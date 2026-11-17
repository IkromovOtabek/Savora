'use server';

/**
 * Restoran server action'lari (web). Har biri: sessiya → huquq/modul (lib/restaurant ichida) → zod →
 * amal. Natija: `{ ok: true, data, success? }` yoki `{ ok: false, error, code, details? }`
 * (useToastOnState bilan mos). Buyurtma amallari yangilangan buyurtmani `data.order` da qaytaradi —
 * UI holatini shundan yangilaydi (sahifa revalidate qilinmaydi; stollar/KDS polling bilan ishlaydi).
 * To'liq ro'yxat va kirish/chiqish shakllari: docs/RESTORAN_API.md.
 */
import { revalidatePath } from 'next/cache';
import { parseInput } from '@/lib/validation';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { restaurantCtxFromSession, toAction, type ActionResult } from '@/lib/restaurant/session';
import { restaurantSchemas } from '@/lib/restaurant/inputs';
import type { RestaurantCtx } from '@/lib/restaurant/context';
import * as ops from '@/lib/restaurant/ops';
import * as setup from '@/lib/restaurant/setup';
import type { OrderView } from '@/lib/restaurant/view';
import type { BumpTarget } from '@/lib/restaurant/rules';
import type { RestaurantSettings, StationKind, TableCallKind } from '@/lib/restaurant/types';

async function prep() {
  const ctx = await restaurantCtxFromSession();
  return { ctx, s: restaurantSchemas(ctx.d.restaurant.errors), t: ctx.d.restaurant };
}

function invalid(error: string): { ok: false; error: string; code: 'badInput' } {
  return { ok: false, error, code: 'badInput' };
}

/** Buyurtma id'sini tekshirish (24 hex) */
function orderIdOf(ctx: RestaurantCtx, s: ReturnType<typeof restaurantSchemas>, orderId: unknown) {
  return parseInput(s.id, { id: orderId }, ctx.d.restaurant.errors.orderNotFound);
}

/* ───────────────────────────── buyurtma ───────────────────────────── */

/** Stol ochish (dine_in, tableId) yoki saboy (takeaway). Stolda ochiq buyurtma bo'lsa — o'sha (`existing: true`) */
export async function openOrderAction(input: ops.OpenOrderInput): Promise<ActionResult<{ order: OrderView; existing: boolean }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.openOrder, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await ops.openOrder(ctx, p.data);
  return toAction(r, r.ok && !r.data.existing ? t.order.opened : undefined);
}

/** Taom qo'shish (`clientItemId` bo'yicha idempotent) */
export async function addOrderItemsAction(orderId: string, input: { items: ops.AddItemInput[] }): Promise<ActionResult<{ order: OrderView; added: string[]; duplicates: string[] }>> {
  const { ctx, s, t } = await prep();
  const id = orderIdOf(ctx, s, orderId);
  if (!id.ok) return invalid(id.error);
  const p = parseInput(s.addItems, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await ops.addItems(ctx, id.data.id, p.data.items);
  return toAction(r, r.ok ? tr(t.order.itemsAdded, { n: r.data.added.length }) : undefined);
}

/** Oshxonaga yuborish (ombor band qilinadi). `itemIds` yo'q — barcha yangi taomlar */
export async function sendToKitchenAction(orderId: string, input: { itemIds?: string[] } = {}): Promise<ActionResult<{ order: OrderView; sent: string[]; failed: ops.SendFailure[] }>> {
  const { ctx, s, t } = await prep();
  const id = orderIdOf(ctx, s, orderId);
  if (!id.ok) return invalid(id.error);
  const p = parseInput(s.send, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await ops.sendItems(ctx, id.data.id, p.data.itemIds);
  return toAction(r, r.ok ? tr(t.order.sentCount, { n: r.data.sent.length }) : undefined);
}

/** Mijoz QR taomlarini tasdiqlash (yoki `reject: true` — rad etish); `send: true` — darhol yuborish */
export async function confirmQrItemsAction(
  orderId: string,
  input: { itemIds?: string[]; reject?: boolean; send?: boolean } = {},
): Promise<ActionResult<ops.ConfirmResult>> {
  const { ctx, s, t } = await prep();
  const id = orderIdOf(ctx, s, orderId);
  if (!id.ok) return invalid(id.error);
  const p = parseInput(s.confirm, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await ops.confirmPendingItems(ctx, id.data.id, p.data);
  return toAction(r, r.ok ? (p.data.reject ? t.order.rejected : t.order.confirmed) : undefined);
}

/** Taomni bekor qilish (`qty` — qismi; yuborilgan taomga sabab va `order.voidItem`) */
export async function voidOrderItemAction(
  orderId: string,
  input: { itemId: string; qty?: number; reason?: string },
): Promise<ActionResult<{ order: OrderView; voidedItemId: string; stockReleased: boolean; loss: boolean }>> {
  const { ctx, s, t } = await prep();
  const id = orderIdOf(ctx, s, orderId);
  if (!id.ok) return invalid(id.error);
  const p = parseInput(s.voidItem, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await ops.voidItem(ctx, id.data.id, p.data);
  return toAction(r, r.ok ? t.order.voided : undefined);
}

/** KDS / ofitsant: cooking («Boshlash»), ready («Tayyor»; ready→cooking — «Qaytarish»), served («Yetkazildi») */
export async function bumpItemsAction(orderId: string, input: { itemIds: string[]; to: BumpTarget }): Promise<ActionResult<{ order: OrderView; updated: string[]; skipped: ops.BumpSkip[] }>> {
  const { ctx, s, t } = await prep();
  const id = orderIdOf(ctx, s, orderId);
  if (!id.ok) return invalid(id.error);
  const p = parseInput(s.bump, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await ops.bumpItems(ctx, id.data.id, p.data);
  return toAction(r, r.ok ? t.order.bumped : undefined);
}

/** Boshqa stolga va/yoki boshqa ofitsantga o'tkazish (`order.transfer`) */
export async function transferOrderAction(orderId: string, input: { tableId?: string; waiterId?: string }): Promise<ActionResult<{ order: OrderView }>> {
  const { ctx, s, t } = await prep();
  const id = orderIdOf(ctx, s, orderId);
  if (!id.ok) return invalid(id.error);
  const p = parseInput(s.transfer, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await ops.transferOrder(ctx, id.data.id, p.data);
  return toAction(r, r.ok ? t.order.transferred : undefined);
}

/** Pre-chek («Hisob»): yuborilmaganlar avtomatik yuboriladi, tarkib qulflanadi */
export async function precheckOrderAction(orderId: string): Promise<ActionResult<{ order: OrderView }>> {
  const { ctx, s, t } = await prep();
  const id = orderIdOf(ctx, s, orderId);
  if (!id.ok) return invalid(id.error);
  const r = await ops.precheckOrder(ctx, id.data.id);
  return toAction(r, r.ok ? t.order.prechecked : undefined);
}

/** Pre-chekdan keyin qayta ochish (`order.reopen`) */
export async function reopenOrderAction(orderId: string): Promise<ActionResult<{ order: OrderView }>> {
  const { ctx, s, t } = await prep();
  const id = orderIdOf(ctx, s, orderId);
  if (!id.ok) return invalid(id.error);
  const r = await ops.reopenOrder(ctx, id.data.id);
  return toAction(r, r.ok ? t.order.reopened : undefined);
}

/**
 * To'lov: butun buyurtma yoki `items` (hisobni bo'lish, `order.split`). Teng bo'lish — bitta so'rovda
 * bir nechta `parts` (har mehmon ulushi; summalar — splitEqually). `payId` — takroriy bosishdan himoya.
 */
export async function payOrderAction(orderId: string, input: ops.PayInput): Promise<ActionResult<ops.PayResult>> {
  const { ctx, s, t } = await prep();
  const id = orderIdOf(ctx, s, orderId);
  if (!id.ok) return invalid(id.error);
  const p = parseInput(s.pay, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await ops.payOrder(ctx, id.data.id, { ...p.data, discount: p.data.discount ?? null });
  if (r.ok) {
    revalidatePath('/app/sales');
    revalidatePath('/app/shifts');
  }
  return toAction(r, r.ok ? tr(t.order.paidMsg, { sum: fmtMoney(r.data.total) }) : undefined);
}

/** Buyurtmani bekor qilish (yuborilgan faol taom va to'lov bo'lmasa) */
export async function cancelOrderAction(orderId: string, input: { reason?: string } = {}): Promise<ActionResult<{ order: OrderView }>> {
  const { ctx, s, t } = await prep();
  const id = orderIdOf(ctx, s, orderId);
  if (!id.ok) return invalid(id.error);
  const p = parseInput(s.cancel, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await ops.cancelOrder(ctx, id.data.id, p.data.reason || undefined);
  return toAction(r, r.ok ? t.order.cancelled : undefined);
}

/** Mehmonlar soni (0 — tozalash) va izoh */
export async function updateOrderInfoAction(orderId: string, input: { guests?: number; note?: string }): Promise<ActionResult<{ order: OrderView }>> {
  const { ctx, s, t } = await prep();
  const id = orderIdOf(ctx, s, orderId);
  if (!id.ok) return invalid(id.error);
  const p = parseInput(s.info, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await ops.updateOrderInfo(ctx, id.data.id, { guests: p.data.guests === undefined ? undefined : p.data.guests || null, note: p.data.note });
  return toAction(r, r.ok ? t.order.updated : undefined);
}

/** Mijoz chaqiruvi ko'rildi (`kind` yo'q — ikkalasi) */
export async function ackTableCallAction(input: { tableId: string; kind?: TableCallKind }): Promise<ActionResult<{ tableId: string }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.ackCall, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  return toAction(await ops.ackTableCall(ctx, p.data.tableId, p.data.kind), t.order.callAcked);
}

/* ───────────────────────────── sozlamalar (tables.manage) ───────────────────────────── */

export async function saveRestaurantSettingsAction(input: setup.RestaurantSettingsInput): Promise<ActionResult<RestaurantSettings>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.settings, input, t.errors.badSettings);
  if (!p.ok) return invalid(p.error);
  const r = await setup.saveRestaurantSettings(ctx, p.data);
  if (r.ok) revalidatePath('/app/restaurant');
  return toAction(r, t.settings.saved);
}

export async function saveHallAction(input: { id?: string; name: string; branchId?: string; sort?: number; active?: boolean }): Promise<ActionResult<{ id: string }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.hall, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await setup.saveHall(ctx, p.data);
  if (r.ok) revalidatePath('/app/restaurant');
  return toAction(r, t.settings.saved);
}

export async function deleteHallAction(id: string): Promise<ActionResult<{ id: string }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.id, { id }, t.errors.hallNotFound);
  if (!p.ok) return invalid(p.error);
  const r = await setup.deleteHall(ctx, p.data.id);
  if (r.ok) revalidatePath('/app/restaurant');
  return toAction(r, t.settings.deleted);
}

export async function saveTableAction(input: setup.TableInput): Promise<ActionResult<{ id: string; qrToken: string }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.table, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await setup.saveTable(ctx, p.data);
  if (r.ok) revalidatePath('/app/restaurant');
  return toAction(r, t.settings.saved);
}

/** Ketma-ket raqamli stollar (masalan 1–12) */
export async function createTablesRangeAction(input: { hallId: string; from: number; to: number; seats?: number }): Promise<ActionResult<{ created: number; skipped: number[] }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.tablesRange, input, t.errors.badInput);
  if (!p.ok || p.data.from === undefined || p.data.to === undefined) return invalid(p.ok ? t.errors.badInput : p.error);
  const r = await setup.createTablesRange(ctx, { hallId: p.data.hallId, from: p.data.from, to: p.data.to, seats: p.data.seats });
  if (r.ok) revalidatePath('/app/restaurant');
  return toAction(r, t.settings.saved);
}

export async function deleteTableAction(id: string): Promise<ActionResult<{ id: string }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.id, { id }, t.errors.tableNotFound);
  if (!p.ok) return invalid(p.error);
  const r = await setup.deleteTable(ctx, p.data.id);
  if (r.ok) revalidatePath('/app/restaurant');
  return toAction(r, t.settings.deleted);
}

/** Stol QR-kodini almashtirish (eski QR ishlamay qoladi) */
export async function regenerateTableQrAction(id: string): Promise<ActionResult<{ id: string; qrToken: string; qrPath: string; qrUrl: string }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.id, { id }, t.errors.tableNotFound);
  if (!p.ok) return invalid(p.error);
  const r = await setup.regenerateTableQr(ctx, p.data.id);
  if (r.ok) revalidatePath('/app/restaurant');
  return toAction(r, t.settings.qrRegenerated);
}

export async function saveStationAction(input: { id?: string; name: string; kind: StationKind; branchId?: string; printerIp?: string; sort?: number; active?: boolean }): Promise<ActionResult<{ id: string }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.station, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await setup.saveStation(ctx, p.data);
  if (r.ok) revalidatePath('/app/restaurant');
  return toAction(r, t.settings.saved);
}

export async function deleteStationAction(id: string): Promise<ActionResult<{ id: string; detached: number }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.id, { id }, t.errors.stationNotFound);
  if (!p.ok) return invalid(p.error);
  const r = await setup.deleteStation(ctx, p.data.id);
  if (r.ok) revalidatePath('/app/restaurant');
  return toAction(r, t.settings.deleted);
}

/** Taomning restoran maydonlari: stansiya (null — stansiyasiz), modifikator guruhlari, MXIK (`product.edit`) */
export async function updateMenuItemAction(input: { productId: string } & setup.MenuItemInput): Promise<ActionResult<{ id: string }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.menuItem, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const { productId, ...rest } = p.data;
  const r = await setup.updateMenuItem(ctx, productId, rest);
  if (r.ok) revalidatePath(`/app/products/${productId}`);
  return toAction(r, t.settings.menuItemSaved);
}

/** Stop-list (`menu.stopList`) */
export async function setStopListAction(input: { productId: string; stopped: boolean }): Promise<ActionResult<{ id: string; name: string; stopListed: boolean }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.stopList, input, t.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const r = await setup.setStopList(ctx, p.data.productId, p.data.stopped);
  return toAction(r, r.ok ? tr(r.data.stopListed ? t.kitchen.stopListOn : t.kitchen.stopListOff, { name: r.data.name }) : undefined);
}
