/**
 * Mijoz qarzlari: ommaviy to'lovni taqsimlash va solishtirish dalolatnomasi — sof funksiyalar.
 */

/**
 * Summani qarzlarga berilgan tartibda (eng eski/muddati yaqin birinchi) taqsimlaydi.
 * Summa jami qarzdan katta yoki noto'g'ri bo'lsa — null.
 */
export function allocatePayment(debts: { id: string; remaining: number }[], amount: number): { id: string; amount: number }[] | null {
  const total = debts.reduce((s, d) => s + Math.max(0, d.remaining), 0);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > total) return null;
  const out: { id: string; amount: number }[] = [];
  let left = amount;
  for (const d of debts) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, d.remaining));
    if (take > 0) { out.push({ id: d.id, amount: take }); left -= take; }
  }
  return out;
}

export interface LedgerSale {
  id: string;
  saleNo: string;
  product: string;
  createdAt: Date;
  totalAmount: number;
  payments: { amount: number; paidAt: Date; note?: string }[];
}

export interface LedgerRow {
  at: Date;
  kind: 'sale' | 'payment';
  saleNo: string;
  product: string;
  debit: number;
  credit: number;
  balance: number;
  note?: string;
}

/**
 * Dalolatnoma qatorlari: sotuv — qarz (debet), to'lov — kredit; sana bo'yicha, o'suvchi qoldiq.
 * Yakuniy qoldiq = Σ sotuv − Σ to'lov (bekor qilingan sotuvlar chaqiruvchi tomonidan chiqariladi).
 */
export function buildLedger(sales: LedgerSale[]): { rows: LedgerRow[]; debit: number; credit: number; balance: number } {
  const events: Omit<LedgerRow, 'balance'>[] = [];
  for (const s of sales) {
    events.push({ at: new Date(s.createdAt), kind: 'sale', saleNo: s.saleNo, product: s.product, debit: s.totalAmount, credit: 0 });
    for (const p of s.payments) {
      events.push({ at: new Date(p.paidAt), kind: 'payment', saleNo: s.saleNo, product: s.product, debit: 0, credit: p.amount, note: p.note });
    }
  }
  // Bir vaqtdagi sotuv va uning bosh to'lovi: avval sotuv, keyin to'lov
  events.sort((a, b) => a.at.getTime() - b.at.getTime() || (a.kind === b.kind ? 0 : a.kind === 'sale' ? -1 : 1));
  let balance = 0;
  let debit = 0;
  let credit = 0;
  const rows = events.map((e) => {
    balance += e.debit - e.credit;
    debit += e.debit;
    credit += e.credit;
    return { ...e, balance };
  });
  return { rows, debit, credit, balance };
}
