import type { ISale, PaymentType } from './models/tenant/Sale';
import type { ICashFlow } from './models/tenant/CashFlow';

export interface BranchCashCard {
  id: string;
  name: string;
  naxtSotuv: number;
  adminOlgan: number;
  qolgan: number;
}

function effectivePaymentType(sale: ISale, note: string): PaymentType {
  const n = note.toLowerCase();
  const isCashReceived = n.includes('boshlang') || n.includes('naqd');
  return sale.paymentType !== 'cash' && isCashReceived ? 'cash' : sale.paymentType;
}

/** Filial bo'yicha naqd tushum (barcha vaqt) */
export function sumCashFromSales(sales: (ISale & { _id: unknown })[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const sale of sales) {
    if (sale.status === 'cancelled') continue;
    const branchId = String(sale.branchId);
    let branchCash = 0;
    for (const p of sale.payments ?? []) {
      if (effectivePaymentType(sale, p.note ?? '') === 'cash') {
        branchCash += p.amount;
      }
    }
    if (branchCash > 0) {
      map.set(branchId, (map.get(branchId) ?? 0) + branchCash);
    }
  }
  return map;
}

/** Admin olgan pul — filial bo'yicha (branchId bo'lmasa umumiy) */
export function sumAdminWithdrawals(
  flows: (ICashFlow & { branchId?: { toString(): string } | null })[],
): { byBranch: Map<string, number>; global: number } {
  const byBranch = new Map<string, number>();
  let global = 0;
  for (const f of flows) {
    if (f.type !== 'expense') continue;
    if (f.branchId) {
      const id = String(f.branchId);
      byBranch.set(id, (byBranch.get(id) ?? 0) + f.amount);
    } else {
      global += f.amount;
    }
  }
  return { byBranch, global };
}

export function buildBranchCashCards(
  branches: { id: string; name: string }[],
  sales: (ISale & { _id: unknown })[],
  flows: (ICashFlow & { branchId?: { toString(): string } | null })[],
): { cards: BranchCashCard[]; total: BranchCashCard } {
  const cashByBranch = sumCashFromSales(sales);
  const { byBranch: withdrawByBranch, global: globalWithdraw } = sumAdminWithdrawals(flows);

  const cards = branches.map((b) => {
    const naxtSotuv = cashByBranch.get(b.id) ?? 0;
    const adminOlgan = withdrawByBranch.get(b.id) ?? 0;
    return {
      id: b.id,
      name: b.name,
      naxtSotuv,
      adminOlgan,
      qolgan: naxtSotuv - adminOlgan,
    };
  });

  const totalNaxt = cards.reduce((s, c) => s + c.naxtSotuv, 0);
  const totalAdmin = cards.reduce((s, c) => s + c.adminOlgan, 0) + globalWithdraw;

  return {
    cards,
    total: {
      id: 'all',
      name: 'JAMI (BARCHA FILIALLAR)',
      naxtSotuv: totalNaxt,
      adminOlgan: totalAdmin,
      qolgan: totalNaxt - totalAdmin,
    },
  };
}
