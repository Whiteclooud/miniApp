import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { GalleryService } from './gallery.service';

@Controller('api/v1/gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  async listGallery(@Query('limit') limitText?: string) {
    const limit = this.parseLimit(limitText);
    const items = await this.galleryService.listActiveItems(limit);
    return { items };
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
}
