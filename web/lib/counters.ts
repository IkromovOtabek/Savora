import type { Connection, Model } from 'mongoose';
import { counterSchema, ICounter } from './models/tenant/Counter';
import { escapeRegExp } from './security';

function counterModel(conn: Connection): Model<ICounter> {
  return (conn.models.Counter as Model<ICounter>) || conn.model<ICounter>('Counter', counterSchema);
}

/** Bugungi sana prefiksi: S20261015 / T20261015 */
export function datePrefix(letter: string, today = new Date()): string {
  return `${letter}${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
}

/** Hujjat raqami: `<prefix>-0001` */
export function formatDocNo(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

/**
 * Prefiks bo'yicha keyingi raqam — atomik ($inc). Hisoblagich hali yo'q bo'lsa
 * (yangi kun yoki eski ma'lumot), avval mavjud hujjatlar soni bilan $max orqali
 * boshlanadi — shunda eski raqamlar bilan to'qnashmaydi; parallel chaqiruvlarda ham
 * $max + $inc birga takrorsiz natija beradi.
 */
export async function nextDocNo(
  DocModel: Model<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  field: string,
  kind: string,
  prefix: string
): Promise<string> {
  const Counter = counterModel(DocModel.db);
  const key = `${kind}:${prefix}`;

  const existing = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true }).lean();
  if (existing) return formatDocNo(prefix, existing.seq);

  const count = await DocModel.countDocuments({ [field]: { $regex: `^${escapeRegExp(prefix)}-` } });
  await Counter.updateOne({ _id: key }, { $max: { seq: count } }, { upsert: true });
  const doc = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true, upsert: true }).lean();
  return formatDocNo(prefix, doc!.seq);
}
