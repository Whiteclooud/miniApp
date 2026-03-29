function formatPublishedAt(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function normalizeGalleryItem(item = {}, index = 0) {
  const imageUrls = Array.isArray(item.imageUrls)
    ? item.imageUrls.filter((value) => typeof value === 'string' && value.trim())
    : [];
  const coverImageUrl = item.imageUrl || imageUrls[0] || '';
  const normalizedImageUrls = imageUrls.length ? imageUrls : (coverImageUrl ? [coverImageUrl] : []);
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];

  return {
    id: item.id || `gallery-${index}`,
    title: item.title || '未命名返图',
    imageUrl: coverImageUrl,
    imageUrls: normalizedImageUrls,
    tags,
    description: item.description || '',
    publishedAt: item.publishedAt || '',
    publishedAtText: formatPublishedAt(item.publishedAt),
    sortOrder: Number(item.sortOrder || index + 1),
    status: item.status || 'active',
    createdBy: item.createdBy || ''
  };
}

function normalizeGalleryItems(items = []) {
  return (items || []).map((item, index) => normalizeGalleryItem(item, index));
}

module.exports = {
  formatPublishedAt,
  normalizeGalleryItem,
  normalizeGalleryItems
};
