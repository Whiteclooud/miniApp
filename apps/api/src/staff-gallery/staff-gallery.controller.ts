import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { UpsertStaffGalleryDto } from './dto/upsert-staff-gallery.dto';
import { StaffGalleryService } from './staff-gallery.service';

@Controller('api/v1/staff/gallery')
export class StaffGalleryController {
  constructor(
    private readonly staffGalleryService: StaffGalleryService,
    private readonly authService: AuthService
  ) {}

  @Get()
  async listItems(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string
  ) {
    const resolvedStaffOpenId = await this.authService.resolveStaffOpenId(authorization, staffOpenId);
    const items = await this.staffGalleryService.listItems(resolvedStaffOpenId);
    return { items };
  }

  @Get(':id')
  async getItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') itemId?: string
  ) {
    const resolvedStaffOpenId = await this.authService.resolveStaffOpenId(authorization, staffOpenId);
    const item = await this.staffGalleryService.getItem(resolvedStaffOpenId, itemId);
    return { item };
  }

  @Post()
  async createItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Body() payload: UpsertStaffGalleryDto = {}
  ) {
    const resolvedStaffOpenId = await this.authService.resolveStaffOpenId(authorization, staffOpenId);
    const item = await this.staffGalleryService.createItem(resolvedStaffOpenId, payload);
    return { item };
  }

  @Patch(':id')
  async updateItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') itemId?: string,
    @Body() payload: UpsertStaffGalleryDto = {}
  ) {
    const resolvedStaffOpenId = await this.authService.resolveStaffOpenId(authorization, staffOpenId);
    const item = await this.staffGalleryService.updateItem(resolvedStaffOpenId, itemId, payload);
    return { item };
  }

  @Delete(':id')
  async deleteItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') itemId?: string
  ) {
    const resolvedStaffOpenId = await this.authService.resolveStaffOpenId(authorization, staffOpenId);
    const item = await this.staffGalleryService.deleteItem(resolvedStaffOpenId, itemId);
    return { item };
  }
}
