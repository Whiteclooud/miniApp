import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MyInspirationsController } from './my-inspirations.controller';
import { MyInspirationsService } from './my-inspirations.service';

@Module({
  imports: [PrismaModule],
  controllers: [MyInspirationsController],
  providers: [MyInspirationsService]
})
export class MyInspirationsModule {}
