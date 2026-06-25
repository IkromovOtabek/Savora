import { ISale, PaymentType } from './models/tenant/Sale';

export interface KassaPaymentRow {
  saleId: string;
  saleNo: string;
  customerName: string;
  paymentType: PaymentType;
  amount: number;
  paidAt: Date;
  note?: string;
  recordedBy?: string;
  productName: string;
  imei: string;
}

/** Berilgan kun uchun kassa tushumlari (sotuv to'lovlari) */
export function extractKassaPayments(
  sales: (ISale & { _id: unknown })[],
  dayStart: Date,
  dayEnd: Date,
): KassaPaymentRow[] {
  const rows: KassaPaymentRow[] = [];

  for (const sale of sales) {
    if (sale.status === 'cancelled') continue;
    for (const p of sale.payments ?? []) {
      const paidAt = new Date(p.paidAt);
      if (paidAt >= dayStart && paidAt < dayEnd) {
        // Naqd qo'lga olingan pul (bosh to'lov / naqd to'lov) — Naqd kassaga hisoblanadi.
        // Bank moliyalashtirgan qoldiq esa Kredit kassa sahifasida ko'rsatiladi.
        const note = (p.note ?? '').toLowerCase();
        const isCashReceived = note.includes('boshlang') || note.includes('naqd');
        const effectiveType: PaymentType =
          sale.paymentType !== 'cash' && isCashReceived ? 'cash' : sale.paymentType;
        rows.push({
          saleId: String(sale._id),
          saleNo: sale.saleNo,
          customerName: sale.customerSnapshot?.fullName ?? '—',
          paymentType: effectiveType,
          amount: p.amount,
          paidAt,
          note: p.note,
          recordedBy: p.recordedBy,
          productName: sale.productSnapshot.name,
          imei: sale.productSnapshot.imei,
        });
      }
    }
  }

  return rows.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
}

export function sumByType(rows: KassaPaymentRow[]): Record<PaymentType, number> {
  const totals: Record<PaymentType, number> = { cash: 0, debt: 0, installment: 0, bank_credit: 0 };
  for (const r of rows) totals[r.paymentType] += r.amount;
  return totals;
}

export function dayRange(dateStr: string): { start: Date; end: Date; label: string } {
  const start = new Date(dateStr);
  if (Number.isNaN(start.getTime())) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(end.getDate() + 1);
    return { start: now, end, label: now.toISOString().slice(0, 10) };
  }
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end, label: dateStr };
}
