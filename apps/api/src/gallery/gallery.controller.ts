import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { GalleryService } from './gallery.service';

@Controller('api/v1/gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  async listGallery(
    @Query('limit') limitText?: string,
    @Query('tag') tagText?: string
  ) {
    const limit = this.parseLimit(limitText);
    const tag = this.parseTag(tagText);
    const items = await this.galleryService.listActiveItems({ limit, tag });
    return { items };
  }

  @Get(':id')
  async getGalleryItem(@Param('id') itemId?: string) {
    const item = await this.galleryService.getActiveItem(itemId);
    return { item };
  }

  private parseLimit(limitText?: string) {
    if (!limitText) {
      return undefined;
    }

    const limit = Number(limitText);
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new BadRequestException({
        error: 'Invalid limit',
        code: 'INVALID_LIMIT'
      });
    }

    return limit;
  }

  private parseTag(tagText?: string) {
    const tag = `${tagText || ''}`.trim();
    if (tag.length > 64) {
      throw new BadRequestException({
        error: 'Invalid tag',
        code: 'INVALID_GALLERY_TAG'
      });
    }

    return tag || undefined;
  }
}
