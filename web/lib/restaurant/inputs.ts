/**
 * Restoran kirish sxemalari (zod) — server action, web API va mobil API bir xil tekshiradi.
 * Ishonchsiz kirish: ObjectId'lar 24 hex, matnlar uzunligi cheklangan, raqamlar oraliqda — NoSQL
 * injection (obyekt/operator) o'tmaydi. Xato xabari — d.restaurant.errors (badInput va boshqalar).
 */
import { z } from 'zod';
import type { Dict } from '../i18n/dict';
import { PAY_METHODS } from '../payMethods';
import { zField, zId, zOneOf, zOptId, zOptInt, zOptQty, zQty, zText } from '../validation';
import { BUMP_TARGETS } from './rules';
import { RESTAURANT_LIMITS, STATION_KINDS, TABLE_CALL_KINDS } from './types';

type Errors = Dict['restaurant']['errors'];

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** Klient kaliti (idempotentlik): [A-Za-z0-9:_-], `min`–64 belgi; bo'sh — undefined */
export const zOptClientId = (message: string, min = 8, max = 64) =>
  zField((v, ctx) => {
    const s = str(v).trim();
    if (!s) return undefined;
    if (s.length < min || s.length > max || !/^[A-Za-z0-9:_-]+$/.test(s)) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return s;
  });

/** Maydon umuman yuborilmasa — undefined (o'zgartirilmaydi); yuborilsa — trim qilingan matn ('' — tozalash) */
export const zOptText = (max: number, message: string) =>
  zField((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null) return '';
    if (typeof v !== 'string' && typeof v !== 'number') {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    const s = String(v).trim();
    if (s.length > max) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return s;
  });

/** Ixtiyoriy son oralig'ida (kasr mumkin); yuborilmasa — undefined */
export const zOptNum = (message: string, min: number, max: number, opts: { int?: boolean } = {}) =>
  zField((v, ctx) => {
    if (v === undefined || v === null || str(v).trim() === '') return undefined;
    const n = typeof v === 'number' ? v : Number(str(v).replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n < min || n > max || (opts.int && !Number.isInteger(n))) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return n;
  });

/** Ixtiyoriy boolean (true/false/'1'/'0'/'on'); yuborilmasa — undefined */
export const zOptBool = () =>
  zField((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    return v === true || v === 'true' || v === '1' || v === 'on';
  });

const idList = (message: string, max: number) => z.array(zId(message)).max(max, message);

export function restaurantSchemas(e: Errors) {
  const bad = e.badInput;
  const item = z.object({
    clientItemId: zOptClientId(bad),
    productId: zId(e.productNotFound),
    qty: zQty(bad),
    optionIds: idList(bad, 40).optional(),
    note: zText(RESTAURANT_LIMITS.noteMax, bad),
  });
  return {
    openOrder: z.object({
      type: zOneOf(['dine_in', 'takeaway'] as const, bad),
      tableId: zOptId(e.tableNotFound),
      branchId: zOptId(e.badBranch),
      guests: zOptInt(bad, 1, RESTAURANT_LIMITS.maxGuests),
      note: zText(RESTAURANT_LIMITS.noteMax, bad),
      clientOrderId: zOptClientId(bad),
      items: z.array(item).max(RESTAURANT_LIMITS.maxAddItems, e.tooManyItems).optional(),
    }),
    addItems: z.object({ items: z.array(item).min(1, bad).max(RESTAURANT_LIMITS.maxAddItems, e.tooManyItems) }),
    send: z.object({ itemIds: idList(bad, RESTAURANT_LIMITS.maxOrderItems).optional() }),
    confirm: z.object({
      itemIds: idList(bad, RESTAURANT_LIMITS.maxOrderItems).optional(),
      reject: zOptBool(),
      send: zOptBool(),
    }),
    voidItem: z.object({
      itemId: zId(e.itemNotFound),
      qty: zOptQty(bad),
      reason: zText(RESTAURANT_LIMITS.voidReasonMax, bad),
    }),
    bump: z.object({
      itemIds: idList(bad, RESTAURANT_LIMITS.maxOrderItems).min(1, bad),
      to: zOneOf(BUMP_TARGETS, bad),
    }),
    transfer: z.object({ tableId: zOptId(e.tableNotFound), waiterId: zOptId(e.waiterNotFound) }),
    pay: z.object({
      items: z.array(z.object({ itemId: zId(e.itemNotFound), qty: zOptQty(bad) })).max(RESTAURANT_LIMITS.maxOrderItems, bad).optional(),
      parts: z.array(z.object({ method: zOneOf(PAY_METHODS, bad), amount: zField((v, ctx) => {
        const n = typeof v === 'number' ? v : Number(str(v).replace(/\s/g, ''));
        if (!Number.isSafeInteger(n) || n < 0) { ctx.addIssue({ code: 'custom', message: bad }); return z.NEVER; }
        return n;
      }) })).min(1, bad).max(40, bad),
      discount: z.object({
        kind: zOneOf(['percent', 'amount'] as const, bad),
        value: zOptNum(bad, 0, 1_000_000_000).transform((n) => n ?? 0),
      }).nullable().optional(),
      payId: zOptClientId(bad),
    }),
    cancel: z.object({ reason: zText(RESTAURANT_LIMITS.voidReasonMax, bad) }),
    info: z.object({ guests: zOptNum(bad, 0, RESTAURANT_LIMITS.maxGuests, { int: true }), note: zOptText(RESTAURANT_LIMITS.noteMax, bad) }),
    ackCall: z.object({ tableId: zId(e.tableNotFound), kind: zOneOf(TABLE_CALL_KINDS, bad).optional() }),

    settings: z.object({
      serviceChargePct: zOptNum(e.badSettings, 0, RESTAURANT_LIMITS.maxServiceChargePct),
      takeawayPackFee: zOptNum(e.badSettings, 0, 10_000_000, { int: true }),
      requireVoidReason: zOptBool(),
      kdsWarnMinutes: zOptNum(e.badSettings, 1, 240, { int: true }),
      kdsAlertMinutes: zOptNum(e.badSettings, 1, 480, { int: true }),
      brand: z.object({
        logoUrl: zOptText(500, e.badUrl),
        color: zOptText(7, e.badColor),
        coverUrl: zOptText(500, e.badUrl),
      }).optional(),
    }),
    hall: z.object({
      id: zOptId(e.hallNotFound),
      name: zText(60, bad),
      branchId: zOptId(e.badBranch),
      sort: zOptNum(bad, 0, 10_000, { int: true }),
      active: zOptBool(),
    }),
    table: z.object({
      id: zOptId(e.tableNotFound),
      hallId: zId(e.hallNotFound),
      number: zField((v, ctx) => {
        const n = Number(str(v).trim());
        if (!Number.isInteger(n) || n < 1 || n > RESTAURANT_LIMITS.maxTableNumber) { ctx.addIssue({ code: 'custom', message: bad }); return z.NEVER; }
        return n;
      }),
      seats: zOptNum(bad, 1, RESTAURANT_LIMITS.maxSeats, { int: true }),
      x: zOptNum(bad, 0, 10_000),
      y: zOptNum(bad, 0, 10_000),
      active: zOptBool(),
    }),
    tablesRange: z.object({
      hallId: zId(e.hallNotFound),
      from: zOptNum(bad, 1, RESTAURANT_LIMITS.maxTableNumber, { int: true }),
      to: zOptNum(bad, 1, RESTAURANT_LIMITS.maxTableNumber, { int: true }),
      seats: zOptNum(bad, 1, RESTAURANT_LIMITS.maxSeats, { int: true }),
    }),
    station: z.object({
      id: zOptId(e.stationNotFound),
      name: zText(60, bad),
      kind: zOneOf(STATION_KINDS, bad),
      branchId: zOptId(e.badBranch),
      printerIp: zOptText(64, bad),
      sort: zOptNum(bad, 0, 10_000, { int: true }),
      active: zOptBool(),
    }),
    menuItem: z.object({
      productId: zId(e.productNotFound),
      stationId: zOptText(24, e.stationNotFound),
      modifierGroups: z.unknown().optional(),
      ikpu: zOptText(30, bad),
    }),
    stopList: z.object({ productId: zId(e.productNotFound), stopped: zOptBool().transform((b) => !!b) }),
    id: z.object({ id: zId(bad) }),
    /** Polling so'rovi parametrlari (GET ?branchId=&stationId=&since=) */
    query: z.object({
      branchId: zOptId(e.badBranch),
      stationId: zOptId(e.stationNotFound),
      since: zField((v, ctx) => {
        const s = str(v).trim();
        if (!s) return undefined;
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) { ctx.addIssue({ code: 'custom', message: bad }); return z.NEVER; }
        return d;
      }),
      status: zField((v) => (['active', 'closed', 'all'].includes(str(v)) ? (str(v) as 'active' | 'closed' | 'all') : undefined)),
      type: zField((v) => (['dine_in', 'takeaway', 'qr_self'].includes(str(v)) ? (str(v) as 'dine_in' | 'takeaway' | 'qr_self') : undefined)),
    }),
    /** Mijoz QR buyurtmasi (ochiq API) */
    publicOrder: z.object({
      clientOrderId: zField((v, ctx) => {
        const s = str(v).trim();
        if (s.length < 8 || s.length > 40 || !/^[A-Za-z0-9_-]+$/.test(s)) { ctx.addIssue({ code: 'custom', message: bad }); return z.NEVER; }
        return s;
      }),
      items: z.array(z.object({
        productId: zId(e.productNotFound),
        qty: zQty(bad),
        optionIds: idList(bad, 40).optional(),
        note: zText(RESTAURANT_LIMITS.noteMax, bad),
      })).min(1, bad).max(RESTAURANT_LIMITS.maxQrItems, bad),
    }),
    publicCall: z.object({ kind: zOneOf(TABLE_CALL_KINDS, bad) }),
  };
}

export type RestaurantSchemas = ReturnType<typeof restaurantSchemas>;

/** URLSearchParams → oddiy obyekt (faqat birinchi qiymat) */
export function searchParamsObject(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of sp.entries()) if (!(k in out)) out[k] = v;
  return out;
}
