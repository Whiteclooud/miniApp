const {
  listStaffGallery,
  createStaffGallery,
  updateStaffGallery,
  uploadStaffGalleryImages
} = require('../../../services/appointment');
const {
  ensureStaffIdentity,
  setStaffOpenId,
  clearStaffOpenId,
  createMockStaffOpenId
} = require('../../../utils/staff');
const { normalizeGalleryItems } = require('../../../utils/gallery');
const { getErrorKind, getErrorMessage } = require('../../../utils/request');
const { isDevelopEnv } = require('../../../utils/customer');

function getNowParts() {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`
  };
}

function parsePublishedAt(value) {
  if (!value) {
    return getNowParts();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return getNowParts();
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`
  };
}

function buildDefaultForm() {
  const now = getNowParts();
  return {
    title: '',
    description: '',
    tagsText: '',
    publishDate: now.date,
    publishTime: now.time,
    status: 'active',
    imageUrls: [],
    coverIndex: 0
  };
}

function parseTags(text) {
  return `${text || ''}`
    .split(/[，,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getStaffIdentityMeta() {
  const identity = ensureStaffIdentity();
  const develop = isDevelopEnv();
  return {
    openId: identity.openId,
    label: identity.label,
    canUse: identity.canUse,
    isMock: identity.isMock,
    isDevelopEnv: develop,
    sourceText: identity.canUse
      ? identity.isMock
        ? '当前为开发环境模拟店员身份；返图管理接口将通过 X-Staff-OpenId 调用。'
        : '当前为店员身份；返图管理接口将通过 X-Staff-OpenId 调用。'
      : develop
        ? '未设置店员 OpenID。开发环境请先填写或生成模拟 OpenID。'
        : '未获取到店员 OpenID，当前无法查询返图管理页。'
  };
}

function buildSubmitPayload(form) {
  const imageUrls = (form.imageUrls || []).filter(Boolean);
  const coverIndex = Math.min(Math.max(Number(form.coverIndex) || 0, 0), Math.max(imageUrls.length - 1, 0));
  const publishedAt = `${form.publishDate}T${form.publishTime}:00`;

  return {
    title: `${form.title || ''}`.trim(),
    description: `${form.description || ''}`.trim(),
    tags: parseTags(form.tagsText),
    publishedAt,
    status: form.status === 'inactive' ? 'inactive' : 'active',
    imageUrl: imageUrls[coverIndex] || imageUrls[0] || '',
    imageUrls
  };
}

function validateForm(form) {
  const payload = buildSubmitPayload(form);
  if (!payload.title) {
    return '请先填写返图标题。';
  }

  if (!payload.imageUrls.length) {
    return '请至少上传一张返图图片。';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.publishDate || '')) {
    return '请选择有效发布时间日期。';
  }

  if (!/^\d{2}:\d{2}$/.test(form.publishTime || '')) {
    return '请选择有效发布时间。';
  }

  return '';
}

function normalizeGalleryList(items) {
  return normalizeGalleryItems(items || []).map((item) => ({
    ...item,
    statusText: item.status === 'inactive' ? '草稿' : '已发布'
  }));
}

function normalizeFormFromItem(item) {
  const publishParts = parsePublishedAt(item.publishedAt);
  return {
    title: item.title || '',
    description: item.description || '',
    tagsText: Array.isArray(item.tags) ? item.tags.join(', ') : '',
    publishDate: publishParts.date,
    publishTime: publishParts.time,
    status: item.status === 'inactive' ? 'inactive' : 'active',
    imageUrls: item.imageUrls || [],
    coverIndex: Math.max((item.imageUrls || []).findIndex((url) => url === item.imageUrl), 0)
  };
}

function formatPageErrorMessage(error, fallback) {
  const kind = getErrorKind(error);
  if (kind === 'network') {
    return '网络异常，返图管理页暂时加载失败。请确认本地服务已启动并允许开发者工具访问。';
  }

  if (kind === 'unauthorized') {
    return getErrorMessage(error, fallback || '当前身份无权访问返图管理。');
  }

  return getErrorMessage(error, fallback || '返图管理页加载失败，请稍后重试。');
}

Page({
  data: {
    pageState: 'loading',
    stateMessage: '',
    submitMessage: '',
    uploadMessage: '',
    saveState: 'idle',
    uploadState: 'idle',
    editingId: '',
    staffOpenIdInput: '',
    items: [],
    form: buildDefaultForm(),
    staffIdentity: {
      openId: '',
      label: '未设置店员 OpenID',
      canUse: false,
      isMock: false,
      isDevelopEnv: false,
      sourceText: ''
    }
  },

  onLoad() {
    this.refreshStaffIdentity();
  },

  onShow() {
    this.refreshStaffIdentity();
    this.loadData();
  },

  async onPullDownRefresh() {
    this.refreshStaffIdentity();
    await this.loadData();
    wx.stopPullDownRefresh();
  },

  refreshStaffIdentity() {
    const staffIdentity = getStaffIdentityMeta();
    this.setData({
      staffIdentity,
      staffOpenIdInput: staffIdentity.openId || this.data.staffOpenIdInput || ''
    });
  },

  onStaffOpenIdInput(event) {
    this.setData({
      staffOpenIdInput: event.detail.value
    });
  },

  applyStaffOpenId() {
    const value = (this.data.staffOpenIdInput || '').trim();
    if (!value) {
      wx.showToast({ title: '请先输入店员 OpenID', icon: 'none' });
      return;
    }

    setStaffOpenId(value);
    this.refreshStaffIdentity();
    this.loadData();
    wx.showToast({ title: '店员 OpenID 已保存', icon: 'success' });
  },

  generateStaffOpenId() {
    setStaffOpenId(createMockStaffOpenId());
    this.refreshStaffIdentity();
    this.loadData();
    wx.showToast({ title: '已生成模拟 OpenID', icon: 'success' });
  },

  clearStaffOpenId() {
    clearStaffOpenId();
    this.refreshStaffIdentity();
    this.setData({
      pageState: 'unauthorized',
      stateMessage: '店员 OpenID 已清空，返图管理页不会继续请求 staff 接口。',
      items: [],
      editingId: '',
      form: buildDefaultForm(),
      staffOpenIdInput: ''
    });
    wx.showToast({ title: '已清空店员 OpenID', icon: 'none' });
  },

  goRules() {
    wx.redirectTo({
      url: '/pages/staff/rules/index'
    });
  },

  goAppointments() {
    wx.redirectTo({
      url: '/pages/staff/appointments/index'
    });
  },

  onInput(event) {
    const { field } = event.currentTarget.dataset;
    this.setData({
      [`form.${field}`]: event.detail.value
    });
  },

  onPublishDateChange(event) {
    this.setData({
      'form.publishDate': event.detail.value
    });
  },

  onPublishTimeChange(event) {
    this.setData({
      'form.publishTime': event.detail.value
    });
  },

  setPublishNow() {
    const now = getNowParts();
    this.setData({
      'form.publishDate': now.date,
      'form.publishTime': now.time
    });
  },

  setStatus(event) {
    const { status } = event.currentTarget.dataset;
    this.setData({
      'form.status': status === 'inactive' ? 'inactive' : 'active'
    });
  },

  chooseCover(event) {
    const { index } = event.currentTarget.dataset;
    this.setData({
      'form.coverIndex': Number(index) || 0
    });
  },

  removeImage(event) {
    const { index } = event.currentTarget.dataset;
    const imageUrls = [...(this.data.form.imageUrls || [])];
    imageUrls.splice(Number(index), 1);
    const nextCoverIndex = Math.min(this.data.form.coverIndex || 0, Math.max(imageUrls.length - 1, 0));
    this.setData({
      'form.imageUrls': imageUrls,
      'form.coverIndex': nextCoverIndex
    });
  },

  async addImages() {
    if (this.data.uploadState === 'uploading') {
      return;
    }

    try {
      const chooser = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 9,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          success: resolve,
          fail: reject
        });
      });

      const filePaths = (chooser.tempFiles || []).map((item) => item.tempFilePath).filter(Boolean);
      if (!filePaths.length) {
        return;
      }

      this.setData({
        uploadState: 'uploading',
        uploadMessage: ''
      });

      const response = await uploadStaffGalleryImages(filePaths);
      const uploadedUrls = (response.items || []).map((item) => item.url).filter(Boolean);
      const imageUrls = [...(this.data.form.imageUrls || []), ...uploadedUrls];
      this.setData({
        'form.imageUrls': imageUrls,
        'form.coverIndex': imageUrls.length && !this.data.form.imageUrls.length ? 0 : this.data.form.coverIndex,
        uploadMessage: uploadedUrls.length ? '' : '本次未拿到可用图片地址，请稍后重试。'
      });

      if (uploadedUrls.length) {
        wx.showToast({ title: '图片已上传', icon: 'success' });
      }
    } catch (error) {
      this.setData({
        uploadMessage: formatPageErrorMessage(error, '图片上传失败，请稍后重试。')
      });
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      this.setData({
        uploadState: 'idle'
      });
    }
  },

  startCreate() {
    this.setData({
      editingId: '',
      submitMessage: '',
      uploadMessage: '',
      form: buildDefaultForm()
    });
  },

  startEdit(event) {
    const { id } = event.currentTarget.dataset;
    const target = (this.data.items || []).find((item) => item.id === id);
    if (!target) {
      return;
    }

    this.setData({
      editingId: target.id,
      submitMessage: '',
      uploadMessage: '',
      form: normalizeFormFromItem(target)
    });
  },

  async loadData() {
    const staffIdentity = getStaffIdentityMeta();
    if (!staffIdentity.canUse) {
      this.setData({
        staffIdentity,
        pageState: 'unauthorized',
        stateMessage: staffIdentity.isDevelopEnv
          ? '未获取到店员 OpenID。开发环境请先填写或生成模拟 OpenID，再进入返图管理页。'
          : '未获取到店员 OpenID，当前无法查询返图管理页。',
        items: []
      });
      return;
    }

    this.setData({
      staffIdentity,
      pageState: 'loading',
      stateMessage: '',
      submitMessage: '',
      uploadMessage: ''
    });

    try {
      const response = await listStaffGallery();
      const items = normalizeGalleryList(response.items || []);
      this.setData({
        pageState: 'ready',
        items,
        stateMessage: items.length ? '' : '当前还没有返图内容，先创建第一条灵感内容吧。'
      });
    } catch (error) {
      this.setData({
        pageState: error.isUnauthorized ? 'unauthorized' : 'error',
        stateMessage: formatPageErrorMessage(error, '返图管理页加载失败，请稍后重试。'),
        items: []
      });
    }
  },

  async submit() {
    const { staffIdentity, editingId, form } = this.data;

    if (!staffIdentity.canUse) {
      this.setData({
        pageState: 'unauthorized',
        stateMessage: '缺少店员 OpenID，当前不能保存返图内容。'
      });
      wx.showToast({ title: '缺少店员 OpenID', icon: 'none' });
      return;
    }

    const validationMessage = validateForm(form);
    if (validationMessage) {
      this.setData({
        submitMessage: validationMessage
      });
      wx.showToast({ title: '请检查返图表单', icon: 'none' });
      return;
    }

    const payload = buildSubmitPayload(form);
    this.setData({
      saveState: 'submitting',
      submitMessage: ''
    });

    try {
      if (editingId) {
        await updateStaffGallery(editingId, payload);
      } else {
        await createStaffGallery(payload);
      }
      wx.showToast({ title: editingId ? '返图已更新' : '返图已创建', icon: 'success' });
      this.setData({
        editingId: '',
        form: buildDefaultForm()
      });
      await this.loadData();
    } catch (error) {
      this.setData({
        submitMessage: formatPageErrorMessage(error, '返图保存失败，请稍后重试。')
      });
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({
        saveState: 'idle'
      });
    }
  }
});
