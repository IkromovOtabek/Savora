import { Model } from 'mongoose';
import { ISale } from './models/tenant/Sale';
import { datePrefix, nextDocNo } from './counters';

/** Sotuv raqami (S20261015-0001) — atomik hisoblagich orqali, parallel sotuvda takrorlanmaydi */
export async function generateSaleNo(Sale: Model<ISale>): Promise<string> {
  return nextDocNo(Sale, 'saleNo', 'sale', datePrefix('S'));
}

export function calcSaleStatus(total: number, paid: number): 'paid' | 'partial' {
  if (paid >= total) return 'paid';
  return 'partial';
}
