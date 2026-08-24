import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AuthService, PERMISSIONS } from '../auth/auth.service';
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
    const identity = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_GALLERY_READ, staffOpenId);
    const items = await this.staffGalleryService.listItems(identity.openId);
    return { items };
  }

  @Get(':id')
  async getItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') itemId?: string
  ) {
    const identity = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_GALLERY_READ, staffOpenId);
    const item = await this.staffGalleryService.getItem(identity.openId, itemId);
    return { item };
  }

  @Post()
  async createItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Body() payload: UpsertStaffGalleryDto = {}
  ) {
    const identity = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_GALLERY_WRITE, staffOpenId);
    const item = await this.staffGalleryService.createItem(identity.openId, payload);
    return { item };
  }

  @Patch(':id')
  async updateItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') itemId?: string,
    @Body() payload: UpsertStaffGalleryDto = {}
  ) {
    const identity = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_GALLERY_WRITE, staffOpenId);
    const item = await this.staffGalleryService.updateItem(identity.openId, itemId, payload);
    return { item };
  }

  @Delete(':id')
  async deleteItem(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @Param('id') itemId?: string
  ) {
    const identity = await this.authService.requirePermission(authorization, PERMISSIONS.STAFF_GALLERY_WRITE, staffOpenId);
    const item = await this.staffGalleryService.deleteItem(identity.openId, itemId);
    return { item };
  }
}
