import type { AiHealth, AiPriority, AiResult, AiRole } from './types';

/**
 * AI javobini himoyali tekshirish: noma'lum maydonlar tashlanadi, satrlar qisqartiriladi,
 * enum'lar tekshiriladi. Asosiy maydonlar yaroqsiz bo'lsa — null (qoidalarga o'tiladi).
 * Sof funksiya — client'da ham ishlaydi.
 */

const HEALTH: readonly AiHealth[] = ['yaxshi', 'o\'rta', 'xavfli'];
const PRIORITY: readonly AiPriority[] = ['yuqori', 'o\'rta', 'past'];
const ROLES: readonly AiRole[] = ['owner', 'director', 'seller', 'cashier'];

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  // Uzluksiz bo'shliq (NBSP — summalardagi minglik ajratuvchi) saqlanadi
  const t = v.replace(/[^\S ]+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function normPriority(v: unknown): AiPriority {
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase().replace(/[‘’ʻʼ`]/g, '\'');
    if ((PRIORITY as readonly string[]).includes(t)) return t as AiPriority;
    if (t === 'orta' || t === 'medium') return 'o\'rta';
    if (t === 'high') return 'yuqori';
    if (t === 'low') return 'past';
  }
  return 'o\'rta';
}

function normHealth(v: unknown): AiHealth | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase().replace(/[‘’ʻʼ`]/g, '\'');
  if ((HEALTH as readonly string[]).includes(t)) return t as AiHealth;
  if (t === 'orta') return 'o\'rta';
  return null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Matndan birinchi JSON obyektni ajratib oladi (```json ... ``` o'ramlarini ham) */
export function extractJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* davom etamiz */
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseAiResult(raw: unknown): AiResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const summary = str(o.summary, 600);
  const health = normHealth(o.health);
  if (!summary || !health) return null;

  const insights = arr(o.insights).flatMap((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const title = str(r.title, 120);
    const detail = str(r.detail, 500);
    if (!title || !detail) return [];
    const metric = str(r.metric, 40);
    return [metric ? { title, detail, metric } : { title, detail }];
  }).slice(0, 8);

  const recommendations = arr(o.recommendations).flatMap((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const title = str(r.title, 120);
    const detail = str(r.detail, 600);
    if (!title || !detail) return [];
    return [{ title, detail, priority: normPriority(r.priority), impact: str(r.impact, 160) ?? '' }];
  }).slice(0, 6);

  const tasks = arr(o.tasks).flatMap((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const title = str(r.title, 120);
    const detail = str(r.detail, 600) ?? '';
    if (!title) return [];
    const role = typeof r.role === 'string' && (ROLES as readonly string[]).includes(r.role) ? (r.role as AiRole) : 'owner';
    const n = Number(r.dueInDays);
    const dueInDays = Number.isFinite(n) ? Math.min(30, Math.max(0, Math.round(n))) : 3;
    return [{ title, detail, role, dueInDays }];
  }).slice(0, 6);

  return { summary, health, insights, recommendations, tasks };
}
