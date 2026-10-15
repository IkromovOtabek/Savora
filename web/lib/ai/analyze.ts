import { ruleBasedAnalysis } from './rules';
import { extractJson, parseAiResult } from './validate';
import type { AiResult, AiSnapshot, AiSource } from './types';

/**
 * Claude (Anthropic Messages API) bilan tahlil. SDK o'rnatilmagan — rasmiy REST API'ga
 * to'g'ridan-to'g'ri `fetch` (qo'shimcha bog'liqliksiz).
 *
 * Muhit:
 *   ANTHROPIC_API_KEY — bo'lmasa AI chaqirilmaydi, qoidalar dvigateli ishlaydi
 *   ANTHROPIC_MODEL   — ixtiyoriy (standart: claude-sonnet-5-5)
 *
 * Yuboriladigan ma'lumot — faqat AiSnapshot (agregat ko'rsatkichlar, shaxsiy ma'lumotsiz).
 */

export const DEFAULT_AI_MODEL = 'claude-sonnet-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 30_000;
/** Server tomonida rad etilgan (refusal) so'rovni boshqa modelda qayta urinish — faqat shu modellarda */
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);

export function aiModel(): string {
  return (process.env.ANTHROPIC_MODEL || '').trim() || DEFAULT_AI_MODEL;
}

export function aiConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || '').trim();
}

export const SYSTEM_PROMPT = `Siz O'zbekistondagi chakana savdo va nasiya (bo'lib to'lash) bizneslari bo'yicha tajribali (senior) biznes-tahlilchisiz.
Sizga do'konning oxirgi 30 kunlik AGREGAT ko'rsatkichlari JSON ko'rinishida beriladi (summalar so'mda, UZS).

Vazifa: do'kon egasiga qisqa, aniq va amaliy tahlil bering.
- Faqat berilgan raqamlarga tayaning; ma'lumot yo'q narsani to'qimang. Raqam keltirsangiz, u snapshotdan bo'lsin.
- Muhim: tushum dinamikasi (haftama-hafta), o'rtacha chek, to'lov turlari ulushi, eng daromadli mahsulotlar,
  qoldig'i oz tovarlar, qarz/nasiya portfeli va muddati o'tgan savatlar (1-30, 31-60, 61-90, 90+ kun), yaqin to'lovlar, filiallar farqi.
- Nasiya bo'yicha qonunchilikni hisobga oling: PQ-294 qarori asosida 2027-yildan bo'lib to'lash muddati 12 oydan oshmasligi,
  yillik ustama va barcha to'lovlar 50% dan oshmasligi kerak. Faol nasiyalarda 12 oydan uzun muddat bo'lsa, buni ogohlantiring.
- Tavsiyalar O'zbekiston bozoriga mos bo'lsin (Telegram/SMS eslatma, naqd chegirma, bozor mavsumiyligi, kafil va hujjatlar).
- Topshiriqlar aniq bajariladigan bo'lsin: kim (owner — egasi, director — filial rahbari, seller — sotuvchi, cashier — kassir) va necha kunda.
- health: "yaxshi" — barqaror; "o'rta" — e'tibor kerak; "xavfli" — zudlik bilan chora kerak (masalan muddati o'tgan qarz >30% yoki tushum keskin tushgan).
- Til: faqat o'zbek tili, lotin yozuvi. Qisqa yozing: summary 2-3 gap; insights 3-6 ta; recommendations 2-5 ta; tasks 1-5 ta.
- Ma'lumot juda kam bo'lsa (sotuv yo'q), buni summary'da ayting va ma'lumot kiritishni tavsiya qiling.
Javob — faqat belgilangan JSON sxemaga mos obyekt.`;

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    health: { type: 'string', enum: ['yaxshi', 'o\'rta', 'xavfli'] },
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, detail: { type: 'string' }, metric: { type: 'string' } },
        required: ['title', 'detail'],
        additionalProperties: false,
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          priority: { type: 'string', enum: ['yuqori', 'o\'rta', 'past'] },
          impact: { type: 'string' },
        },
        required: ['title', 'detail', 'priority', 'impact'],
        additionalProperties: false,
      },
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          role: { type: 'string', enum: ['owner', 'director', 'seller', 'cashier'] },
          dueInDays: { type: 'integer' },
        },
        required: ['title', 'detail', 'role', 'dueInDays'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'health', 'insights', 'recommendations', 'tasks'],
  additionalProperties: false,
} as const;

export type AnalyzeOutcome =
  | { ok: true; result: AiResult; model: string }
  | { ok: false; reason: string };

/** Claude'ga bitta so'rov. Hech qachon throw qilmaydi. */
export async function callClaude(snapshot: AiSnapshot): Promise<AnalyzeOutcome> {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) return { ok: false, reason: 'no_key' };
  const model = aiModel();
  const withFallback = FALLBACK_MODELS.has(model);
  const isHaiku = model.startsWith('claude-haiku');

  const body: Record<string, unknown> = {
    model,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Do'kon ko'rsatkichlari (agregat, ${snapshot.scope === 'branch' ? 'bitta filial' : 'barcha filiallar'}):\n${JSON.stringify(snapshot)}`,
      },
    ],
    output_config: {
      // 30 soniyalik chegaraga sig'ishi uchun — past effort (tahlil qisqa, sxemaga bog'langan)
      ...(isHaiku ? {} : { effort: 'low' }),
      format: { type: 'json_schema', schema: RESULT_SCHEMA },
    },
    ...(withFallback ? { fallbacks: 'default' } : {}),
  };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
  };
  if (withFallback) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal, cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as {
      model?: string;
      stop_reason?: string;
      content?: { type: string; text?: string }[];
      error?: { type?: string; message?: string };
    } | null;
    if (!res.ok || !data) {
      return { ok: false, reason: `http_${res.status}${data?.error?.type ? `:${data.error.type}` : ''}` };
    }
    if (data.stop_reason === 'refusal') return { ok: false, reason: 'refusal' };
    if (data.stop_reason === 'max_tokens') return { ok: false, reason: 'max_tokens' };
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    const parsed = parseAiResult(extractJson(text));
    if (!parsed) return { ok: false, reason: 'invalid_json' };
    return { ok: true, result: parsed, model: data.model || model };
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError';
    return { ok: false, reason: aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export interface AnalysisResult {
  source: AiSource;
  model: string;
  result: AiResult;
  fallbackReason?: string;
}

/** AI (kalit bo'lsa) → xato bo'lsa qoidalar. Natija shakli doim bir xil. */
export async function analyzeSnapshot(snapshot: AiSnapshot): Promise<AnalysisResult> {
  if (aiConfigured()) {
    const out = await callClaude(snapshot);
    if (out.ok) return { source: 'ai', model: out.model, result: out.result };
    return { source: 'rules', model: 'rules', result: ruleBasedAnalysis(snapshot), fallbackReason: out.reason };
  }
  return { source: 'rules', model: 'rules', result: ruleBasedAnalysis(snapshot), fallbackReason: 'no_key' };
}
