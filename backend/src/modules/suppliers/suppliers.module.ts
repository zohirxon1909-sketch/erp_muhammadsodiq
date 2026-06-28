import { Module } from '@nestjs/common';
import { SuppliersController } from './api/suppliers.controller';
import { SuppliersService } from './application/suppliers.service';
import { SupplierDebtService } from './application/supplier-debt.service';

@Module({
  controllers: [SuppliersController],
  providers: [SuppliersService, SupplierDebtService],
  exports: [SuppliersService, SupplierDebtService],
})
export class SuppliersModule {}
