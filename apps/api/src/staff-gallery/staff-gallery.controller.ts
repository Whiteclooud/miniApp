import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { UpsertStaffGalleryDto } from './dto/upsert-staff-gallery.dto';
import { StaffGalleryService } from './staff-gallery.service';

@Controller('api/v1/staff/gallery')
export class StaffGalleryController {
  constructor(private readonly staffGalleryService: StaffGalleryService) {}

  @Get()
  async listItems(@Headers('x-staff-openid') staffOpenId?: string) {
    const items = await this.staffGalleryService.listItems(staffOpenId);
    return { items };
  }

  @Post()
  async createItem(
    @Headers('x-staff-openid') staffOpenId?: string,
    @Body() payload: UpsertStaffGalleryDto = {}
  ) {
    const item = await this.staffGalleryService.createItem(staffOpenId, payload);
    return { item };
  }

  @Patch(':id')
  async updateItem(
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') itemId?: string,
    @Body() payload: UpsertStaffGalleryDto = {}
  ) {
    const item = await this.staffGalleryService.updateItem(staffOpenId, itemId, payload);
    return { item };
  }
}
