/**
 * Markirovka (GS1 DataMatrix) — kassada kodni tovarga bog'lash qoidalari. Client (PosScreen) va server (posSaleAction)
 * bir xil ishlatadi; DB importi yo'q. Bu FISKAL tekshiruv emas: Savora cheki ichki hujjat, kodlar keyingi bosqichda
 * virtual kassaga uzatish uchun saqlanadi (docs/SOLIQ.md).
 */
import { gtinBarcodes, isExpiredOn, isMarkingCode, parseGs1 } from './gs1';
import { isFractionalUnit } from './qty';

/** warn — kodsiz sotish mumkin (ogohlantirish); require — markirovkali tovar har donasiga kod skanerlanmasa sotilmaydi */
export const MARKING_MODES = ['warn', 'require'] as const;
export type MarkingMode = (typeof MARKING_MODES)[number];

export function markingModeOf(v: unknown): MarkingMode {
  return v === 'require' ? 'require' : 'warn';
}

/** Bitta sotuv qatorida ko'pi bilan shuncha kod */
export const MARKING_MAX_PER_LINE = 500;

/** Mahsulot kodlaridan (shtrix-kod, kod/IMEI) biri GTIN ga mosmi (EAN-13 ↔ GTIN-14 va h.k.) */
export function productMatchesGtin(codes: readonly (string | null | undefined)[], gtin: string): boolean {
  const want = new Set(gtinBarcodes(gtin));
  return codes.some((c) => !!c && want.has(c.replace(/\s/g, '')));
}

/** Qatorga kerak bo'ladigan kodlar soni: butun birlikda — har donaga bitta, kasrli (kg) — qatorga bitta */
export function markingNeed(qty: number, unit?: string | null): number {
  if (isFractionalUnit(unit)) return qty > 0 ? 1 : 0;
  return Math.max(0, Math.round(qty));
}

export function markingShortfall(qty: number, unit: string | null | undefined, codes: number): number {
  return Math.max(0, markingNeed(qty, unit) - codes);
}

export type MarkingLineError =
  | { code: 'invalid'; name: string; value: string }
  | { code: 'mismatch'; name: string; value: string }
  | { code: 'duplicate'; name: string; value: string }
  | { code: 'tooMany'; name: string }
  | { code: 'missing'; name: string; n: number }
  | { code: 'expired'; name: string; date: string };

export interface MarkingLineInput {
  name: string;
  qty: number;
  unit?: string | null;
  marked: boolean;
  /** Mahsulotning shtrix-kod/kod maydonlari — GTIN solishtirish uchun */
  productCodes: readonly (string | null | undefined)[];
  codes: readonly string[];
}

/**
 * Savatcha qatorlarining kodlarini tekshirish (server; client ham shu qoidada):
 * format (GTIN + seriya), mahsulotga mosligi, savatchada takror, soni (qty dan oshmaydi),
 * `require` rejimida — yetishmagan kod va muddati o'tgan tovar.
 */
export function checkMarkingLines(
  lines: readonly MarkingLineInput[],
  mode: MarkingMode,
  today: string,
): { ok: true; lines: { codes: string[]; keys: string[] }[] } | { ok: false; error: MarkingLineError } {
  const seen = new Set<string>();
  const out: { codes: string[]; keys: string[] }[] = [];
  for (const line of lines) {
    const codes: string[] = [];
    const keys: string[] = [];
    if (line.codes.length > Math.min(MARKING_MAX_PER_LINE, Math.max(1, markingNeed(line.qty, line.unit)))) {
      return { ok: false, error: { code: 'tooMany', name: line.name } };
    }
    for (const raw of line.codes) {
      const c = parseGs1(raw);
      if (!isMarkingCode(c)) return { ok: false, error: { code: 'invalid', name: line.name, value: String(raw).slice(0, 40) } };
      if (!productMatchesGtin(line.productCodes, c.gtin)) return { ok: false, error: { code: 'mismatch', name: line.name, value: c.serial } };
      if (seen.has(c.key)) return { ok: false, error: { code: 'duplicate', name: line.name, value: c.serial } };
      if (mode === 'require' && isExpiredOn(c.expiry, today)) return { ok: false, error: { code: 'expired', name: line.name, date: c.expiry! } };
      seen.add(c.key);
      codes.push(c.normalized);
      keys.push(c.key);
    }
    if (mode === 'require' && line.marked) {
      const n = markingShortfall(line.qty, line.unit, codes.length);
      if (n > 0) return { ok: false, error: { code: 'missing', name: line.name, n } };
    }
    out.push({ codes, keys });
  }
  return { ok: true, lines: out };
}

/**
 * Bazadagi faol sotuvlar bilan to'qnashuv: kod allaqachon sotilgan (bekor qilinmagan) sotuvda bo'lsa — takror.
 * Qisman qaytarilgan sotuvdagi kod bloklanmaydi: qaysi dona qaytgani noma'lum (docs/SOLIQ.md → cheklovlar).
 */
export function soldMarkingConflict(
  keys: readonly string[],
  sold: readonly { markingKeys?: string[] | null; returns?: unknown[] | null; status?: string }[],
): string | null {
  const want = new Set(keys);
  for (const s of sold) {
    if (s.status === 'cancelled' || (s.returns?.length ?? 0) > 0) continue;
    const k = s.markingKeys?.find((x) => want.has(x));
    if (k) return k;
  }
  return null;
}

/** Kalitdan seriya (xabar uchun): 01<GTIN 14>21<seriya> */
export function serialOfKey(key: string): string {
  return key.length > 18 ? key.slice(18) : key;
}
