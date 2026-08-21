import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { UploadedImageFile, UploadsService } from './uploads.service';
import {
  AuthenticatedUploadRequest,
  StaffUploadAuthGuard,
  UploadHttpExceptionFilter,
  uploadMulterOptions
} from './uploads.security';

@Controller('api/v1/staff/uploads/images')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseGuards(StaffUploadAuthGuard)
  @UseFilters(UploadHttpExceptionFilter)
  @UseInterceptors(AnyFilesInterceptor(uploadMulterOptions))
  async uploadImages(
    @Req() request: AuthenticatedUploadRequest,
    @UploadedFiles() files: UploadedImageFile[] = []
  ) {
    const items = await this.uploadsService.uploadImages(request.staffOpenId, files);
    return { items };
  }

  @Get(':filename')
  async getImage(@Param('filename') filename: string, @Res() response: any) {
    return response.sendFile(this.uploadsService.getImageFilePath(filename));
  }
}
