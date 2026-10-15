import { Model } from 'mongoose';
import { ITransfer } from './models/tenant/Transfer';
import { datePrefix, nextDocNo } from './counters';

/** O'tkazma raqami (T20261015-0001) — atomik hisoblagich orqali */
export async function generateTransferNo(Transfer: Model<ITransfer>): Promise<string> {
  return nextDocNo(Transfer, 'transferNo', 'transfer', datePrefix('T'));
}
