/**
 * Oshxona printeri — printer stansiyasi uchun navbat amallari (server, DB). Web JSON API
 * (app/api/restaurant/print) chaqiradi. Navbatga qo'yish — print.ts (ops.ts dan).
 *
 * Bir varaq bir marta chop etilishi: varaq atomik «olinadi» (claim: findOneAndUpdate, qurilma kaliti va
 * vaqt yoziladi), chop etilgach `printed`. Qurilma olib, belgilamay qolsa (sahifa yopildi) —
 * PRINT_LEASE_MS dan keyin boshqa qurilma oladi (yo'qolgandan ko'ra takror chop etilgani yaxshi).
 * PRINT_MAX_AGE_MS dan eski varaq avtomatik chop etilmaydi (printer kun bo'yi o'chiq turgan bo'lsa,
 * yoqilganda eski varaqlar chiqib ketmasin) — ro'yxatda «chop etilmadi», qo'lda qayta chop etiladi.
 */
import { Types } from 'mongoose';
import type { PrintJobDoc } from '../models/tenant/PrintJob';
import { branchFilter } from '../branchScope';
import { recordAudit } from '../audit';
import type { OrderType, PrintJobKind, PrintJobStatus, StationKind } from './types';
import { fail, needFeature, needPerm, ok, orderRef, type OpErr, type OpResult, type RestaurantCtx } from './context';
import { resolveBranchId } from './ops';
import { branchesFor } from './queries';

/** Olingan, lekin belgilanmagan varaq shuncha vaqtdan keyin boshqa qurilmaga beriladi */
export const PRINT_LEASE_MS = 60_000;
/** Shundan eski varaq avtomatik chop etilmaydi */
export const PRINT_MAX_AGE_MS = 30 * 60_000;
/** Shuncha marta olinib, chop etilmagan varaq to'xtatiladi (qo'lda qayta chop etish mumkin) */
export const PRINT_MAX_ATTEMPTS = 5;
/** Bitta so'rovda olinadigan varaqlar */
export const PRINT_CLAIM_LIMIT = 5;
/** Ro'yxatdagi oxirgi varaqlar */
export const PRINT_RECENT_LIMIT = 30;

const HEX24 = /^[a-f0-9]{24}$/i;
const iso = (d?: Date | null): string | null => (d ? new Date(d).toISOString() : null);

export interface PrintJobLineView {
  name: string;
  qty: number;
  unit: string | null;
  modifiers: { group: string; name: string }[];
  note: string | null;
  fromQr: boolean;
  reason: string | null;
}

export interface PrintJobView {
  id: string;
  kind: PrintJobKind;
  status: PrintJobStatus;
  stationId: string;
  stationName: string;
  orderId: string;
  orderNo: string;
  orderType: OrderType;
  tableNumber: number | null;
  /** Saboy qaysi stol mehmonlariga (varaqda «SABOY · STOL 5») */
  forTableNumber: number | null;
  waiterName: string | null;
  guests: number | null;
  orderNote: string | null;
  lines: PrintJobLineView[];
  /** Qayta chop etilgan nusxa */
  copy: boolean;
  queuedAt: string;
  printedAt: string | null;
  printedBy: string | null;
  attempts: number;
  /** Navbatda, lekin avtomatik chop etilmaydi (eskirgan yoki urinishlar tugagan) */
  stale: boolean;
}

export interface PrintStationBoard {
  serverTime: string;
  branchId: string;
  branches: { id: string; name: string; isMain: boolean }[];
  /** Filialning faol stansiyalari (printer yoqilgan-yoqilmaganligi bilan) */
  stations: { id: string; name: string; kind: StationKind; printEnabled: boolean }[];
  /** Shu so'rovda shu qurilmaga berilgan (chop etilishi kerak) varaqlar — eskisidan yangisiga */
  jobs: PrintJobView[];
  /** Oxirgi varaqlar (yangisi birinchi) */
  recent: PrintJobView[];
}

export function isStale(j: Pick<PrintJobDoc, 'status' | 'queuedAt' | 'attempts'>, now: number): boolean {
  return j.status === 'pending' && (new Date(j.queuedAt).getTime() < now - PRINT_MAX_AGE_MS || (j.attempts ?? 0) >= PRINT_MAX_ATTEMPTS);
}

export function printJobView(j: PrintJobDoc, now: number): PrintJobView {
  return {
    id: String(j._id),
    kind: j.kind,
    status: j.status,
    stationId: String(j.stationId),
    stationName: j.stationName,
    orderId: String(j.orderId),
    orderNo: j.orderNo,
    orderType: j.orderType,
    tableNumber: j.tableNumber ?? null,
    forTableNumber: j.forTableNumber ?? null,
    waiterName: j.waiterName ?? null,
    guests: j.guests ?? null,
    orderNote: j.orderNote ?? null,
    lines: (j.lines ?? []).map((l) => ({
      name: l.name,
      qty: l.qty,
      unit: l.unit ?? null,
      modifiers: (l.modifiers ?? []).map((m) => ({ group: m.group, name: m.name })),
      note: l.note ?? null,
      fromQr: !!l.fromQr,
      reason: l.reason ?? null,
    })),
    copy: !!j.copy,
    queuedAt: new Date(j.queuedAt).toISOString(),
    printedAt: iso(j.printedAt),
    printedBy: j.printedBy ?? null,
    attempts: j.attempts ?? 0,
    stale: isStale(j, now),
  };
}

function guard(ctx: RestaurantCtx): OpErr | null {
  return needFeature(ctx, 'kitchen') ?? needPerm(ctx, 'kitchen.view');
}

/** Olish mumkin bo'lgan varaq sharti: navbatda, yangi, urinishlar tugamagan, hech kim olmagan / muddati o'tgan / shu qurilmaniki */
export function claimableFilter(input: { branchId: string; stationId?: string; deviceId: string; now: number; exclude: Types.ObjectId[] }) {
  return {
    branchId: new Types.ObjectId(input.branchId),
    ...(input.stationId ? { stationId: new Types.ObjectId(input.stationId) } : {}),
    status: 'pending',
    queuedAt: { $gte: new Date(input.now - PRINT_MAX_AGE_MS) },
    attempts: { $lt: PRINT_MAX_ATTEMPTS },
    ...(input.exclude.length ? { _id: { $nin: input.exclude } } : {}),
    $or: [
      { claimedAt: null },
      { claimedAt: { $lt: new Date(input.now - PRINT_LEASE_MS) } },
      { claimedBy: input.deviceId },
    ],
  };
}

/**
 * Printer stansiyasining so'rovi (polling): `claim` — yangi varaqlarni shu qurilmaga olish
 * (chop etish to'xtatilgan bo'lsa — faqat ro'yxat). `stationId` bo'sh — filialning barcha stansiyalari.
 */
export async function printStationPoll(
  ctx: RestaurantCtx,
  input: { branchId?: string; stationId?: string; deviceId: string; claim: boolean },
): Promise<OpResult<PrintStationBoard>> {
  const denied = guard(ctx);
  if (denied) return denied;
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const branchId = br.data;
  const stationId = input.stationId && HEX24.test(input.stationId) ? input.stationId : undefined;
  const now = Date.now();
  const { PrintJob, KitchenStation } = ctx.m;

  const claimed: PrintJobDoc[] = [];
  if (input.claim) {
    for (let k = 0; k < PRINT_CLAIM_LIMIT; k++) {
      const j = await PrintJob.findOneAndUpdate(
        claimableFilter({ branchId, stationId, deviceId: input.deviceId, now, exclude: claimed.map((c) => c._id) }),
        { $set: { claimedAt: new Date(now), claimedBy: input.deviceId }, $inc: { attempts: 1 } },
        { sort: { queuedAt: 1 }, new: true },
      ).lean<PrintJobDoc>();
      if (!j) break;
      claimed.push(j);
    }
  }

  const [stations, recent, branches] = await Promise.all([
    KitchenStation.find({ branchId, active: true }).sort({ sort: 1, createdAt: 1 }).select('name kind printEnabled').lean(),
    PrintJob.find({ branchId, ...(stationId ? { stationId } : {}) }).sort({ createdAt: -1 }).limit(PRINT_RECENT_LIMIT).lean<PrintJobDoc[]>(),
    branchesFor(ctx),
  ]);
  return ok({
    serverTime: new Date(now).toISOString(),
    branchId,
    branches,
    stations: stations.map((s) => ({ id: String(s._id), name: s.name, kind: s.kind, printEnabled: !!s.printEnabled })),
    jobs: claimed.map((j) => printJobView(j, now)),
    recent: recent.map((j) => printJobView(j, now)),
  });
}

/** Varaq chop etildi (qayta belgilash — zararsiz) */
export async function markPrintJobPrinted(ctx: RestaurantCtx, id: string): Promise<OpResult<{ id: string; printed: boolean }>> {
  const denied = guard(ctx);
  if (denied) return denied;
  if (!HEX24.test(id)) return fail(ctx.d, 'printJobNotFound');
  const r = await ctx.m.PrintJob.updateOne(
    { _id: id, ...branchFilter(ctx.user), status: 'pending' },
    { $set: { status: 'printed', printedAt: new Date(), printedBy: ctx.user.username }, $unset: { claimedAt: '', claimedBy: '' } },
  );
  if (!r.matchedCount) {
    const exists = await ctx.m.PrintJob.exists({ _id: id, ...branchFilter(ctx.user) });
    if (!exists) return fail(ctx.d, 'printJobNotFound');
  }
  return ok({ id, printed: r.modifiedCount > 0 });
}

/**
 * Qayta chop etish: asl varaqning «NUSXA» belgili yangi nusxasi navbatga qo'yiladi (asl varaq tarixi
 * saqlanadi). Takroriy varaq — hisobsiz taom tayyorlash usuli bo'lishi mumkin, shuning uchun auditga yoziladi.
 */
export async function reprintPrintJob(ctx: RestaurantCtx, id: string): Promise<OpResult<{ id: string }>> {
  const denied = guard(ctx);
  if (denied) return denied;
  if (!HEX24.test(id)) return fail(ctx.d, 'printJobNotFound');
  const j = await ctx.m.PrintJob.findOne({ _id: id, ...branchFilter(ctx.user) }).lean<PrintJobDoc>();
  if (!j) return fail(ctx.d, 'printJobNotFound');
  const copy = await ctx.m.PrintJob.create({
    branchId: j.branchId,
    stationId: j.stationId,
    stationName: j.stationName,
    kind: j.kind,
    orderId: j.orderId,
    orderNo: j.orderNo,
    orderType: j.orderType,
    tableNumber: j.tableNumber,
    forTableNumber: j.forTableNumber,
    waiterName: j.waiterName,
    guests: j.guests,
    orderNote: j.orderNote,
    lines: j.lines,
    status: 'pending',
    queuedAt: new Date(),
    copy: true,
    attempts: 0,
    createdBy: ctx.user.username,
  });
  await recordAudit(ctx.user, {
    action: 'print.reprint',
    entity: 'order',
    entityId: String(j.orderId),
    summary: `${orderRef(j)}: «${j.stationName}» varag'i qayta chop etildi (NUSXA, ${j.lines.length} ta qator)${ctx.via ?? ''}`,
    meta: { printJobId: id, copyId: String(copy._id), kind: j.kind },
  });
  return ok({ id: String(copy._id) });
}
