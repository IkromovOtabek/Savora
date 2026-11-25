import type { Model, Types } from 'mongoose';
import type { ICashFlow } from './models/tenant/CashFlow';
import type { ICashShift } from './models/tenant/CashShift';
import type { IPieceworkEntry } from './models/tenant/PieceworkEntry';
import { SHIFT_DEPOSIT_CATEGORY, SHIFT_WITHDRAW_CATEGORY } from './models/tenant/FinanceCategory';

/**
 * Moliya jurnalidan o'chirib bo'lmaydigan (tizim) yozuvlar — o'chirilsa boshqa hisob buziladi:
 * - `sale` — sotuv bekor qilinganda mijozga qaytarilgan pul (sotuv bilan bog'liq);
 * - `ledger` — daftar qarzi kassa orqali (daftar qoldig'i);
 * - `shiftOp` — smena ichida kassaga pul qo'shish/olish;
 * - `closedShift` — yopilgan smenaga bog'langan yozuv (smena yakuni o'zgarib ketadi);
 * - `piecework` — ishbay to'lovi (ishbay yozuvlari «to'langan» holatda qoladi).
 * Ochiq smenadagi oddiy xarajatni (xato kiritilgan) o'chirish mumkin.
 */
export type CashFlowLock = 'sale' | 'ledger' | 'shiftOp' | 'closedShift' | 'piecework';

type FlowRow = Pick<ICashFlow, 'saleId' | 'ledgerEntryId' | 'shiftId' | 'category'> & { _id: Types.ObjectId | string };

/** Faqat yozuvning o'zidan aniqlanadigan qulf (bazaga murojaatsiz) */
export function cashFlowLinkLock(e: FlowRow): CashFlowLock | null {
  if (e.saleId) return 'sale';
  if (e.ledgerEntryId) return 'ledger';
  if (e.shiftId && (e.category === SHIFT_DEPOSIT_CATEGORY || e.category === SHIFT_WITHDRAW_CATEGORY)) return 'shiftOp';
  return null;
}

/** Yozuvlar ro'yxati uchun qulflar: id → sabab (qulfsizlar ro'yxatda yo'q) */
export async function loadCashFlowLocks(
  m: { CashShift: Model<ICashShift>; PieceworkEntry: Model<IPieceworkEntry> },
  entries: FlowRow[],
): Promise<Map<string, CashFlowLock>> {
  const locks = new Map<string, CashFlowLock>();
  const shiftIds: Types.ObjectId[] = [];
  const free: FlowRow[] = [];
  for (const e of entries) {
    const lock = cashFlowLinkLock(e);
    if (lock) locks.set(String(e._id), lock);
    else {
      free.push(e);
      if (e.shiftId) shiftIds.push(e.shiftId);
    }
  }
  if (!free.length) return locks;

  const [closed, paid] = await Promise.all([
    shiftIds.length
      ? m.CashShift.find({ _id: { $in: shiftIds }, status: 'closed' }).select('_id').lean()
      : Promise.resolve([]),
    m.PieceworkEntry.find({ cashFlowId: { $in: free.map((e) => e._id) } }).select('cashFlowId').lean(),
  ]);
  const closedSet = new Set(closed.map((s) => String(s._id)));
  const paidSet = new Set(paid.map((p) => String(p.cashFlowId)));
  for (const e of free) {
    const id = String(e._id);
    if (paidSet.has(id)) locks.set(id, 'piecework');
    else if (e.shiftId && closedSet.has(String(e.shiftId))) locks.set(id, 'closedShift');
  }
  return locks;
}
