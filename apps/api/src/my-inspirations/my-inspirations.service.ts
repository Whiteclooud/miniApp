import { createHash } from 'node:crypto';
import { CustomerInspiration, GalleryItem, GalleryStatus, Prisma } from '@prisma/client';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { ApiGalleryItem, mapGalleryItem } from '../gallery/gallery.shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMyInspirationDto } from './dto/create-my-inspiration.dto';
import { ListMyInspirationsQuery } from './dto/list-my-inspirations.query';
import { UpdateMyInspirationDto } from './dto/update-my-inspiration.dto';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;
const MAX_NOTE_LENGTH = 2000;

type InspirationWithGallery = CustomerInspiration & {
  galleryItem: GalleryItem;
};

type InspirationCursor = {
  createdAt: Date;
  id: string;
};

export interface ApiMyInspirationItem {
  id: string;
  galleryItemId: string;
  note: string;
  availability: 'available' | 'unavailable';
  createdAt: string;
  updatedAt: string;
  galleryItem: ApiGalleryItem | null;
}

@Injectable()
export class MyInspirationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listItems(customerOpenId?: string, query: ListMyInspirationsQuery = {}) {
    const owner = this.assertCustomerAuthorized(customerOpenId);
    const limit = this.parseLimit(query.limit);
    const cursor = this.parseCursor(query.cursor, owner);

    const rows = await this.prisma.customerInspiration.findMany({
      where: {
        customerOpenId: owner,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                {
                  createdAt: cursor.createdAt,
                  id: { lt: cursor.id }
                }
              ]
            }
          : {})
      },
      include: {
        galleryItem: true
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: pageRows.map((row) => this.mapItem(row)),
      pageInfo: {
        hasMore,
        nextCursor:
          hasMore && pageRows.length
            ? this.encodeCursor(pageRows[pageRows.length - 1], owner)
            : null
      }
    };
  }

  async getItem(customerOpenId?: string, inspirationId?: string) {
    const owner = this.assertCustomerAuthorized(customerOpenId);
    const row = await this.findOwnedItem(owner, inspirationId);
    return this.mapItem(row);
  }

  async createItem(
    customerOpenId?: string,
    payload: CreateMyInspirationDto = {}
  ): Promise<ApiMyInspirationItem> {
    const owner = this.assertCustomerAuthorized(customerOpenId);
    this.assertObjectPayload(payload);
    this.assertAllowedKeys(payload, ['galleryItemId', 'note'], 'INVALID_INSPIRATION_CREATE');
    const galleryItemId = this.normalizeGalleryItemId(payload.galleryItemId);
    const note = this.normalizeNote(payload.note);

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const activeGalleryRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM gallery_items
          WHERE id = ${galleryItemId} AND status = ${GalleryStatus.ACTIVE}
          FOR UPDATE
        `;

        if (!activeGalleryRows.length) {
          this.throwGalleryItemNotAvailable();
        }

        const existing = await tx.customerInspiration.findUnique({
          where: {
            customerOpenId_galleryItemId: {
              customerOpenId: owner,
              galleryItemId
            }
          },
          include: {
            galleryItem: true
          }
        });

        if (existing) {
          return existing;
        }

        return tx.customerInspiration.create({
          data: {
            customerOpenId: owner,
            galleryItemId,
            note: note || null
          },
          include: {
            galleryItem: true
          }
        });
      });
      return this.mapItem(row);
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        const existing = await this.prisma.customerInspiration.findUnique({
          where: {
            customerOpenId_galleryItemId: {
              customerOpenId: owner,
              galleryItemId
            }
          },
          include: {
            galleryItem: true
          }
        });
        if (existing) {
          return this.mapItem(existing);
        }
      }
      if (this.isPrismaError(error, 'P2003') || this.isPrismaError(error, 'P2025')) {
        this.throwGalleryItemNotAvailable();
      }
      throw error;
    }
  }

  async updateItem(
    customerOpenId?: string,
    inspirationId?: string,
    payload: UpdateMyInspirationDto = {}
  ): Promise<ApiMyInspirationItem> {
    const owner = this.assertCustomerAuthorized(customerOpenId);
    this.assertObjectPayload(payload);
    this.assertAllowedKeys(payload, ['note'], 'INVALID_INSPIRATION_UPDATE');

    if (!Object.prototype.hasOwnProperty.call(payload, 'note')) {
      throw new BadRequestException({
        error: 'note is required',
        code: 'INVALID_INSPIRATION_UPDATE'
      });
    }

    const existing = await this.findOwnedItem(owner, inspirationId);
    const note = this.normalizeNote(payload.note);
    try {
      const row = await this.prisma.customerInspiration.update({
        where: {
          id: existing.id
        },
        data: {
          note: note || null
        },
        include: {
          galleryItem: true
        }
      });
      return this.mapItem(row);
    } catch (error) {
      if (this.isPrismaError(error, 'P2025')) {
        this.throwInspirationNotFound();
      }
      throw error;
    }
  }

  async deleteItem(
    customerOpenId?: string,
    inspirationId?: string
  ): Promise<ApiMyInspirationItem> {
    const owner = this.assertCustomerAuthorized(customerOpenId);
    const existing = await this.findOwnedItem(owner, inspirationId);
    const result = await this.prisma.customerInspiration.deleteMany({
      where: {
        id: existing.id,
        customerOpenId: owner
      }
    });

    if (!result.count) {
      this.throwInspirationNotFound();
    }

    return this.mapItem(existing);
  }

  private async findOwnedItem(customerOpenId: string, inspirationId?: string) {
    const normalizedId = `${inspirationId || ''}`.trim();
    const row = normalizedId
      ? await this.prisma.customerInspiration.findFirst({
          where: {
            id: normalizedId,
            customerOpenId
          },
          include: {
            galleryItem: true
          }
        })
      : null;

    if (!row) {
      this.throwInspirationNotFound();
    }

    return row;
  }

  private assertCustomerAuthorized(customerOpenId?: string) {
    const normalized = `${customerOpenId || ''}`.trim();
    if (!normalized) {
      throw new UnauthorizedException({
        error: 'Customer unauthorized',
        code: 'CUSTOMER_UNAUTHORIZED'
      });
    }
    return normalized;
  }

  private parseLimit(value: unknown) {
    if (value === undefined || value === '') {
      return DEFAULT_PAGE_LIMIT;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException({
        error: `limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`,
        code: 'INVALID_INSPIRATION_LIMIT'
      });
    }
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
      throw new BadRequestException({
        error: `limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`,
        code: 'INVALID_INSPIRATION_LIMIT'
      });
    }
    return limit;
  }

  private parseCursor(value: unknown, customerOpenId: string): InspirationCursor | null {
    if (value === undefined || value === '') {
      return null;
    }
    if (typeof value !== 'string' || value.length > 512) {
      this.throwInvalidCursor();
    }

    try {
      const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
        v?: unknown;
        o?: unknown;
        c?: unknown;
        i?: unknown;
      };
      const createdAtText = typeof decoded.c === 'string' ? decoded.c : '';
      const isCanonicalTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
        createdAtText
      );
      const createdAt = isCanonicalTimestamp
        ? new Date(createdAtText)
        : new Date(NaN);
      const hasDatabaseSafeTimestamp =
        !Number.isNaN(createdAt.getTime()) &&
        createdAt.getUTCFullYear() >= 1000 &&
        createdAt.toISOString() === createdAtText;
      const cursorId = typeof decoded.i === 'string' ? decoded.i : '';
      // IDs are opaque database values. Validate their transport shape, but
      // do not couple pagination to Prisma's current cuid format so imported
      // or migrated records remain cursor-compatible.
      const hasValidCursorId =
        cursorId.length > 0 &&
        cursorId.length <= 191 &&
        !/[\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/.test(cursorId);
      if (
        decoded.v !== 1 ||
        decoded.o !== this.cursorOwnerHash(customerOpenId) ||
        !hasValidCursorId ||
        !hasDatabaseSafeTimestamp
      ) {
        this.throwInvalidCursor();
      }
      return {
        createdAt,
        id: cursorId
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.throwInvalidCursor();
    }
  }

  private encodeCursor(row: CustomerInspiration, customerOpenId: string) {
    return Buffer.from(
      JSON.stringify({
        v: 1,
        o: this.cursorOwnerHash(customerOpenId),
        c: row.createdAt.toISOString(),
        i: row.id
      })
    ).toString('base64url');
  }

  private cursorOwnerHash(customerOpenId: string) {
    return createHash('sha256').update(customerOpenId).digest('base64url').slice(0, 22);
  }

  private normalizeGalleryItemId(value: unknown) {
    if (typeof value !== 'string') {
      throw new BadRequestException({
        error: 'Invalid galleryItemId',
        code: 'INVALID_INSPIRATION_GALLERY_ITEM_ID'
      });
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > 191) {
      throw new BadRequestException({
        error: 'Invalid galleryItemId',
        code: 'INVALID_INSPIRATION_GALLERY_ITEM_ID'
      });
    }
    return normalized;
  }

  private normalizeNote(value: unknown) {
    if (value === undefined || value === null) {
      return '';
    }
    if (typeof value !== 'string' || value.trim().length > MAX_NOTE_LENGTH) {
      throw new BadRequestException({
        error: `note must be a string with at most ${MAX_NOTE_LENGTH} characters`,
        code: 'INVALID_INSPIRATION_NOTE'
      });
    }
    return value.trim();
  }

  private assertObjectPayload(value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException({
        error: 'Invalid inspiration payload',
        code: 'INVALID_INSPIRATION_PAYLOAD'
      });
    }
  }

  private assertAllowedKeys(
    payload: object,
    allowedKeys: string[],
    code: string
  ) {
    if (Object.keys(payload).some((key) => !allowedKeys.includes(key))) {
      throw new BadRequestException({
        error: 'Unsupported inspiration field',
        code
      });
    }
  }

  private mapItem(row: InspirationWithGallery): ApiMyInspirationItem {
    const isAvailable = row.galleryItem.status === GalleryStatus.ACTIVE;
    return {
      id: row.id,
      galleryItemId: row.galleryItemId,
      note: row.note ?? '',
      availability: isAvailable ? 'available' : 'unavailable',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      galleryItem: isAvailable ? mapGalleryItem(row.galleryItem) : null
    };
  }

  private isPrismaError(error: unknown, code: string) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }

  private throwGalleryItemNotAvailable(): never {
    throw new NotFoundException({
      error: 'Gallery item is not available',
      code: 'GALLERY_ITEM_NOT_AVAILABLE'
    });
  }

  private throwInvalidCursor(): never {
    throw new BadRequestException({
      error: 'Invalid inspiration cursor',
      code: 'INVALID_INSPIRATION_CURSOR'
    });
  }

  private throwInspirationNotFound(): never {
    throw new NotFoundException({
      error: 'Inspiration not found',
      code: 'INSPIRATION_NOT_FOUND'
    });
  }
}
