import { Controller, Get, Headers, Param, Post, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { AuthService } from '../auth/auth.service';
import { UploadsService } from './uploads.service';

@Controller('api/v1/staff/uploads/images')
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly authService: AuthService
  ) {}

  @Post()
  @UseInterceptors(AnyFilesInterceptor())
  async uploadImages(
    @Headers('authorization') authorization?: string,
    @Headers('x-staff-openid') staffOpenId?: string,
    @UploadedFiles() files: Array<{ originalname?: string; mimetype?: string; size?: number; buffer: Buffer }> = []
  ) {
    const resolvedStaffOpenId = await this.authService.resolveStaffOpenId(authorization, staffOpenId);
    const items = await this.uploadsService.uploadImages(resolvedStaffOpenId, files);
    return { items };
  }

  @Get(':filename')
  async getImage(@Param('filename') filename: string, @Res() response: any) {
    return response.sendFile(this.uploadsService.getImageFilePath(filename));
  }
}
