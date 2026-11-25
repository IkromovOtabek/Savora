import { Types, type Model } from 'mongoose';
import type { ISale } from './models/tenant/Sale';
import type { ICashFlow } from './models/tenant/CashFlow';
import type { IBankReceipt } from './models/tenant/BankReceipt';
import { isCashMethod } from './payMethods';
import { KASSA_SALE_FILTER, countsInKassa, effectivePaymentType } from './kassa';

/** Filial naqd kassasi (barcha vaqt) */
export interface BranchCash {
  /** Naqd to'lovlar (sotuv, qarz/nasiya to'lovi) − mijozga qaytarilgan naqd */
  cashSales: number;
  /** Kredit kassada bankdan olingan pul (shu filial kassasiga) */
  bankIn: number;
  /** Filialga bog'langan kirim (kassaga pul qo'shish, daftar «olindi» va h.k.) */
  income: number;
  /** Filialga bog'langan chiqim (xarajat, kassadan olish, qaytarish, daftar «berildi») */
  expense: number;
  /** Kassada bo'lishi kerak bo'lgan naqd: cashSales + bankIn + income − expense */
  cash: number;
}

export interface BranchCashResult {
  byBranch: Map<string, BranchCash>;
  /** Filialsiz kirim/chiqim va bank tushumi — faqat egasining jamiga qo'shiladi */
  unbranched: { income: number; expense: number; bankIn: number };
}

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

const empty = (): BranchCash => ({ cashSales: 0, bankIn: 0, income: 0, expense: 0, cash: 0 });

/**
 * Naqd kassa qoldig'i — yagona formula (Naqd kassa, Moliya → Hisoblar holati).
 * `branchIds` berilsa — faqat shu filiallar (filial login); bo'lmasa — hammasi.
 */
export async function loadBranchCash(
  m: { Sale: Model<ISale>; CashFlow: Model<ICashFlow>; BankReceipt: Model<IBankReceipt> },
  branchIds?: string[],
): Promise<BranchCashResult> {
  const branchMatch = branchIds ? { branchId: { $in: branchIds } } : {};
  const [sales, flows, receipts] = await Promise.all([
    // Bekor qilingan (yangi tartib) — to'lovlari realizatsiya, qaytarilgani CashFlow chiqimida
    m.Sale.find({ ...KASSA_SALE_FILTER, ...branchMatch }).select('branchId status cancelledAt paymentType payments returns').lean(),
    m.CashFlow.aggregate<{ _id: { branchId: unknown; type: string }; total: number }>([
      ...(branchIds ? [{ $match: { branchId: { $in: branchIds.map((id) => new Types.ObjectId(id)) } } }] : []),
      { $group: { _id: { branchId: '$branchId', type: '$type' }, total: { $sum: '$amount' } } },
    ]),
    m.BankReceipt.aggregate<{ _id: unknown; total: number }>([
      ...(branchIds ? [{ $match: { branchId: { $in: branchIds.map((id) => new Types.ObjectId(id)) } } }] : []),
      { $group: { _id: '$branchId', total: { $sum: '$amount' } } },
    ]),
  ]);

  const byBranch = new Map<string, BranchCash>();
  const row = (id: string) => {
    let r = byBranch.get(id);
    if (!r) byBranch.set(id, (r = empty()));
    return r;
  };
  const unbranched = { income: 0, expense: 0, bankIn: 0 };

  for (const [id, v] of sumCashFromSales(sales)) row(id).cashSales += v;
  for (const f of flows) {
    const key = f._id.type === 'income' ? 'income' : 'expense';
    if (f._id.branchId) row(String(f._id.branchId))[key] += f.total;
    else unbranched[key] += f.total;
  }
  for (const r of receipts) {
    if (r._id) row(String(r._id)).bankIn += r.total;
    else unbranched.bankIn += r.total;
  }
  for (const r of byBranch.values()) r.cash = r.cashSales + r.bankIn + r.income - r.expense;
  return { byBranch, unbranched };
}

export function branchCashOf(res: BranchCashResult, id: string): BranchCash {
  return res.byBranch.get(id) ?? empty();
}
