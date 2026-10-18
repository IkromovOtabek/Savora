/**
 * Muhit o'zgaruvchilarini (env) tekshirish.
 *
 * Production'da server ishga tushayotganda (instrumentation.ts → register()) chaqiriladi:
 * majburiy qiymat yo'q yoki xavfli bo'lsa — server ishga TUSHMAYDI va aniq o'zbekcha
 * xabar logga yoziladi. Dev'da faqat ogohlantiradi.
 *
 * Sof funksiya (`validateEnv`) — test qilinadi (tests/env.test.ts).
 * Hech qachon sir qiymatining o'zini xabarga chiqarmaydi — faqat nomi va muammo.
 */

type Env = Record<string, string | undefined>;

export interface EnvReport {
  errors: string[];
  warnings: string[];
}

/** .env.example / docker-compose'dagi namunaviy qiymatlar — production'da ishlatib bo'lmaydi */
const KNOWN_PLACEHOLDERS = new Set([
  'savdopro-super-secret-change-this-32chars',
  'change-this-in-production-32chars-min',
  'ci-dummy-session-secret-32-characters-long',
  'dev-only-session-secret-change-in-prod-32ch',
  'your-cron-secret-here',
  'change-me',
  'changeme',
]);

const TELEGRAM_SECRET_RE = /^[A-Za-z0-9_-]{1,256}$/;

function val(env: Env, key: string): string {
  return (env[key] ?? '').trim();
}

function isHttpUrl(s: string): URL | null {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Env'ni tekshiradi. `production` — qat'iy rejim (xatolar), aks holda xatolar ham
 * ogohlantirish sifatida qaytadi (dev'da ishlashga to'sqinlik qilmaydi).
 */
export function validateEnv(env: Env, production = env.NODE_ENV === 'production'): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── MongoDB ──
  const mongo = val(env, 'MONGO_URI');
  if (!mongo) {
    errors.push("MONGO_URI o'rnatilmagan — MongoDB ulanish manzili majburiy (masalan mongodb://mongo:27017).");
  } else if (!/^mongodb(\+srv)?:\/\//.test(mongo)) {
    errors.push('MONGO_URI noto\'g\'ri: "mongodb://" yoki "mongodb+srv://" bilan boshlanishi kerak.');
  }
  if (!val(env, 'MASTER_DB_NAME')) {
    warnings.push("MASTER_DB_NAME o'rnatilmagan — standart 'savdopro_master' ishlatiladi. Mavjud bazangiz nomini aniq yozing.");
  }

  // ── Sessiya ──
  const session = val(env, 'SESSION_SECRET');
  if (!session) {
    errors.push("SESSION_SECRET o'rnatilmagan — sessiya shifrlash kaliti majburiy (kamida 32 belgi). Yaratish: openssl rand -base64 48");
  } else if (session.length < 32) {
    errors.push(`SESSION_SECRET juda qisqa (${session.length} belgi) — kamida 32 belgi bo'lishi shart. Yaratish: openssl rand -base64 48`);
  } else if (KNOWN_PLACEHOLDERS.has(session)) {
    errors.push("SESSION_SECRET namunaviy (.env.example) qiymatda qolgan — yangi tasodifiy kalit yarating: openssl rand -base64 48");
  }

  // ── Domen va URL ──
  const root = val(env, 'ROOT_DOMAIN');
  if (!root) {
    errors.push("ROOT_DOMAIN o'rnatilmagan — asosiy domen majburiy (masalan savora.uz).");
  } else if (/^https?:\/\//.test(root) || root.includes('/')) {
    errors.push('ROOT_DOMAIN faqat domen bo\'lishi kerak, "https://" va "/" siz (masalan savora.uz).');
  } else if (production && (root === 'lvh.me' || root === 'localhost')) {
    warnings.push(`ROOT_DOMAIN="${root}" — bu lokal dev domeni. Production'da haqiqiy domen yozing (masalan savora.uz).`);
  }
  const pubRoot = val(env, 'NEXT_PUBLIC_ROOT_DOMAIN');
  if (root && pubRoot && pubRoot !== root) {
    warnings.push(`NEXT_PUBLIC_ROOT_DOMAIN ("${pubRoot}") ROOT_DOMAIN ("${root}") bilan bir xil emas — havolalar noto'g'ri bo'lishi mumkin.`);
  }

  const appUrlRaw = val(env, 'NEXT_PUBLIC_APP_URL');
  if (!appUrlRaw) {
    errors.push("NEXT_PUBLIC_APP_URL o'rnatilmagan — saytning to'liq manzili majburiy (masalan https://savora.uz).");
  } else {
    const u = isHttpUrl(appUrlRaw);
    if (!u) {
      errors.push('NEXT_PUBLIC_APP_URL noto\'g\'ri URL — "https://savora.uz" ko\'rinishida yozing.');
    } else {
      if (production && u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        warnings.push("NEXT_PUBLIC_APP_URL https emas — production'da SSL (https://) majburiy tavsiya etiladi (cookie 'secure').");
      }
      if (appUrlRaw.endsWith('/')) {
        warnings.push('NEXT_PUBLIC_APP_URL oxirida "/" bor — olib tashlang (https://savora.uz).');
      }
    }
  }

  const pathRouting = val(env, 'NEXT_PUBLIC_USE_PATH_ROUTING');
  if (pathRouting && pathRouting !== 'true' && pathRouting !== 'false') {
    warnings.push('NEXT_PUBLIC_USE_PATH_ROUTING faqat "true" yoki "false" bo\'lishi mumkin.');
  }

  // ── Cron ──
  const cron = val(env, 'CRON_SECRET');
  if (!cron) {
    errors.push("CRON_SECRET o'rnatilmagan — /api/cron/* so'rovlari himoyasi uchun majburiy. Yaratish: openssl rand -hex 32");
  } else if (KNOWN_PLACEHOLDERS.has(cron)) {
    errors.push('CRON_SECRET namunaviy qiymatda qolgan — yangisini yarating: openssl rand -hex 32');
  } else if (cron.length < 16) {
    errors.push(`CRON_SECRET juda qisqa (${cron.length} belgi) — kamida 16 belgi. Yaratish: openssl rand -hex 32`);
  }

  // ── Telegram ──
  const tgToken = val(env, 'TELEGRAM_BOT_TOKEN');
  const tgSecret = val(env, 'TELEGRAM_WEBHOOK_SECRET');
  if (tgToken) {
    if (!tgSecret) {
      errors.push("TELEGRAM_BOT_TOKEN bor, lekin TELEGRAM_WEBHOOK_SECRET yo'q — webhook barcha so'rovni rad etadi. Yaratish: openssl rand -hex 32");
    } else if (!TELEGRAM_SECRET_RE.test(tgSecret)) {
      errors.push("TELEGRAM_WEBHOOK_SECRET faqat A-Z a-z 0-9 _ - belgilardan iborat bo'lishi kerak (1–256). Yaratish: openssl rand -hex 32");
    }
    if (!val(env, 'TELEGRAM_BOT_USERNAME')) {
      warnings.push("TELEGRAM_BOT_USERNAME o'rnatilmagan — Telegram ulash havolasi ishlamaydi.");
    }
  }

  // ── Ixtiyoriy integratsiyalar: qisman sozlash xatosi ──
  const r2Keys = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'];
  const r2Set = r2Keys.filter((k) => val(env, k));
  // R2_BUCKET / R2_PUBLIC_URL .env.example'da standart qiymat bilan keladi — faqat kalitlar bo'yicha baholaymiz
  const r2Creds = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter((k) => val(env, k));
  if (r2Creds.length > 0 && r2Set.length < r2Keys.length) {
    const missing = r2Keys.filter((k) => !val(env, k)).join(', ');
    warnings.push(`R2 qisman sozlangan — yetishmayapti: ${missing}. Fayllar lokal diskka saqlanadi (volume shart).`);
  } else if (production && r2Creds.length === 0) {
    warnings.push("R2 sozlanmagan — rasmlar lokal public/uploads ga saqlanadi. Docker'da uploads volume ulanganiga ishonch hosil qiling.");
  }

  const eskiz = ['ESKIZ_EMAIL', 'ESKIZ_PASSWORD'].filter((k) => val(env, k));
  if (eskiz.length === 1) {
    warnings.push('Eskiz SMS qisman sozlangan — ESKIZ_EMAIL va ESKIZ_PASSWORD ikkalasi kerak. SMS yuborilmaydi.');
  }

  const hook = val(env, 'ERROR_WEBHOOK_URL');
  if (hook) {
    const u = isHttpUrl(hook);
    if (!u) warnings.push("ERROR_WEBHOOK_URL noto'g'ri URL — xato xabarlari yuborilmaydi.");
    else if (production && u.protocol !== 'https:') warnings.push('ERROR_WEBHOOK_URL https emas — xato tafsilotlari shifrlanmasdan yuboriladi.');
  }

  const redis = val(env, 'REDIS_URL');
  if (redis && !/^rediss?:\/\//.test(redis)) warnings.push("REDIS_URL redis:// yoki rediss:// bilan boshlanishi kerak — rate-limit xotirada ishlaydi.");

  const sentry = val(env, 'SENTRY_DSN');
  if (sentry && !isHttpUrl(sentry)) warnings.push("SENTRY_DSN noto'g'ri URL — Sentry ishlamaydi.");

  if (!production) {
    // Dev: hech narsa server ishini to'xtatmaydi
    return { errors: [], warnings: [...errors, ...warnings] };
  }
  return { errors, warnings };
}

/** Xatolarni bitta o'qiladigan matnga yig'adi */
export function formatEnvReport(report: EnvReport): string {
  const lines: string[] = [];
  if (report.errors.length) {
    lines.push(`Savora: muhit sozlamalarida ${report.errors.length} ta xato — server ishga tushirilmadi.`);
    report.errors.forEach((e, i) => lines.push(`  ${i + 1}. ${e}`));
    lines.push("  Tuzatish: .env (yoki docker-compose env_file) ni to'ldiring — qarang: web/docs/DEPLOY.md");
  }
  if (report.warnings.length) {
    lines.push(`Savora: ${report.warnings.length} ta ogohlantirish:`);
    report.warnings.forEach((w) => lines.push(`  - ${w}`));
  }
  return lines.join('\n');
}

/**
 * Server start'da chaqiriladi. Production'da xato bo'lsa — Error tashlaydi.
 * Build bosqichida (next build) tekshirilmaydi: sirlar faqat runtime'da beriladi.
 */
export function assertEnv(env: Env = process.env): EnvReport {
  if (env.NEXT_PHASE === 'phase-production-build') return { errors: [], warnings: [] };
  const report = validateEnv(env);
  const text = formatEnvReport(report);
  if (report.errors.length) {
    throw new Error(text);
  }
  if (text) console.warn(text);
  return report;
}

/**
 * instrumentation.ts → register() dan chaqiriladi. Faqat production server start'ida
 * ishlaydi; xato bo'lsa aniq xabar chiqarib jarayonni to'xtatadi (exit 1).
 */
export function startupEnvCheck(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  try {
    assertEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
