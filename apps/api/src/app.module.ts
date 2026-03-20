import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { GalleryModule } from './gallery/gallery.module';

@Module({
  imports: [PrismaModule, HealthModule, GalleryModule]
})
export class AppModule {}
