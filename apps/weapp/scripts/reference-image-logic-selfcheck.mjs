import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CUSTOMER_URL = 'https://cdn.example.com/api/v1/uploads/images/customer-owner-1700000000000-aabbcc.png';
const SECOND_CUSTOMER_URL = '/api/v1/uploads/images/customer-owner-1700000000001-ddeeff.webp';
const STAFF_URL = 'https://cdn.example.com/api/v1/staff/uploads/images/gallery-cover.jpg';

function installModuleMock(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports,
    children: [],
    paths: []
  };
}

function restoreModule(modulePath, originalModule) {
  delete require.cache[modulePath];
  if (originalModule) {
    require.cache[modulePath] = originalModule;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPageInstance(definition, overrides = {}) {
  const instance = {
    ...definition,
    data: {
      ...clone(definition.data),
      ...clone(overrides)
    }
  };

  instance.setData = (changes = {}) => {
    Object.entries(changes).forEach(([key, value]) => {
      const segments = key.split('.');
      let target = instance.data;
      segments.slice(0, -1).forEach((segment) => {
        if (!target[segment] || typeof target[segment] !== 'object') {
          target[segment] = {};
        }
        target = target[segment];
      });
      target[segments[segments.length - 1]] = value;
    });
  };

  return instance;
}

function removeEvent(index) {
  return { currentTarget: { dataset: { index } } };
}

function testReferenceImageUrlOwnership() {
  const {
    getCustomerReferenceImageFilename,
    isCustomerReferenceImageUrl
  } = require('../utils/reference-images.js');
  const filename = 'customer-owner-1700000000000-aabbcc.png';

  assert.equal(
    getCustomerReferenceImageFilename(`/api/v1/uploads/images/${filename}`),
    filename
  );
  assert.equal(
    getCustomerReferenceImageFilename(`https://api.example.com/api/v1/uploads/images/${filename}?v=1#preview`),
    filename
  );
  assert.equal(
    getCustomerReferenceImageFilename('/api/v1/uploads/images/%63ustomer-owner.jpg'),
    'customer-owner.jpg'
  );
  assert.equal(isCustomerReferenceImageUrl(STAFF_URL), false);
  assert.equal(isCustomerReferenceImageUrl('/api/v1/uploads/images-extra/file.jpg'), false);
  assert.equal(isCustomerReferenceImageUrl('/nested/api/v1/uploads/images/file.jpg'), false);
  assert.equal(isCustomerReferenceImageUrl('/api/v1/uploads/images/'), false);
  assert.equal(isCustomerReferenceImageUrl('/api/v1/uploads/images/nested/file.jpg'), false);
  assert.equal(isCustomerReferenceImageUrl('/api/v1/uploads/images/%2Fetc.jpg'), false);
  assert.equal(isCustomerReferenceImageUrl('/api/v1/uploads/images/%5Cetc.jpg'), false);
  assert.equal(isCustomerReferenceImageUrl('/api/v1/uploads/images/%broken.jpg'), false);
  assert.equal(isCustomerReferenceImageUrl('/preview?next=/api/v1/uploads/images/file.jpg'), false);
  assert.equal(isCustomerReferenceImageUrl('ftp://api.example.com/api/v1/uploads/images/file.jpg'), false);
}

async function testAppointmentImageService() {
  const requestModulePath = require.resolve('../utils/request.js');
  const serviceModulePath = require.resolve('../services/appointment.js');
  const originalRequestModule = require.cache[requestModulePath];
  const originalServiceModule = require.cache[serviceModulePath];
  const requestCalls = [];
  const uploadCalls = [];
  let uploadImplementation = async () => ({ items: [] });

  try {
    installModuleMock(requestModulePath, {
      request: async (options) => {
        requestCalls.push(options);
        return { item: { filename: options.url.split('/').pop() } };
      },
      uploadFiles: (options) => {
        uploadCalls.push(options);
        return uploadImplementation(options);
      }
    });
    delete require.cache[serviceModulePath];
    const {
      deleteCustomerReferenceImage,
      uploadCustomerReferenceImages
    } = require(serviceModulePath);

    await deleteCustomerReferenceImage(CUSTOMER_URL);
    assert.deepEqual(requestCalls, [{
      url: '/api/v1/uploads/images/customer-owner-1700000000000-aabbcc.png',
      method: 'DELETE',
      auth: 'customer'
    }]);

    const skipped = await deleteCustomerReferenceImage(STAFF_URL);
    assert.equal(skipped.skipped, true);
    assert.equal(requestCalls.length, 1, 'staff URL must not issue a DELETE request');

    const firstItem = { url: CUSTOMER_URL };
    const partialError = new Error('second upload failed');
    uploadCalls.length = 0;
    uploadImplementation = async () => {
      if (uploadCalls.length === 1) {
        return { items: [firstItem] };
      }
      throw partialError;
    };

    await assert.rejects(
      uploadCustomerReferenceImages(['/tmp/first.png', '/tmp/second.png', '/tmp/third.png']),
      (error) => {
        assert.equal(error, partialError);
        assert.deepEqual(error.uploadedItems, [firstItem]);
        return true;
      }
    );
    assert.deepEqual(
      uploadCalls.map((call) => call.filePaths),
      [['/tmp/first.png'], ['/tmp/second.png']]
    );

    uploadCalls.length = 0;
    uploadImplementation = async (options) => ({
      items: [{ url: options.filePaths[0] === '/tmp/first.png' ? CUSTOMER_URL : SECOND_CUSTOMER_URL }]
    });
    const uploaded = await uploadCustomerReferenceImages(['/tmp/first.png', '/tmp/second.png']);
    assert.deepEqual(uploaded.items, [{ url: CUSTOMER_URL }, { url: SECOND_CUSTOMER_URL }]);
  } finally {
    restoreModule(serviceModulePath, originalServiceModule);
    restoreModule(requestModulePath, originalRequestModule);
  }
}

async function testBookingReferenceImageLogic() {
  const requestModulePath = require.resolve('../utils/request.js');
  const serviceModulePath = require.resolve('../services/appointment.js');
  const loginGuardModulePath = require.resolve('../utils/login-guard.js');
  const bookingModulePath = require.resolve('../pages/booking/index.js');
  const originalRequestModule = require.cache[requestModulePath];
  const originalServiceModule = require.cache[serviceModulePath];
  const originalLoginGuardModule = require.cache[loginGuardModulePath];
  const originalBookingModule = require.cache[bookingModulePath];
  const previousPage = globalThis.Page;
  const previousWx = globalThis.wx;
  const deleteCalls = [];
  const uploadCalls = [];
  const createCalls = [];
  const toastCalls = [];
  let bookingDefinition;
  let chooseMediaImplementation = (options) => options.success({ tempFiles: [] });
  let deleteImplementation = async () => ({ item: {} });
  let uploadImplementation = async () => ({ items: [] });
  let createImplementation = async () => ({
    item: { date: '2026-08-20', timeSlot: '10:00', status: 'pending' }
  });

  try {
    installModuleMock(requestModulePath, {
      getErrorKind: () => 'unknown',
      getErrorMessage: (error, fallback) => (error && error.message) || fallback
    });
    installModuleMock(serviceModulePath, {
      getAvailability: async () => ({}),
      createAppointment: (payload) => {
        createCalls.push(payload);
        return createImplementation(payload);
      },
      uploadCustomerReferenceImages: (filePaths) => {
        uploadCalls.push(filePaths);
        return uploadImplementation(filePaths);
      },
      deleteCustomerReferenceImage: (imageUrl) => {
        deleteCalls.push(imageUrl);
        return deleteImplementation(imageUrl);
      }
    });
    installModuleMock(loginGuardModulePath, {
      hasCustomerAccess: () => true,
      isLoginRequiredError: () => false,
      promptForLogin: async () => true
    });

    globalThis.Page = (definition) => {
      bookingDefinition = definition;
    };
    globalThis.wx = {
      chooseMedia: (options) => chooseMediaImplementation(options),
      showToast: (options) => toastCalls.push(options)
    };
    delete require.cache[bookingModulePath];
    require(bookingModulePath);
    assert.ok(bookingDefinition, 'booking page definition must be registered');

    let page = createPageInstance(bookingDefinition);
    page.onLoad({
      galleryId: encodeURIComponent('gallery-seed-aurora-cat-eye'),
      galleryTitle: encodeURIComponent('极光猫眼'),
      referenceImageUrl: encodeURIComponent(STAFF_URL)
    });
    assert.equal(page.data.sourceGalleryId, 'gallery-seed-aurora-cat-eye');
    assert.equal(page.data.sourceGalleryTitle, '极光猫眼');
    assert.deepEqual(page.data.referenceImageUrls, [STAFF_URL]);
    assert.equal(page.data.form.note, '', '预约同款 must not auto-fill the note');

    page = createPageInstance(bookingDefinition, {
      submitState: 'submitting',
      referenceImageState: 'idle',
      referenceImageUrls: [CUSTOMER_URL]
    });
    let chooseCallCount = 0;
    chooseMediaImplementation = (options) => {
      chooseCallCount += 1;
      options.success({ tempFiles: [{ tempFilePath: '/tmp/blocked.png' }] });
    };
    await page.addReferenceImages();
    await page.removeReferenceImage(removeEvent(0));
    assert.equal(chooseCallCount, 0, 'submitting must block the media chooser');
    assert.equal(deleteCalls.length, 0, 'submitting must block image deletion');
    assert.deepEqual(page.data.referenceImageUrls, [CUSTOMER_URL]);

    page = createPageInstance(bookingDefinition, {
      submitState: 'idle',
      referenceImageState: 'idle',
      referenceImageUrls: [STAFF_URL]
    });
    await page.removeReferenceImage(removeEvent(0));
    assert.deepEqual(page.data.referenceImageUrls, []);
    assert.equal(deleteCalls.length, 0, 'staff gallery image removal must stay local');

    let resolveDelete;
    deleteImplementation = () => new Promise((resolve) => {
      resolveDelete = resolve;
    });
    page = createPageInstance(bookingDefinition, {
      submitState: 'idle',
      referenceImageState: 'idle',
      referenceImageUrls: [CUSTOMER_URL]
    });
    const removePromise = page.removeReferenceImage(removeEvent(0));
    assert.equal(page.data.referenceImageState, 'deleting');
    assert.deepEqual(page.data.referenceImageUrls, [CUSTOMER_URL]);
    resolveDelete({ item: {} });
    await removePromise;
    assert.deepEqual(page.data.referenceImageUrls, []);
    assert.equal(page.data.referenceImageState, 'idle');

    deleteImplementation = async () => {
      const error = new Error('already deleted');
      error.statusCode = 404;
      error.code = 'CUSTOMER_UPLOAD_NOT_FOUND';
      throw error;
    };
    page = createPageInstance(bookingDefinition, {
      submitState: 'idle',
      referenceImageState: 'idle',
      referenceImageUrls: [CUSTOMER_URL]
    });
    await page.removeReferenceImage(removeEvent(0));
    assert.deepEqual(
      page.data.referenceImageUrls,
      [],
      'an already-missing owned upload should still be removable from the form'
    );
    assert.equal(page.data.referenceImageState, 'idle');

    deleteImplementation = async () => {
      throw new Error('server delete failed');
    };
    page = createPageInstance(bookingDefinition, {
      submitState: 'idle',
      referenceImageState: 'idle',
      referenceImageUrls: [CUSTOMER_URL]
    });
    await page.removeReferenceImage(removeEvent(0));
    assert.deepEqual(page.data.referenceImageUrls, [CUSTOMER_URL]);
    assert.match(page.data.referenceImageMessage, /删除失败，图片已保留/);

    let chooserOptions;
    chooseMediaImplementation = (options) => {
      chooserOptions = options;
    };
    uploadCalls.length = 0;
    page = createPageInstance(bookingDefinition, {
      submitState: 'idle',
      referenceImageState: 'idle',
      referenceImageUrls: []
    });
    const addDuringSubmit = page.addReferenceImages();
    assert.equal(page.data.referenceImageState, 'choosing');
    page.data.submitState = 'submitting';
    chooserOptions.success({ tempFiles: [{ tempFilePath: '/tmp/race.png' }] });
    await addDuringSubmit;
    assert.equal(uploadCalls.length, 0, 'submit state must be rechecked after choosing media');
    assert.equal(page.data.referenceImageState, 'idle');

    const partialError = new Error('batch upload failed');
    partialError.uploadedItems = [
      { url: CUSTOMER_URL },
      { url: STAFF_URL },
      { url: SECOND_CUSTOMER_URL }
    ];
    chooseMediaImplementation = (options) => options.success({
      tempFiles: [
        { tempFilePath: '/tmp/first.png' },
        { tempFilePath: '/tmp/second.png' }
      ]
    });
    uploadImplementation = async () => {
      throw partialError;
    };
    deleteImplementation = async () => ({ item: {} });
    deleteCalls.length = 0;
    page = createPageInstance(bookingDefinition, {
      submitState: 'idle',
      referenceImageState: 'idle',
      referenceImageUrls: [STAFF_URL]
    });
    await page.addReferenceImages();
    assert.deepEqual(deleteCalls, [CUSTOMER_URL, SECOND_CUSTOMER_URL]);
    assert.deepEqual(page.data.referenceImageUrls, [STAFF_URL]);
    assert.equal(page.data.referenceImageState, 'idle');

    deleteCalls.length = 0;
    page = createPageInstance(bookingDefinition, {
      pageState: 'ready',
      submitState: 'idle',
      referenceImageState: 'idle',
      customerIdentity: { canUse: true },
      availability: { selectedDate: '2026-08-20' },
      timeSlotOptions: [{ value: '10:00', status: 'active' }],
      selectedTimeSlotValue: '10:00',
      referenceImageUrls: [CUSTOMER_URL],
      form: { customerName: 'Test', phone: '', note: '' }
    });
    await page.submit();
    assert.equal(page.data.submitState, 'success');
    assert.equal(createCalls.at(-1).referenceImageUrls[0], CUSTOMER_URL);
    assert.equal(deleteCalls.length, 0, 'successful appointment submission must not delete images');
  } finally {
    delete require.cache[bookingModulePath];
    restoreModule(bookingModulePath, originalBookingModule);
    restoreModule(serviceModulePath, originalServiceModule);
    restoreModule(loginGuardModulePath, originalLoginGuardModule);
    restoreModule(requestModulePath, originalRequestModule);
    globalThis.Page = previousPage;
    globalThis.wx = previousWx;
  }
}

export async function runReferenceImageLogicSelfcheck() {
  testReferenceImageUrlOwnership();
  await testAppointmentImageService();
  await testBookingReferenceImageLogic();
}

const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  await runReferenceImageLogicSelfcheck();
  console.log('reference image logic self-check passed');
}
