import { GalleryItem, GalleryStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

export interface ApiGalleryItem {
  id: string;
  title: string;
  imageUrl: string;
  imageUrls: string[];
  description: string;
  tags: string[];
  publishedAt: string;
  sortOrder: number;
  status: 'active' | 'inactive';
}

export interface StaffGalleryItem extends ApiGalleryItem {
  createdBy: string;
}

export interface UpsertGalleryInput {
  title?: string;
  imageUrl?: string;
  coverImageUrl?: string;
  imageUrls?: string[] | string;
  description?: string;
  tags?: string[] | string;
  publishedAt?: string;
  sortOrder?: number;
  status?: string;
}

export function safeParseStringArray(value: string | null | undefined): string[] {
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

function normalizeStringArray(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => `${item}`.trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) {
      return [];
    }

    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => `${item}`.trim()).filter(Boolean);
        }
      } catch (_error) {
        // noop
      }
    }

    return text
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeGalleryStatus(status?: string): GalleryStatus {
  const normalized = `${status || 'active'}`.trim().toLowerCase();
  return normalized === 'inactive' ? GalleryStatus.INACTIVE : GalleryStatus.ACTIVE;
}

function normalizePublishedAt(value?: string): Date {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException({
      error: 'Invalid publishedAt',
      code: 'INVALID_PUBLISHED_AT'
    });
  }

  return parsed;
}

export function normalizeGalleryUpsertInput(input: UpsertGalleryInput = {}) {
  const title = `${input.title || ''}`.trim();
  const imageUrls = normalizeStringArray(input.imageUrls);
  const imageUrl = `${input.imageUrl || input.coverImageUrl || imageUrls[0] || ''}`.trim();
  const description = `${input.description || ''}`.trim();
  const tags = normalizeStringArray(input.tags);
  const publishedAt = normalizePublishedAt(input.publishedAt);
  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0;
  const status = normalizeGalleryStatus(input.status);

  if (!title) {
    throw new BadRequestException({
      error: 'Title is required',
      code: 'INVALID_GALLERY_TITLE'
    });
  }

  if (!imageUrl) {
    throw new BadRequestException({
      error: 'Cover image is required',
      code: 'INVALID_GALLERY_IMAGE'
    });
  }

  const normalizedImageUrls = imageUrls.length ? imageUrls : [imageUrl];

  return {
    title,
    imageUrl,
    imageUrls: normalizedImageUrls,
    description,
    tags,
    publishedAt,
    sortOrder,
    status
  };
}

export function mapGalleryItem(item: GalleryItem): ApiGalleryItem {
  const imageUrls = safeParseStringArray(item.imageUrlsJson);
  const tags = safeParseStringArray(item.tagsJson);

  return {
    id: item.id,
    title: item.title,
    imageUrl: item.imageUrl,
    imageUrls: imageUrls.length ? imageUrls : [item.imageUrl],
    description: item.description ?? '',
    tags,
    publishedAt: item.publishedAt.toISOString(),
    sortOrder: item.sortOrder,
    status: item.status === GalleryStatus.INACTIVE ? 'inactive' : 'active'
  };
}

export function mapStaffGalleryItem(item: GalleryItem): StaffGalleryItem {
  const base = mapGalleryItem(item);
  return {
    ...base,
    createdBy: item.createdByOpenId ?? ''
  };
}
