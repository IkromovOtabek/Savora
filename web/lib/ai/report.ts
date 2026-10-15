import type { Connection, Model } from 'mongoose';
import type { getTenantModels } from '../tenantDb';
import type { SessionUser } from '../session';
import { counterSchema, ICounter } from '../models/tenant/Counter';
import type { AiReportDoc } from '../models/tenant/AiReport';
import { buildSnapshot, dayKey, scopeKeyOf, snapshotHash } from './snapshot';
import { aiConfigured, analyzeSnapshot } from './analyze';
import { parseAiResult } from './validate';
import { AI_DAILY_LIMIT, type AiResult, type AiSource } from './types';

type TenantModels = Awaited<ReturnType<typeof getTenantModels>>;
type ReportUser = Pick<SessionUser, 'role' | 'branchId' | 'username'>;

/** Sahifa/mobil uchun serializatsiya qilingan hisobot */
export interface AiReportView {
  id: string;
  source: AiSource;
  model: string;
  createdAt: string;
  day: string;
  result: AiResult;
  /** tavsiya indeksi → Task id */
  addedTasks: Record<string, string>;
  fallbackReason?: string;
}

export function toReportView(r: AiReportDoc): AiReportView {
  return {
    id: String(r._id),
    source: r.source,
    model: r.model,
    createdAt: new Date(r.createdAt ?? Date.now()).toISOString(),
    day: r.day,
    // Bazadagi natija ham himoyali o'qiladi (eski/buzilgan yozuv sahifani yiqitmasin)
    result: parseAiResult(r.result) ?? { summary: '—', health: 'o\'rta', insights: [], recommendations: [], tasks: [] },
    addedTasks: r.addedTasks ?? {},
    fallbackReason: r.fallbackReason,
  };
}

/** Shu doiradagi eng oxirgi hisobot. todayOnly — faqat bugungi (kunlik kesh). */
export async function getLatestReport(
  models: Pick<TenantModels, 'AiReport'>,
  user: Pick<SessionUser, 'role' | 'branchId'>,
  opts: { todayOnly?: boolean } = {},
): Promise<AiReportDoc | null> {
  const filter: Record<string, unknown> = { scopeKey: scopeKeyOf(user) };
  if (opts.todayOnly) filter.day = dayKey();
  return models.AiReport.findOne(filter).sort({ createdAt: -1 }).lean<AiReportDoc>();
}

function counterModel(conn: Connection): Model<ICounter> {
  return (conn.models.Counter as Model<ICounter>) || conn.model<ICounter>('Counter', counterSchema);
}

/**
 * Kunlik limit — atomik. `seq < limit` sharti bilan $inc; limitga yetganda upsert
 * dublikat kalit xatosini beradi → false. Parallel bosishlarda ham limit oshmaydi.
 */
export async function consumeDailySlot(conn: Connection, day = dayKey(), limit = AI_DAILY_LIMIT): Promise<boolean> {
  const Counter = counterModel(conn);
  try {
    const doc = await Counter.findOneAndUpdate(
      { _id: `ai:${day}`, seq: { $lt: limit } },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    ).lean();
    return !!doc && doc.seq <= limit;
  } catch {
    return false;
  }
}

/** Bugun ishlatilgan tahlillar soni (UI uchun) */
export async function usedToday(conn: Connection): Promise<number> {
  const doc = await counterModel(conn).findById(`ai:${dayKey()}`).lean();
  return doc?.seq ?? 0;
}

export type RunOutcome =
  | { status: 'created'; report: AiReportDoc }
  | { status: 'cached'; report: AiReportDoc }
  | { status: 'limited'; report: AiReportDoc | null };

/**
 * Tahlil: snapshot → (o'zgarmagan bo'lsa kesh) → limit → AI/qoidalar → ai_reports.
 * Ma'lumot o'zgarmagan va bugungi hisobot AI'dan bo'lsa — qayta chaqirilmaydi (pul tejaladi).
 */
export async function runAnalysis(
  models: TenantModels,
  user: ReportUser,
  opts: { businessType?: string } = {},
): Promise<RunOutcome> {
  const snapshot = await buildSnapshot(models, user, { businessType: opts.businessType });
  const hash = snapshotHash(snapshot);
  const latest = await getLatestReport(models, user, { todayOnly: true });

  if (latest && latest.snapshotHash === hash && (latest.source === 'ai' || !aiConfigured())) {
    return { status: 'cached', report: latest };
  }

  if (!(await consumeDailySlot(models.conn))) {
    return { status: 'limited', report: latest };
  }

  const analysis = await analyzeSnapshot(snapshot);
  const created = await models.AiReport.create({
    day: dayKey(),
    scopeKey: scopeKeyOf(user),
    source: analysis.source,
    model: analysis.model,
    snapshotHash: hash,
    snapshot,
    result: analysis.result,
    fallbackReason: analysis.fallbackReason,
    createdBy: user.username,
  });
  return { status: 'created', report: created.toObject() as AiReportDoc };
}

/** Bugungi hisobot bor bo'lsa — o'sha; bo'lmasa yangisini yaratadi (sahifa birinchi ochilganda) */
export async function getOrCreateTodayReport(
  models: TenantModels,
  user: ReportUser,
  opts: { businessType?: string } = {},
): Promise<{ report: AiReportDoc | null; limited: boolean }> {
  const today = await getLatestReport(models, user, { todayOnly: true });
  if (today) return { report: today, limited: false };
  const out = await runAnalysis(models, user, opts);
  if (out.status === 'limited') {
    return { report: out.report ?? (await getLatestReport(models, user)), limited: true };
  }
  return { report: out.report, limited: false };
}

/** Qoidalar/AI sababi — foydalanuvchiga tushunarli izoh */
export function fallbackReasonLabel(reason?: string): string | null {
  if (!reason) return null;
  if (reason === 'no_key') return 'AI kaliti sozlanmagan — qoidalar asosida tahlil.';
  if (reason === 'timeout') return 'AI 30 soniyada javob bermadi — qoidalar asosida tahlil.';
  if (reason === 'refusal') return 'AI so\'rovni rad etdi — qoidalar asosida tahlil.';
  return 'AI vaqtincha ishlamadi — qoidalar asosida tahlil.';
}
