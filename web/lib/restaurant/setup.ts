/**
 * Restoran sozlamalari (server, DB): zallar, stollar (QR token), stansiyalar, ShopSettings.restaurant,
 * taomning restoran maydonlari (stansiya, modifikatorlar, MXIK) va stop-list.
 * Huquq: sozlamalar — `tables.manage`; taom maydonlari — `product.edit`; stop-list — `menu.stopList`.
 */
import crypto from 'crypto';
import { Types } from 'mongoose';
import { branchFilter } from '../branchScope';
import { recordAudit } from '../audit';
import { saveShopSettingsPart } from '../shopSettings';
import { isTenantUploadUrl } from '../fileUrl';
import { siteUrl } from '../siteUrl';
import { parseMxikInput } from '../mxik';
import { isDupKey } from '../posSync';
import { normalizeModifierGroups } from './modifiers';
import { normalizeRestaurantInfo, type RestaurantInfoInput } from './info';
import { isBrandColor, qrMenuPath } from './qr';
import { RESTAURANT_LIMITS, type RestaurantSettings, type StationKind } from './types';
import { fail, needFeature, needPerm, ok, type OpErr, type OpResult, type RestaurantCtx } from './context';
import { resolveBranchId, restaurantSettings } from './ops';

const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

/** Stol QR tokeni: 128 bit tasodifiy, base64url (22 belgi) */
export function newQrToken(): string {
  return crypto.randomBytes(16).toString('base64url');
}

function guard(ctx: RestaurantCtx): OpErr | null {
  return needFeature(ctx, 'tables') ?? needPerm(ctx, 'tables.manage');
}

function settingsAudit(ctx: RestaurantCtx, action: string, summary: string, meta?: Record<string, unknown>) {
  return recordAudit(ctx.user, { action, entity: 'branch', summary: `${summary}${ctx.via ?? ''}`, meta });
}

/* ───────────────────────────── sozlamalar ───────────────────────────── */

export interface RestaurantSettingsInput {
  serviceChargePct?: number;
  takeawayPackFee?: number;
  requireVoidReason?: boolean;
  kdsWarnMinutes?: number;
  kdsAlertMinutes?: number;
  /** null yoki '' — o'chirish */
  brand?: { logoUrl?: string | null; color?: string | null; coverUrl?: string | null };
  /** Mijoz sahifasi aloqa ma'lumoti (lib/restaurant/info.ts): null yoki '' — o'chirish */
  info?: RestaurantInfoInput;
}

/** Restoran sozlamalarini qisman yangilash (berilmagan maydon o'zgarmaydi) */
export async function saveRestaurantSettings(ctx: RestaurantCtx, input: RestaurantSettingsInput): Promise<OpResult<RestaurantSettings>> {
  const denied = guard(ctx);
  if (denied) return denied;
  const cur = await restaurantSettings(ctx.m);
  const next: RestaurantSettings = { ...cur, brand: { ...cur.brand }, info: { ...cur.info } };

  if (input.serviceChargePct !== undefined) {
    const v = Math.round(input.serviceChargePct * 100) / 100;
    if (!Number.isFinite(v) || v < 0 || v > RESTAURANT_LIMITS.maxServiceChargePct) return fail(ctx.d, 'badSettings');
    next.serviceChargePct = v;
  }
  if (input.takeawayPackFee !== undefined) {
    if (!Number.isSafeInteger(input.takeawayPackFee) || input.takeawayPackFee < 0 || input.takeawayPackFee > 10_000_000) return fail(ctx.d, 'badSettings');
    next.takeawayPackFee = input.takeawayPackFee;
  }
  if (input.requireVoidReason !== undefined) next.requireVoidReason = !!input.requireVoidReason;
  if (input.kdsWarnMinutes !== undefined) next.kdsWarnMinutes = input.kdsWarnMinutes;
  if (input.kdsAlertMinutes !== undefined) next.kdsAlertMinutes = input.kdsAlertMinutes;
  const okMin = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;
  if (!okMin(next.kdsWarnMinutes, 240) || !okMin(next.kdsAlertMinutes, 480) || next.kdsAlertMinutes <= next.kdsWarnMinutes) {
    return fail(ctx.d, 'badSettings');
  }
  if (input.brand) {
    for (const key of ['logoUrl', 'coverUrl'] as const) {
      const v = input.brand[key];
      if (v === undefined) continue;
      if (!v) { delete next.brand[key]; continue; }
      // Faqat shu do'konga yuklangan rasm (/api/upload) — tashqi manzil va boshqa do'kon fayli emas
      if (!isTenantUploadUrl(v, ctx.user.dbName ?? '')) return fail(ctx.d, 'badUrl');
      next.brand[key] = v;
    }
    const c = input.brand.color;
    if (c !== undefined) {
      if (!c) delete next.brand.color;
      else if (!isBrandColor(c)) return fail(ctx.d, 'badColor');
      else next.brand.color = c.toUpperCase();
    }
  }
  if (input.info) {
    const r = normalizeRestaurantInfo(next.info, input.info);
    if (!r.ok) return fail(ctx.d, 'badSettings', undefined, { field: r.field });
    next.info = r.info;
  }

  await saveShopSettingsPart(ctx.m.ShopSettings, 'restaurant', {
    serviceChargePct: next.serviceChargePct,
    takeawayPackFee: next.takeawayPackFee,
    requireVoidReason: next.requireVoidReason,
    kdsWarnMinutes: next.kdsWarnMinutes,
    kdsAlertMinutes: next.kdsAlertMinutes,
    brand: next.brand,
    info: next.info,
  }, ctx.user.username);
  await settingsAudit(ctx, 'settings.restaurant', `Restoran sozlamalari: xizmat haqi ${next.serviceChargePct}%, qadoq ${next.takeawayPackFee} so'm`, {
    serviceChargePct: next.serviceChargePct, takeawayPackFee: next.takeawayPackFee, requireVoidReason: next.requireVoidReason,
  });
  return ok(next);
}

/* ───────────────────────────── zallar ───────────────────────────── */

export async function saveHall(
  ctx: RestaurantCtx,
  input: { id?: string; name: string; branchId?: string; sort?: number; active?: boolean },
): Promise<OpResult<{ id: string }>> {
  const denied = guard(ctx);
  if (denied) return denied;
  const name = input.name.trim();
  if (!name || name.length > 60) return fail(ctx.d, 'badInput');
  const { Hall } = ctx.m;
  if (input.id) {
    if (!validId(input.id)) return fail(ctx.d, 'hallNotFound');
    const r = await Hall.updateOne(
      { _id: input.id, ...branchFilter(ctx.user) },
      { $set: { name, ...(input.sort !== undefined ? { sort: input.sort } : {}), ...(input.active !== undefined ? { active: input.active } : {}) } },
    );
    if (!r.matchedCount) return fail(ctx.d, 'hallNotFound');
    await settingsAudit(ctx, 'hall.update', `Zal «${name}» tahrirlandi`);
    return ok({ id: input.id });
  }
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const sort = input.sort ?? (await Hall.countDocuments({ branchId: br.data }));
  const hall = await Hall.create({ name, branchId: br.data, sort, active: true });
  await settingsAudit(ctx, 'hall.create', `Zal «${name}» qo'shildi`);
  return ok({ id: String(hall._id) });
}

export async function deleteHall(ctx: RestaurantCtx, id: string): Promise<OpResult<{ id: string }>> {
  const denied = guard(ctx);
  if (denied) return denied;
  if (!validId(id)) return fail(ctx.d, 'hallNotFound');
  const hall = await ctx.m.Hall.findOne({ _id: id, ...branchFilter(ctx.user) }).select('name').lean();
  if (!hall) return fail(ctx.d, 'hallNotFound');
  if (await ctx.m.Table.exists({ hallId: id })) return fail(ctx.d, 'hallHasTables');
  await ctx.m.Hall.deleteOne({ _id: id });
  await settingsAudit(ctx, 'hall.delete', `Zal «${hall.name}» o'chirildi`);
  return ok({ id });
}

/* ───────────────────────────── stollar ───────────────────────────── */

export interface TableInput {
  id?: string;
  hallId: string;
  number: number;
  seats?: number;
  x?: number | null;
  y?: number | null;
  active?: boolean;
}

function tableNumberOk(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= RESTAURANT_LIMITS.maxTableNumber;
}

async function hallInScope(ctx: RestaurantCtx, hallId: string) {
  if (!validId(hallId)) return null;
  return ctx.m.Hall.findOne({ _id: hallId, ...branchFilter(ctx.user) }).select('branchId name').lean();
}

async function hasOpenOrder(ctx: RestaurantCtx, tableId: string): Promise<boolean> {
  return !!(await ctx.m.Order.exists({ activeTableKey: tableId }));
}

export async function saveTable(ctx: RestaurantCtx, input: TableInput): Promise<OpResult<{ id: string; qrToken: string }>> {
  const denied = guard(ctx);
  if (denied) return denied;
  if (!tableNumberOk(input.number)) return fail(ctx.d, 'badInput');
  const seats = input.seats ?? 4;
  if (!Number.isInteger(seats) || seats < 1 || seats > RESTAURANT_LIMITS.maxSeats) return fail(ctx.d, 'badInput');
  const hall = await hallInScope(ctx, input.hallId);
  if (!hall) return fail(ctx.d, 'hallNotFound');
  const pos = {
    ...(input.x !== undefined && input.x !== null ? { x: input.x } : {}),
    ...(input.y !== undefined && input.y !== null ? { y: input.y } : {}),
  };
  const { Table } = ctx.m;
  try {
    if (input.id) {
      if (!validId(input.id)) return fail(ctx.d, 'tableNotFound');
      const cur = await Table.findOne({ _id: input.id, ...branchFilter(ctx.user) }).select('branchId qrToken number').lean();
      if (!cur) return fail(ctx.d, 'tableNotFound');
      // Zal boshqa filialga o'tkazilmaydi (buyurtma va ombor filialga bog'liq)
      if (String(cur.branchId) !== String(hall.branchId)) return fail(ctx.d, 'badBranch');
      if (input.active === false && (await hasOpenOrder(ctx, input.id))) return fail(ctx.d, 'tableHasOrder');
      await Table.updateOne(
        { _id: input.id },
        {
          $set: { hallId: hall._id, number: input.number, seats, ...pos, ...(input.active !== undefined ? { active: input.active } : {}) },
          ...(input.x === null || input.y === null ? { $unset: { ...(input.x === null ? { x: '' } : {}), ...(input.y === null ? { y: '' } : {}) } } : {}),
        },
      );
      await settingsAudit(ctx, 'table.update', `Stol ${cur.number} → ${input.number} (${hall.name})`);
      return ok({ id: input.id, qrToken: cur.qrToken });
    }
    const qrToken = newQrToken();
    const t = await Table.create({ hallId: hall._id, branchId: hall.branchId, number: input.number, seats, ...pos, qrToken, active: true });
    await settingsAudit(ctx, 'table.create', `Stol ${input.number} qo'shildi (${hall.name})`);
    return ok({ id: String(t._id), qrToken });
  } catch (e) {
    if (isDupKey(e)) return fail(ctx.d, 'tableNumberTaken', { n: input.number });
    throw e;
  }
}

/** Bir nechta stolni ketma-ket raqam bilan qo'shish (masalan 1–12); band raqamlar o'tkazib yuboriladi */
export async function createTablesRange(
  ctx: RestaurantCtx,
  input: { hallId: string; from: number; to: number; seats?: number },
): Promise<OpResult<{ created: number; skipped: number[] }>> {
  const denied = guard(ctx);
  if (denied) return denied;
  if (!tableNumberOk(input.from) || !tableNumberOk(input.to) || input.to < input.from || input.to - input.from >= 100) return fail(ctx.d, 'badInput');
  const seats = input.seats ?? 4;
  if (!Number.isInteger(seats) || seats < 1 || seats > RESTAURANT_LIMITS.maxSeats) return fail(ctx.d, 'badInput');
  const hall = await hallInScope(ctx, input.hallId);
  if (!hall) return fail(ctx.d, 'hallNotFound');
  const taken = new Set((await ctx.m.Table.find({ branchId: hall.branchId, number: { $gte: input.from, $lte: input.to } }).select('number').lean()).map((t) => t.number));
  const docs = [];
  const skipped: number[] = [];
  for (let n = input.from; n <= input.to; n++) {
    if (taken.has(n)) { skipped.push(n); continue; }
    docs.push({ hallId: hall._id, branchId: hall.branchId, number: n, seats, qrToken: newQrToken(), active: true });
  }
  let created = docs.length;
  if (docs.length) {
    try {
      await ctx.m.Table.insertMany(docs, { ordered: false });
    } catch (e) {
      // Parallel qo'shilgan raqamlar — noyob indeks rad etadi
      const inserted = (e as { insertedDocs?: unknown[]; result?: { insertedCount?: number } }).result?.insertedCount;
      if (!isDupKey(e) && !(e as { writeErrors?: unknown[] }).writeErrors) throw e;
      created = typeof inserted === 'number' ? inserted : created;
    }
  }
  await settingsAudit(ctx, 'table.createRange', `Stollar ${input.from}–${input.to} qo'shildi (${hall.name}): ${created} ta`);
  return ok({ created, skipped });
}

export async function deleteTable(ctx: RestaurantCtx, id: string): Promise<OpResult<{ id: string }>> {
  const denied = guard(ctx);
  if (denied) return denied;
  if (!validId(id)) return fail(ctx.d, 'tableNotFound');
  const t = await ctx.m.Table.findOne({ _id: id, ...branchFilter(ctx.user) }).select('number').lean();
  if (!t) return fail(ctx.d, 'tableNotFound');
  if (await hasOpenOrder(ctx, id)) return fail(ctx.d, 'tableHasOrder');
  await ctx.m.Table.deleteOne({ _id: id });
  await settingsAudit(ctx, 'table.delete', `Stol ${t.number} o'chirildi`);
  return ok({ id });
}

/** QR-kodni almashtirish — eski havola darhol ishlamay qoladi (masalan, QR rasmi tarqalib ketganda) */
export async function regenerateTableQr(ctx: RestaurantCtx, id: string): Promise<OpResult<{ id: string; qrToken: string; qrPath: string; qrUrl: string }>> {
  const denied = guard(ctx);
  if (denied) return denied;
  if (!validId(id)) return fail(ctx.d, 'tableNotFound');
  const qrToken = newQrToken();
  const t = await ctx.m.Table.findOneAndUpdate({ _id: id, ...branchFilter(ctx.user) }, { $set: { qrToken } }, { new: true }).select('number').lean();
  if (!t) return fail(ctx.d, 'tableNotFound');
  await settingsAudit(ctx, 'table.qr', `Stol ${t.number}: QR-kod almashtirildi`);
  const qrPath = qrMenuPath(ctx.orgSlug, qrToken);
  return ok({ id, qrToken, qrPath, qrUrl: `${siteUrl()}${qrPath}` });
}

/* ───────────────────────────── stansiyalar ───────────────────────────── */

export async function saveStation(
  ctx: RestaurantCtx,
  input: { id?: string; name: string; kind: StationKind; branchId?: string; printerIp?: string | null; sort?: number; active?: boolean },
): Promise<OpResult<{ id: string }>> {
  const denied = guard(ctx);
  if (denied) return denied;
  const name = input.name.trim();
  if (!name || name.length > 60) return fail(ctx.d, 'badInput');
  const printerIp = input.printerIp?.trim() || undefined;
  if (printerIp && !/^[A-Za-z0-9.:-]{3,64}$/.test(printerIp)) return fail(ctx.d, 'badInput');
  const { KitchenStation } = ctx.m;
  const fields = {
    name,
    kind: input.kind,
    ...(input.sort !== undefined ? { sort: input.sort } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
  if (input.id) {
    if (!validId(input.id)) return fail(ctx.d, 'stationNotFound');
    const r = await KitchenStation.updateOne(
      { _id: input.id, ...branchFilter(ctx.user) },
      { $set: { ...fields, ...(printerIp ? { printerIp } : {}) }, ...(printerIp ? {} : { $unset: { printerIp: '' } }) },
    );
    if (!r.matchedCount) return fail(ctx.d, 'stationNotFound');
    await settingsAudit(ctx, 'station.update', `Stansiya «${name}» tahrirlandi`);
    return ok({ id: input.id });
  }
  const br = await resolveBranchId(ctx, input.branchId);
  if (!br.ok) return br;
  const sort = input.sort ?? (await KitchenStation.countDocuments({ branchId: br.data }));
  const st = await KitchenStation.create({ ...fields, sort, branchId: br.data, active: input.active ?? true, ...(printerIp ? { printerIp } : {}) });
  await settingsAudit(ctx, 'station.create', `Stansiya «${name}» (${input.kind}) qo'shildi`);
  return ok({ id: String(st._id) });
}

/** Stansiyani o'chirish: unga bog'langan taomlar stansiyasiz bo'ladi (ochiq buyurtmalardagi taomlar «barcha stansiyalar» ekranida qoladi) */
export async function deleteStation(ctx: RestaurantCtx, id: string): Promise<OpResult<{ id: string; detached: number }>> {
  const denied = guard(ctx);
  if (denied) return denied;
  if (!validId(id)) return fail(ctx.d, 'stationNotFound');
  const st = await ctx.m.KitchenStation.findOne({ _id: id, ...branchFilter(ctx.user) }).select('name').lean();
  if (!st) return fail(ctx.d, 'stationNotFound');
  const r = await ctx.m.Product.updateMany({ stationId: id }, { $unset: { stationId: '' } }).setOptions({ withDeleted: true });
  await ctx.m.KitchenStation.deleteOne({ _id: id });
  await settingsAudit(ctx, 'station.delete', `Stansiya «${st.name}» o'chirildi (${r.modifiedCount} ta taom stansiyasiz qoldi)`);
  return ok({ id, detached: r.modifiedCount });
}

/* ───────────────────────────── taom (menyu bandi) ───────────────────────────── */

export interface MenuItemInput {
  /** null — stansiyasiz */
  stationId?: string | null;
  /** Modifikator guruhlari (to'liq almashtiriladi); [] yoki null — olib tashlash */
  modifierGroups?: unknown;
  /** MXIK (IKPU); null yoki '' — o'chirish */
  ikpu?: string | null;
}

/** Taomning restoran maydonlari: stansiya, modifikatorlar, MXIK (`product.edit`) */
export async function updateMenuItem(ctx: RestaurantCtx, productId: string, input: MenuItemInput): Promise<OpResult<{ id: string }>> {
  const denied = needPerm(ctx, 'product.edit');
  if (denied) return denied;
  if (!validId(productId)) return fail(ctx.d, 'productNotFound');
  const p = await ctx.m.Product.findOne({ _id: productId, ...branchFilter(ctx.user) }).select('name branchId').lean();
  if (!p) return fail(ctx.d, 'productNotFound');
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  if (input.stationId !== undefined) {
    if (input.stationId === null || input.stationId === '') unset.stationId = '';
    else {
      if (!validId(input.stationId)) return fail(ctx.d, 'stationNotFound');
      const st = await ctx.m.KitchenStation.findOne({ _id: input.stationId, branchId: p.branchId }).select('_id').lean();
      if (!st) return fail(ctx.d, 'stationNotFound');
      set.stationId = new Types.ObjectId(input.stationId);
    }
  }
  if (input.modifierGroups !== undefined) {
    const g = normalizeModifierGroups(input.modifierGroups);
    if (!g.ok) return fail(ctx.d, 'badModifierGroups');
    if (g.groups.length) set.modifierGroups = g.groups;
    else unset.modifierGroups = '';
  }
  if (input.ikpu !== undefined) {
    // MXIK — 17 raqam (lib/mxik.ts, mahsulot formasi bilan bir xil qoida)
    const v = parseMxikInput(input.ikpu);
    if (v === null) return fail(ctx.d, 'badInput');
    if (!v) unset.ikpu = '';
    else set.ikpu = v;
  }
  if (!Object.keys(set).length && !Object.keys(unset).length) return ok({ id: productId });
  await ctx.m.Product.updateOne(
    { _id: productId },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      $push: { history: { action: 'edited', detail: 'Restoran: stansiya/modifikator/MXIK', by: ctx.user.username, at: new Date() } },
    },
  );
  await recordAudit(ctx.user, { action: 'product.menu', entity: 'product', entityId: productId, summary: `«${p.name}»: restoran sozlamasi o'zgartirildi${ctx.via ?? ''}` });
  return ok({ id: productId });
}

/** Stop-list: tugagan taomni vaqtincha menyudan olish / qaytarish (`menu.stopList`) */
export async function setStopList(ctx: RestaurantCtx, productId: string, stopped: boolean): Promise<OpResult<{ id: string; name: string; stopListed: boolean }>> {
  const denied = needFeature(ctx, 'tables') ?? needPerm(ctx, 'menu.stopList');
  if (denied) return denied;
  if (!validId(productId)) return fail(ctx.d, 'productNotFound');
  const p = await ctx.m.Product.findOneAndUpdate(
    { _id: productId, ...branchFilter(ctx.user) },
    stopped ? { $set: { stopListed: true } } : { $unset: { stopListed: '' } },
    { new: true },
  ).select('name').lean();
  if (!p) return fail(ctx.d, 'productNotFound');
  await recordAudit(ctx.user, {
    action: stopped ? 'product.stopListOn' : 'product.stopListOff',
    entity: 'product',
    entityId: productId,
    summary: `«${p.name}» ${stopped ? "stop-listga qo'yildi" : 'stop-listdan chiqarildi'}${ctx.via ?? ''}`,
  });
  return ok({ id: productId, name: p.name, stopListed: stopped });
}
