import type { ISaleBankPart, PaymentType, SaleStatus } from './models/tenant/Sale';

/**
 * Bank krediti hisob-kitobi (sof funksiyalar — test qilinadi).
 *
 * Bitta sotuvni bir nechta bank moliyalashtirishi mumkin: 10 mln telefon, 2 mln bosh to'lov,
 * qolgan 8 mln — Ishonch 3 mln + Uzum Nasiya 3 mln + TezPay 2 mln.
 * Har bank bo'yicha: Kiritilgan (sotuvlardagi ulushlar) − Olingan (bankdan tushgan pul) = Qoldiq.
 * Qoldiq manfiy bo'lishi mumkin — bank kerakdan ortiq o'tkazgan.
 */

/** Bitta sotuvda eng ko'p bank soni */
export const MAX_BANK_PARTS = 5;

type SaleLike = {
  paymentType: PaymentType;
  status?: SaleStatus;
  bankName?: string | null;
  bankParts?: ISaleBankPart[] | null;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
};

/**
 * Sotuvning bank ulushlari. Eski sotuvlarda (bankParts yo'q) — bitta bank, joriy qoldiq bilan:
 * ilgari bank puli sotuvning o'ziga to'lov qilib yozilgan, shuning uchun joriy qoldiq allaqachon sof summa.
 */
export function saleBankParts(sale: SaleLike): ISaleBankPart[] {
  if (sale.paymentType !== 'bank_credit') return [];
  if (sale.bankParts && sale.bankParts.length > 0) {
    return sale.bankParts.map((p) => ({ bankName: p.bankName, amount: p.amount }));
  }
  const name = sale.bankName?.trim();
  if (!name) return [];
  const amount = sale.remainingAmount ?? Math.max(0, (sale.totalAmount ?? 0) - (sale.paidAmount ?? 0));
  return [{ bankName: name, amount: Math.max(0, amount) }];
}

/** Ko'rsatish uchun: "Ishonch, Uzum Nasiya" */
export function bankPartsLabel(parts: ISaleBankPart[]): string {
  return parts.map((p) => p.bankName).join(', ');
}

/** Klientdan kelgan JSON (`[{bankName, amount}]`) → qatorlar; shakli noto'g'ri bo'lsa null */
export function parseBankPartsInput(raw: unknown): { bankName: string; amount: number }[] | null {
  if (raw === undefined || raw === null || raw === '') return [];
  let v: unknown = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(v) || v.length > 50) return null;
  const out: { bankName: string; amount: number }[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') return null;
    const { bankName, amount } = item as { bankName?: unknown; amount?: unknown };
    const name = typeof bankName === 'string' ? bankName.trim() : '';
    if (name.length > 120) return null;
    const n = typeof amount === 'number' ? amount : Number(String(amount ?? '').replace(/\s/g, ''));
    out.push({ bankName: name, amount: Number.isFinite(n) ? n : NaN });
  }
  return out;
}

export type BankPartsError = 'required' | 'tooMany' | 'duplicate' | 'badAmount' | 'nothingFinanced' | 'sumMismatch';

/**
 * Bank ulushlarini tekshiradi: har bank bir marta, summa butun ≥ 1,
 * jami = bank moliyalashtiradigan summa (jami − bosh to'lov).
 */
export function validateBankParts(
  parts: { bankName: string; amount: number }[],
  financed: number,
): { ok: true; parts: ISaleBankPart[] } | { ok: false; error: BankPartsError } {
  if (financed < 1) return { ok: false, error: 'nothingFinanced' };
  if (parts.length === 0 || parts.some((p) => !p.bankName.trim())) return { ok: false, error: 'required' };
  if (parts.length > MAX_BANK_PARTS) return { ok: false, error: 'tooMany' };
  const seen = new Set<string>();
  for (const p of parts) {
    const key = p.bankName.trim().toLowerCase();
    if (seen.has(key)) return { ok: false, error: 'duplicate' };
    seen.add(key);
    if (!Number.isSafeInteger(p.amount) || p.amount < 1) return { ok: false, error: 'badAmount' };
  }
  const sum = parts.reduce((a, p) => a + p.amount, 0);
  if (sum !== financed) return { ok: false, error: 'sumMismatch' };
  return { ok: true, parts: parts.map((p) => ({ bankName: p.bankName.trim(), amount: p.amount })) };
}

export interface BankBalance {
  /** Sotuvlarda shu bankka yozilgan summa */
  financed: number;
  /** Bankdan olingan pul */
  received: number;
  /** financed − received (manfiy — bank ortiqcha o'tkazgan) */
  balance: number;
  /** Shu bank ishtirok etgan sotuvlar soni */
  salesCount: number;
}

const EMPTY: BankBalance = { financed: 0, received: 0, balance: 0, salesCount: 0 };

/** Banklar bo'yicha hisob: bekor qilingan sotuvlar hisobga olinmaydi */
export function computeBankBalances(
  sales: SaleLike[],
  receipts: { bankName: string; amount: number }[],
): Map<string, BankBalance> {
  const map = new Map<string, BankBalance>();
  const get = (name: string) => {
    let cur = map.get(name);
    if (!cur) {
      cur = { ...EMPTY };
      map.set(name, cur);
    }
    return cur;
  };
  for (const s of sales) {
    if (s.status === 'cancelled') continue;
    for (const p of saleBankParts(s)) {
      const cur = get(p.bankName);
      cur.financed += p.amount;
      cur.salesCount += 1;
    }
  }
  for (const r of receipts) get(r.bankName).received += r.amount;
  for (const cur of map.values()) cur.balance = cur.financed - cur.received;
  return map;
}

export function bankBalanceOf(map: Map<string, BankBalance>, name: string): BankBalance {
  return map.get(name) ?? { ...EMPTY };
}
