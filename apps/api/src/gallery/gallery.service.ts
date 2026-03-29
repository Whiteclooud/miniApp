import { GalleryStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiGalleryItem, mapGalleryItem } from './gallery.shared';

const FALLBACK_GALLERY_ITEMS: ApiGalleryItem[] = [
  {
    id: 'gallery-fallback-aurora',
    title: '极光猫眼',
    imageUrl:
      'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?auto=format&fit=crop&w=1200&q=80',
    imageUrls: [
      'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1200&q=80'
    ],
    description: '偏通勤的极光猫眼，适合春夏。',
    tags: ['猫眼', '通勤', '热门'],
    publishedAt: '2026-03-29T10:00:00.000Z',
    sortOrder: 1,
    status: 'active'
  },
  {
    id: 'gallery-fallback-milk-tea',
    title: '奶茶跳色',
    imageUrl:
      'https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=1200&q=80',
    imageUrls: [
      'https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1526045478516-99145907023c?auto=format&fit=crop&w=1200&q=80'
    ],
    description: '温柔奶茶色系，适合日常与约会。',
    tags: ['奶茶色', '温柔', '日常'],
    publishedAt: '2026-03-28T10:00:00.000Z',
    sortOrder: 2,
    status: 'active'
  },
  {
    id: 'gallery-fallback-french',
    title: '法式细闪',
    imageUrl:
      'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=1200&q=80',
    imageUrls: [
      'https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1607779097040-26e80aa78e66?auto=format&fit=crop&w=1200&q=80'
    ],
    description: '法式线条搭配细闪，适合精致感妆造。',
    tags: ['法式', '细闪', '约会'],
    publishedAt: '2026-03-27T10:00:00.000Z',
    sortOrder: 3,
    status: 'active'
  }
];

@Injectable()
export class GalleryService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveItems(limit?: number) {
    const rows = await this.prisma.galleryItem.findMany({
      where: {
        status: GalleryStatus.ACTIVE
      },
      orderBy: [{ publishedAt: 'desc' }, { sortOrder: 'asc' }, { id: 'desc' }],
      ...(limit ? { take: limit } : {})
    });

    if (!rows.length) {
      return (limit ? FALLBACK_GALLERY_ITEMS.slice(0, limit) : FALLBACK_GALLERY_ITEMS).map((item) => ({
        ...item
      }));
    }

    return rows.map(mapGalleryItem);
  }
}
