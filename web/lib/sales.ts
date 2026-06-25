import { Model } from 'mongoose';
import { ISale } from './models/tenant/Sale';

export async function generateSaleNo(Sale: Model<ISale>): Promise<string> {
  const today = new Date();
  const prefix = `S${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const count = await Sale.countDocuments({ saleNo: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

export function calcSaleStatus(total: number, paid: number): 'paid' | 'partial' {
  if (paid >= total) return 'paid';
  return 'partial';
}
