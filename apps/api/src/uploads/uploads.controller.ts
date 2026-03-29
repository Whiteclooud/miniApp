import { Controller, Get, Headers, Param, Post, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';

@Controller('api/v1/staff/uploads/images')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseInterceptors(AnyFilesInterceptor())
  async uploadImages(
    @Headers('x-staff-openid') staffOpenId?: string,
    @UploadedFiles() files: Array<{ originalname?: string; buffer: Buffer }> = []
  ) {
    const items = await this.uploadsService.uploadImages(staffOpenId, files);
    return { items };
  }

  @Get(':filename')
  async getImage(@Param('filename') filename: string, @Res() response: any) {
    return response.sendFile(this.uploadsService.getImageFilePath(filename));
  }
}
