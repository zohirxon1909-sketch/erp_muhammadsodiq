import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { mapCategory, mapProduct } from '@/api/mappers';
import { toMoneyString } from '@/utils/money';
import type { PaginatedResponse, ListParams } from '@/types/api';
import type { Category, Product } from '@/types/entities';

export const productsApi = {
  list: async (params?: ListParams): Promise<Product[]> => {
    const result = await productsApi.listPaginated(params);
    return result.data;
  },

  listPaginated: async (params?: ListParams): Promise<PaginatedResponse<Product>> => {
    const { data } = await apiClient.get<PaginatedResponse<unknown>>(API_ENDPOINTS.products, {
      params: { limit: 20, ...params },
    });
    return {
      data: data.data.map((row) => mapProduct(row as Parameters<typeof mapProduct>[0])),
      meta: data.meta,
    };
  },

  getById: async (id: string): Promise<Product> => {
    const { data } = await apiClient.get(API_ENDPOINTS.products + `/${id}`);
    return mapProduct(data);
  },

  search: async (q: string): Promise<Product[]> => {
    const { data } = await apiClient.get<{ data: unknown[] }>(`${API_ENDPOINTS.products}/search`, {
      params: { q },
    });
    return data.data.map((row) => mapProduct(row as Parameters<typeof mapProduct>[0]));
  },

  posProducts: async (q?: string, limit = 50): Promise<Product[]> => {
    const { data } = await apiClient.get<{ data: unknown[] }>(API_ENDPOINTS.posProducts, {
      params: { q, limit },
    });
    return data.data.map((row) => mapProduct(row as Parameters<typeof mapProduct>[0]));
  },

  getByBarcode: async (code: string): Promise<Product> => {
    const { data } = await apiClient.get(`${API_ENDPOINTS.products}/barcode/${encodeURIComponent(code)}`);
    return mapProduct(data);
  },

  create: async (input: {
    sku: string;
    name: string;
    categoryId: string;
    barcode?: string;
    unitOfMeasure?: string;
    unitsPerBox?: number;
    minStockLevel?: number;
    purchasePriceUzs: number;
    salePriceUzs: number;
    initialStock?: number;
    initialWarehouseId?: string;
  }): Promise<Product> => {
    const { data } = await apiClient.post(API_ENDPOINTS.products, {
      sku: input.sku,
      name: input.name,
      categoryId: input.categoryId,
      barcode: input.barcode?.trim() || undefined,
      unitOfMeasure: input.unitOfMeasure ?? 'pcs',
      unitsPerBox: input.unitsPerBox != null ? String(input.unitsPerBox) : undefined,
      minStockLevel: input.minStockLevel != null ? toMoneyString(input.minStockLevel) : undefined,
      purchasePriceUzs: toMoneyString(input.purchasePriceUzs),
      salePriceUzs: toMoneyString(input.salePriceUzs),
      initialStock: input.initialStock ? toMoneyString(input.initialStock) : undefined,
      initialWarehouseId: input.initialWarehouseId,
    });
    return mapProduct(data);
  },

  update: async (
    id: string,
    input: Partial<{
      name: string;
      categoryId: string;
      barcode: string | null;
      unitOfMeasure: string;
      unitsPerBox: number;
      minStockLevel: number;
      purchasePriceUzs: number;
      salePriceUzs: number;
      salePriceUsd?: number;
      status: string;
    }>,
  ): Promise<Product> => {
    const body: Record<string, unknown> = { ...input };
    if (input.barcode !== undefined) body.barcode = input.barcode?.trim() || null;
    if (input.unitsPerBox != null) body.unitsPerBox = String(input.unitsPerBox);
    if (input.minStockLevel != null) body.minStockLevel = toMoneyString(input.minStockLevel);
    if (input.purchasePriceUzs != null) body.purchasePriceUzs = toMoneyString(input.purchasePriceUzs);
    if (input.salePriceUzs != null) body.salePriceUzs = toMoneyString(input.salePriceUzs);
    if (input.salePriceUsd != null) body.salePriceUsd = toMoneyString(input.salePriceUsd);
    if (input.status) body.status = input.status.toUpperCase();
    const { data } = await apiClient.patch(`${API_ENDPOINTS.products}/${id}`, body);
    return mapProduct(data);
  },

  delete: (id: string) => apiClient.delete(`${API_ENDPOINTS.products}/${id}`),

  importPreview: async (rows: Array<Record<string, string>>) => {
    const { data } = await apiClient.post(`${API_ENDPOINTS.products}/import/preview`, { rows });
    return data.data as Array<{ row: number; sku: string; valid: boolean; errors: string[] }>;
  },

  import: async (input: {
    warehouseId?: string;
    rows: Array<{
      sku: string;
      barcode?: string;
      name: string;
      category: string;
      unit?: string;
      purchasePrice: string;
      sellingPrice: string;
      stock?: string;
    }>;
  }) => {
    const { data } = await apiClient.post(`${API_ENDPOINTS.products}/import`, input);
    return data as {
      created: number;
      failed: number;
      results: Array<{ row: number; sku: string; status: string; errors?: string[] }>;
    };
  },
};

export const categoriesApi = {
  list: async (): Promise<Category[]> => {
    const { data } = await apiClient.get<{ data: unknown[] }>(API_ENDPOINTS.categories);
    return data.data.map((row) => mapCategory(row as Parameters<typeof mapCategory>[0]));
  },

  create: async (input: { name: string; parentId?: string | null; sortOrder?: number }) => {
    const { data } = await apiClient.post(API_ENDPOINTS.categories, input);
    return mapCategory(data);
  },

  update: async (id: string, input: Partial<{ name: string; parentId: string | null; sortOrder: number }>) => {
    const { data } = await apiClient.patch(`${API_ENDPOINTS.categories}/${id}`, input);
    return mapCategory(data);
  },

  delete: (id: string) => apiClient.delete(`${API_ENDPOINTS.categories}/${id}`),
};
