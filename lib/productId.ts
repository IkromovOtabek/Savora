/** Ko'rinadigan mahsulot ID — PRD-XXXXXX */
export function generateProductCode(): string {
  const tail = Date.now().toString(36).toUpperCase().slice(-5);
  const rnd = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `PRD-${tail}${rnd}`;
}
