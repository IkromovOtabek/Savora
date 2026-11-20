/**
 * Printer stansiyasi — sof funksiyalar (DOM'siz; tests/kitchenPrint.test.ts): varaq sarlavhasi va qatorlari,
 * navbatga qo'shish (takrorsiz), sinov varag'i, Chrome yorlig'i buyrug'i, qurilma kaliti.
 */
import type { Dict } from '@/lib/i18n/dict';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { fmtQty } from '@/lib/qty';
import type { PrintJobLineView, PrintJobView } from '@/lib/restaurant/printQueue';
import { shortOrderNo } from '../kitchen/kdsLogic';

/** So'rov oralig'i (ms) va aloqa uzilganda eng uzun kutish */
export const PRINT_POLL_MS = 3_000;
export const PRINT_POLL_MAX_MS = 30_000;
/** «Chop etildi» belgisini yuborishga urinishlar */
export const PRINT_DONE_RETRIES = 3;

export type PaperWidth = 58 | 80;

/** Varaq yuqorisidagi katta yozuv: «STOL 12» / «SABOY» / «SABOY · STOL 5» (stol mehmonlariga) / «QR · STOL 5» */
export function ticketPlace(j: Pick<PrintJobView, 'orderType' | 'tableNumber'> & Partial<Pick<PrintJobView, 'forTableNumber'>>, d: Dict): string {
  const p = d.restaurant.print;
  if (j.orderType === 'takeaway') {
    return j.forTableNumber ? `${p.ticketTakeaway} · ${tr(p.ticketTable, { n: j.forTableNumber })}` : p.ticketTakeaway;
  }
  const table = j.tableNumber !== null ? tr(p.ticketTable, { n: j.tableNumber }) : '';
  if (j.orderType === 'qr_self') return table ? `${p.ticketQr} · ${table}` : p.ticketQr;
  return table || p.ticketTakeaway;
}

/** Ikkinchi qator: «№0042 · Ofitsant: Ali · 4 mehmon» */
export function ticketMeta(j: Pick<PrintJobView, 'orderNo' | 'waiterName' | 'guests'>, d: Dict): string {
  const p = d.restaurant.print;
  return [
    tr(p.ticketNo, { no: shortOrderNo(j.orderNo) }),
    j.waiterName ? tr(p.ticketWaiter, { name: j.waiterName }) : '',
    j.guests ? tr(p.ticketGuests, { n: j.guests }) : '',
  ].filter(Boolean).join(' · ');
}

/** Miqdor: dona — «2 ×», boshqa birlik — «0,5 kg» */
export function ticketQty(l: Pick<PrintJobLineView, 'qty' | 'unit'>, d: Dict): string {
  return !l.unit || l.unit === 'dona' ? `${fmtQty(l.qty)} ×` : qtyWithUnit(l.qty, l.unit, d.stock.fields.units);
}

/** Ro'yxat uchun qisqa tarkib: «2× Osh, 1× Lag'mon» */
export function linesSummary(lines: readonly Pick<PrintJobLineView, 'qty' | 'name'>[], max = 3): string {
  const parts = lines.slice(0, max).map((l) => `${fmtQty(l.qty)}× ${l.name}`);
  return lines.length > max ? `${parts.join(', ')} …` : parts.join(', ');
}

/** HH:MM (qurilma vaqti) */
export function hhmm(isoOrMs: string | number): string {
  const t = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(t)) return '';
  const x = new Date(t);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}

/**
 * Serverdan kelgan (shu qurilmaga berilgan) varaqlarni navbatga qo'shadi: navbatda bor yoki shu seansda
 * chop etilgan (`handled`) varaq qayta qo'shilmaydi. `again` — chop etilgan, lekin serverga «chop etildi»
 * yetib bormagan varaqlar (belgini qayta yuborish kerak).
 */
export function mergeQueue(
  queue: readonly PrintJobView[],
  incoming: readonly PrintJobView[],
  handled: ReadonlySet<string>,
): { queue: PrintJobView[]; again: string[] } {
  const inQueue = new Set(queue.map((j) => j.id));
  const next = [...queue];
  const again: string[] = [];
  for (const j of incoming) {
    if (handled.has(j.id)) { again.push(j.id); continue; }
    if (inQueue.has(j.id)) continue;
    inQueue.add(j.id);
    next.push(j);
  }
  return { queue: next, again };
}

/** Sinov varag'i (serverga yozilmaydi) */
export function sampleJob(d: Dict, stationName: string, now: number): PrintJobView {
  const p = d.restaurant.print;
  const at = new Date(now).toISOString();
  return {
    id: 'test',
    kind: 'order',
    status: 'pending',
    stationId: '',
    stationName,
    orderId: '',
    orderNo: 'TEST-0001',
    orderType: 'dine_in',
    tableNumber: 1,
    forTableNumber: null,
    waiterName: null,
    guests: null,
    orderNote: p.ticketTestFoot,
    lines: [{ name: p.ticketTestDish, qty: 2, unit: null, modifiers: [{ group: '', name: p.ticketTestMod }], note: p.ticketTestNote, fromQr: false, reason: null }],
    copy: false,
    queuedAt: at,
    printedAt: null,
    printedBy: null,
    attempts: 0,
    stale: false,
  };
}

/** Chrome bayroqlari: dialogsiz chop etish + fon rejimida taymerlar sekinlashmasin (oyna orqada qolsa ham chop etadi) */
export const CHROME_FLAGS = [
  '--kiosk-printing',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
] as const;

/** Windows yorlig'idagi «Obyekt» maydoni shundan uzun matnni kesib tashlaydi */
export const WINDOWS_TARGET_MAX = 260;

/**
 * Printer stansiyasi yorlig'i buyrug'i. Alohida profil papkasi — oddiy Chrome oynalariga xalaqit bermaydi va
 * bayroqlar Chrome ochiq turgan bo'lsa ham ishlaydi; tanlangan stansiya/filial shu profilning localStorage'ida
 * saqlanadi, shuning uchun manzil parametrsiz (Windows «Obyekt» maydoni 260 belgiga sig'ishi uchun).
 */
export function chromeCommand(os: 'windows' | 'mac', url: string): string {
  const safe = url.replace(/["\s]/g, '');
  if (os === 'mac') {
    return `open -na "Google Chrome" --args --user-data-dir="$HOME/SavoraPrinter" ${CHROME_FLAGS.join(' ')} --app="${safe}"`;
  }
  return `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir=C:\\SavoraPrinter ${CHROME_FLAGS.join(' ')} --app=${safe}`;
}

/** Printer stansiyasi manzili (parametrsiz — tanlov localStorage'da) */
export function printStationUrl(origin: string): string {
  return new URL('/app/kitchen/print', origin).toString();
}

const DEVICE_RE = /^[A-Za-z0-9:_-]{8,64}$/;

/** Qurilma kaliti (localStorage'da saqlanadi): server varaqni shu kalitga biriktiradi */
export function validDeviceId(v: string | null | undefined): v is string {
  return !!v && DEVICE_RE.test(v);
}

export function newDeviceId(rand: () => number = Math.random): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `pr-${c.randomUUID()}`;
  let s = 'pr-';
  for (let i = 0; i < 24; i++) s += Math.floor(rand() * 36).toString(36);
  return s;
}
