/**
 * Code 128 shtrix-kod generatori (kutubxonasiz, server ham, brauzer ham).
 *
 * Nega Code 128: har qanday skaner (USB pistalet, kamera, mobil ilova) sukut bo'yicha o'qiydi, raqam va
 * lotin harflarini (PRD-…, SKU-…) kodlaydi. Raqam ketma-ketligi C to'plamida juft-juft joylanadi — 15 xonali
 * IMEI 134 modulga sig'adi (40 mm yorliqda 0.25 mm chiziq — 203 dpi printerning 2 nuqtasi).
 *
 * Natija — chiziq/oraliq kengliklari (modul birligida), qora chiziqdan boshlanadi, STOP bilan tugaydi.
 */

/** Belgilar jadvali: qiymat → 6 ta kenglik (chiziq, oraliq, …), har biri 11 modul; 106 — STOP (13 modul) */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
] as const;

const CODE_C = 99;
const CODE_B = 100;
const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Yorliqqa yoziladigan kodning eng uzun uzunligi (undan uzuni yorliqqa sig'maydi) */
export const CODE128_MAX_LEN = 48;

const isDigit = (c: number) => c >= 48 && c <= 57;

/** i-o'rindan boshlab ketma-ket raqamlar soni */
function digitRun(s: string, i: number): number {
  let n = 0;
  while (i + n < s.length && isDigit(s.charCodeAt(i + n))) n++;
  return n;
}

/**
 * Matn → belgilar qiymatlari (START … nazorat raqami, STOP'siz). Faqat ko'rinadigan ASCII (32–126);
 * boshqa belgi (kirill, emoji) yoki bo'sh/juda uzun matn — null.
 */
export function code128Values(text: string): number[] | null {
  if (!text || text.length > CODE128_MAX_LEN) return null;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 32 || c > 126) return null;
  }

  const values: number[] = [];
  const run0 = digitRun(text, 0);
  // C bilan boshlash: juft uzunlikdagi 4+ raqam yoki butun matn juft sonli raqam
  let set: 'B' | 'C' = (run0 >= 4 && run0 % 2 === 0) || (run0 === text.length && run0 >= 2 && run0 % 2 === 0) ? 'C' : 'B';
  values.push(set === 'C' ? START_C : START_B);

  let i = 0;
  while (i < text.length) {
    if (set === 'C') {
      if (digitRun(text, i) >= 2) {
        values.push(Number(text.slice(i, i + 2)));
        i += 2;
      } else {
        values.push(CODE_B);
        set = 'B';
      }
      continue;
    }
    const run = digitRun(text, i);
    // 4+ raqam — C ga o'tish arzonroq; toq bo'lsa birinchisi B da yoziladi (keyingi qadamda juft qoladi)
    if (run >= 4 && run % 2 === 0) {
      values.push(CODE_C);
      set = 'C';
      continue;
    }
    values.push(text.charCodeAt(i) - 32);
    i++;
  }

  let sum = values[0];
  for (let k = 1; k < values.length; k++) sum += values[k] * k;
  values.push(sum % 103);
  return values;
}

/** Matn → chiziq/oraliq kengliklari (modul birligida), STOP bilan. Kodlab bo'lmasa — null */
export function code128Widths(text: string): number[] | null {
  const values = code128Values(text);
  if (!values) return null;
  const widths: number[] = [];
  for (const v of [...values, STOP]) {
    for (const ch of PATTERNS[v]) widths.push(ch.charCodeAt(0) - 48);
  }
  return widths;
}

export interface Code128Bars {
  /** Qora chiziqlar: [boshlanish, kenglik] (modul birligida) */
  bars: [number, number][];
  /** Umumiy kenglik (modul), jim zonasiz */
  modules: number;
}

/** Chizish uchun: qora chiziqlar ro'yxati */
export function code128Bars(text: string): Code128Bars | null {
  const widths = code128Widths(text);
  if (!widths) return null;
  const bars: [number, number][] = [];
  let x = 0;
  widths.forEach((w, idx) => {
    if (idx % 2 === 0) bars.push([x, w]);
    x += w;
  });
  return { bars, modules: x };
}

/** Jadval yaxlitligi (testlar uchun) */
export const CODE128_PATTERNS: readonly string[] = PATTERNS;
