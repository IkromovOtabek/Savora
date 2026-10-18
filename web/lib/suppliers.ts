import { Types, type Model } from 'mongoose';
import type { ISupplierEntry, SupplierEntryType } from './models/tenant/Supplier';

export type SupplierBalance = { purchased: number; paid: number; debt: number };

/** Yozuvlardan qarz hisobi (sof funksiya): qarz = olingan tovar − to'langan */
export function sumSupplierEntries(entries: { type: SupplierEntryType; amount: number }[]): SupplierBalance {
  let purchased = 0;
  let paid = 0;
  for (const e of entries) {
    if (e.type === 'purchase') purchased += e.amount;
    else if (e.type === 'payment') paid += e.amount;
  }
  return { purchased, paid, debt: purchased - paid };
}

/** Bir nechta yetkazib beruvchi balansi — bitta aggregate (ro'yxat sahifasi uchun) */
export async function loadSupplierBalances(
  SupplierEntry: Model<ISupplierEntry>,
  supplierIds?: Types.ObjectId[],
): Promise<Map<string, SupplierBalance>> {
  const rows = await SupplierEntry.aggregate<{ _id: Types.ObjectId; purchased: number; paid: number }>([
    ...(supplierIds ? [{ $match: { supplierId: { $in: supplierIds } } }] : []),
    {
      $group: {
        _id: '$supplierId',
        purchased: { $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, '$amount', 0] } },
        paid: { $sum: { $cond: [{ $eq: ['$type', 'payment'] }, '$amount', 0] } },
      },
    },
  ]);
  const map = new Map<string, SupplierBalance>();
  for (const r of rows) map.set(String(r._id), { purchased: r.purchased, paid: r.paid, debt: r.purchased - r.paid });
  return map;
}
