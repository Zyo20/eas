import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    let dbOk = false;
    let dbDetail = 'unreachable';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
      dbDetail = 'connected';
    } catch (err) {
      dbDetail = (err as Error).message;
    }
    return {
      ok: dbOk,
      service: 'api',
      stage: 'nest+db',
      db: dbDetail,
    };
  }
}
