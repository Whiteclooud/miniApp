const CUSTOMER_UPLOAD_PATH_PREFIX = '/api/v1/uploads/images/';
const SAFE_IMAGE_FILENAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:jpe?g|png|webp)$/i;

function getUrlPathname(value) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url || url.includes('\\')) {
    return '';
  }

  const withoutHash = url.split('#', 1)[0];
  const withoutQuery = withoutHash.split('?', 1)[0];
  const absoluteMatch = withoutQuery.match(/^https?:\/\/[^/]+(\/.*)?$/i);
  if (absoluteMatch) {
    return absoluteMatch[1] || '/';
  }

  if (!withoutQuery.startsWith('/')) {
    return '';
  }

  return withoutQuery;
}

function getCustomerReferenceImageFilename(imageUrl) {
  const pathname = getUrlPathname(imageUrl);
  if (!pathname.startsWith(CUSTOMER_UPLOAD_PATH_PREFIX)) {
    return '';
  }

  const encodedFilename = pathname.slice(CUSTOMER_UPLOAD_PATH_PREFIX.length);
  if (!encodedFilename || encodedFilename.includes('/')) {
    return '';
  }

  try {
    const filename = decodeURIComponent(encodedFilename);
    return SAFE_IMAGE_FILENAME_PATTERN.test(filename) ? filename : '';
  } catch (_error) {
    return '';
  }
}

function isCustomerReferenceImageUrl(imageUrl) {
  return Boolean(getCustomerReferenceImageFilename(imageUrl));
}

module.exports = {
  CUSTOMER_UPLOAD_PATH_PREFIX,
  getCustomerReferenceImageFilename,
  isCustomerReferenceImageUrl
};
