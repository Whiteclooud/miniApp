import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertStaffAuthorized } from '../staff-auth/staff-auth';
import {
  mapStaffGalleryItem,
  normalizeGalleryUpsertInput,
  assertGalleryPayload,
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

  async getItem(staffOpenId?: string, itemId?: string): Promise<StaffGalleryItem> {
    assertStaffAuthorized(staffOpenId);
    const row = await this.findItemOrThrow(itemId);
    return mapStaffGalleryItem(row);
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
    assertGalleryPayload(input);
    const existing = await this.findItemOrThrow(itemId);

    const normalized = normalizeGalleryUpsertInput({
      title: input.title ?? existing.title,
      imageUrl: input.imageUrl ?? input.coverImageUrl ?? existing.imageUrl,
      imageUrls:
        input.imageUrls ?? safeParseStringArray(existing.imageUrlsJson),
      description: input.description ?? existing.description ?? '',
      tags: input.tags ?? safeParseStringArray(existing.tagsJson),
      publishedAt: input.publishedAt ?? existing.publishedAt.toISOString(),
      sortOrder: input.sortOrder ?? existing.sortOrder,
      status: input.status ?? existing.status.toLowerCase()
    });

    let row;
    try {
      row = await this.prisma.galleryItem.update({
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
    } catch (error) {
      // A concurrent hard-delete can invalidate the earlier read. Preserve the
      // resource contract instead of leaking Prisma's P2025 as a 500 response.
      if (
        error &&
        typeof error === 'object' &&
        (error as { code?: string }).code === 'P2025'
      ) {
        this.throwItemNotFound();
      }
      throw error;
    }

    return mapStaffGalleryItem(row);
  }

  async deleteItem(staffOpenId?: string, itemId?: string): Promise<StaffGalleryItem> {
    assertStaffAuthorized(staffOpenId);
    const existing = await this.findItemOrThrow(itemId);
    const result = await this.prisma.galleryItem.deleteMany({
      where: {
        id: existing.id
      }
    });

    if (!result.count) {
      this.throwItemNotFound();
    }

    return mapStaffGalleryItem(existing);
  }

  private async findItemOrThrow(itemId?: string) {
    const normalizedItemId = `${itemId || ''}`.trim();
    const row = normalizedItemId
      ? await this.prisma.galleryItem.findUnique({
          where: {
            id: normalizedItemId
          }
        })
      : null;

    if (!row) {
      this.throwItemNotFound();
    }

    return row;
  }

  private throwItemNotFound(): never {
    throw new NotFoundException({
      error: 'Gallery item not found',
      code: 'GALLERY_ITEM_NOT_FOUND'
    });
  }
}
