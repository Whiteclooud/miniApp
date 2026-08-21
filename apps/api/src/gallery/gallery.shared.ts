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

export function assertGalleryPayload(input: unknown): asserts input is UpsertGalleryInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException({
      error: 'Gallery payload must be an object',
      code: 'INVALID_GALLERY_PAYLOAD'
    });
  }

  const payload = input as Record<string, unknown>;
  const stringFields = [
    ['title', 'INVALID_GALLERY_TITLE'],
    ['imageUrl', 'INVALID_GALLERY_IMAGE'],
    ['coverImageUrl', 'INVALID_GALLERY_IMAGE'],
    ['description', 'INVALID_GALLERY_PAYLOAD'],
    ['publishedAt', 'INVALID_PUBLISHED_AT'],
    ['status', 'INVALID_GALLERY_STATUS']
  ] as const;

  for (const [field, code] of stringFields) {
    if (payload[field] !== undefined && typeof payload[field] !== 'string') {
      throw new BadRequestException({
        error: `${field} must be a string`,
        code
      });
    }
  }

  for (const [field, code] of [
    ['imageUrls', 'INVALID_GALLERY_IMAGE'],
    ['tags', 'INVALID_GALLERY_PAYLOAD']
  ] as const) {
    const value = payload[field];
    if (
      value !== undefined &&
      typeof value !== 'string' &&
      (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    ) {
      throw new BadRequestException({
        error: `${field} must be a string or an array of strings`,
        code
      });
    }
  }
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

function resolvePublicUploadUrl(value: string) {
  const url = `${value || ''}`.trim();
  const publicBaseUrl = `${process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || ''}`
    .trim()
    .replace(/\/+$/, '');
  const match = url.match(
    /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(\/api\/v1\/staff\/uploads\/images\/[^?#]+(?:[?#].*)?)$/i
  );

  if (!match || !publicBaseUrl) {
    return url;
  }

  return `${publicBaseUrl}${match[1]}`;
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
  const normalized = `${status ?? 'active'}`.trim().toLowerCase();

  if (normalized !== 'active' && normalized !== 'inactive') {
    throw new BadRequestException({
      error: 'status must be active or inactive',
      code: 'INVALID_GALLERY_STATUS'
    });
  }

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
  assertGalleryPayload(input);
  const title = `${input.title || ''}`.trim();
  const imageUrls = normalizeStringArray(input.imageUrls);
  const imageUrl = `${input.imageUrl || input.coverImageUrl || imageUrls[0] || ''}`.trim();
  const description = `${input.description || ''}`.trim();
  const tags = normalizeStringArray(input.tags);
  const publishedAt = normalizePublishedAt(input.publishedAt);
  const sortOrder = input.sortOrder === undefined ? 0 : Number(input.sortOrder);
  const status = normalizeGalleryStatus(input.status);

  if (!title) {
    throw new BadRequestException({
      error: 'Title is required',
      code: 'INVALID_GALLERY_TITLE'
    });
  }

  if (title.length > 191) {
    throw new BadRequestException({
      error: 'Title is too long',
      code: 'INVALID_GALLERY_TITLE'
    });
  }

  if (!imageUrl) {
    throw new BadRequestException({
      error: 'Cover image is required',
      code: 'INVALID_GALLERY_IMAGE'
    });
  }

  if (!Number.isInteger(sortOrder)) {
    throw new BadRequestException({
      error: 'sortOrder must be an integer',
      code: 'INVALID_GALLERY_SORT_ORDER'
    });
  }

  const normalizedImageUrls = imageUrls.length ? [...imageUrls] : [imageUrl];
  if (!normalizedImageUrls.includes(imageUrl)) {
    normalizedImageUrls.unshift(imageUrl);
  }

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
  const imageUrl = resolvePublicUploadUrl(item.imageUrl);
  const imageUrls = safeParseStringArray(item.imageUrlsJson).map(resolvePublicUploadUrl);
  const tags = safeParseStringArray(item.tagsJson);

  return {
    id: item.id,
    title: item.title,
    imageUrl,
    imageUrls: imageUrls.length ? imageUrls : [imageUrl],
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
