/**
 * Oshxona printeri — varaqni navbatga qo'yish (server). ops.ts buyurtma yozilgandan keyin chaqiradi:
 *   sendItems → yuborilgan taomlar stansiya bo'yicha `order` varag'iga ajratiladi;
 *   voidItem  → oshxonada turgan (sent/cooking/ready) taom bekor qilinsa — `void` varag'i.
 * Faqat `printEnabled` va faol stansiyalar uchun. Xato buyurtma amalini to'xtatmaydi (chaqiruvchi ushlaydi).
 * Navbatdan olish va belgilash — printQueue.ts. Bu fayl ops.ts ni import qilmaydi (aylana import bo'lmasin).
 */
import type { Types } from 'mongoose';
import type { IOrderItem, OrderDoc } from '../models/tenant/Order';
import type { IPrintJob, IPrintJobLine } from '../models/tenant/PrintJob';
import { loadStaffNames, staffName, type StaffNames } from '../staffNames';
import { KDS_STATUSES, type ItemStatus, type PrintJobKind } from './types';
import type { RestaurantCtx } from './context';

export type NewPrintJob = Omit<IPrintJob, 'createdAt' | 'updatedAt'>;
type StationRef = { _id: Types.ObjectId | string; name: string };

/** Buyurtma qatoridan varaq qatori (narx chiqmaydi — oshxonaga kerak emas) */
export function printLine(i: IOrderItem, reason?: string): IPrintJobLine {
  return {
    itemId: i._id,
    name: i.name,
    qty: i.qty,
    ...(i.unit ? { unit: i.unit } : {}),
    modifiers: (i.modifiers ?? []).map((m) => ({ group: m.group, name: m.name })),
    ...(i.note ? { note: i.note } : {}),
    ...(i.fromQr ? { fromQr: true } : {}),
    ...(reason ? { reason } : {}),
  };
}

/**
 * Taomlarni stansiya bo'yicha varaqlarga ajratadi: har stansiyaga bitta varaq, qatorlar buyurtmadagi
 * tartibda. `stations` — printeri yoqilgan stansiyalar; boshqa stansiyadagi va stansiyasiz taom tushmaydi.
 */
export function buildPrintJobs(
  kind: PrintJobKind,
  o: OrderDoc,
  items: readonly IOrderItem[],
  stations: readonly StationRef[],
  meta: { waiterName: string | null; by: string; now: Date },
): NewPrintJob[] {
  const byStation = new Map(stations.map((s) => [String(s._id), s]));
  const groups = new Map<string, IOrderItem[]>();
  for (const i of items) {
    const sid = i.stationId ? String(i.stationId) : '';
    if (!sid || !byStation.has(sid)) continue;
    const g = groups.get(sid);
    if (g) g.push(i);
    else groups.set(sid, [i]);
  }
  const jobs: NewPrintJob[] = [];
  for (const [sid, list] of groups) {
    const st = byStation.get(sid)!;
    jobs.push({
      branchId: o.branchId,
      stationId: list[0].stationId!,
      stationName: st.name,
      kind,
      orderId: o._id,
      orderNo: o.orderNo,
      orderType: o.type,
      ...(o.tableNumber !== undefined && o.tableNumber !== null ? { tableNumber: o.tableNumber } : {}),
      ...(meta.waiterName ? { waiterName: meta.waiterName } : {}),
      ...(o.guests ? { guests: o.guests } : {}),
      ...(o.note ? { orderNote: o.note } : {}),
      lines: list.map((i) => printLine(i, kind === 'void' ? i.voidReason : undefined)),
      status: 'pending',
      queuedAt: meta.now,
      attempts: 0,
      createdBy: meta.by,
    });
  }
  return jobs;
}

/** Bekor qilinganda varaq kerakmi: taom oshxonada edi (yuborilgan, tayyorlanayotgan yoki tayyor) */
export function needsVoidTicket(prevStatus: ItemStatus, item: Pick<IOrderItem, 'stationId'>): boolean {
  return !!item.stationId && KDS_STATUSES.includes(prevStatus);
}

async function enqueue(
  ctx: RestaurantCtx,
  kind: PrintJobKind,
  o: OrderDoc,
  items: readonly IOrderItem[],
  names?: () => Promise<StaffNames>,
): Promise<number> {
  const stationIds = [...new Set(items.map((i) => (i.stationId ? String(i.stationId) : '')).filter(Boolean))];
  if (!stationIds.length) return 0;
  const stations = await ctx.m.KitchenStation.find({ _id: { $in: stationIds }, branchId: o.branchId, active: true, printEnabled: true })
    .select('name')
    .lean();
  if (!stations.length) return 0;
  const staff = await (names ? names() : loadStaffNames(ctx.m.User));
  const jobs = buildPrintJobs(kind, o, items, stations, {
    waiterName: staffName(staff, o.waiterName, o.waiterId),
    by: ctx.user.username,
    now: new Date(),
  });
  if (!jobs.length) return 0;
  await ctx.m.PrintJob.insertMany(jobs);
  return jobs.length;
}

/** Oshxonaga yuborilgan taomlar (`itemIds`) — saqlangan buyurtmadan olinadi */
export function enqueueSentTickets(ctx: RestaurantCtx, saved: OrderDoc, itemIds: readonly string[], names?: () => Promise<StaffNames>): Promise<number> {
  const ids = new Set(itemIds);
  return enqueue(ctx, 'order', saved, saved.items.filter((i) => ids.has(String(i._id)) && i.status !== 'voided'), names);
}

/** Bekor qilingan taom (`voidedItemId` — saqlangan buyurtmadagi `voided` qator) */
export function enqueueVoidTicket(
  ctx: RestaurantCtx,
  saved: OrderDoc,
  voidedItemId: string,
  prevStatus: ItemStatus,
  names?: () => Promise<StaffNames>,
): Promise<number> {
  const item = saved.items.find((i) => String(i._id) === voidedItemId);
  if (!item || !needsVoidTicket(prevStatus, item)) return Promise.resolve(0);
  return enqueue(ctx, 'void', saved, [item], names);
}
