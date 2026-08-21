import {
  Controller,
  Delete,
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
  CustomerUploadAuthGuard,
  UploadHttpExceptionFilter,
  uploadMulterOptions
} from './uploads.security';

@Controller('api/v1/uploads/images')
export class CustomerUploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseGuards(CustomerUploadAuthGuard)
  @UseFilters(UploadHttpExceptionFilter)
  @UseInterceptors(AnyFilesInterceptor(uploadMulterOptions))
  async uploadImages(
    @Req() request: AuthenticatedUploadRequest,
    @UploadedFiles() files: UploadedImageFile[] = []
  ) {
    const items = await this.uploadsService.uploadCustomerImages(request.customerOpenId, files);
    return { items };
  }

  @Get(':filename')
  async getImage(@Param('filename') filename: string, @Res() response: any) {
    return response.sendFile(this.uploadsService.getImageFilePath(filename));
  }

  @Delete(':filename')
  @UseGuards(CustomerUploadAuthGuard)
  async deleteImage(
    @Req() request: AuthenticatedUploadRequest,
    @Param('filename') filename?: string
  ) {
    const item = await this.uploadsService.deleteCustomerImage(request.customerOpenId, filename);
    return { item };
  }
}
