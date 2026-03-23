import { Injectable } from '@nestjs/common';
import { GalleryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function safeParseStringArray(value: string | null | undefined): string[] {
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

@Injectable()
export class GalleryService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveItems() {
    const rows = await this.prisma.galleryItem.findMany({
      where: {
        status: GalleryStatus.ACTIVE
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }]
    });

    return rows.map((item) => {
      const imageUrls = safeParseStringArray(item.imageUrlsJson);
      const tags = safeParseStringArray(item.tagsJson);

      return {
        id: item.id,
        title: item.title,
        imageUrl: item.imageUrl,
        imageUrls: imageUrls.length ? imageUrls : [item.imageUrl],
        tags,
        sortOrder: item.sortOrder,
        status: 'active'
      };
    });
  }
}
