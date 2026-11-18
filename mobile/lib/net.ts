import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { initialNet, netReduce, nextPingDelay, type NetEvent, type NetModel, type NetState } from './netModel';

export type { NetState } from './netModel';

/**
 * Tarmoq holati (online · slow · offline) butun ilova uchun — native paketsiz (NetInfo yo'q, OTA bilan chiqadi).
 * Signallar: har `api()` so'rovi natijasi va davomiyligi (api.ts xabar beradi), engil ping `GET /api/health?live=1`
 * (4 s) va AppState. Hisob — `netModel.ts` (sof), bu yerda faqat taymer va obuna.
 *  - online'da alohida ping yo'q (oddiy so'rovlarning o'zi o'lchov);
 *  - slow/offline'da ping oralig'i 5 → 10 → 20 → 40 → 60 s (natija bo'lsa yana 5 s);
 *  - ilova fonda bo'lsa ping to'xtaydi, oldinga chiqqanda (online bo'lmasa) darhol ping.
 */

const PING_TIMEOUT_MS = 4000;

let model: NetModel = initialNet(Date.now());
let pingUrl: string | null = null;
const listeners = new Set<() => void>();

let timer: ReturnType<typeof setTimeout> | null = null;
let timerDue = 0;
let pinging = false;
let appActive = AppState.currentState !== 'background';
/** Ilova oxirgi marta fondan qaytgan vaqt — fonda boshlangan/uzilgan so'rov o'lchov emas */
let resumedAt = 0;

/** api.ts modul yuklanishida o'rnatadi (aylanma import bo'lmasligi uchun manzil shu yerga beriladi) */
export function setNetPingUrl(url: string) { pingUrl = url; }

export function getNetState(): NetState { return model.state; }

export function subscribeNet(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Komponent uchun joriy holat (o'zgarsa qayta chiziladi) */
export function useNetState(): NetState {
  return useSyncExternalStore(subscribeNet, getNetState, getNetState);
}

/** api.ts dan keladigan o'lchovlar (`at` shu yerda qo'yiladi) */
export type NetReport =
  | { type: 'sample'; ms: number }
  | { type: 'reach' }
  | { type: 'timeout'; small: boolean }
  | { type: 'fail' };

/**
 * `startedAt` — so'rov boshlangan vaqt. Ilova fonda bo'lgan yoki so'rov fon davrini kesib o'tgan bo'lsa:
 * xato/timeout hisoblanmaydi (iOS fonda tarmoqni to'xtatadi), davomiylik esa namuna emas (fon vaqti qo'shilgan).
 */
export function netReport(r: NetReport, startedAt?: number) {
  const spannedBackground = !appActive || (startedAt !== undefined && startedAt < resumedAt);
  if (spannedBackground) {
    if (r.type === 'fail' || r.type === 'timeout') return;
    if (r.type === 'sample') r = { type: 'reach' };
  }
  dispatch({ ...r, at: Date.now() } as NetEvent);
}

function dispatch(e: NetEvent) {
  const prev = model;
  model = netReduce(model, e);
  if (model.state !== prev.state) {
    clearTimer(); // yangi holat — ping jadvali boshidan
    listeners.forEach((fn) => fn());
  }
  schedule();
}

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null; }
}

/** Keyingi pingni rejalashtiradi; mavjud taymer ertaroq bo'lsa — tegmaydi (so'rovlar pingni cheksiz surmasin) */
function schedule() {
  if (!appActive || pinging || !pingUrl) return;
  const delay = nextPingDelay(model);
  if (delay === null) { clearTimer(); return; }
  const due = Date.now() + delay;
  if (timer && timerDue <= due) return;
  clearTimer();
  timerDue = due;
  timer = setTimeout(() => { void ping(); }, delay);
}

async function ping() {
  timer = null;
  if (!pingUrl || pinging) return;
  pinging = true;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
  let ok = false;
  try {
    const res = await fetch(`${pingUrl}&t=${t0}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: ctrl.signal,
    });
    // 5xx (nginx 502 — ilova to'xtagan) server ishlamayotganini bildiradi; 4xx — server bor
    ok = res.status < 500;
  } catch {
    ok = false;
  } finally {
    clearTimeout(to);
    pinging = false;
  }
  // Ping fon davrini kesib o'tdi — natija ishonchsiz; keyingisini rejalashtiramiz
  if (!appActive || t0 < resumedAt) { schedule(); return; }
  dispatch({ type: 'ping', ok, ms: Date.now() - t0, at: Date.now() });
}

AppState.addEventListener('change', (st) => {
  const active = st === 'active';
  if (st !== 'active' && st !== 'background') return; // iOS 'inactive' (boshqaruv markazi) — o'zgarish emas
  if (active === appActive) return;
  appActive = active;
  if (!active) { clearTimer(); return; }
  resumedAt = Date.now();
  if (model.state === 'online') return;
  dispatch({ type: 'wake', at: Date.now() });
  clearTimer();
  void ping();
});
