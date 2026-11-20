/**
 * Do'kon ichki barkodi — zavod barkodi yo'q tovar uchun (bar mahsuloti, o'z mahsuloti): EAN-13, «200» bilan
 * boshlanadi. GS1'da 20–29 prefiksi do'kon ichida ishlatishga ajratilgan, shuning uchun bunday kod umumiy barkod
 * lug'atiga tushmaydi (barcodeLookup.isSharedBarcode). «200» tanlangan — tarozi yorliqlari odatda 21–29 bilan
 * boshlanadi, to'qnashmasin. Yorliqqa chiqadi (labelCodeOf → `barcode`), kassa va ofitsant skaneri shu bo'yicha topadi.
 */
export const INTERNAL_BARCODE_PREFIX = '200';

/** EAN-13 nazorat raqami (birinchi 12 raqamdan): chapdan toq o'rinlar ×1, juft o'rinlar ×3 */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** Tasodifiy ichki barkod (13 raqam). `digit` — testlar uchun */
export function makeInternalBarcode(digit: () => number = () => Math.floor(Math.random() * 10)): string {
  let body = INTERNAL_BARCODE_PREFIX;
  while (body.length < 12) body += String(digit());
  return body + ean13CheckDigit(body);
}

/** Savora yaratgan ichki barkodmi (prefiks va nazorat raqami to'g'ri) */
export function isInternalBarcode(code: string): boolean {
  return /^200\d{10}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** Do'kon bazasida band bo'lmagan ichki barkod (boshqa tovarning `barcode` yoki `imei` maydonida yo'q) */
export async function uniqueInternalBarcode(Product: { exists: (filter: Record<string, unknown>) => unknown }): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = makeInternalBarcode();
    if (!(await Product.exists({ $or: [{ barcode: code }, { imei: code }] }))) return code;
  }
  throw new Error('internalBarcode: bo\'sh kod topilmadi');
}
