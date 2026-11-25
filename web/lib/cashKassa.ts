import type { ISale } from './models/tenant/Sale';
import { isCashMethod } from './payMethods';
import { countsInKassa, effectivePaymentType } from './kassa';

/** Filial bo'yicha naqd tushum (barcha vaqt) */
export function sumCashFromSales(sales: (ISale & { _id: unknown })[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const sale of sales) {
    // Yangi tartibda bekor qilingan sotuv to'lovlari realizatsiyada qoladi (qaytarilgani — CashFlow chiqimi)
    if (!countsInKassa(sale)) continue;
    const branchId = String(sale.branchId);
    let branchCash = 0;
    for (const p of sale.payments ?? []) {
      if (isCashMethod(p.method) && effectivePaymentType(sale.paymentType, p) === 'cash') {
        branchCash += p.amount;
      }
    }
    // Qisman qaytarishda mijozga naqd qaytarilgan pul kassadan chiqadi
    for (const r of sale.returns ?? []) branchCash -= r.refundAmount ?? 0;
    if (branchCash !== 0) {
      map.set(branchId, (map.get(branchId) ?? 0) + branchCash);
    }
  }
  return map;
}
