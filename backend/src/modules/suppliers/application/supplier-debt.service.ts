import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SupplierDebtHistoryType,
  SupplierReceivePaymentType,
  SupplierStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../core/database/prisma.service';
import { AppException } from '../../../core/exceptions/app.exception';
import { formatMoney, isPositiveMoney } from '../../../core/utils/money.util';

@Injectable()
export class SupplierDebtService {
  constructor(private readonly prisma: PrismaService) {}

  async recordReceiptCredit(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      supplierId: string;
      productId: string;
      warehouseId: string;
      inventoryBatchId: string;
      quantity: Decimal;
      unitCostUzs: Decimal;
      note: string | null;
      receivedBy: string;
    },
  ): Promise<void> {
    const totalCostUzs = input.unitCostUzs.mul(input.quantity).toDecimalPlaces(4);

    await tx.supplierReceipt.create({
      data: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        inventoryBatchId: input.inventoryBatchId,
        quantity: input.quantity,
        unitCostUzs: input.unitCostUzs,
        totalCostUzs,
        paymentType: SupplierReceivePaymentType.CREDIT,
        note: input.note,
        receivedBy: input.receivedBy,
      },
    });

    const supplier = await tx.supplier.update({
      where: { id: input.supplierId, companyId: input.companyId },
      data: { totalDebtUzs: { increment: totalCostUzs } },
    });

    const balanceAfter = supplier.totalDebtUzs.sub(supplier.totalPaidUzs);

    await tx.supplierDebtHistory.create({
      data: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        type: SupplierDebtHistoryType.receipt_credit,
        amountUzs: totalCostUzs,
        balanceAfterUzs: balanceAfter,
        reference: input.inventoryBatchId,
        recordedBy: input.receivedBy,
      },
    });
  }

  async recordCashReceipt(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      supplierId: string;
      productId: string;
      warehouseId: string;
      inventoryBatchId: string;
      quantity: Decimal;
      unitCostUzs: Decimal;
      note: string | null;
      receivedBy: string;
    },
  ): Promise<void> {
    const totalCostUzs = input.unitCostUzs.mul(input.quantity).toDecimalPlaces(4);

    await tx.supplierReceipt.create({
      data: {
        companyId: input.companyId,
        supplierId: input.supplierId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        inventoryBatchId: input.inventoryBatchId,
        quantity: input.quantity,
        unitCostUzs: input.unitCostUzs,
        totalCostUzs,
        paymentType: SupplierReceivePaymentType.CASH,
        note: input.note,
        receivedBy: input.receivedBy,
      },
    });
  }

  async ensureSupplier(companyId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, companyId, deletedAt: null, status: SupplierStatus.ACTIVE },
    });
    if (!supplier) {
      throw AppException.notFound('Supplier', supplierId);
    }
    return supplier;
  }

  validatePaymentAmount(amountUzs: Decimal): void {
    if (!isPositiveMoney(amountUzs)) {
      throw AppException.validation('Validation failed', [
        { field: 'amountUzs', message: 'Must be > 0', code: 'INVALID_AMOUNT' },
      ]);
    }
  }

  async applyPayment(
    companyId: string,
    supplierId: string,
    amountUzs: Decimal,
    userId: string,
    paymentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Decimal> {
    const db = tx ?? this.prisma;
    const supplier = await db.supplier.findFirst({
      where: { id: supplierId, companyId, deletedAt: null },
    });
    if (!supplier) {
      throw AppException.notFound('Supplier', supplierId);
    }

    const remaining = supplier.totalDebtUzs.sub(supplier.totalPaidUzs);
    if (amountUzs.gt(remaining)) {
      throw AppException.businessRule('Payment exceeds remaining supplier debt', {
        remaining: formatMoney(remaining),
        amount: formatMoney(amountUzs),
      });
    }

    const updated = await db.supplier.update({
      where: { id: supplierId, companyId },
      data: { totalPaidUzs: { increment: amountUzs } },
    });

    const balanceAfter = updated.totalDebtUzs.sub(updated.totalPaidUzs);

    await db.supplierDebtHistory.create({
      data: {
        companyId,
        supplierId,
        type: SupplierDebtHistoryType.payment,
        amountUzs,
        balanceAfterUzs: balanceAfter,
        reference: paymentId,
        recordedBy: userId,
      },
    });

    return balanceAfter;
  }
}
