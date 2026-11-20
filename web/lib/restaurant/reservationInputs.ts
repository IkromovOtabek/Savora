/**
 * Bron kirish sxemalari (zod) — server action, mobil API bir xil tekshiradi. Ishonchsiz kirish: id'lar 24 hex, matnlar
 * uzunligi cheklangan, sana YYYY-MM-DD, vaqt HH:MM (15 daqiqa qadam), raqamlar oraliqda — obyekt/operator (NoSQL
 * injection) o'tmaydi. Xato xabari — d.reservations.errors / d.restaurant.errors.
 */
import { z } from 'zod';
import type { Dict } from '../i18n/dict';
import { zField, zId, zInt, zOptId, zQty, zText } from '../validation';
import { RESTAURANT_LIMITS } from './types';
import { RESERVATION_LIMITS, isDayKey, isValidDuration, parseTime } from './reservationRules';

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** Sana (YYYY-MM-DD) */
const zDay = (message: string) =>
  zField((v, ctx): string => {
    const s = str(v).trim();
    if (!isDayKey(s)) { ctx.addIssue({ code: 'custom', message }); return z.NEVER; }
    return s;
  });

/** Ixtiyoriy sana: bo'sh → undefined */
const zOptDay = (message: string) =>
  zField((v, ctx): string | undefined => {
    const s = str(v).trim();
    if (!s) return undefined;
    if (!isDayKey(s)) { ctx.addIssue({ code: 'custom', message }); return z.NEVER; }
    return s;
  });

/** Vaqt HH:MM (15 daqiqa qadam) */
const zTime = (message: string) =>
  zField((v, ctx) => {
    const s = str(v).trim();
    if (parseTime(s) === null) { ctx.addIssue({ code: 'custom', message }); return z.NEVER; }
    return s;
  });

/** Davomiylik (daqiqa): bo'sh — standart 120 */
const zDuration = (message: string) =>
  zField((v, ctx) => {
    const s = str(v).trim();
    if (!s) return RESERVATION_LIMITS.defaultDurationMin;
    const n = Number(s);
    if (!isValidDuration(n)) { ctx.addIssue({ code: 'custom', message }); return z.NEVER; }
    return n;
  });

export function reservationSchemas(d: Pick<Dict, 'reservations' | 'restaurant'>) {
  const e = d.reservations.errors;
  const re = d.restaurant.errors;
  const bad = re.badInput;
  const item = z.object({
    productId: zId(re.productNotFound),
    qty: zQty(bad),
    optionIds: z.array(zId(bad)).max(40, bad).optional(),
    note: zText(RESTAURANT_LIMITS.noteMax, bad),
  });
  const fields = z.object({
    branchId: zOptId(re.badBranch),
    tableId: zId(re.tableNotFound),
    date: zDay(e.badDate),
    time: zTime(e.badTime),
    durationMin: zDuration(e.badDuration),
    guests: zInt(e.badGuests, 1, RESERVATION_LIMITS.maxGuests),
    customerId: zOptId(e.customerNotFound),
    customerName: zText(RESERVATION_LIMITS.nameMax, bad),
    customerPhone: zText(RESERVATION_LIMITS.phoneMax, e.badPhone),
    items: z.array(item).max(RESERVATION_LIMITS.maxItems, re.tooManyItems).optional(),
    note: zText(RESERVATION_LIMITS.noteMax, bad),
  });
  return {
    /** Yaratish va tahrirlash — bir xil maydonlar (tahrir — to'liq almashtirish) */
    save: fields,
    cancel: z.object({ reason: zText(RESERVATION_LIMITS.reasonMax, bad) }),
    /** Kun ro'yxati: ?date=YYYY-MM-DD (yo'q — bugun) &branchId= */
    list: z.object({ date: zOptDay(e.badDate), branchId: zOptId(re.badBranch) }),
    /** Formadagi bo'sh stollar */
    free: z.object({
      branchId: zOptId(re.badBranch),
      date: zDay(e.badDate),
      time: zTime(e.badTime),
      durationMin: zDuration(e.badDuration),
      guests: zInt(e.badGuests, 1, RESERVATION_LIMITS.maxGuests),
      excludeId: zOptId(e.reservationNotFound),
    }),
    search: z.object({ q: zText(60, bad) }),
    branch: z.object({ branchId: zOptId(re.badBranch) }),
    id: z.object({ id: zId(e.reservationNotFound) }),
  };
}

export type ReservationSchemas = ReturnType<typeof reservationSchemas>;
export type ReservationSaveInput = z.output<ReservationSchemas['save']>;
