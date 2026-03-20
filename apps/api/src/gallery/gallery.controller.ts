import { Controller, Get } from '@nestjs/common';
import { GalleryService } from './gallery.service';

@Controller('api/v1/gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  async listGallery() {
    const items = await this.galleryService.listActiveItems();
    return { items };
  }
}
