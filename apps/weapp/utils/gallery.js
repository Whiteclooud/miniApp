function normalizeGalleryItem(item = {}, index = 0) {
  const imageUrls = Array.isArray(item.imageUrls)
    ? item.imageUrls.filter((value) => typeof value === 'string' && value.trim())
    : [];
  const coverImageUrl = imageUrls[0] || item.imageUrl || '';

  return {
    id: item.id || `gallery-${index}`,
    title: item.title || '未命名返图',
    imageUrl: coverImageUrl,
    imageUrls: imageUrls.length ? imageUrls : (coverImageUrl ? [coverImageUrl] : []),
    tags: Array.isArray(item.tags) ? item.tags : [],
    description: item.description || '',
    priceFrom: item.priceFrom,
    serviceId: item.serviceId || '',
    serviceName: item.serviceName || '',
    ctaText: item.ctaText || '立即预约',
    sortOrder: Number(item.sortOrder || index + 1),
    status: item.status || 'active'
  };
}

function normalizeGalleryItems(items = []) {
  return (items || []).map((item, index) => normalizeGalleryItem(item, index));
}

module.exports = {
  normalizeGalleryItem,
  normalizeGalleryItems
};
