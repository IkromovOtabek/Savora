/**
 * Tarmoq holati mashinasi — SOF hisob (React / React Native importsiz, `node --test` bilan tekshiriladi).
 * Ish vaqti qismi (ping taymeri, AppState, obuna) — `net.ts`.
 *
 * Uch holat: online · slow · offline. Kirish va chiqish chegaralari har xil (gisterezis) — holat chayqalmaydi.
 *  - online → slow:    EWMA kechikish > 2,5 s (kamida 3 namuna) yoki kichik GET timeout
 *  - slow → online:    ketma-ket 3 namunada < 1,2 s
 *  - → offline:        2 ketma-ket javobsiz so'rov (tarmoq xatosi yoki timeout)
 *  - offline → online: 2 muvaffaqiyatli ping (orasi ≥ 5 s) va kamida 15 s oflaynda turgan
 * Faqat o'chiriladigan TS sintaksisi (enum/namespace yo'q) — Node type stripping bilan to'g'ridan-to'g'ri ishlaydi.
 */

export type NetState = 'online' | 'slow' | 'offline';

export interface NetRules {
  /** EWMA silliqlash koeffitsiyenti */
  alpha: number;
  slowEnterMs: number;
  slowMinSamples: number;
  slowExitMs: number;
  slowExitStreak: number;
  offlineFailStreak: number;
  onlineOkStreak: number;
  /** Oflayndan chiqish: hisoblanadigan ikki ping orasidagi eng kam vaqt */
  okMinGapMs: number;
  offlineMinMs: number;
  /** Oflayn/sekinda ping oralig'i — har «natijasiz» pingdan keyin keyingisiga o'tadi */
  pingDelaysMs: readonly number[];
}

/** Boshlang'ich qiymatlar (taklif §3.2) — real foydalanishda sozlanadi */
export const NET_RULES: NetRules = {
  alpha: 0.3,
  slowEnterMs: 2500,
  slowMinSamples: 3,
  slowExitMs: 1200,
  slowExitStreak: 3,
  offlineFailStreak: 2,
  onlineOkStreak: 2,
  okMinGapMs: 5000,
  offlineMinMs: 15000,
  pingDelaysMs: [5000, 10000, 20000, 40000, 60000],
};

export interface NetModel {
  state: NetState;
  /** Joriy holatga o'tilgan vaqt (ms) */
  since: number;
  /** Kechikishning eksponensial o'rtachasi (ms); holat almashganda boshidan */
  ewma: number | null;
  /** EWMA'ga tushgan namunalar soni (joriy holatda) */
  samples: number;
  /** Sekin holatda: ketma-ket tez (< slowExitMs) namunalar */
  fastStreak: number;
  /** Ketma-ket javobsiz so'rovlar (tarmoq xatosi yoki timeout) */
  failStreak: number;
  /** Oflaynda: hisoblangan muvaffaqiyatli pinglar (har biri oldingisidan ≥ okMinGapMs keyin) */
  okStreak: number;
  /** Oxirgi hisoblangan muvaffaqiyatli ping vaqti */
  lastOkAt: number | null;
  /** Ping oralig'i qadami (pingDelaysMs indeksi); natija bo'lsa 0 ga qaytadi */
  pingStep: number;
}

export type NetEvent =
  /** Kichik GET javob berdi — `ms` sarlavhalar kelguncha o'tgan vaqt */
  | { type: 'sample'; ms: number; at: number }
  /** Boshqa so'rov (POST, katta GET) javob oldi — server yetib boriladi, kechikish hisoblanmaydi */
  | { type: 'reach'; at: number }
  /** So'rov vaqti tugadi; `small` — kichik GET (online → slow signali) */
  | { type: 'timeout'; small: boolean; at: number }
  /** Javob kelmadi (internet yo'q, DNS, ulanish uzildi) */
  | { type: 'fail'; at: number }
  /** `/api/health?live=1` ping natijasi */
  | { type: 'ping'; ok: boolean; ms: number; at: number }
  /** Ilova fondan qaytdi — ping oralig'i boshidan (5 s) */
  | { type: 'wake'; at: number };

export function initialNet(at: number): NetModel {
  return { state: 'online', since: at, ewma: null, samples: 0, fastStreak: 0, failStreak: 0, okStreak: 0, lastOkAt: null, pingStep: 0 };
}

/** EWMA qadami: birinchi namuna — o'zi, keyin α·x + (1−α)·oldingi */
export function ewmaNext(prev: number | null, x: number, alpha: number = NET_RULES.alpha): number {
  return prev === null ? x : alpha * x + (1 - alpha) * prev;
}

/** Yangi holatga o'tish — hisoblagichlar boshidan (eski holat namunalari yangisiga ta'sir qilmasin) */
function enter(m: NetModel, state: NetState, at: number): NetModel {
  return { ...m, state, since: at, ewma: null, samples: 0, fastStreak: 0, okStreak: 0, lastOkAt: null, pingStep: 0 };
}

/** Javobsiz so'rov: tarmoq xatosi, timeout yoki muvaffaqiyatsiz ping */
function onFail(m: NetModel, at: number, smallTimeout: boolean, isPing: boolean, R: NetRules): NetModel {
  const failStreak = m.failStreak + 1;
  if (m.state !== 'offline' && failStreak >= R.offlineFailStreak) return { ...enter(m, 'offline', at), failStreak };
  if (m.state === 'online' && smallTimeout) return { ...enter(m, 'slow', at), failStreak };
  return {
    ...m,
    failStreak,
    fastStreak: 0,
    // Oflaynda tasdiq zanjiri uziladi: yana 2 ta ketma-ket muvaffaqiyat kerak
    okStreak: m.state === 'offline' ? 0 : m.okStreak,
    lastOkAt: m.state === 'offline' ? null : m.lastOkAt,
    pingStep: isPing ? m.pingStep + 1 : m.pingStep,
  };
}

/** Oflaynda muvaffaqiyatli javob (ping yoki boshqa so'rov) — chiqish shartini tekshiradi */
function onOfflineOk(m: NetModel, at: number, R: NetRules): NetModel {
  const counts = m.lastOkAt === null || at - m.lastOkAt >= R.okMinGapMs;
  const okStreak = counts ? m.okStreak + 1 : m.okStreak;
  const lastOkAt = counts ? at : m.lastOkAt;
  if (okStreak >= R.onlineOkStreak && at - m.since >= R.offlineMinMs) return enter(m, 'online', at);
  // Javob keldi (ping yoki foydalanuvchi tortib yangiladi) — tasdiq pingi tez (5 s) bo'lsin
  return { ...m, failStreak: 0, okStreak, lastOkAt, pingStep: 0 };
}

/** Kechikish namunasi (online/slow) */
function onSample(m: NetModel, ms: number, at: number, isPing: boolean, R: NetRules): NetModel {
  const ewma = ewmaNext(m.ewma, ms, R.alpha);
  const samples = m.samples + 1;
  if (m.state === 'online') {
    if (samples >= R.slowMinSamples && ewma > R.slowEnterMs) return enter(m, 'slow', at);
    return { ...m, failStreak: 0, ewma, samples };
  }
  // slow
  const fast = ms < R.slowExitMs;
  const fastStreak = fast ? m.fastStreak + 1 : 0;
  if (fastStreak >= R.slowExitStreak) return enter(m, 'online', at);
  return { ...m, failStreak: 0, ewma, samples, fastStreak, pingStep: isPing ? (fast ? 0 : m.pingStep + 1) : m.pingStep };
}

/** Holat mashinasining yagona kirish nuqtasi (sof: bir xil kirish — bir xil natija) */
export function netReduce(m: NetModel, e: NetEvent, R: NetRules = NET_RULES): NetModel {
  switch (e.type) {
    case 'fail':
      return onFail(m, e.at, false, false, R);
    case 'timeout':
      return onFail(m, e.at, e.small, false, R);
    case 'ping':
      if (!e.ok) return onFail(m, e.at, false, true, R);
      return m.state === 'offline' ? onOfflineOk(m, e.at, R) : onSample(m, e.ms, e.at, true, R);
    case 'sample':
      return m.state === 'offline' ? onOfflineOk(m, e.at, R) : onSample(m, e.ms, e.at, false, R);
    case 'reach':
      return m.state === 'offline' ? onOfflineOk(m, e.at, R) : (m.failStreak === 0 ? m : { ...m, failStreak: 0 });
    case 'wake':
      return m.pingStep === 0 ? m : { ...m, pingStep: 0 };
  }
}

/** Keyingi pingacha kutish (ms); online'da alohida ping yo'q — null */
export function nextPingDelay(m: NetModel, R: NetRules = NET_RULES): number | null {
  if (m.state === 'online') return null;
  const ds = R.pingDelaysMs;
  return ds[Math.min(m.pingStep, ds.length - 1)];
}
