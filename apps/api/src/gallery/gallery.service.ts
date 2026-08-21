import { GalleryStatus } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiGalleryItem, mapGalleryItem } from './gallery.shared';

export interface ListGalleryOptions {
  limit?: number;
  tag?: string;
}

@Injectable()
export class GalleryService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveItems(options: ListGalleryOptions = {}): Promise<ApiGalleryItem[]> {
    const normalizedTag = `${options.tag || ''}`.trim().toLocaleLowerCase();
    const rows = await this.prisma.galleryItem.findMany({
      where: {
        status: GalleryStatus.ACTIVE
      },
      orderBy: [{ publishedAt: 'desc' }, { sortOrder: 'asc' }, { id: 'desc' }],
      ...(!normalizedTag && options.limit ? { take: options.limit } : {})
    });

    const items = rows.map(mapGalleryItem);
    const filteredItems = normalizedTag
      ? items.filter((item) =>
          item.tags.some((tag) => tag.trim().toLocaleLowerCase() === normalizedTag)
        )
      : items;

    return options.limit ? filteredItems.slice(0, options.limit) : filteredItems;
  }

  async getActiveItem(itemId?: string): Promise<ApiGalleryItem> {
    const normalizedItemId = `${itemId || ''}`.trim();
    const row = normalizedItemId
      ? await this.prisma.galleryItem.findFirst({
          where: {
            id: normalizedItemId,
            status: GalleryStatus.ACTIVE
          }
        })
      : null;

    if (!row) {
      throw new NotFoundException({
        error: 'Gallery item not found',
        code: 'GALLERY_ITEM_NOT_FOUND'
      });
    }

    return mapGalleryItem(row);
  }
}
