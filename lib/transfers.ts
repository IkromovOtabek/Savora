import { Model } from 'mongoose';
import { ITransfer } from './models/tenant/Transfer';

export async function generateTransferNo(Transfer: Model<ITransfer>): Promise<string> {
  const today = new Date();
  const prefix = `T${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const count = await Transfer.countDocuments({ transferNo: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}
