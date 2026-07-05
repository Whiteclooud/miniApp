import { promises as fs } from 'fs';
import * as path from 'path';
import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { assertStaffAuthorized } from '../staff-auth/staff-auth';

export interface UploadedImageItem {
  url: string;
}

type UploadedFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer: Buffer;
};

const DEFAULT_MAX_FILES = 6;
const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

function resolvePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class UploadsService {
  private readonly uploadDir = path.resolve(process.cwd(), 'uploads', 'gallery');
  private readonly maxFiles = resolvePositiveInt(process.env.UPLOAD_MAX_FILES, DEFAULT_MAX_FILES);
  private readonly maxFileSizeBytes = resolvePositiveInt(
    process.env.UPLOAD_MAX_FILE_SIZE_BYTES,
    DEFAULT_MAX_FILE_SIZE_BYTES
  );

  async uploadImages(staffOpenId: string | undefined, files: UploadedFile[] = []) {
    assertStaffAuthorized(staffOpenId);

    if (!files.length) {
      return [];
    }

    if (files.length > this.maxFiles) {
      throw new BadRequestException({
        error: 'Too many files',
        code: 'UPLOAD_FILE_COUNT_EXCEEDED'
      });
    }

    await fs.mkdir(this.uploadDir, { recursive: true });

    const items: UploadedImageItem[] = [];
    for (const file of files) {
      const extension = this.resolveImageExtension(file);
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`;
      const absolutePath = path.join(this.uploadDir, filename);
      await fs.writeFile(absolutePath, file.buffer);
      items.push({
        url: `${this.resolveBaseUrl()}/api/v1/staff/uploads/images/${filename}`
      });
    }

    return items;
  }

  getImageFilePath(filename: string) {
    return path.join(this.uploadDir, path.basename(filename));
  }

  private resolveImageExtension(file: UploadedFile) {
    const fileSize = Number(file.size || file.buffer?.length || 0);
    if (fileSize <= 0) {
      throw new BadRequestException({
        error: 'Invalid image file',
        code: 'INVALID_IMAGE_FILE'
      });
    }

    if (fileSize > this.maxFileSizeBytes) {
      throw new PayloadTooLargeException({
        error: 'Upload image is too large',
        code: 'UPLOAD_TOO_LARGE'
      });
    }

    const mimeType = `${file.mimetype || ''}`.trim().toLowerCase();
    const extension = path.extname(file.originalname || '').toLowerCase();

    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException({
        error: 'Unsupported image type',
        code: 'UNSUPPORTED_IMAGE_TYPE'
      });
    }

    if (extension && !ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException({
        error: 'Unsupported image type',
        code: 'UNSUPPORTED_IMAGE_TYPE'
      });
    }

    if (!mimeType && !extension) {
      throw new BadRequestException({
        error: 'Unsupported image type',
        code: 'UNSUPPORTED_IMAGE_TYPE'
      });
    }

    return extension || MIME_EXTENSION_MAP[mimeType] || '.jpg';
  }

  private resolveBaseUrl() {
    return process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3100}`;
  }
}
