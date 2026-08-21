import { Module } from '@nestjs/common';
import { CustomerUploadsController } from './customer-uploads.controller';
import { UploadsController } from './uploads.controller';
import { CustomerUploadAuthGuard, StaffUploadAuthGuard } from './uploads.security';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController, CustomerUploadsController],
  providers: [UploadsService, CustomerUploadAuthGuard, StaffUploadAuthGuard],
  exports: [UploadsService]
})
export class UploadsModule {}
