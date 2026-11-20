import { fixKeyboardLayout } from './gs1';

/**
 * Skaner pistaleti klaviatura kabi ishlaydi: kompyuterda RUS/O'ZB (kirill) tartibi yoqiq bo'lsa,
 * «PRD-5K2» o'rniga «ЗКВ-5Л2» yoziladi (tugma o'rni bir xil, harf boshqa). Raqamlar (IMEI, EAN) ta'sirlanmaydi,
 * lekin harfli kodlar (mahsulot ID, SKU) topilmay qolardi — kirill harf QWERTY'dagi o'rniga qaytariladi
 * (lib/gs1.ts → fixKeyboardLayout, markirovka kodi bilan bir xil jadval).
 *
 * Variantlar: asl ko'rinishi va — kirill bo'lsa — lotinga qaytarilgani. Bo'shliqlar olib tashlanadi
 * (ba'zi skanerlar kod ichiga bo'shliq qo'shadi).
 */
export function scanVariants(raw: string): string[] {
  const base = String(raw ?? '').trim().replace(/\s/g, '');
  if (!base) return [];
  const latin = fixKeyboardLayout(base);
  return latin === base ? [base] : [base, latin];
}

/** Kod ro'yxatida skanerlangan kod bormi (katta-kichik harfsiz, klaviatura tartibi adashgan bo'lsa ham) */
export function codeMatches(codes: readonly string[], raw: string): boolean {
  const vs = scanVariants(raw).map((v) => v.toLowerCase());
  return vs.length > 0 && codes.some((c) => vs.includes(c.toLowerCase()));
}
