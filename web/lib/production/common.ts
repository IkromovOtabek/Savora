/**
 * Ishlab chiqarish/kirim umumiy server yordamchilari: filial doirasi, hujjat qulfi («bajarildi»/«post» bir marta),
 * audit, sahifalash, filial nomlari.
 */
import { Types, type Model } from 'mongoose';
import { recordAudit } from '../audit';
import { ensureMainBranchId } from '../mainBranch';
import { escapeRegExp } from '../security';
import { isTashkentMidnight } from '../period';
import type { AuditEntity } from '../models/tenant/AuditLog';
import { PRODUCTION_LIMITS as L } from './calc';
import { fail, ok, scoped, validId, type OpResult, type ProductionCtx } from './context';

/**
 * Amal bajariladigan filial (o'z ombori): filial xodimi — faqat o'z filiali (boshqasini so'rasa — xato);
 * admin — so'ralgan faol filial, bo'lmasa asosiy ombor.
 */
export async function resolveOwnBranch(ctx: ProductionCtx, requested?: string | null): Promise<OpResult<string>> {
  if (ctx.user.role !== 'admin') {
    if (!ctx.user.branchId) return fail(ctx.d, 'badBranch');
    if (requested && requested !== ctx.user.branchId) return fail(ctx.d, 'badBranch');
    return ok(ctx.user.branchId);
  }
  if (requested) return resolveAnyBranch(ctx, requested);
  return ok(await ensureMainBranchId(ctx.m.Branch));
}

/** Istalgan faol filial (masalan tayyor mahsulot ombori — «filialga berish» kabi, xodim ham tanlay oladi) */
export async function resolveAnyBranch(ctx: ProductionCtx, requested: string): Promise<OpResult<string>> {
  if (!validId(requested)) return fail(ctx.d, 'badBranch');
  const b = await ctx.m.Branch.findOne({ _id: requested, active: true }).select('_id').lean();
  return b ? ok(requested) : fail(ctx.d, 'badBranch');
}

/** Filial nomlari (id → nom) */
export async function branchNames(ctx: ProductionCtx, ids: readonly unknown[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean).map(String))].filter(validId);
  if (!uniq.length) return new Map();
  const list = await ctx.m.Branch.find({ _id: { $in: uniq } }).select('name').lean();
  return new Map(list.map((b) => [String(b._id), b.name]));
}

/** Admin uchun filiallar ro'yxati (tanlash); filial xodimiga — faqat o'zi */
export async function branchesFor(ctx: ProductionCtx): Promise<{ id: string; name: string; isMain: boolean }[]> {
  const filter = scoped(ctx) ? { _id: ctx.user.branchId, active: true } : { active: true };
  const list = await ctx.m.Branch.find(filter).select('name isMain').sort({ isMain: -1, createdAt: 1 }).lean();
  return list.map((b) => ({ id: String(b._id), name: b.name, isMain: !!b.isMain }));
}

export async function audit(
  ctx: ProductionCtx,
  entity: Extract<AuditEntity, 'production' | 'purchase' | 'product' | 'finance'>,
  action: string,
  entityId: string,
  summary: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await recordAudit(ctx.user, { action, entity, entityId, summary: `${summary}${ctx.via ?? ''}`, meta });
}

/** Sahifalash (page 1 dan) */
export function pageArgs(q: { page?: number | null; limit?: number | null }): { skip: number; limit: number; page: number } {
  const limit = Math.min(Math.max(q.limit ?? L.pageSize, 1), L.maxPageSize);
  const page = Math.max(q.page ?? 1, 1);
  return { skip: (page - 1) * limit, limit, page };
}

/**
 * Davr filtri (createdAt yoki boshqa sana maydoni), kunlar — Toshkent vaqti (UTC+5, lib/period.ts):
 *  - `from` — shu lahzadan (kun kalitidan kelsa — Toshkent kuni boshi, `zOptDay`);
 *  - `to` aynan Toshkent yarim tuni bo'lsa (kun kaliti «YYYY-MM-DD») — SHU KUN OXIRIGACHA (keyingi kun boshidan oldin);
 *    boshqa lahza — shu lahzagacha (ichida).
 */
export function dateRange(from?: Date | null, to?: Date | null): Record<string, Date> | null {
  if (!from && !to) return null;
  const r: Record<string, Date> = {};
  if (from) r.$gte = from;
  if (to) {
    if (isTashkentMidnight(to)) r.$lt = new Date(to.getTime() + 86_400_000);
    else r.$lte = to;
  }
  return r;
}

/** Matn qidiruvi uchun xavfsiz regex (foydalanuvchi kiritgani — ekranlanadi) */
export function searchRegex(q?: string | null): RegExp | null {
  const s = (q ?? '').trim();
  return s ? new RegExp(escapeRegExp(s), 'i') : null;
}

export const oid = (id: string) => new Types.ObjectId(id);

/* ───────────────────────────── hujjat qulfi ───────────────────────────── */

/**
 * «Bajarildi»/«post» bir marta bajarilsin: `postingAt` atomik qo'yiladi (holat va rev mos bo'lsa). Ikkinchi so'rov —
 * `locked`. Jarayon server qulashi bilan uzilgan bo'lsa, qulf `staleLockMs` dan keyin qayta olinadi.
 * Natija: qulf vaqti (bo'shatish/yakuniy yozuv sharti) yoki xato.
 */
export async function acquireLock(
  ctx: ProductionCtx,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  M: Model<any>,
  doc: { _id: Types.ObjectId; rev?: number },
  statuses: readonly string[],
): Promise<OpResult<Date>> {
  const now = new Date();
  const stale = new Date(now.getTime() - L.staleLockMs);
  const res = await M.updateOne(
    {
      _id: doc._id,
      rev: doc.rev ?? 0,
      status: { $in: statuses },
      $or: [{ postingAt: { $exists: false } }, { postingAt: null }, { postingAt: { $lt: stale } }],
    },
    { $set: { postingAt: now }, $inc: { rev: 1 } },
  );
  if (res.modifiedCount === 1) return ok(now);
  const fresh = await M.findById(doc._id).select('status postingAt').lean<{ status: string; postingAt?: Date }>();
  if (!fresh || !statuses.includes(fresh.status)) return fail(ctx.d, 'badTransition');
  if (fresh.postingAt && new Date(fresh.postingAt) >= stale) return fail(ctx.d, 'locked');
  return fail(ctx.d, 'conflict');
}

/** Qulfni bo'shatish (xatoda) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function releaseLock(M: Model<any>, id: Types.ObjectId, at: Date): Promise<void> {
  await M.updateOne({ _id: id, postingAt: at }, { $unset: { postingAt: 1 }, $inc: { rev: 1 } });
}
