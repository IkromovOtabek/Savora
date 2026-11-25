import { ISale, PaymentType } from './models/tenant/Sale';
import { methodOf, type PayMethod } from './payMethods';

export interface KassaPaymentRow {
  saleId: string;
  saleNo: string;
  customerName: string;
  paymentType: PaymentType;
  /** To'lov usuli (naqd/karta/o'tkazma); qaytarish — doim naqd */
  method: PayMethod;
  amount: number;
  paidAt: Date;
  note?: string;
  recordedBy?: string;
  productName: string;
  imei: string;
  /** Qisman qaytarish — mijozga naqd qaytarilgan pul (amount manfiy) */
  isRefund?: boolean;
  /** Sotuv keyin bekor qilingan (to'lov realizatsiya bo'lib qoladi, qaytarilgani — Moliya chiqimi) */
  cancelled?: boolean;
}

/**
 * Kassa hisobiga kiradigan sotuvlar: bekor qilinmagan yoki yangi tartibda bekor qilingan (`cancelledAt` bor).
 * Yangi tartibda to'lovlar o'z kunida realizatsiya bo'lib qoladi, mijozga qaytarilgani esa
 * Moliya'da «Sotuv bekor qilindi» chiqimi (CashFlow) — kassa qoldig'i shu chiqim bilan kamayadi.
 * Eski bekor qilinganlar (cancelledAt yo'q) — avvalgidek hisobdan butunlay chiqadi (tarix o'zgarmasin).
 */
export const KASSA_SALE_FILTER = { $or: [{ status: { $ne: 'cancelled' } }, { cancelledAt: { $exists: true } }] };

export function countsInKassa(sale: { status: string; cancelledAt?: Date | null }): boolean {
  return sale.status !== 'cancelled' || !!sale.cancelledAt;
}

/**
 * To'lov kassada qaysi tur bo'lib hisoblanadi. Qo'lga olingan pul (bosh to'lov, naqd to'lov,
 * kassir "Naqd" usulini tanlab qabul qilgan qarz to'lovi) — 'cash'; aks holda sotuv turi
 * (bank moliyalashtirgan qoldiq Kredit kassa sahifasida ko'rsatiladi).
 * Usul yozilgan to'lovda (method bor) usul hal qiladi; eski yozuvlarda — izoh.
 */
export function effectivePaymentType(
  saleType: PaymentType,
  p: { note?: string | null; method?: string | null },
): PaymentType {
  if (saleType === 'cash') return 'cash';
  if (p.method === 'cash') return 'cash';
  const note = (p.note ?? '').toLowerCase();
  return note.includes('boshlang') || note.includes('naqd') ? 'cash' : saleType;
}

/** Berilgan kun uchun kassa tushumlari (sotuv to'lovlari) */
export function extractKassaPayments(
  sales: (ISale & { _id: unknown })[],
  dayStart: Date,
  dayEnd: Date,
): KassaPaymentRow[] {
  const rows: KassaPaymentRow[] = [];

  for (const sale of sales) {
    if (!countsInKassa(sale)) continue;
    const cancelled = sale.status === 'cancelled';
    for (const p of sale.payments ?? []) {
      const paidAt = new Date(p.paidAt);
      if (paidAt >= dayStart && paidAt < dayEnd) {
        const effectiveType = effectivePaymentType(sale.paymentType, p);
        rows.push({
          saleId: String(sale._id),
          saleNo: sale.saleNo,
          customerName: sale.customerSnapshot?.fullName ?? '—',
          paymentType: effectiveType,
          method: methodOf(p),
          amount: p.amount,
          paidAt,
          note: p.note,
          recordedBy: p.recordedBy,
          productName: sale.productSnapshot.name,
          imei: sale.productSnapshot.imei,
          ...(cancelled ? { cancelled } : {}),
        });
      }
    }
    // Qisman qaytarish: mijozga naqd qaytarilgan pul — shu kun kassasidan chiqim (manfiy)
    for (const r of sale.returns ?? []) {
      const at = new Date(r.returnedAt);
      if (r.refundAmount > 0 && at >= dayStart && at < dayEnd) {
        rows.push({
          saleId: String(sale._id),
          saleNo: sale.saleNo,
          customerName: sale.customerSnapshot?.fullName ?? '—',
          paymentType: 'cash',
          method: 'cash',
          amount: -r.refundAmount,
          paidAt: at,
          note: r.reason,
          recordedBy: r.by,
          productName: sale.productSnapshot.name,
          imei: sale.productSnapshot.imei,
          isRefund: true,
        });
      }
    }
  }

  return rows.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
}

/** Kassadagi naqd pulga qo'shiladigan qator: naqd tushum (yoki bosh to'lov) va naqd usul */
export function isCashRow(r: Pick<KassaPaymentRow, 'paymentType' | 'method'>): boolean {
  return r.paymentType === 'cash' && r.method === 'cash';
}

/** Karta/o'tkazma tushumi (naqd kassaga kirmaydi) — usul bo'yicha */
export function sumByMethod(rows: KassaPaymentRow[]): Partial<Record<PayMethod, number>> {
  const out: Partial<Record<PayMethod, number>> = {};
  for (const r of rows) {
    if (r.isRefund || r.method === 'cash') continue;
    out[r.method] = (out[r.method] ?? 0) + r.amount;
  }
  return out;
}
