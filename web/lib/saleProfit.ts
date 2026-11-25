/**
 * Sotuv foydasi qachon foydaga kiradi (sof funksiyalar — test qilinadi).
 *
 * Oddiy sotuv (naqd, qarz, bank krediti): sotuv kuni to'liq — tushum (bank ulushisiz, `saleProfitRevenue`) − tannarx.
 *
 * Nasiya (installment, bank + nasiya ham): avval mahsulot tannarxi qoplanadi. Mijoz to'lovlari (boshlang'ich ham)
 * yig'indisi tannarxga yetguncha foyda 0; tannarxdan oshgan har to'lov — to'lov kuni foydaga kiradi.
 * Masalan: 10 mln telefon, tannarx 7 mln, boshlang'ich 2 mln, oyiga 1 mln — 5-oygacha foyda 0,
 * 6-oyda +1 mln, keyin har oy +1 mln; to'liq to'langach jami foyda = 10 − 7 = 3 mln.
 * Zararli nasiya (tushum < tannarx) — zarar sotuv kuni darhol. Mijozga naqd qaytarilgan pul to'lovni kamaytiradi.
 * Bank + nasiya: bank ulushi avvalgidek bankdan pul olinganda foydaga (BankReceipt) — bu yerda faqat mijoz qismi.
 */
import { saleProfitRevenue } from './bankCredit';
import { QTY_DECIMALS, priceTimesQty } from './qty';

type CostSale = { productId?: unknown; productSnapshot?: { purchasePrice?: number | null; saleQuantity?: number | null } | null };

/**
 * Sotuv tannarxi — yagona qoida (Hisobot, mobil foyda, Realizatsiya, hisobot sahifalari):
 * sotuv paytidagi xarid narxi × miqdor, butun so'mga (`priceTimesQty` — kasr miqdorda float xatosisiz).
 * `fallbackUnit` — snapshot'da narx yo'q eski sotuvlar uchun mahsulotning joriy xarid narxi.
 */
export function saleCost(sale: CostSale, fallbackUnit?: Map<string, number>): number {
  const unit = sale.productSnapshot?.purchasePrice ?? fallbackUnit?.get(String(sale.productId)) ?? 0;
  return priceTimesQty(unit, sale.productSnapshot?.saleQuantity ?? 1);
}

/** Eski sotuvlar (snapshot'da xarid narxi yo'q) uchun mahsulotning joriy xarid narxi: productId → narx */
export async function loadCostFallback(
  Product: { find(f: object): { select(s: string): { lean(): PromiseLike<{ _id: unknown; purchasePrice?: number | null }[]> } } },
  sales: CostSale[],
): Promise<Map<string, number>> {
  const missing = sales.filter((s) => s.productSnapshot?.purchasePrice == null).map((s) => s.productId);
  if (!missing.length) return new Map();
  const list = await Product.find({ _id: { $in: missing } }).select('purchasePrice').lean();
  return new Map(list.map((p) => [String(p._id), p.purchasePrice ?? 0]));
}

const QTY_SCALE = 10 ** QTY_DECIMALS;
/** `saleCost` ning Mongo aggregate nusxasi (snapshot bo'yicha): tannarx × miqdor butun arifmetikada, yarmi yuqoriga */
export const SALE_COST_EXPR = {
  $floor: { $divide: [
    { $add: [
      { $multiply: [
        { $ifNull: ['$productSnapshot.purchasePrice', 0] },
        { $round: [{ $multiply: [{ $ifNull: ['$productSnapshot.saleQuantity', 1] }, QTY_SCALE] }, 0] },
      ] },
      QTY_SCALE / 2,
    ] },
    QTY_SCALE,
  ] },
};

type ProfitSale = Parameters<typeof saleProfitRevenue>[0] & {
  createdAt?: Date | string | null;
  payments?: { amount: number; paidAt: Date | string }[] | null;
  returns?: { refundAmount?: number; returnedAt: Date | string }[] | null;
};

/** Foydaning bir bo'lagi: `sale` — sotuv kuni, `nasiya` — nasiya to'lovidan (tannarx qoplangach) */
export interface ProfitPart {
  at: Date;
  amount: number;
  kind: 'sale' | 'nasiya';
}

/** Foydasi to'lovlar bilan (tannarx qoplangach) kiradigan sotuv */
export function defersProfit(s: { paymentType?: string | null }): boolean {
  return s.paymentType === 'installment';
}

/**
 * Sotuv foydasining bo'laklari (sana bo'yicha). Yig'indisi — hozirgacha foydaga kirgani;
 * davr foydasi — shu davrga tushgan bo'laklar (`profitBetween`).
 */
export function saleProfitParts(sale: ProfitSale, cost: number): ProfitPart[] {
  const at = sale.createdAt ? new Date(sale.createdAt) : new Date(0);
  const revenue = saleProfitRevenue(sale);
  if (!defersProfit(sale)) return [{ at, amount: revenue - cost, kind: 'sale' }];

  // To'langan summa p bo'yicha foydaga kirgani: tannarxdan oshgani; zararli nasiyada — zarar o'zi (o'zgarmaydi)
  const loss = Math.min(0, revenue - cost);
  const earned = (paid: number) => Math.max(Math.min(Math.max(paid, 0), revenue) - cost, loss);
  const moves = [
    ...(sale.payments ?? []).filter((p) => p.amount > 0).map((p) => ({ at: new Date(p.paidAt), amount: p.amount })),
    ...(sale.returns ?? []).filter((r) => (r.refundAmount ?? 0) > 0).map((r) => ({ at: new Date(r.returnedAt), amount: -(r.refundAmount ?? 0) })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const parts: ProfitPart[] = loss ? [{ at, amount: loss, kind: 'sale' }] : [];
  let paid = 0;
  let prev = earned(0);
  for (const m of moves) {
    paid += m.amount;
    const cur = earned(paid);
    if (cur !== prev) parts.push({ at: m.at, amount: cur - prev, kind: 'nasiya' });
    prev = cur;
  }
  return parts;
}

/** [start, end) davriga tushgan foyda; `kind` berilsa — faqat o'sha bo'laklar */
export function profitBetween(parts: ProfitPart[], start: Date, end: Date, kind?: ProfitPart['kind']): number {
  let sum = 0;
  for (const p of parts) if (p.at >= start && p.at < end && (!kind || p.kind === kind)) sum += p.amount;
  return sum;
}

/** Hozirgacha foydaga kirgan jami (barcha vaqt) */
export function profitToDate(parts: ProfitPart[]): number {
  return parts.reduce((a, p) => a + p.amount, 0);
}

/**
 * Davrdan oldin sotilgan nasiyalar, shu davrda to'lov yoki qaytarish bo'lganlari — ularning tannarxdan oshgan
 * to'lovlari shu davr foydasiga kiradi (Mongo filtri; filial cheklovi chaqiruvchida qo'shiladi).
 */
export function earlierNasiyaFilter(start: Date, end: Date) {
  const range = { $gte: start, $lt: end };
  return {
    status: { $ne: 'cancelled' as const },
    paymentType: 'installment' as const,
    createdAt: { $lt: start },
    $or: [{ 'payments.paidAt': range }, { 'returns.returnedAt': range }],
  };
}
