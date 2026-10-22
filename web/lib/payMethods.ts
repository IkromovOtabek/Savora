/**
 * To'lov usullari (BILLZ: Naqd / UzCard / HUMO / Click / Payme).
 * Sotuv to'lovi (Sale.payments[].method) qaysi yo'l bilan kelganini bildiradi.
 * Eski yozuvlarda `method` yo'q — ular naqd deb hisoblanadi.
 * Kassa smenasi va naqd kassa faqat naqd usulni sanaydi; karta/o'tkazma alohida ko'rsatiladi.
 */
export const PAY_METHODS = ['cash', 'uzcard', 'humo', 'click', 'payme'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

/** Naqd bo'lmagan usullar (kassadagi naqd pulga qo'shilmaydi) */
export const CARD_METHODS = PAY_METHODS.filter((m) => m !== 'cash') as Exclude<PayMethod, 'cash'>[];

export function isPayMethod(v: unknown): v is PayMethod {
  return typeof v === 'string' && (PAY_METHODS as readonly string[]).includes(v);
}

/** `method` yo'q (eski yozuv) yoki 'cash' — naqd */
export function methodOf(p: { method?: string | null }): PayMethod {
  return isPayMethod(p.method) ? p.method : 'cash';
}

export function isCashMethod(m?: string | null): boolean {
  return !m || m === 'cash';
}

export interface PayPart { method: PayMethod; amount: number }

/** Bir xil usullarni qo'shadi, 0 summalarni tashlaydi */
export function mergeParts(parts: PayPart[]): PayPart[] {
  const sum = new Map<PayMethod, number>();
  for (const p of parts) if (p.amount > 0) sum.set(p.method, (sum.get(p.method) ?? 0) + p.amount);
  return PAY_METHODS.filter((m) => sum.has(m)).map((m) => ({ method: m, amount: sum.get(m)! }));
}

export type SettleResult =
  | { ok: true; parts: PayPart[]; paid: number; change: number }
  | { ok: false; reason: 'overpaidCard' | 'underpaid' | 'overpaid' };

/**
 * Kassadagi to'lovni hisoblaydi.
 * - full (to'liq to'lov): jami ≥ summa bo'lishi shart; ortiqchasi — qaytim, faqat naqddan beriladi
 *   (karta/o'tkazma bilan summadan ortiq to'lab bo'lmaydi).
 * - debt (qarzga): to'langan qism summadan kam yoki teng (0 ham mumkin); ortiqcha to'lov rad.
 * Qaytadigan `parts` — sotuvga yoziladigan haqiqiy summalar (qaytim chiqarilgan).
 */
export function settlePayment(total: number, input: PayPart[], mode: 'full' | 'debt'): SettleResult {
  const parts = mergeParts(input);
  const nonCash = parts.filter((p) => p.method !== 'cash').reduce((s, p) => s + p.amount, 0);
  const cash = parts.find((p) => p.method === 'cash')?.amount ?? 0;
  if (nonCash > total) return { ok: false, reason: 'overpaidCard' };
  const sum = nonCash + cash;
  if (mode === 'debt') {
    if (sum > total) return { ok: false, reason: 'overpaid' };
    return { ok: true, parts, paid: sum, change: 0 };
  }
  if (sum < total) return { ok: false, reason: 'underpaid' };
  const change = sum - total;
  const cashKept = cash - change;
  const fixed = mergeParts(parts.map((p) => (p.method === 'cash' ? { ...p, amount: cashKept } : p)));
  return { ok: true, parts: fixed, paid: total, change };
}

/**
 * To'lov qismlarini savatcha qatorlariga taqsimlaydi ("sharshara"): qatorlar tartib bilan,
 * har biri sig'imigacha, qismlar ham tartib bilan to'ldiriladi. Natija butun so'm, aniq:
 * har qatorga yozilgan yig'indi ≤ qator summasi, umumiy yig'indi = to'langan summa.
 */
export function allocateParts(lineTotals: number[], parts: PayPart[]): PayPart[][] {
  const out: PayPart[][] = lineTotals.map(() => []);
  let li = 0;
  let room = lineTotals[0] ?? 0;
  for (const part of parts) {
    let left = part.amount;
    while (left > 0 && li < lineTotals.length) {
      if (room <= 0) { li += 1; room = lineTotals[li] ?? 0; continue; }
      const take = Math.min(left, room);
      out[li].push({ method: part.method, amount: take });
      left -= take;
      room -= take;
    }
  }
  return out.map(mergeParts);
}
