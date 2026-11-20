/**
 * Restoran bronlari (server, DB) — docs/RESTORAN_API.md §18. Web server action'lari (app/actions/reservations.ts) va
 * mobil API (app/api/mobile/restaurant/reservations/*) shu funksiyalarni `RestaurantCtx` bilan chaqiradi; zod tekshiruvi
 * chaqiruvchida (lib/restaurant/reservationInputs.ts). Sof qoidalar — reservationRules.ts.
 *
 * Huquqlar: ro'yxat va «Keldi» — `order.create` YOKI `reservation.manage`; yaratish, tahrirlash, bekor qilish, «Kelmadi»,
 * mijoz qidiruvi, forma ma'lumoti — `reservation.manage`. Modul — `tables`. Filial xodimi faqat o'z filiali (branchFilter).
 *
 * Qoidalar:
 *  - bir stolda vaqt oralig'i kesishgan `booked|seated` bron bo'lmaydi (tutashgani mumkin). Parallel yozuvda ham:
 *    yozuvdan keyin qayta tekshiriladi — yaratishda kechroq yozilgan bron o'chiriladi, tahrirda o'zgarish qaytariladi;
 *  - o'tgan vaqtga (15 daqiqa chegara bilan) va bir yildan uzoqqa — yo'q; vaqt Toshkent bo'yicha, 15 daqiqa qadam;
 *  - stol faol va shu filialda; oldindan taomlar menyuda va stop-listda emas (ops.prepareItems — buyurtma bilan bir xil);
 *  - mijoz: mavjud `Customer` (id) yoki ism + telefon — telefon bo'yicha topiladi, bo'lmasa yangisi yaratiladi
 *    (POS qarz sotuvi kabi: `customers.manage` shart emas, mavjud mijoz ismi ustidan yozilmaydi);
 *  - «Keldi» — ops.openOrder (dine_in, taomlar `new` holatida — ofitsant oshxonaga yuboradi), `clientOrderId` = `res-<id>`
 *    (takroriy bosish ikkinchi buyurtma ochmaydi); stol band bo'lsa — `tableBusy`. Taom endi menyuda bo'lmasa (stop-list,
 *    o'chirilgan) — stol baribir ochiladi, o'sha taomlar `skipped` da qaytadi.
 * Audit: `reservation.create|update|cancel|seat|noShow` (entity `order`).
 */
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import type { IReservationItem, ReservationDoc } from '../models/tenant/Reservation';
import { branchFilter } from '../branchScope';
import { recordAudit } from '../audit';
import { findCustomerByPhone } from '../daftarOps';
import { tr } from '../i18n/fmt';
import type { Dict } from '../i18n/dict';
import type { PermissionKey } from '../permissions';
import { staffName } from '../staffNames';
import { fail, needAnyPerm, needFeature, ok, type OpErr, type RestaurantCtx, type RestaurantErrorCode } from './context';
import { openOrder, prepareItems, resolveBranchId, staffNamesFor, type AddItemInput } from './ops';
import { branchesFor, buildMenu, type MenuItemView } from './queries';
import type { OrderView } from './view';
import type { ActionResult } from './session';
import {
  ACTIVE_RESERVATION_STATUSES, RESERVATION_LIMITS, dayRange, isDayKey, isLate, noShowTooEarly, normalizeReservationPhone,
  reservationEnd, reservationStart, seatTooEarly, sortTablesForGuests, startProblem, tashkentClock, tashkentDay,
  type ReservationStatus,
} from './reservationRules';

/* ───────────────────────────── natija va xatolar ───────────────────────────── */

export type ReservationErrorCode = keyof Dict['reservations']['errors'];

export interface ResErr extends Omit<OpErr, 'code'> {
  code: RestaurantErrorCode | ReservationErrorCode;
}
export type ResResult<T> = { ok: true; data: T } | ResErr;

const RES_STATUS: Record<ReservationErrorCode, number> = {
  reservationNotFound: 404,
  customerNotFound: 404,
  reservationOverlap: 409,
  reservationClosed: 409,
  reservationTooEarly: 409,
  reservationNotStarted: 409,
  reservationPast: 400,
  reservationTooFar: 400,
  badDate: 400,
  badTime: 400,
  badDuration: 400,
  badGuests: 400,
  badPhone: 400,
  customerRequired: 400,
};

export function resFail(d: Dict, code: ReservationErrorCode, params?: Record<string, string | number>): ResErr {
  const msg = d.reservations.errors[code];
  return { ok: false, code, error: params ? tr(msg, params) : msg, status: RES_STATUS[code] };
}

/** API javobi: muvaffaqiyat — `data` (200), xato — `{ error, code, details? }` + HTTP holati (session.toResponse bilan bir xil) */
export function toResResponse<T>(r: ResResult<T>): NextResponse {
  if (r.ok) return NextResponse.json(r.data);
  return NextResponse.json({ error: r.error, code: r.code, ...(r.details ? { details: r.details } : {}) }, { status: r.status });
}

/** Server action natijasi (session.toAction bilan bir xil shakl) */
export function toResAction<T>(r: ResResult<T>, success?: string): ActionResult<T> {
  if (r.ok) return { ok: true, data: r.data, ...(success ? { success } : {}) };
  return { ok: false, error: r.error, code: r.code, ...(r.details ? { details: r.details } : {}) };
}

/* ───────────────────────────── ko'rinish ───────────────────────────── */

export interface ReservationItemView {
  productId: string;
  name: string;
  qty: number;
  note: string | null;
  optionIds: string[];
  /** Variant nomlari («Katta») */
  options: string[];
}

export interface ReservationView {
  id: string;
  branchId: string;
  tableId: string;
  tableNumber: number;
  hallId: string | null;
  hallName: string | null;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  guests: number;
  /** ISO lahzalar */
  startAt: string;
  endAt: string;
  /** Toshkent kuni (YYYY-MM-DD) va soatlari (HH:MM) — client vaqt zonasi hisoblamaydi */
  day: string;
  time: string;
  endTime: string;
  durationMin: number;
  items: ReservationItemView[];
  note: string | null;
  status: ReservationStatus;
  /** Mehmon kechikmoqda (booked, boshlanganiga 15 daqiqadan oshdi) */
  late: boolean;
  orderId: string | null;
  seatedAt: string | null;
  /** Xodim ismlari (login emas) */
  seatedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  noShowAt: string | null;
  remindedAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

const iso = (d?: Date | string | null): string | null => (d ? new Date(d).toISOString() : null);
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

type ViewCtx = { halls: Map<string, string>; names: Awaited<ReturnType<typeof staffNamesFor>>; now: Date };

export function reservationView(r: ReservationDoc, v: Pick<ViewCtx, 'now'> & Partial<ViewCtx>): ReservationView {
  const name = (login?: string | null) => (v.names ? staffName(v.names, login) : login ?? null);
  return {
    id: String(r._id),
    branchId: String(r.branchId),
    tableId: String(r.tableId),
    tableNumber: r.tableNumber,
    hallId: r.hallId ? String(r.hallId) : null,
    hallName: r.hallId ? v.halls?.get(String(r.hallId)) ?? null : null,
    customerId: r.customerId ? String(r.customerId) : null,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    guests: r.guests,
    startAt: new Date(r.startAt).toISOString(),
    endAt: new Date(r.endAt).toISOString(),
    day: tashkentDay(r.startAt),
    time: tashkentClock(r.startAt),
    endTime: tashkentClock(r.endAt),
    durationMin: r.durationMin,
    items: (r.items ?? []).map((i) => ({
      productId: String(i.productId),
      name: i.name,
      qty: i.qty,
      note: i.note || null,
      optionIds: (i.optionIds ?? []).map(String),
      options: i.options ?? [],
    })),
    note: r.note || null,
    status: r.status,
    late: isLate(r, v.now),
    orderId: r.orderId ? String(r.orderId) : null,
    seatedAt: iso(r.seatedAt),
    seatedBy: name(r.seatedBy),
    cancelledAt: iso(r.cancelledAt),
    cancelledBy: name(r.cancelledBy),
    cancelReason: r.cancelReason || null,
    noShowAt: iso(r.noShowAt),
    remindedAt: iso(r.remindedAt),
    createdBy: name(r.createdBy),
    createdAt: iso(r.createdAt),
  };
}

async function viewsFor(ctx: RestaurantCtx, list: ReservationDoc[], now: Date): Promise<ReservationView[]> {
  if (!list.length) return [];
  const hallIds = [...new Set(list.map((r) => r.hallId).filter(Boolean).map(String))];
  const [halls, names] = await Promise.all([
    hallIds.length ? ctx.m.Hall.find({ _id: { $in: hallIds } }).select('name').lean() : Promise.resolve([]),
    staffNamesFor(ctx),
  ]);
  const hallMap = new Map(halls.map((h) => [String(h._id), h.name]));
  return list.map((r) => reservationView(r, { halls: hallMap, names, now }));
}

async function viewFor(ctx: RestaurantCtx, r: ReservationDoc, now: Date): Promise<ReservationView> {
  return (await viewsFor(ctx, [r], now))[0];
}

/* ───────────────────────────── kirish nazorati ───────────────────────────── */

/** Ro'yxat va «Keldi» */
export const RESERVATION_READ_PERMS: readonly PermissionKey[] = ['order.create', 'reservation.manage'];
/** Yaratish, tahrirlash, bekor qilish, «Kelmadi», mijoz qidiruvi */
const MANAGE: readonly PermissionKey[] = ['reservation.manage'];

function gate(ctx: RestaurantCtx, perms: readonly PermissionKey[]): OpErr | null {
  return needFeature(ctx, 'tables') ?? needAnyPerm(ctx, perms);
}

async function loadReservation(ctx: RestaurantCtx, id: string): Promise<ResResult<ReservationDoc>> {
  if (!validId(id)) return resFail(ctx.d, 'reservationNotFound');
  const r = await ctx.m.Reservation.findOne({ _id: id, ...branchFilter(ctx.user) }).lean<ReservationDoc>();
  return r ? ok(r) : resFail(ctx.d, 'reservationNotFound');
}

function audit(ctx: RestaurantCtx, action: string, r: Pick<ReservationDoc, '_id' | 'tableNumber' | 'startAt' | 'customerName' | 'guests'>, extra = '', meta?: Record<string, unknown>) {
  return recordAudit(ctx.user, {
    action,
    entity: 'order',
    entityId: String(r._id),
    summary: `Bron: stol ${r.tableNumber}, ${tashkentDay(r.startAt)} ${tashkentClock(r.startAt)}, ${r.customerName} (${r.guests} kishi)${extra}${ctx.via ?? ''}`,
    meta,
  });
}

/* ───────────────────────────── ro'yxat ───────────────────────────── */

export interface ReservationsDay {
  serverTime: string;
  /** Ko'rsatilayotgan kun va bugungi kun (Toshkent) */
  date: string;
  today: string;
  branchId: string;
  branches: { id: string; name: string; isMain: boolean }[];
  items: ReservationView[];
  counts: Record<ReservationStatus, number> & { guests: number };
  can: { manage: boolean; seat: boolean };
}

/** Kun bo'yicha bronlar (vaqt tartibida). `date` yo'q — bugun (Toshkent) */
export async function listReservations(ctx: RestaurantCtx, input: { date?: string; branchId?: string; now?: Date } = {}): Promise<ResResult<ReservationsDay>> {
  const denied = gate(ctx, RESERVATION_READ_PERMS);
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const now = input.now ?? new Date();
  const today = tashkentDay(now);
  const date = input.date && isDayKey(input.date) ? input.date : today;
  const { start, end } = dayRange(date);
  const [list, branches] = await Promise.all([
    ctx.m.Reservation.find({ branchId: br.data, startAt: { $gte: start, $lt: end }, ...branchFilter(ctx.user) })
      .sort({ startAt: 1, tableNumber: 1 }).limit(500).lean<ReservationDoc[]>(),
    branchesFor(ctx),
  ]);
  const items = await viewsFor(ctx, list, now);
  const counts = { booked: 0, seated: 0, cancelled: 0, no_show: 0, guests: 0 };
  for (const r of items) {
    counts[r.status]++;
    if (r.status === 'booked' || r.status === 'seated') counts.guests += r.guests;
  }
  return ok({
    serverTime: now.toISOString(),
    date,
    today,
    branchId: br.data,
    branches,
    items,
    counts,
    can: { manage: ctx.perms.has('reservation.manage'), seat: true },
  });
}

export async function getReservation(ctx: RestaurantCtx, id: string, now = new Date()): Promise<ResResult<{ reservation: ReservationView }>> {
  const denied = gate(ctx, RESERVATION_READ_PERMS);
  if (denied) return denied;
  const r = await loadReservation(ctx, id);
  if (!r.ok) return r;
  return ok({ reservation: await viewFor(ctx, r.data, now) });
}

/* ───────────────────────────── forma: stollar, menyu, mijozlar ───────────────────────────── */

export interface ReservationForm {
  branchId: string;
  branches: { id: string; name: string; isMain: boolean }[];
  halls: { id: string; name: string }[];
  tables: { id: string; number: number; seats: number; hallId: string }[];
  menu: { categories: string[]; items: MenuItemView[] };
}

/** Bron formasi uchun: filial zallari, stollari va xodim menyusi (stop-list/tugagan — belgi bilan) */
export async function reservationForm(ctx: RestaurantCtx, input: { branchId?: string } = {}): Promise<ResResult<ReservationForm>> {
  const denied = gate(ctx, MANAGE);
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const branchId = br.data;
  const [halls, tables, menu, branches] = await Promise.all([
    ctx.m.Hall.find({ branchId, active: true }).sort({ sort: 1, createdAt: 1 }).select('name').lean(),
    ctx.m.Table.find({ branchId, active: true }).sort({ number: 1 }).select('number seats hallId').lean(),
    buildMenu(ctx.m, branchId, { withSoldOut: true }),
    branchesFor(ctx),
  ]);
  const hallSet = new Set(halls.map((h) => String(h._id)));
  return ok({
    branchId,
    branches,
    halls: halls.map((h) => ({ id: String(h._id), name: h.name })),
    tables: tables.filter((t) => hallSet.has(String(t.hallId))).map((t) => ({ id: String(t._id), number: t.number, seats: t.seats, hallId: String(t.hallId) })),
    menu,
  });
}

export interface FreeTable {
  id: string;
  number: number;
  seats: number;
  hallId: string;
  hallName: string | null;
  /** O'rindiqlar mehmonlarga yetadimi */
  fits: boolean;
  /** Hozir ochiq buyurtma bor (bron vaqti 2 soat ichida bo'lsa ko'rsatiladi) */
  busyNow: boolean;
}

/**
 * Shu vaqt oralig'ida bo'sh stollar (kesishgan `booked|seated` broni yo'q faol stollar): mehmonlarga sig'adiganlari
 * birinchi, o'rindig'i kamrog'i oldin (reservationRules.sortTablesForGuests). `excludeId` — tahrirlanayotgan bronning o'zi.
 */
export async function freeTables(
  ctx: RestaurantCtx,
  branchId: string | undefined,
  startAt: Date,
  durationMin: number,
  guests: number,
  opts: { excludeId?: string; now?: Date } = {},
): Promise<ResResult<FreeTable[]>> {
  const denied = gate(ctx, MANAGE);
  if (denied) return denied;
  const br = await resolveBranchId(ctx, branchId);
  if (!br.ok) return br;
  if (!Number.isInteger(guests) || guests < 1 || guests > RESERVATION_LIMITS.maxGuests) return resFail(ctx.d, 'badGuests');
  const end = reservationEnd(startAt, durationMin);
  const now = opts.now ?? new Date();
  const soon = startAt.getTime() - now.getTime() < 2 * 3_600_000 && end.getTime() > now.getTime();
  const [tables, halls, taken, open] = await Promise.all([
    ctx.m.Table.find({ branchId: br.data, active: true }).select('number seats hallId').lean(),
    ctx.m.Hall.find({ branchId: br.data, active: true }).select('name').lean(),
    ctx.m.Reservation.find({
      branchId: br.data,
      status: { $in: ACTIVE_RESERVATION_STATUSES },
      startAt: { $lt: end },
      endAt: { $gt: startAt },
      ...(opts.excludeId && validId(opts.excludeId) ? { _id: { $ne: opts.excludeId } } : {}),
    }).select('tableId').lean(),
    soon
      ? ctx.m.Order.find({ branchId: br.data, status: { $in: ['open', 'precheck'] }, tableId: { $exists: true } }).select('tableId').lean()
      : Promise.resolve([]),
  ]);
  const hallName = new Map(halls.map((h) => [String(h._id), h.name]));
  const busy = new Set(taken.map((r) => String(r.tableId)));
  const occupied = new Set(open.map((o) => String(o.tableId)));
  const free = tables
    .filter((t) => hallName.has(String(t.hallId)) && !busy.has(String(t._id)))
    .map((t) => ({ id: String(t._id), number: t.number, seats: t.seats, hallId: String(t.hallId), hallName: hallName.get(String(t.hallId)) ?? null }));
  return ok(sortTablesForGuests(free, guests).map((t) => ({ ...t, busyNow: occupied.has(t.id) })));
}

export interface ReservationCustomerHit { id: string; name: string; phone: string }

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Mijoz qidiruvi (forma): 3+ raqam — telefon bo'yicha (oxirgi raqamlar, formatdan qat'i nazar), aks holda ism bo'yicha */
export async function searchReservationCustomers(ctx: RestaurantCtx, q: string): Promise<ResResult<ReservationCustomerHit[]>> {
  const denied = gate(ctx, MANAGE);
  if (denied) return denied;
  const s = q.trim();
  if (s.length < 2) return ok([]);
  const digits = s.replace(/\D/g, '');
  const filter = digits.length >= 3
    ? { phone: { $regex: digits.slice(-9).split('').join('\\D*') } }
    : { fullName: { $regex: escapeRegex(s), $options: 'i' } };
  const list = await ctx.m.Customer.find(filter).sort({ updatedAt: -1 }).limit(RESERVATION_LIMITS.searchLimit).select('fullName phone').lean();
  return ok(list.map((c) => ({ id: String(c._id), name: c.fullName, phone: c.phone })));
}

/* ───────────────────────────── yaratish / tahrirlash ───────────────────────────── */

export interface ReservationInput {
  branchId?: string;
  tableId: string;
  /** Toshkent kuni YYYY-MM-DD */
  date: string;
  /** HH:MM (15 daqiqa qadam) */
  time: string;
  /** Daqiqa (30–480, 15 qadam); yo'q — 120 */
  durationMin?: number;
  guests: number;
  /** Mavjud mijoz (qidiruvdan) */
  customerId?: string;
  /** Yangi mijoz yoki bronda ko'rinadigan ism/telefon */
  customerName?: string;
  customerPhone?: string;
  items?: { productId: string; qty: number; optionIds?: string[]; note?: string }[];
  note?: string;
}

interface Prepared {
  start: Date;
  end: Date;
  durationMin: number;
  table: { _id: Types.ObjectId; number: number; hallId: Types.ObjectId; branchId: Types.ObjectId };
  items: IReservationItem[];
}

type OverlapDoc = Pick<ReservationDoc, '_id' | 'tableNumber' | 'startAt' | 'endAt' | 'customerName'> & { createdAt?: Date };

function overlapErr(ctx: RestaurantCtx, o: OverlapDoc): ResErr {
  return resFail(ctx.d, 'reservationOverlap', { n: o.tableNumber, from: tashkentClock(o.startAt), to: tashkentClock(o.endAt), name: o.customerName });
}

function overlapsOn(ctx: RestaurantCtx, tableId: Types.ObjectId | string, start: Date, end: Date, excludeId?: Types.ObjectId | string) {
  return ctx.m.Reservation.find({
    tableId,
    status: { $in: ACTIVE_RESERVATION_STATUSES },
    startAt: { $lt: end },
    endAt: { $gt: start },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).sort({ startAt: 1 }).select('tableNumber startAt endAt customerName createdAt').lean<OverlapDoc[]>();
}

/** Vaqt, stol, ustma-ust, taomlar — yozuvdan oldingi umumiy tekshiruv (mijoz — keyin, yon ta'siri bor) */
async function prepare(
  ctx: RestaurantCtx,
  input: ReservationInput,
  now: Date,
  current?: ReservationDoc,
): Promise<ResResult<Prepared>> {
  const start = reservationStart(input.date, input.time);
  if (!start) return resFail(ctx.d, isDayKey(input.date) ? 'badTime' : 'badDate');
  const durationMin = input.durationMin ?? RESERVATION_LIMITS.defaultDurationMin;
  if (!Number.isInteger(input.guests) || input.guests < 1 || input.guests > RESERVATION_LIMITS.maxGuests) return resFail(ctx.d, 'badGuests');
  // Tahrirda vaqt o'zgarmagan bo'lsa (kechikayotgan bronning izohi/taomlari) — o'tgan vaqt tekshirilmaydi
  if (!current || current.startAt.getTime() !== start.getTime()) {
    const problem = startProblem(start, now);
    if (problem) return resFail(ctx.d, problem === 'past' ? 'reservationPast' : 'reservationTooFar');
  }
  if (!validId(input.tableId)) return fail(ctx.d, 'tableNotFound');
  const table = await ctx.m.Table.findOne({ _id: input.tableId, active: true, ...branchFilter(ctx.user) })
    .select('number hallId branchId').lean<Prepared['table']>();
  if (!table) return fail(ctx.d, 'tableNotFound');
  // Admin filial tanlagan bo'lsa — stol o'sha filialda bo'lishi shart; tahrirda filial o'zgarmaydi
  if (input.branchId && String(table.branchId) !== input.branchId) return fail(ctx.d, 'badBranch');
  if (current && String(table.branchId) !== String(current.branchId)) return fail(ctx.d, 'badBranch');
  const end = reservationEnd(start, durationMin);
  const clash = await overlapsOn(ctx, table._id, start, end, current?._id);
  if (clash.length) return overlapErr(ctx, clash[0]);

  let items: IReservationItem[] = [];
  const raw = input.items ?? [];
  if (raw.length) {
    if (raw.length > RESERVATION_LIMITS.maxItems) return fail(ctx.d, 'tooManyItems');
    const prepared = await prepareItems(
      ctx.m, ctx.d, table.branchId,
      raw.map((i) => ({ productId: i.productId, qty: i.qty, optionIds: i.optionIds ?? [], ...(i.note ? { note: i.note } : {}) })),
      { addedBy: ctx.user.username, status: 'new', now },
    );
    if (!prepared.ok) return prepared;
    items = prepared.data.map((p, i) => {
      const optionIds = raw[i].optionIds ?? [];
      return {
        productId: p.productId,
        name: p.name,
        qty: p.qty,
        ...(p.note ? { note: p.note } : {}),
        ...(optionIds.length ? { optionIds: optionIds.map((x) => new Types.ObjectId(x)), options: (p.modifiers ?? []).map((m) => m.name) } : {}),
      };
    });
  }
  return ok({ start, end, durationMin, table, items });
}

/** Mijoz: id bo'yicha yoki telefon bo'yicha topiladi; topilmasa yaratiladi (oxirgi qadam — yon ta'sir) */
async function resolveCustomer(
  ctx: RestaurantCtx,
  input: Pick<ReservationInput, 'customerId' | 'customerName' | 'customerPhone'>,
): Promise<ResResult<{ customerId?: Types.ObjectId; name: string; phone: string; created: boolean }>> {
  const typedName = input.customerName?.trim() ?? '';
  const typedPhone = input.customerPhone?.trim() ?? '';
  if (input.customerId) {
    if (!validId(input.customerId)) return resFail(ctx.d, 'customerNotFound');
    const c = await ctx.m.Customer.findById(input.customerId).select('fullName phone').lean();
    if (!c) return resFail(ctx.d, 'customerNotFound');
    let phone = c.phone;
    if (typedPhone) {
      const p = normalizeReservationPhone(typedPhone);
      if (!p) return resFail(ctx.d, 'badPhone');
      phone = p;
    }
    return ok({ customerId: c._id, name: typedName || c.fullName, phone, created: false });
  }
  if (!typedName || !typedPhone) return resFail(ctx.d, 'customerRequired');
  const phone = normalizeReservationPhone(typedPhone);
  if (!phone) return resFail(ctx.d, 'badPhone');
  const found = await findCustomerByPhone(ctx.m, phone);
  if (found) return ok({ customerId: found._id as Types.ObjectId, name: typedName, phone, created: false });
  const c = await ctx.m.Customer.create({ fullName: typedName, phone });
  return ok({ customerId: c._id, name: typedName, phone, created: true });
}

/** Yangi bron */
export async function createReservation(ctx: RestaurantCtx, input: ReservationInput, now = new Date()): Promise<ResResult<{ reservation: ReservationView }>> {
  const denied = gate(ctx, MANAGE);
  if (denied) return denied;
  const p = await prepare(ctx, input, now);
  if (!p.ok) return p;
  const cust = await resolveCustomer(ctx, input);
  if (!cust.ok) return cust;
  const { start, end, durationMin, table, items } = p.data;
  const note = input.note?.trim();
  const created = await ctx.m.Reservation.create({
    branchId: table.branchId,
    tableId: table._id,
    tableNumber: table.number,
    hallId: table.hallId,
    ...(cust.data.customerId ? { customerId: cust.data.customerId } : {}),
    customerName: cust.data.name,
    customerPhone: cust.data.phone,
    guests: input.guests,
    startAt: start,
    durationMin,
    endAt: end,
    items,
    ...(note ? { note } : {}),
    status: 'booked',
    createdBy: ctx.user.username,
  });
  const doc = created.toObject() as ReservationDoc;

  // Parallel yaratish: ikkalasi tekshiruvdan o'tgan bo'lsa — kechroq yozilgani (createdAt, keyin _id) o'chiriladi
  const clash = await overlapsOn(ctx, table._id, start, end, doc._id);
  const mine = { t: new Date(doc.createdAt ?? now).getTime(), id: String(doc._id) };
  const earlier = clash.find((c) => {
    const t = new Date(c.createdAt ?? 0).getTime();
    return t < mine.t || (t === mine.t && String(c._id) < mine.id);
  });
  if (earlier) {
    await ctx.m.Reservation.deleteOne({ _id: doc._id });
    return overlapErr(ctx, earlier);
  }

  await audit(ctx, 'reservation.create', doc, items.length ? `, ${items.length} ta taom oldindan` : '', { customerCreated: cust.data.created || undefined });
  return ok({ reservation: await viewFor(ctx, doc, now) });
}

/** Bronni tahrirlash (to'liq almashtirish; faqat `booked`). Vaqt o'zgarsa — eslatma qayta yuboriladi */
export async function updateReservation(ctx: RestaurantCtx, id: string, input: ReservationInput, now = new Date()): Promise<ResResult<{ reservation: ReservationView }>> {
  const denied = gate(ctx, MANAGE);
  if (denied) return denied;
  const loaded = await loadReservation(ctx, id);
  if (!loaded.ok) return loaded;
  const cur = loaded.data;
  if (cur.status !== 'booked') return resFail(ctx.d, 'reservationClosed');
  const p = await prepare(ctx, input, now, cur);
  if (!p.ok) return p;
  const cust = await resolveCustomer(ctx, input);
  if (!cust.ok) return cust;
  const { start, end, durationMin, table, items } = p.data;
  const timeChanged = cur.startAt.getTime() !== start.getTime();
  const note = input.note?.trim();
  const set: Record<string, unknown> = {
    tableId: table._id,
    tableNumber: table.number,
    hallId: table.hallId,
    customerName: cust.data.name,
    customerPhone: cust.data.phone,
    guests: input.guests,
    startAt: start,
    durationMin,
    endAt: end,
    items,
    updatedBy: ctx.user.username,
  };
  const unset: Record<string, ''> = {};
  if (cust.data.customerId) set.customerId = cust.data.customerId;
  else unset.customerId = '';
  if (note) set.note = note;
  else unset.note = '';
  if (timeChanged) unset.remindedAt = '';

  const saved = await ctx.m.Reservation.findOneAndUpdate(
    { _id: cur._id, status: 'booked', updatedAt: cur.updatedAt },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { new: true },
  ).lean<ReservationDoc>();
  if (!saved) {
    const again = await ctx.m.Reservation.findById(cur._id).select('status').lean();
    return again && again.status !== 'booked' ? resFail(ctx.d, 'reservationClosed') : fail(ctx.d, 'conflict');
  }

  // Parallel yozuv: yozuvdan keyin kesishish paydo bo'lgan bo'lsa — o'zgarish qaytariladi
  const clash = await overlapsOn(ctx, table._id, start, end, cur._id);
  if (clash.length) {
    const back: Record<string, unknown> = {
      tableId: cur.tableId, tableNumber: cur.tableNumber, hallId: cur.hallId, customerName: cur.customerName,
      customerPhone: cur.customerPhone, guests: cur.guests, startAt: cur.startAt, durationMin: cur.durationMin,
      endAt: cur.endAt, items: cur.items ?? [],
      ...(cur.customerId ? { customerId: cur.customerId } : {}),
      ...(cur.note ? { note: cur.note } : {}),
      ...(cur.remindedAt ? { remindedAt: cur.remindedAt } : {}),
      ...(cur.updatedBy ? { updatedBy: cur.updatedBy } : {}),
    };
    await ctx.m.Reservation.updateOne({ _id: cur._id, updatedAt: saved.updatedAt }, { $set: back });
    return overlapErr(ctx, clash[0]);
  }

  const changes: string[] = [];
  if (timeChanged || cur.durationMin !== durationMin) changes.push(`vaqt ${tashkentDay(cur.startAt)} ${tashkentClock(cur.startAt)}–${tashkentClock(cur.endAt)} → ${tashkentDay(start)} ${tashkentClock(start)}–${tashkentClock(end)}`);
  if (String(cur.tableId) !== String(table._id)) changes.push(`stol ${cur.tableNumber} → ${table.number}`);
  if (cur.guests !== input.guests) changes.push(`mehmon ${cur.guests} → ${input.guests}`);
  await audit(ctx, 'reservation.update', saved, changes.length ? `; ${changes.join('; ')}` : '', { before: { startAt: cur.startAt, tableNumber: cur.tableNumber, guests: cur.guests } });
  return ok({ reservation: await viewFor(ctx, saved, now) });
}

/* ───────────────────────────── holat amallari ───────────────────────────── */

/** `booked` → yangi holat (shartli yozuv: parallel amalda bittasi o'tadi) */
async function closeAs(
  ctx: RestaurantCtx,
  id: string,
  now: Date,
  check: (r: ReservationDoc) => ResErr | null,
  set: Record<string, unknown>,
  auditAction: string,
  auditExtra: (r: ReservationDoc) => string,
): Promise<ResResult<{ reservation: ReservationView }>> {
  const denied = gate(ctx, MANAGE);
  if (denied) return denied;
  const loaded = await loadReservation(ctx, id);
  if (!loaded.ok) return loaded;
  if (loaded.data.status !== 'booked') return resFail(ctx.d, 'reservationClosed');
  const bad = check(loaded.data);
  if (bad) return bad;
  const saved = await ctx.m.Reservation.findOneAndUpdate(
    { _id: loaded.data._id, status: 'booked', ...branchFilter(ctx.user) },
    { $set: set },
    { new: true },
  ).lean<ReservationDoc>();
  if (!saved) return resFail(ctx.d, 'reservationClosed');
  await audit(ctx, auditAction, saved, auditExtra(saved));
  return ok({ reservation: await viewFor(ctx, saved, now) });
}

/** Bekor qilish (sabab ixtiyoriy) */
export function cancelReservation(ctx: RestaurantCtx, id: string, reason = '', now = new Date()) {
  const why = reason.trim().slice(0, RESERVATION_LIMITS.reasonMax);
  return closeAs(
    ctx, id, now, () => null,
    { status: 'cancelled', cancelledAt: now, cancelledBy: ctx.user.username, ...(why ? { cancelReason: why } : {}) },
    'reservation.cancel',
    () => (why ? ` — bekor: ${why}` : ' — bekor qilindi'),
  );
}

/** «Kelmadi» — faqat boshlanish vaqti kelgach */
export function markNoShow(ctx: RestaurantCtx, id: string, now = new Date()) {
  return closeAs(
    ctx, id, now,
    (r) => (noShowTooEarly(r.startAt, now) ? resFail(ctx.d, 'reservationNotStarted') : null),
    { status: 'no_show', noShowAt: now, noShowBy: ctx.user.username },
    'reservation.noShow',
    () => ' — kelmadi',
  );
}

/* ───────────────────────────── «Keldi» ───────────────────────────── */

export interface SeatResult {
  reservation: ReservationView;
  orderId: string;
  /** Ochilgan buyurtma (takroriy bosishda — null, `orderId` bo'yicha oching) */
  order: OrderView | null;
  /** Buyurtmaga qo'shilmagan oldindan taomlar (stop-list, menyudan olingan…) */
  skipped: { name: string; message: string }[];
  /** Bron allaqachon «Keldi» bo'lgan (takroriy so'rov) */
  existing: boolean;
}

/** Taom bilan bog'liq openOrder xatolari — bunday holda stol taomsiz (yoki yaroqlilari bilan) ochiladi */
const ITEM_ERRORS: ReadonlySet<string> = new Set(['productNotFound', 'stopListed', 'badQty', 'badModifiers', 'tooManyItems']);

/** Bron kaliti — buyurtmaning `clientOrderId` (takroriy «Keldi» ikkinchi buyurtma ochmaydi) */
export const seatOrderKey = (reservationId: string) => `res-${reservationId}`;

/**
 * «Keldi»: stol ochiladi (ops.openOrder, dine_in) — oldindan taomlar `new` holatida qo'shiladi (oshxonaga ofitsant yuboradi),
 * bron `seated` + `orderId`. Stolda boshqa ochiq buyurtma bo'lsa — `tableBusy`. Huquq: `order.create` yoki `reservation.manage`
 * (faqat `reservation.manage` bo'lsa ham stol ochiladi — bron shuning uchun yozilgan).
 */
export async function seatReservation(ctx: RestaurantCtx, id: string, now = new Date()): Promise<ResResult<SeatResult>> {
  const denied = gate(ctx, RESERVATION_READ_PERMS);
  if (denied) return denied;
  const loaded = await loadReservation(ctx, id);
  if (!loaded.ok) return loaded;
  const r = loaded.data;
  if (r.status === 'seated' && r.orderId) {
    return ok({ reservation: await viewFor(ctx, r, now), orderId: String(r.orderId), order: null, skipped: [], existing: true });
  }
  if (r.status !== 'booked') return resFail(ctx.d, 'reservationClosed');
  if (seatTooEarly(r.startAt, now)) {
    const min = Math.ceil((r.startAt.getTime() - now.getTime()) / 60_000);
    const v = min >= 60 ? tr(ctx.d.reservations.leftHourMin, { h: Math.floor(min / 60), m: min % 60 }) : tr(ctx.d.reservations.leftMin, { n: min });
    return resFail(ctx.d, 'reservationTooEarly', { v });
  }

  const key = seatOrderKey(String(r._id));
  const busy = await ctx.m.Order.findOne({ activeTableKey: String(r.tableId), status: { $in: ['open', 'precheck'] } })
    .select('clientOrderId').lean<{ clientOrderId?: string }>();
  if (busy && busy.clientOrderId !== key) return fail(ctx.d, 'tableBusy', { n: r.tableNumber });

  // Faqat bron huquqi bor xodim ham stolni ocha olsin (shu amal uchun)
  const openCtx: RestaurantCtx = ctx.perms.has('order.create') ? ctx : { ...ctx, perms: new Set([...ctx.perms, 'order.create']) };
  const all: AddItemInput[] = (r.items ?? []).map((i, n) => ({
    clientItemId: `${key}:${n}`,
    productId: String(i.productId),
    qty: i.qty,
    optionIds: (i.optionIds ?? []).map(String),
    ...(i.note ? { note: i.note } : {}),
  }));
  const base = { type: 'dine_in' as const, tableId: String(r.tableId), guests: r.guests, clientOrderId: key };
  const skipped: SeatResult['skipped'] = [];
  let opened = await openOrder(openCtx, { ...base, items: all });
  if (!opened.ok && ITEM_ERRORS.has(opened.code) && all.length) {
    // Qaysi taom o'tmasligini aniqlab, qolganlari bilan ochamiz
    const good: AddItemInput[] = [];
    for (const [n, it] of all.entries()) {
      const one = await prepareItems(ctx.m, ctx.d, r.branchId, [it], { addedBy: ctx.user.username, status: 'new', now });
      if (one.ok) good.push(it);
      else skipped.push({ name: r.items[n].name, message: one.error });
    }
    opened = await openOrder(openCtx, { ...base, items: good });
  }
  if (!opened.ok) return opened;
  const order = opened.data.order;
  if (opened.data.existing) {
    // Stol band bo'lib qolgan (parallel ochilgan) — bu bronning buyurtmasi emas
    const mine = await ctx.m.Order.findById(order.id).select('clientOrderId').lean<{ clientOrderId?: string }>();
    if (mine?.clientOrderId !== key) return fail(ctx.d, 'tableBusy', { n: r.tableNumber });
  }

  const saved = await ctx.m.Reservation.findOneAndUpdate(
    { _id: r._id, status: 'booked' },
    { $set: { status: 'seated', orderId: new Types.ObjectId(order.id), seatedAt: now, seatedBy: ctx.user.username } },
    { new: true },
  ).lean<ReservationDoc>();
  const final = saved ?? (await ctx.m.Reservation.findById(r._id).lean<ReservationDoc>()) ?? r;
  if (saved) {
    await audit(ctx, 'reservation.seat', saved, `; buyurtma ${order.orderNo}${skipped.length ? `; qo'shilmadi: ${skipped.map((s) => s.name).join(', ')}` : ''}`, { orderId: order.id });
  }
  return ok({ reservation: await viewFor(ctx, final, now), orderId: order.id, order, skipped, existing: false });
}

/* ───────────────────────────── stollar taxtasi uchun ───────────────────────────── */

export interface UpcomingReservation {
  id: string;
  /** ISO */
  startAt: string;
  /** Toshkent soati HH:MM */
  time: string;
  customerName: string;
  guests: number;
  /** Mehmon kechikmoqda (boshlanganiga 15 daqiqadan oshdi) */
  late: boolean;
}

/**
 * Stollar taxtasi uchun: stol → eng yaqin `booked` bron. Oyna: boshlanishiga ≤ `windowMin` daqiqa qolgan yoki boshlanganiga
 * ≤ 30 daqiqa bo'lgan (kechikayotgan mehmon). Huquq yo'q / modul o'chiq / boshqa filial — bo'sh obyekt (taxta buzilmasin).
 * Kalit — stol id (TableBoardRow.id).
 */
export async function upcomingByTable(
  ctx: RestaurantCtx,
  branchId: string,
  now: Date = new Date(),
  windowMin = 60,
): Promise<Record<string, UpcomingReservation>> {
  if (!ctx.features.tables || !validId(branchId)) return {};
  if (!(['order.create', 'order.viewAll', 'reservation.manage'] as const).some((k) => ctx.perms.has(k))) return {};
  if (ctx.user.role !== 'admin' && ctx.user.branchId !== branchId) return {};
  const list = await ctx.m.Reservation.find({
    branchId,
    status: 'booked',
    startAt: { $gte: new Date(now.getTime() - RESERVATION_LIMITS.boardGraceMin * 60_000), $lte: new Date(now.getTime() + windowMin * 60_000) },
  }).sort({ startAt: 1 }).select('tableId startAt customerName guests status').limit(500).lean<ReservationDoc[]>();
  const out: Record<string, UpcomingReservation> = {};
  for (const r of list) {
    const k = String(r.tableId);
    if (out[k]) continue;
    out[k] = { id: String(r._id), startAt: r.startAt.toISOString(), time: tashkentClock(r.startAt), customerName: r.customerName, guests: r.guests, late: isLate(r, now) };
  }
  return out;
}
