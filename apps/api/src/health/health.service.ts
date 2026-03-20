import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    await this.prisma.$queryRawUnsafe('SELECT 1');
    return {
      ok: true,
      service: 'miniapp-api',
      timestamp: new Date().toISOString()
    };
  }
}
