import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertStaffAuthorized } from '../staff-auth/staff-auth';
import {
  mapStaffGalleryItem,
  normalizeGalleryUpsertInput,
  safeParseStringArray,
  StaffGalleryItem,
  UpsertGalleryInput
} from '../gallery/gallery.shared';

@Injectable()
export class StaffGalleryService {
  constructor(private readonly prisma: PrismaService) {}

  async listItems(staffOpenId?: string): Promise<StaffGalleryItem[]> {
    assertStaffAuthorized(staffOpenId);
    const rows = await this.prisma.galleryItem.findMany({
      orderBy: [{ publishedAt: 'desc' }, { sortOrder: 'asc' }, { id: 'desc' }]
    });

    return rows.map(mapStaffGalleryItem);
  }

  async createItem(staffOpenId?: string, input: UpsertGalleryInput = {}): Promise<StaffGalleryItem> {
    const createdByOpenId = assertStaffAuthorized(staffOpenId);
    const normalized = normalizeGalleryUpsertInput(input);

    const row = await this.prisma.galleryItem.create({
      data: {
        title: normalized.title,
        imageUrl: normalized.imageUrl,
        imageUrlsJson: JSON.stringify(normalized.imageUrls),
        description: normalized.description || null,
        tagsJson: JSON.stringify(normalized.tags),
        publishedAt: normalized.publishedAt,
        createdByOpenId,
        sortOrder: normalized.sortOrder,
        status: normalized.status
      }
    });

    return mapStaffGalleryItem(row);
  }

  async updateItem(
    staffOpenId?: string,
    itemId?: string,
    input: UpsertGalleryInput = {}
  ): Promise<StaffGalleryItem> {
    assertStaffAuthorized(staffOpenId);
    const normalizedItemId = `${itemId || ''}`.trim();

    const existing = normalizedItemId
      ? await this.prisma.galleryItem.findUnique({
          where: {
            id: normalizedItemId
          }
        })
      : null;

    if (!existing) {
      throw new NotFoundException({
        error: 'Gallery item not found',
        code: 'GALLERY_ITEM_NOT_FOUND'
      });
    }

    const normalized = normalizeGalleryUpsertInput({
      title: input.title ?? existing.title,
      imageUrl: input.imageUrl ?? existing.imageUrl,
      coverImageUrl: input.coverImageUrl,
      imageUrls:
        input.imageUrls ?? safeParseStringArray(existing.imageUrlsJson),
      description: input.description ?? existing.description ?? '',
      tags: input.tags ?? safeParseStringArray(existing.tagsJson),
      publishedAt: input.publishedAt ?? existing.publishedAt.toISOString(),
      sortOrder: input.sortOrder ?? existing.sortOrder,
      status: input.status ?? existing.status.toLowerCase()
    });

    const row = await this.prisma.galleryItem.update({
      where: {
        id: existing.id
      },
      data: {
        title: normalized.title,
        imageUrl: normalized.imageUrl,
        imageUrlsJson: JSON.stringify(normalized.imageUrls),
        description: normalized.description || null,
        tagsJson: JSON.stringify(normalized.tags),
        publishedAt: normalized.publishedAt,
        sortOrder: normalized.sortOrder,
        status: normalized.status
      }
    });

    return mapStaffGalleryItem(row);
  }
}
