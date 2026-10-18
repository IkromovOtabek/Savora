import { z } from 'zod';
import { Types } from 'mongoose';

/**
 * Kiruvchi ma'lumot (FormData / JSON body) uchun zod sxemalari — server action va mobil API'da
 * qo'lda `String(formData.get(...))` parsing o'rniga.
 *
 * Xato xabarlari lug'atdan beriladi (uz/ru) — shuning uchun sxemalar so'rov ichida `m` bilan quriladi:
 *   const r = parseInput(z.object({ saleId: zId(m.saleNotFound) }), formToObject(formData));
 *   if (!r.ok) return { error: r.error };
 */

/** FormData → oddiy obyekt (har kalitning birinchi qiymati, fayllar tashlab yuboriladi) */
export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (k in out || typeof v !== 'string') continue;
    out[k] = v;
  }
  return out;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Sxema bo'yicha tekshirish; xato bo'lsa birinchi xabar (lug'atdagi matn) qaytadi */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown, fallback = 'Invalid input'): ParseResult<z.output<S>> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  // Dev'da qaysi maydon yiqilganini ko'rsatadi (prod logiga shaxsiy ma'lumot tushmasin)
  if (process.env.NODE_ENV === 'development') {
    console.warn('[validation]', r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
  }
  const msg = r.error.issues[0]?.message;
  return { ok: false, error: msg && !msg.startsWith('Invalid') && !msg.startsWith('Expected') ? msg : fallback };
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/**
 * Har maydon uchun asos: qiymatni o'zgartiruvchi funksiya.
 * MUHIM: z.preprocess bilan o'ralgan — zod 4'da obyektda umuman YO'Q kalit oddiy
 * `z.unknown().transform()` dan o'tmaydi ("expected nonoptional" xatosi beradi);
 * formada ko'rsatilmagan maydon (masalan naqd sotuvda "bankName") bo'lishi tabiiy.
 */
export function zField<T>(fn: (v: unknown, ctx: z.RefinementCtx) => T) {
  return z.preprocess((v) => v, z.unknown().transform(fn));
}

/** Mongo ObjectId (24 hex) */
export const zId = (message: string) =>
  zField((v, ctx) => {
    const s = str(v).trim();
    if (!s || !Types.ObjectId.isValid(s) || !/^[a-f0-9]{24}$/i.test(s)) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return s;
  });

/** Ixtiyoriy ObjectId: bo'sh → undefined, noto'g'ri → xato */
export const zOptId = (message: string) =>
  zField((v, ctx) => {
    const s = str(v).trim();
    if (!s) return undefined;
    if (!Types.ObjectId.isValid(s) || !/^[a-f0-9]{24}$/i.test(s)) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return s;
  });

/** Matn: trim + uzunlik chegarasi (ortig'i kesiladi emas — xato). Bo'sh bo'lishi mumkin. */
export const zText = (max: number, message = `Max ${max}`) =>
  zField((v, ctx) => {
    const s = str(v).trim();
    if (s.length > max) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return s;
  });

/** Majburiy matn */
export const zReqText = (max: number, requiredMsg: string, tooLongMsg = requiredMsg) =>
  zField((v, ctx) => {
    const s = str(v).trim();
    if (!s) {
      ctx.addIssue({ code: 'custom', message: requiredMsg });
      return z.NEVER;
    }
    if (s.length > max) {
      ctx.addIssue({ code: 'custom', message: tooLongMsg });
      return z.NEVER;
    }
    return s;
  });

/**
 * So'm summasi — butun, manfiy emas, xavfsiz butun son (bo'shliqlar olib tashlanadi: "1 200 000").
 * `min` — eng kichik ruxsat (masalan to'lov uchun 1). `optional` — bo'sh qiymat `fallback` bo'ladi.
 */
export const zMoney = (message: string, opts: { min?: number; optional?: boolean; fallback?: number } = {}) =>
  zField((v, ctx) => {
    const s = str(v).replace(/\s/g, '');
    if (s === '' && opts.optional) return opts.fallback ?? 0;
    const n = typeof v === 'number' ? v : Number(s);
    if (s === '' || !Number.isSafeInteger(n) || n < (opts.min ?? 0)) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return n;
  });

/** Butun son oralig'i (dona, oy) — majburiy */
export const zInt = (message: string, min: number, max: number) =>
  zField((v, ctx) => {
    const n = Number(str(v).trim());
    if (str(v).trim() === '' || !Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return n;
  });

/** Ixtiyoriy butun son: bo'sh → undefined */
export const zOptInt = (message: string, min: number, max: number) =>
  zField((v, ctx) => {
    const s = str(v).trim();
    if (s === '') return undefined;
    const n = Number(s);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return n;
  });

/** Ro'yxatdagi qiymatlardan biri */
export const zOneOf = <const T extends readonly [string, ...string[]]>(values: T, message: string) =>
  zField((v, ctx) => {
    const s = str(v);
    if (!(values as readonly string[]).includes(s)) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return s as T[number];
  });

/** Sana (YYYY-MM-DD yoki ISO) — majburiy */
export const zDate = (message: string, opts: { requiredMessage?: string } = {}) =>
  zField((v, ctx) => {
    const s = str(v).trim();
    const d = new Date(s);
    if (!s || Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: !s && opts.requiredMessage ? opts.requiredMessage : message });
      return z.NEVER;
    }
    return d;
  });

/** Ixtiyoriy sana: bo'sh → undefined, noto'g'ri → xato */
export const zOptDate = (message: string) =>
  zField((v, ctx) => {
    const s = str(v).trim();
    if (!s) return undefined;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return d;
  });

/** Checkbox ("on") */
export const zCheckbox = () => zField((v) => v === 'on' || v === true || v === 'true');

/** Mobil API: JSON body'ni o'qib, sxema bo'yicha tekshiradi (buzuq JSON → `badJson` xabari) */
export async function readJsonInput<S extends z.ZodType>(
  req: Request,
  schema: S,
  messages: { badJson: string; fallback: string },
): Promise<ParseResult<z.output<S>>> {
  let body: unknown;
  try { body = await req.json(); } catch { return { ok: false, error: messages.badJson }; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: messages.badJson };
  return parseInput(schema, body, messages.fallback);
}
