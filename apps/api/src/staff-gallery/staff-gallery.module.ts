import { Module } from '@nestjs/common';
import { StaffGalleryController } from './staff-gallery.controller';
import { StaffGalleryService } from './staff-gallery.service';

@Module({
  controllers: [StaffGalleryController],
  providers: [StaffGalleryService]
})
export class StaffGalleryModule {}
