import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException
} from '@nestjs/common';
import { assertStaffAuthorized } from '../staff-auth/staff-auth';
import { uploadMaxFiles, uploadMaxFileSizeBytes } from './uploads.security';

export interface UploadedImageItem {
  url: string;
}

export type UploadedImageFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer: Buffer;
};

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};
const SAFE_IMAGE_FILENAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:jpe?g|png|webp)$/;
const CUSTOMER_IMAGE_FILENAME_PATTERN =
  /^customer-([a-f0-9]{64})-(\d{10,16})-([a-f0-9]{24})\.(?:jpg|png|webp)$/;

function normalizeImageExtension(extension: string) {
  return extension === '.jpeg' ? '.jpg' : extension;
}

function resolveCustomerFilenamePrefix(customerOpenId: string) {
  const ownerHash = createHash('sha256').update(customerOpenId).digest('hex');
  return `customer-${ownerHash}-`;
}

function detectImageExtension(buffer: Buffer) {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return '.png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return '.webp';
  }

  return '';
}

@Injectable()
export class UploadsService {
  private readonly uploadDir = path.resolve(process.cwd(), 'uploads', 'gallery');
  private readonly maxFiles = uploadMaxFiles;
  private readonly maxFileSizeBytes = uploadMaxFileSizeBytes;

  async uploadImages(staffOpenId: string | undefined, files: UploadedImageFile[] = []) {
    assertStaffAuthorized(staffOpenId);

    return this.storeImages(files, '/api/v1/staff/uploads/images');
  }

  async uploadCustomerImages(customerOpenId: string | undefined, files: UploadedImageFile[] = []) {
    const normalizedCustomerOpenId = `${customerOpenId || ''}`.trim();

    if (!normalizedCustomerOpenId) {
      throw new UnauthorizedException({
        error: 'Customer unauthorized',
        code: 'CUSTOMER_UNAUTHORIZED'
      });
    }

    return this.storeImages(
      files,
      '/api/v1/uploads/images',
      resolveCustomerFilenamePrefix(normalizedCustomerOpenId)
    );
  }

  async deleteCustomerImage(customerOpenId: string | undefined, filename?: string) {
    const normalizedCustomerOpenId = `${customerOpenId || ''}`.trim();
    if (!normalizedCustomerOpenId) {
      throw new UnauthorizedException({
        error: 'Customer unauthorized',
        code: 'CUSTOMER_UNAUTHORIZED'
      });
    }

    const normalizedFilename = this.normalizeDeleteFilename(filename);
    const customerMatch = normalizedFilename.match(CUSTOMER_IMAGE_FILENAME_PATTERN);
    const ownerHash = createHash('sha256').update(normalizedCustomerOpenId).digest('hex');

    if (!customerMatch || customerMatch[1] !== ownerHash) {
      throw new ForbiddenException({
        error: 'Customer upload is not owned by current customer',
        code: 'CUSTOMER_UPLOAD_FORBIDDEN'
      });
    }

    const absolutePath = path.resolve(this.uploadDir, normalizedFilename);
    if (path.dirname(absolutePath) !== this.uploadDir) {
      this.throwInvalidUploadFilename();
    }

    try {
      await fs.unlink(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException({
          error: 'Customer upload not found',
          code: 'CUSTOMER_UPLOAD_NOT_FOUND'
        });
      }
      throw error;
    }

    return { filename: normalizedFilename };
  }

  private async storeImages(
    files: UploadedImageFile[],
    publicPath: string,
    filenamePrefix = ''
  ) {
    if (!files.length) {
      return [];
    }

    if (files.length > this.maxFiles) {
      throw new BadRequestException({
        error: 'Too many files',
        code: 'UPLOAD_FILE_COUNT_EXCEEDED'
      });
    }

    const validatedFiles = files.map((file) => ({
      file,
      extension: this.resolveImageExtension(file)
    }));

    await fs.mkdir(this.uploadDir, { recursive: true });

    const items: UploadedImageItem[] = [];
    const batchPaths: string[] = [];

    try {
      for (const { file, extension } of validatedFiles) {
        const filename =
          `${filenamePrefix}${Date.now()}-` +
          `${randomBytes(12).toString('hex')}${extension}`;
        const absolutePath = path.join(this.uploadDir, filename);
        batchPaths.push(absolutePath);
        await fs.writeFile(absolutePath, file.buffer);
        items.push({
          url: `${this.resolveBaseUrl()}${publicPath}/${filename}`
        });
      }
    } catch (error) {
      await Promise.all(
        batchPaths.map((absolutePath) => fs.unlink(absolutePath).catch(() => undefined))
      );
      throw error;
    }

    return items;
  }

  getImageFilePath(filename: string) {
    return path.join(this.uploadDir, path.basename(filename));
  }

  private normalizeDeleteFilename(filename?: string) {
    const normalizedFilename = `${filename || ''}`.trim();
    if (
      !normalizedFilename ||
      normalizedFilename.length > 255 ||
      path.posix.basename(normalizedFilename) !== normalizedFilename ||
      path.win32.basename(normalizedFilename) !== normalizedFilename ||
      !SAFE_IMAGE_FILENAME_PATTERN.test(normalizedFilename)
    ) {
      this.throwInvalidUploadFilename();
    }

    return normalizedFilename;
  }

  private throwInvalidUploadFilename(): never {
    throw new BadRequestException({
      error: 'Invalid upload filename',
      code: 'INVALID_UPLOAD_FILENAME'
    });
  }

  private resolveImageExtension(file: UploadedImageFile) {
    if (!Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException({
        error: 'Invalid image file',
        code: 'INVALID_IMAGE_FILE'
      });
    }

    // Multer supplies both values, but use the larger one so a forged size
    // field cannot bypass the byte limit when this service is called directly.
    const declaredSize = Number(file.size || 0);
    const fileSize = Math.max(
      Number.isFinite(declaredSize) && declaredSize > 0 ? declaredSize : 0,
      file.buffer.length
    );
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

    const detectedExtension = detectImageExtension(file.buffer);
    const declaredExtension = normalizeImageExtension(extension);
    const mimeExtension = MIME_EXTENSION_MAP[mimeType] || '';

    if (
      !detectedExtension ||
      (declaredExtension && declaredExtension !== detectedExtension) ||
      (mimeExtension && mimeExtension !== detectedExtension)
    ) {
      throw new BadRequestException({
        error: 'Invalid image file',
        code: 'INVALID_IMAGE_FILE'
      });
    }

    return detectedExtension;
  }

  private resolveBaseUrl() {
    return (
      process.env.PUBLIC_BASE_URL ||
      process.env.API_BASE_URL ||
      `http://127.0.0.1:${process.env.PORT || 3100}`
    ).replace(/\/+$/, '');
  }
}
