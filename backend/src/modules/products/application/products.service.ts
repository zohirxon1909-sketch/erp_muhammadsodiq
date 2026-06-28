import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../core/database/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { AppException } from '../../../core/exceptions/app.exception';
import {
  formatMoney,
  isNonNegativeMoney,
  parseMoney,
  uzsToUsd,
} from '../../../core/utils/money.util';
import {
  buildPaginationMeta,
  paginationSkip,
  parseSort,
} from '../../../core/utils/pagination.util';
import { CategoriesService } from '../../categories/application/categories.service';
import { CurrencyService } from '../../currency/application/currency.service';
import { InventoryService } from '../../inventory/application/inventory.service';
import { getProductStockTotal } from '../../inventory/application/inventory.helpers';
import {
  CreateProductRequestDto,
  PosProductsQueryDto,
  ProductImportRequestDto,
  ProductImportRowDto,
  ProductListQueryDto,
  ProductResponseDto,
  ProductSearchQueryDto,
  UpdateProductRequestDto,
} from '../api/dto/products.dto';

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: { category: true; prices: true };
}>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly categoriesService: CategoriesService,
    private readonly currencyService: CurrencyService,
    private readonly inventoryService: InventoryService,
  ) {}

  async list(companyId: string, query: ProductListQueryDto) {
    const page = query.resolvedPage();
    const limit = query.resolvedLimit();
    const where: Prisma.ProductWhereInput = { companyId, deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { sku: { contains: query.q, mode: 'insensitive' } },
        { barcode: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const sort = parseSort(
      query.sort,
      ['name', 'sku', 'salePriceUzs', 'createdAt'],
      [{ field: 'name', direction: 'asc' }],
    );

    let productIdsFilter: string[] | undefined;
    if (query.stockLevel) {
      const stockRows = await this.prisma.$queryRawUnsafe<Array<{ product_id: string; stock_qty: Prisma.Decimal }>>(
        `SELECT product_id, SUM(remaining_qty) AS stock_qty
         FROM inventory_batches
         WHERE company_id = $1::uuid AND remaining_qty > 0
         GROUP BY product_id`,
        companyId,
      );
      const stockMap = new Map(stockRows.map((r) => [r.product_id, r.stock_qty]));

      const allProducts = await this.prisma.product.findMany({
        where,
        select: { id: true },
      });

      productIdsFilter = allProducts
        .filter((p) => {
          const stock = stockMap.get(p.id) ?? new Decimal(0);
          if (query.stockLevel === 'out') return stock.lte(0);
          if (query.stockLevel === 'low') return stock.gt(0) && stock.lte(10);
          return stock.gt(0);
        })
        .map((p) => p.id);

      if (productIdsFilter.length === 0) {
        return { data: [], meta: buildPaginationMeta(page, limit, 0) };
      }

      where.id = { in: productIdsFilter };
    }

    const orderBy = this.buildProductOrderBy(sort);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { category: true, prices: true },
        orderBy,
        skip: paginationSkip(page, limit),
        take: limit,
      }),
    ]);

    const data = await Promise.all(rows.map((row) => this.toProductResponse(companyId, row)));

    return { data, meta: buildPaginationMeta(page, limit, total) };
  }

  async search(companyId: string, query: ProductSearchQueryDto) {
    const rows = await this.prisma.product.findMany({
      where: {
        companyId,
        deletedAt: null,
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { sku: { contains: query.q, mode: 'insensitive' } },
          { barcode: { contains: query.q, mode: 'insensitive' } },
        ],
      },
      include: { category: true, prices: true },
      take: 20,
      orderBy: { name: 'asc' },
    });

    const data = await Promise.all(rows.map((row) => this.toProductResponse(companyId, row)));
    return { data };
  }

  async posProducts(companyId: string, query: PosProductsQueryDto) {
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));
    const where: Prisma.ProductWhereInput = {
      companyId,
      deletedAt: null,
      status: ProductStatus.ACTIVE,
    };

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { sku: { contains: query.q, mode: 'insensitive' } },
        { barcode: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.product.findMany({
      where,
      include: { category: true, prices: true },
      take: limit,
      orderBy: { name: 'asc' },
    });

    const data = await Promise.all(rows.map((row) => this.toProductResponse(companyId, row)));
    return { data };
  }

  async getByBarcode(companyId: string, code: string): Promise<ProductResponseDto> {
    const product = await this.prisma.product.findFirst({
      where: { companyId, barcode: code, deletedAt: null },
      include: { category: true, prices: true },
    });
    if (!product) {
      throw AppException.notFound('Product', code);
    }
    return this.toProductResponse(companyId, product);
  }

  async getById(companyId: string, id: string): Promise<ProductResponseDto> {
    const product = await this.findProductOrThrow(companyId, id);
    return this.toProductResponse(companyId, product);
  }

  async create(
    companyId: string,
    userId: string,
    dto: CreateProductRequestDto,
    ip?: string,
    requestId?: string,
  ): Promise<ProductResponseDto> {
    await this.categoriesService.ensureCategory(companyId, dto.categoryId);

    const purchasePriceUzs = parseMoney(dto.purchasePriceUzs);
    const salePriceUzs = parseMoney(dto.salePriceUzs);
    if (!isNonNegativeMoney(purchasePriceUzs) || !isNonNegativeMoney(salePriceUzs)) {
      throw AppException.validation('Validation failed', [
        { field: 'purchasePriceUzs', message: 'Must be >= 0', code: 'INVALID_PRICE' },
      ]);
    }

    const rate = await this.currencyService.getActiveRateOrThrow(companyId);
    const purchasePriceUsd = dto.purchasePriceUsd
      ? parseMoney(dto.purchasePriceUsd)
      : uzsToUsd(purchasePriceUzs, rate.rate);
    const salePriceUsd = dto.salePriceUsd
      ? parseMoney(dto.salePriceUsd)
      : uzsToUsd(salePriceUzs, rate.rate);

    const initialStock = dto.initialStock ? parseMoney(dto.initialStock) : new Decimal(0);
    if (initialStock.gt(0) && !dto.initialWarehouseId) {
      throw AppException.validation('Validation failed', [
        {
          field: 'initialWarehouseId',
          message: 'Required when initialStock > 0',
          code: 'REQUIRED',
        },
      ]);
    }

    if (initialStock.gt(0) && dto.initialWarehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: dto.initialWarehouseId, companyId, status: 'ACTIVE' },
      });
      if (!warehouse) {
        throw AppException.notFound('Warehouse', dto.initialWarehouseId);
      }
    }

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            companyId,
            sku: dto.sku.trim(),
            barcode: dto.barcode?.trim() ?? null,
            name: dto.name.trim(),
            categoryId: dto.categoryId,
            unitOfMeasure: dto.unitOfMeasure ?? 'pcs',
            unitsPerBox: dto.unitsPerBox ? parseInt(dto.unitsPerBox, 10) : 1,
            minStockLevel: dto.minStockLevel ? parseMoney(dto.minStockLevel) : new Decimal(0),
            status: dto.status ?? ProductStatus.ACTIVE,
            prices: {
              create: {
                purchasePriceUzs,
                purchasePriceUsd,
                salePriceUzs,
                salePriceUsd,
              },
            },
          },
          include: { category: true, prices: true },
        });

        if (initialStock.gt(0) && dto.initialWarehouseId) {
          await this.inventoryService.receiveInternal(tx, companyId, userId, {
            productId: created.id,
            warehouseId: dto.initialWarehouseId,
            quantity: initialStock,
            unitCostUzs: purchasePriceUzs,
            unitCostUsd: purchasePriceUsd,
            note: 'Initial stock on product create',
            referenceType: 'product_create',
          });
        }

        return created;
      });

      await this.audit.log({
        companyId,
        userId,
        action: 'CREATE',
        entityType: 'product',
        entityId: product.id,
        newValue: { sku: product.sku, name: product.name },
        ipAddress: ip,
        requestId,
      });

      return this.toProductResponse(companyId, product);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        if (target.includes('sku')) {
          throw AppException.duplicateSku(dto.sku);
        }
        if (target.includes('barcode')) {
          throw AppException.duplicateBarcode(dto.barcode ?? '');
        }
      }
      throw error;
    }
  }

  async update(
    companyId: string,
    id: string,
    userId: string,
    dto: UpdateProductRequestDto,
    ip?: string,
    requestId?: string,
  ): Promise<ProductResponseDto> {
    const existing = await this.findProductOrThrow(companyId, id);

    if (dto.categoryId) {
      await this.categoriesService.ensureCategory(companyId, dto.categoryId);
    }

    const rate = await this.currencyService.getActiveRateOrThrow(companyId);

    const purchasePriceUzs = dto.purchasePriceUzs
      ? parseMoney(dto.purchasePriceUzs)
      : existing.prices?.purchasePriceUzs;
    const salePriceUzs = dto.salePriceUzs
      ? parseMoney(dto.salePriceUzs)
      : existing.prices?.salePriceUzs;

    const purchasePriceUsd = dto.purchasePriceUsd
      ? parseMoney(dto.purchasePriceUsd)
      : dto.purchasePriceUzs
        ? uzsToUsd(parseMoney(dto.purchasePriceUzs), rate.rate)
        : existing.prices?.purchasePriceUsd;
    const salePriceUsd = dto.salePriceUsd
      ? parseMoney(dto.salePriceUsd)
      : dto.salePriceUzs
        ? uzsToUsd(parseMoney(dto.salePriceUzs), rate.rate)
        : existing.prices?.salePriceUsd;

    try {
      const updated = await this.prisma.product.update({
        where: { id, companyId },
        data: {
          name: dto.name?.trim(),
          categoryId: dto.categoryId,
          barcode: dto.barcode === undefined ? undefined : dto.barcode?.trim() || null,
          unitOfMeasure: dto.unitOfMeasure,
          unitsPerBox: dto.unitsPerBox ? parseInt(dto.unitsPerBox, 10) : undefined,
          minStockLevel:
            dto.minStockLevel != null && dto.minStockLevel !== ''
              ? parseMoney(dto.minStockLevel)
              : undefined,
          status: dto.status,
          prices: {
            upsert: {
              create: {
                purchasePriceUzs: purchasePriceUzs ?? new Decimal(0),
                purchasePriceUsd: purchasePriceUsd ?? new Decimal(0),
                salePriceUzs: salePriceUzs ?? new Decimal(0),
                salePriceUsd: salePriceUsd ?? new Decimal(0),
              },
              update: {
                purchasePriceUzs: purchasePriceUzs ?? undefined,
                purchasePriceUsd: purchasePriceUsd ?? undefined,
                salePriceUzs: salePriceUzs ?? undefined,
                salePriceUsd: salePriceUsd ?? undefined,
              },
            },
          },
        },
        include: { category: true, prices: true },
      });

      await this.audit.log({
        companyId,
        userId,
        action: 'UPDATE',
        entityType: 'product',
        entityId: id,
        oldValue: { name: existing.name, status: existing.status },
        newValue: { name: updated.name, status: updated.status },
        ipAddress: ip,
        requestId,
      });

      return this.toProductResponse(companyId, updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppException.duplicateBarcode(dto.barcode ?? '');
      }
      throw error;
    }
  }

  async remove(
    companyId: string,
    id: string,
    userId: string,
    ip?: string,
    requestId?: string,
  ): Promise<void> {
    const existing = await this.findProductOrThrow(companyId, id);

    await this.prisma.product.update({
      where: { id, companyId },
      data: { deletedAt: new Date(), status: ProductStatus.ARCHIVED },
    });

    await this.audit.log({
      companyId,
      userId,
      action: 'DELETE',
      entityType: 'product',
      entityId: id,
      oldValue: { sku: existing.sku, name: existing.name },
      ipAddress: ip,
      requestId,
    });
  }

  async importProducts(
    companyId: string,
    userId: string,
    dto: ProductImportRequestDto,
    ip?: string,
    requestId?: string,
  ) {
    const results: Array<{
      row: number;
      sku: string;
      status: 'created' | 'failed';
      errors?: string[];
      productId?: string;
    }> = [];

    const hasStock = dto.rows.some((r) => parseMoney(r.stock ?? '0').gt(0));
    if (hasStock && !dto.warehouseId) {
      throw AppException.validation('Validation failed', [
        { field: 'warehouseId', message: 'Required when importing stock', code: 'REQUIRED' },
      ]);
    }

    if (dto.warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, companyId, status: 'ACTIVE' },
      });
      if (!warehouse) {
        throw AppException.notFound('Warehouse', dto.warehouseId);
      }
    }

    const seenSkus = new Set<string>();

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i];
      const rowNum = i + 1;
      const errors = this.validateImportRow(row, seenSkus);
      if (errors.length) {
        results.push({ row: rowNum, sku: row.sku, status: 'failed', errors });
        continue;
      }
      seenSkus.add(row.sku.trim().toLowerCase());

      try {
        const categoryId = await this.categoriesService.findOrCreateByName(
          companyId,
          row.category,
          userId,
        );
        const product = await this.create(
          companyId,
          userId,
          {
            sku: row.sku.trim(),
            barcode: row.barcode?.trim(),
            name: row.name.trim(),
            categoryId,
            unitOfMeasure: row.unit?.trim() || 'pcs',
            purchasePriceUzs: row.purchasePrice,
            salePriceUzs: row.sellingPrice,
            initialStock: row.stock && parseMoney(row.stock).gt(0) ? row.stock : undefined,
            initialWarehouseId: dto.warehouseId,
          },
          ip,
          requestId,
        );
        results.push({ row: rowNum, sku: row.sku, status: 'created', productId: product.id });
      } catch (err: unknown) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: string }).message)
            : 'Import failed';
        results.push({ row: rowNum, sku: row.sku, status: 'failed', errors: [message] });
      }
    }

    const created = results.filter((r) => r.status === 'created').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    await this.audit.log({
      companyId,
      userId,
      action: 'IMPORT',
      entityType: 'product',
      newValue: { created, failed, totalRows: dto.rows.length },
      ipAddress: ip,
      requestId,
    });

    return { created, failed, results };
  }

  validateImportPreview(rows: ProductImportRowDto[]) {
    const seenSkus = new Set<string>();
    return rows.map((row, index) => {
      const errors = this.validateImportRow(row, seenSkus);
      if (!errors.length) seenSkus.add(row.sku.trim().toLowerCase());
      return { row: index + 1, sku: row.sku, valid: errors.length === 0, errors };
    });
  }

  private validateImportRow(row: ProductImportRowDto, seenSkus: Set<string>): string[] {
    const errors: string[] = [];
    if (!row.sku?.trim()) errors.push('SKU required');
    if (!row.name?.trim()) errors.push('Name required');
    if (!row.category?.trim()) errors.push('Category required');
    if (!row.purchasePrice || !isNonNegativeMoney(parseMoney(row.purchasePrice))) {
      errors.push('Invalid purchase price');
    }
    if (!row.sellingPrice || !isNonNegativeMoney(parseMoney(row.sellingPrice))) {
      errors.push('Invalid selling price');
    }
    if (row.stock && !isNonNegativeMoney(parseMoney(row.stock))) {
      errors.push('Invalid stock');
    }
    const skuKey = row.sku?.trim().toLowerCase();
    if (skuKey && seenSkus.has(skuKey)) errors.push('Duplicate SKU in file');
    return errors;
  }

  private async findProductOrThrow(companyId: string, id: string): Promise<ProductWithRelations> {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { category: true, prices: true },
    });
    if (!product) {
      throw AppException.notFound('Product', id);
    }
    return product;
  }

  private buildProductOrderBy(
    sortFields: ReturnType<typeof parseSort>,
  ): Prisma.ProductOrderByWithRelationInput[] {
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = [];
    for (const sort of sortFields) {
      if (sort.field === 'salePriceUzs') {
        orderBy.push({ prices: { salePriceUzs: sort.direction } });
      } else if (sort.field !== 'stock') {
        orderBy.push({ [sort.field]: sort.direction });
      }
    }
    return orderBy.length ? orderBy : [{ name: 'asc' }];
  }

  private async toProductResponse(
    companyId: string,
    product: ProductWithRelations,
  ): Promise<ProductResponseDto> {
    const stock = await getProductStockTotal(this.prisma, companyId, product.id);

    return {
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      categoryId: product.categoryId ?? '',
      categoryName: product.category?.name ?? '',
      status: product.status,
      purchasePriceUzs: formatMoney(product.prices?.purchasePriceUzs),
      purchasePriceUsd: formatMoney(product.prices?.purchasePriceUsd),
      salePriceUzs: formatMoney(product.prices?.salePriceUzs),
      salePriceUsd: formatMoney(product.prices?.salePriceUsd),
      stock: formatMoney(stock),
      unitOfMeasure: product.unitOfMeasure,
      unitsPerBox: String(product.unitsPerBox ?? 1),
      minStockLevel: formatMoney(product.minStockLevel ?? new Decimal(0)),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
