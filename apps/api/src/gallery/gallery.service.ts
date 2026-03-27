import { Injectable } from '@nestjs/common';
import { GalleryItem, GalleryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function safeParseStringArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => `${item}`.trim()).filter(Boolean);
    }
  } catch (_error) {
    return [];
  }

  return [];
}

const FALLBACK_GALLERY_ITEMS = [
  {
    id: 'gallery-fallback-aurora',
    title: '极光猫眼',
    imageUrl: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?auto=format&fit=crop&w=1200&q=80',
    imageUrls: [
      'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80'
    ],
    tags: ['猫眼', '通勤', '热门'],
    sortOrder: 1,
    status: 'active'
  },
  {
    id: 'gallery-fallback-milk-tea',
    title: '奶茶跳色',
    imageUrl: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=1200&q=80',
    imageUrls: [
      'https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1526045478516-99145907023c?auto=format&fit=crop&w=1200&q=80'
    ],
    tags: ['奶茶色', '温柔', '日常'],
    sortOrder: 2,
    status: 'active'
  },
  {
    id: 'gallery-fallback-french',
    title: '法式细闪',
    imageUrl: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=1200&q=80',
    imageUrls: [
      'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1607779097040-26e80aa78e66?auto=format&fit=crop&w=1200&q=80'
    ],
    tags: ['法式', '细闪', '约会'],
    sortOrder: 3,
    status: 'active'
  }
] as const;

function mapGalleryItem(item: GalleryItem) {
  const imageUrls = safeParseStringArray(item.imageUrlsJson);
  const tags = safeParseStringArray(item.tagsJson);

  return {
    id: item.id,
    title: item.title,
    imageUrl: item.imageUrl,
    imageUrls: imageUrls.length ? imageUrls : [item.imageUrl],
    tags,
    sortOrder: item.sortOrder,
    status: 'active'
  };
}

@Injectable()
export class GalleryService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveItems() {
    const rows = await this.prisma.galleryItem.findMany({
      where: {
        status: GalleryStatus.ACTIVE
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]
    });

    if (!rows.length) {
      return FALLBACK_GALLERY_ITEMS.map((item) => ({ ...item }));
    }

    return rows.map(mapGalleryItem);
  }
}
