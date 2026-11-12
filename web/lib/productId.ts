/** Ko'rinadigan mahsulot ID — PRD-XXXXXX */
export function generateProductCode(): string {
  const tail = Date.now().toString(36).toUpperCase().slice(-5);
  const rnd = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `PRD-${tail}${rnd}`;
}

/** Shtrix-kodsiz tovarning ichki kaliti (imei maydoni unikal) — SKU-XXXXXXXX */
export function generateSku(): string {
  return `SKU-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
