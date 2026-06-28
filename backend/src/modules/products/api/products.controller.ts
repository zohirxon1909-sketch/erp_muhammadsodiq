import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from '../application/products.service';
import {
  CreateProductRequestDto,
  PosProductsQueryDto,
  ProductImportRequestDto,
  ProductImportRowDto,
  ProductListQueryDto,
  ProductSearchQueryDto,
  UpdateProductRequestDto,
} from './dto/products.dto';
import { CompanyIsolationGuard } from '../../../core/guards/company-isolation.guard';
import { RequireModule, RequirePermissions } from '../../../core/decorators/auth.decorators';
import { CurrentUser, ClientIp, RequestId } from '../../../core/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('products')
@UseGuards(CompanyIsolationGuard)
@RequireModule('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @RequirePermissions('products.view')
  list(@CurrentUser() user: JwtPayload, @Query() query: ProductListQueryDto) {
    return this.productsService.list(user.companyId!, query);
  }

  @Get('search')
  @RequirePermissions('products.view')
  search(@CurrentUser() user: JwtPayload, @Query() query: ProductSearchQueryDto) {
    return this.productsService.search(user.companyId!, query);
  }

  @Post('import/preview')
  @RequirePermissions('products.create')
  importPreview(@Body() dto: ProductImportRequestDto) {
    return { data: this.productsService.validateImportPreview(dto.rows) };
  }

  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('products.create')
  importProducts(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ProductImportRequestDto,
    @ClientIp() ip?: string,
    @RequestId() requestId?: string,
  ) {
    return this.productsService.importProducts(user.companyId!, user.sub, dto, ip, requestId);
  }

  @Get('barcode/:code')
  @RequirePermissions('products.view')
  getByBarcode(@CurrentUser() user: JwtPayload, @Param('code') code: string) {
    return this.productsService.getByBarcode(user.companyId!, code);
  }

  @Get(':id')
  @RequirePermissions('products.view')
  getById(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productsService.getById(user.companyId!, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('products.create')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProductRequestDto,
    @ClientIp() ip?: string,
    @RequestId() requestId?: string,
  ) {
    return this.productsService.create(user.companyId!, user.sub, dto, ip, requestId);
  }

  @Patch(':id')
  @RequirePermissions('products.update')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductRequestDto,
    @ClientIp() ip?: string,
    @RequestId() requestId?: string,
  ) {
    return this.productsService.update(user.companyId!, id, user.sub, dto, ip, requestId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('products.delete')
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @ClientIp() ip?: string,
    @RequestId() requestId?: string,
  ): Promise<void> {
    await this.productsService.remove(user.companyId!, id, user.sub, ip, requestId);
  }
}

@Controller('pos')
@UseGuards(CompanyIsolationGuard)
@RequireModule('products')
export class PosProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('products')
  @RequirePermissions('products.view')
  posProducts(@CurrentUser() user: JwtPayload, @Query() query: PosProductsQueryDto) {
    return this.productsService.posProducts(user.companyId!, query);
  }
}
