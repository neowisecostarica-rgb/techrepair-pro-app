/** Resolve scanner/typed exact identifiers. Internal TRP codes are never searchable. */
export function resolveExactCatalogItem(inventory, rawValue) {
  const value = String(rawValue ?? '').trim().toLocaleLowerCase();
  if (!value) return { status: 'empty', item: null };
  // Barcode wins only when it uniquely identifies one product; ambiguity fails closed.
  const barcodeMatches = inventory.filter(item =>
    String(item.codigo_barras ?? '').trim().toLocaleLowerCase() === value);
  if (barcodeMatches.length > 1) return { status: 'ambiguous', item: null };
  if (barcodeMatches.length === 1) return { status: 'found', item: barcodeMatches[0] };
  const skuMatches = inventory.filter(item =>
    String(item.sku ?? '').trim().toLocaleLowerCase() === value);
  if (skuMatches.length > 1) return { status: 'ambiguous', item: null };
  if (skuMatches.length === 1) return { status: 'found', item: skuMatches[0] };
  return { status: 'not_found', item: null };
}
