export const PRODUCT_UNITS = [
  { value: 'pcs', label: 'dona' },
  { value: 'kg', label: 'kg' },
  { value: 'm', label: 'metr' },
  { value: 'bag', label: 'qop' },
  { value: 'box', label: 'karobka' },
  { value: 'l', label: 'litr' },
] as const;

export type ProductUnitCode = (typeof PRODUCT_UNITS)[number]['value'];

export function productUnitLabel(code: string): string {
  return PRODUCT_UNITS.find((u) => u.value === code)?.label ?? code;
}

/** Base quantity in storage units (pieces) for a cart line. */
export function cartLineBaseQuantity(
  quantity: number,
  saleUnit: 'piece' | 'box',
  unitsPerBox: number,
): number {
  const mult = saleUnit === 'box' ? Math.max(1, unitsPerBox) : 1;
  return quantity * mult;
}
