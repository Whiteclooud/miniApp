import { promises as fs } from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { assertStaffAuthorized } from '../staff-auth/staff-auth';

export interface UploadedImageItem {
  url: string;
}

@Injectable()
export class UploadsService {
  private readonly uploadDir = path.resolve(process.cwd(), 'uploads', 'gallery');

  async uploadImages(staffOpenId: string | undefined, files: Array<{ originalname?: string; buffer: Buffer }> = []) {
    assertStaffAuthorized(staffOpenId);

    if (!files.length) {
      return [];
    }

    await fs.mkdir(this.uploadDir, { recursive: true });

    const items: UploadedImageItem[] = [];
    for (const file of files) {
      const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
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

  private resolveBaseUrl() {
    return process.env.PUBLIC_BASE_URL || process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3100}`;
  }
}
