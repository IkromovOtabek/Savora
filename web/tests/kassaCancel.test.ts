import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { countsInKassa, extractKassaPayments } from '@/lib/kassa';
import { sumCashFromSales } from '@/lib/cashKassa';
import type { ISale } from '@/lib/models/tenant/Sale';

const branchId = new Types.ObjectId();
const day = (d: number, h = 10) => new Date(2026, 10, d, h);

function sale(p: Partial<ISale>): ISale & { _id: unknown } {
  return {
    _id: new Types.ObjectId(),
    saleNo: 'S-1',
    branchId,
    status: 'paid',
    paymentType: 'cash',
    productSnapshot: { name: 'Telefon', imei: '1' },
    payments: [{ amount: 500_000, paidAt: day(10), note: "Naqd to'lov", method: 'cash' }],
    returns: [],
    ...p,
  } as unknown as ISale & { _id: unknown };
}

describe('bekor qilingan sotuv va kassa', () => {
  it("eski bekor qilingan (cancelledAt yo'q) — hisobdan chiqadi, yangisi — realizatsiyada qoladi", () => {
    expect(countsInKassa({ status: 'paid' })).toBe(true);
    expect(countsInKassa({ status: 'cancelled' })).toBe(false);
    expect(countsInKassa({ status: 'cancelled', cancelledAt: day(12) })).toBe(true);

    const legacy = sale({ status: 'cancelled' });
    const fresh = sale({ status: 'cancelled', cancelledAt: day(12) });
    expect(sumCashFromSales([legacy]).get(String(branchId))).toBeUndefined();
    expect(sumCashFromSales([fresh]).get(String(branchId))).toBe(500_000);
  });

  it("to'lov o'z kunida kassada «bekor qilingan» belgisi bilan ko'rinadi", () => {
    const rows = extractKassaPayments([sale({ status: 'cancelled', cancelledAt: day(12) })], day(10, 0), day(11, 0));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 500_000, cancelled: true });
  });
});
