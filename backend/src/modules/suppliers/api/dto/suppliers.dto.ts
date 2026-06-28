import { SupplierPaymentMethod, SupplierReceivePaymentType, SupplierStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../core/dto/pagination-query.dto';

const MONEY_PATTERN = /^\d+(\.\d{1,4})?$/;

export class SupplierListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SupplierStatus)
  status?: SupplierStatus;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  sort?: string;
}

export class SupplierSearchQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;
}

export class CreateSupplierRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateSupplierRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactPerson?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsEnum(SupplierStatus)
  status?: SupplierStatus;
}

export class SupplierReceiptListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsEnum(['day', 'month', 'year'])
  period?: 'day' | 'month' | 'year';
}

export class SupplierPaymentListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}

export class CreateSupplierPaymentRequestDto {
  @IsString()
  @Matches(MONEY_PATTERN)
  amountUzs!: string;

  @IsEnum(SupplierPaymentMethod)
  paymentMethod!: SupplierPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class SupplierResponseDto {
  id!: string;
  name!: string;
  phone!: string;
  contactPerson!: string | null;
  notes!: string | null;
  status!: string;
  totalDebtUzs!: string;
  totalPaidUzs!: string;
  remainingDebtUzs!: string;
  createdAt!: string;
  updatedAt!: string;
}

export class SupplierReceiptResponseDto {
  id!: string;
  supplierId!: string;
  productId!: string;
  productName!: string;
  sku!: string;
  quantity!: string;
  unitCostUzs!: string;
  totalCostUzs!: string;
  paymentType!: SupplierReceivePaymentType;
  note!: string | null;
  createdAt!: string;
}

export class SupplierPaymentResponseDto {
  id!: string;
  supplierId!: string;
  supplierName!: string;
  amountUzs!: string;
  paymentMethod!: string;
  notes!: string | null;
  createdAt!: string;
  recordedBy!: string;
}

export class SupplierDebtHistoryEntryDto {
  id!: string;
  type!: string;
  amountUzs!: string;
  balanceAfterUzs!: string;
  reference!: string | null;
  createdAt!: string;
  recordedBy!: string;
}

export class SupplierSummaryResponseDto {
  supplierCount!: number;
  totalDebtUzs!: string;
  totalPaidUzs!: string;
  remainingDebtUzs!: string;
  topSupplierName!: string | null;
  topSupplierDebtUzs!: string;
  recentPayments!: SupplierPaymentResponseDto[];
}
