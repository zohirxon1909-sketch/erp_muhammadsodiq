import { Global, Module } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { RedisService } from './redis/redis.service';
import { AuditService } from './audit/audit.service';
import { CompanyContextService } from './company/company-context.service';
import { AccessControlService } from './access/access-control.service';
import { SecurityConfigService } from './security/security-config.service';
import { IdempotencyService } from './idempotency/idempotency.service';
import { PilotErrorLogger } from './logging/pilot-error.logger';

@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    AuditService,
    CompanyContextService,
    AccessControlService,
    SecurityConfigService,
    IdempotencyService,
    PilotErrorLogger,
  ],
  exports: [
    PrismaService,
    RedisService,
    AuditService,
    CompanyContextService,
    AccessControlService,
    SecurityConfigService,
    IdempotencyService,
    PilotErrorLogger,
  ],
})
export class CoreModule {}
