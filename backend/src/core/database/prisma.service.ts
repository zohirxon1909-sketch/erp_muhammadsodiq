import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async setCompanyContext(companyId: string): Promise<void> {
    await this.$executeRawUnsafe(
      `SELECT set_config('app.company_id', $1, true)`,
      companyId,
    );
  }
}
