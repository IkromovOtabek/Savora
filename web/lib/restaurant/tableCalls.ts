/**
 * Mijoz QR chaqiruvi → bildirishnoma (lib/notify.ts). public.ts → publicCall chaqiradi (fonda), ops.ts → ackTableCall
 * «Ko'rdim» bosilganda shu kalitlar bilan xabarni yopadi.
 *
 * Kimga:
 *  - stolda ochiq buyurtma va uning ofitsanti bor — faqat o'sha ofitsantga (boshqa ofitsant ko'rmaydi);
 *    hisob so'rovi — qo'shimcha filialdagi `order.viewAll` egalariga (kassir);
 *  - ofitsant yo'q (stol bo'sh yoki mijoz QR orqali ochgan) — filialdagi `order.create` egalariga
 *    (hisob so'rovida `order.viewAll` ham).
 * Hech kim topilmasa — notify() egasiga o'tkazadi.
 */
import type { Types } from 'mongoose';
import { notify, type NotifyInput, type NotifyOrg } from '../notify';
import type { TableCallKind } from './types';
import type { RestaurantModels } from './context';

const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

/** Takrorlanmaslik kalitlari (`kind` yo'q — ikkalasi) */
export function tableCallKeys(tableId: string, kind?: TableCallKind): string[] {
  const keys: string[] = [];
  if (kind !== 'bill') keys.push(`waiterCall:${tableId}`);
  if (kind !== 'waiter') keys.push(`billCall:${tableId}`);
  return keys;
}

/** Chaqiruv xabari (sof — testlanadi) */
export function tableCallNotice(
  table: { _id: Types.ObjectId | string; number: number; branchId: Types.ObjectId | string },
  kind: TableCallKind,
  waiterId: string | null | undefined,
): NotifyInput {
  const bill = kind === 'bill';
  const waiter = validId(waiterId) ? waiterId : null;
  const audience: NotifyInput['audience'] = waiter
    ? { userIds: [waiter], ...(bill ? { anyPermission: ['order.viewAll'] } : {}) }
    : { anyPermission: bill ? ['order.create', 'order.viewAll'] : ['order.create'] };
  const tableId = String(table._id);
  return {
    kind: bill ? 'billCall' : 'waiterCall',
    branchId: String(table.branchId),
    params: { table: table.number },
    url: '/app/tables',
    audience,
    dedupeKey: tableCallKeys(tableId, kind)[0],
  };
}

/** Stoldagi ochiq buyurtma ofitsantini topib, xabar yuboradi. Xato tashlamaydi */
export async function notifyTableCall(
  org: NotifyOrg,
  m: Pick<RestaurantModels, 'Order'>,
  table: { _id: Types.ObjectId; number: number; branchId: Types.ObjectId },
  kind: TableCallKind,
): Promise<void> {
  const open = await m.Order.findOne({ activeTableKey: String(table._id) }).select('waiterId').lean().catch(() => null);
  await notify(org, tableCallNotice(table, kind, open?.waiterId));
}
