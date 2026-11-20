// Oshxona printeri — sof mantiq: varaqlarga ajratish, navbat sharti, printer stansiyasi yordamchilari, varaq render
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Types } from 'mongoose';
import type { IOrderItem, OrderDoc } from '@/lib/models/tenant/Order';
import { buildPrintJobs, needsVoidTicket, printLine } from '@/lib/restaurant/print';
import { PRINT_LEASE_MS, PRINT_MAX_AGE_MS, PRINT_MAX_ATTEMPTS, claimableFilter, isStale, printJobView } from '@/lib/restaurant/printQueue';
import {
  CHROME_FLAGS,
  chromeCommand,
  linesSummary,
  mergeQueue,
  newDeviceId,
  printStationUrl,
  sampleJob,
  ticketMeta,
  ticketPlace,
  ticketQty,
  validDeviceId,
  WINDOWS_TARGET_MAX,
} from '@/components/restaurant/print/printLogic';
import KitchenTicket from '@/components/restaurant/print/KitchenTicket';
import { getDictionary } from '@/lib/i18n/dict';
import type { PrintJobView } from '@/lib/restaurant/printQueue';

const d = getDictionary('uz');
const ru = getDictionary('ru');
const NOW = Date.parse('2026-11-20T09:00:00.000Z');
const kitchen = new Types.ObjectId();
const bar = new Types.ObjectId();
const other = new Types.ObjectId();

function item(name: string, p: Partial<IOrderItem> = {}): IOrderItem {
  return {
    _id: new Types.ObjectId(), productId: new Types.ObjectId(), name, basePrice: 1000, price: 1000, qty: 1, modifiers: [],
    status: 'sent', stockReserved: true, addedBy: 'ali', addedAt: new Date(NOW), ...p,
  };
}

function order(items: IOrderItem[], p: Partial<OrderDoc> = {}): OrderDoc {
  return {
    _id: new Types.ObjectId(), orderNo: 'B20261120-0042', branchId: new Types.ObjectId(), type: 'dine_in', source: 'waiter', status: 'open',
    tableNumber: 12, guests: 4, waiterName: 'ali', serviceChargePct: 10, packFee: 0, items, payments: [], openedBy: 'ali',
    openedAt: new Date(NOW), rev: 1, ...p,
  } as OrderDoc;
}

function view(p: Partial<PrintJobView> = {}): PrintJobView {
  return { ...sampleJob(d, 'Issiq sex', NOW), id: 'j1', orderNo: 'B20261120-0042', tableNumber: 12, waiterName: 'Ali', guests: 4, orderNote: null, ...p };
}

describe('varaqlarga ajratish (buildPrintJobs)', () => {
  const stations = [{ _id: kitchen, name: 'Issiq sex' }, { _id: bar, name: 'Bar' }];

  it('har stansiyaga bitta varaq, qatorlar buyurtma tartibida; printersiz va stansiyasiz taom tushmaydi', () => {
    const osh = item('Osh', { stationId: kitchen, qty: 2, modifiers: [{ group: 'Porsiya', name: 'Katta', price: 8000 }], note: 'piyozsiz' });
    const cola = item('Cola', { stationId: bar });
    const lagmon = item("Lag'mon", { stationId: kitchen, fromQr: true });
    const salat = item('Salat', { stationId: other });
    const non = item('Non', { status: 'served' });
    const o = order([osh, cola, lagmon, salat, non], { note: 'tezroq' });
    const jobs = buildPrintJobs('order', o, o.items, stations, { waiterName: 'Ali', by: 'ali', now: new Date(NOW) });
    expect(jobs).toHaveLength(2);
    const k = jobs.find((j) => String(j.stationId) === String(kitchen))!;
    expect(k).toMatchObject({
      stationName: 'Issiq sex', kind: 'order', orderNo: 'B20261120-0042', orderType: 'dine_in', tableNumber: 12, waiterName: 'Ali',
      guests: 4, orderNote: 'tezroq', status: 'pending', attempts: 0, createdBy: 'ali',
    });
    expect(k.lines.map((l) => l.name)).toEqual(['Osh', "Lag'mon"]);
    expect(k.lines[0]).toMatchObject({ qty: 2, modifiers: [{ group: 'Porsiya', name: 'Katta' }], note: 'piyozsiz' });
    expect(k.lines[0]).not.toHaveProperty('price');
    expect(k.lines[1].fromQr).toBe(true);
    expect(jobs.find((j) => String(j.stationId) === String(bar))!.lines.map((l) => l.name)).toEqual(['Cola']);
  });

  it("saboy — stol raqamisiz; bekor varag'ida sabab", () => {
    const v = item('Osh', { stationId: kitchen, status: 'voided', voidReason: 'mijoz voz kechdi' });
    const o = order([v], { type: 'takeaway', tableNumber: undefined, guests: undefined });
    const [j] = buildPrintJobs('void', o, o.items, stations, { waiterName: null, by: 'admin', now: new Date(NOW) });
    expect(j).toMatchObject({ kind: 'void', orderType: 'takeaway' });
    expect(j).not.toHaveProperty('tableNumber');
    expect(j).not.toHaveProperty('waiterName');
    expect(j.lines[0].reason).toBe('mijoz voz kechdi');
    // oddiy varaqda sabab chiqmaydi
    expect(printLine(v)).not.toHaveProperty('reason');
  });

  it("bekor varag'i faqat oshxonada turgan taomga", () => {
    expect(needsVoidTicket('sent', { stationId: kitchen })).toBe(true);
    expect(needsVoidTicket('cooking', { stationId: kitchen })).toBe(true);
    expect(needsVoidTicket('ready', { stationId: kitchen })).toBe(true);
    expect(needsVoidTicket('new', { stationId: kitchen })).toBe(false);
    expect(needsVoidTicket('served', { stationId: kitchen })).toBe(false);
    expect(needsVoidTicket('sent', {})).toBe(false);
  });
});

describe('navbat sharti', () => {
  it('olish sharti: navbatda, yangi, urinish tugamagan, bo\'sh / muddati o\'tgan / shu qurilmaniki', () => {
    const branchId = new Types.ObjectId().toString();
    const f = claimableFilter({ branchId, deviceId: 'pr-device-1', now: NOW, exclude: [] });
    expect(f).toMatchObject({ status: 'pending', attempts: { $lt: PRINT_MAX_ATTEMPTS } });
    expect(f.queuedAt.$gte.getTime()).toBe(NOW - PRINT_MAX_AGE_MS);
    expect(f.$or).toEqual([{ claimedAt: null }, { claimedAt: { $lt: new Date(NOW - PRINT_LEASE_MS) } }, { claimedBy: 'pr-device-1' }]);
    expect(f).not.toHaveProperty('stationId');
    expect(f).not.toHaveProperty('_id');
    const ex = [new Types.ObjectId()];
    const g = claimableFilter({ branchId, stationId: String(kitchen), deviceId: 'pr-device-1', now: NOW, exclude: ex });
    expect(String(g.stationId)).toBe(String(kitchen));
    expect(g._id).toEqual({ $nin: ex });
  });

  it('eskirgan: navbatda va 30 daqiqadan eski yoki urinishlar tugagan', () => {
    const fresh = { status: 'pending' as const, queuedAt: new Date(NOW - 60_000), attempts: 1 };
    expect(isStale(fresh, NOW)).toBe(false);
    expect(isStale({ ...fresh, queuedAt: new Date(NOW - PRINT_MAX_AGE_MS - 1) }, NOW)).toBe(true);
    expect(isStale({ ...fresh, attempts: PRINT_MAX_ATTEMPTS }, NOW)).toBe(true);
    expect(isStale({ ...fresh, status: 'printed', attempts: 9 }, NOW)).toBe(false);
  });

  it('ko\'rinish: id/sana matnga, bo\'sh maydonlar null', () => {
    const o = order([item('Osh', { stationId: kitchen })]);
    const [j] = buildPrintJobs('order', o, o.items, [{ _id: kitchen, name: 'Issiq sex' }], { waiterName: null, by: 'ali', now: new Date(NOW) });
    const v = printJobView({ ...j, _id: new Types.ObjectId() }, NOW);
    expect(v).toMatchObject({ kind: 'order', status: 'pending', stationId: String(kitchen), waiterName: null, copy: false, printedAt: null, stale: false });
    expect(v.queuedAt).toBe(new Date(NOW).toISOString());
    expect(v.lines[0]).toEqual({ name: 'Osh', qty: 1, unit: null, modifiers: [], note: null, fromQr: false, reason: null });
  });
});

describe('printer stansiyasi yordamchilari', () => {
  it("varaq sarlavhasi: stol / saboy / QR", () => {
    expect(ticketPlace({ orderType: 'dine_in', tableNumber: 12 }, d)).toBe('STOL 12');
    expect(ticketPlace({ orderType: 'takeaway', tableNumber: null }, d)).toBe('SABOY');
    expect(ticketPlace({ orderType: 'qr_self', tableNumber: 5 }, d)).toBe('QR · STOL 5');
    expect(ticketPlace({ orderType: 'dine_in', tableNumber: 3 }, ru)).toBe('СТОЛ 3');
    expect(ticketMeta({ orderNo: 'B20261120-0042', waiterName: 'Ali', guests: 4 }, d)).toBe('№0042 · Ofitsant: Ali · 4 mehmon');
    expect(ticketMeta({ orderNo: 'B20261120-0042', waiterName: null, guests: null }, d)).toBe('№0042');
  });

  it('miqdor va qisqa tarkib', () => {
    expect(ticketQty({ qty: 2, unit: null }, d)).toBe('2 ×');
    expect(ticketQty({ qty: 1.5, unit: 'dona' }, d)).toBe('1,5 ×');
    expect(ticketQty({ qty: 0.5, unit: 'kg' }, d)).toContain('0,5');
    expect(linesSummary([{ qty: 2, name: 'Osh' }, { qty: 1, name: "Lag'mon" }])).toBe("2× Osh, 1× Lag'mon");
    expect(linesSummary([{ qty: 1, name: 'A' }, { qty: 1, name: 'B' }, { qty: 1, name: 'C' }, { qty: 1, name: 'D' }])).toBe('1× A, 1× B, 1× C …');
  });

  it('navbatga qo\'shish: takrorsiz; chop etilgani qayta qo\'shilmaydi — belgi qayta yuboriladi', () => {
    const a = view({ id: 'a' });
    const b = view({ id: 'b' });
    const c = view({ id: 'c' });
    const r = mergeQueue([a], [a, b, c], new Set(['c']));
    expect(r.queue.map((j) => j.id)).toEqual(['a', 'b']);
    expect(r.again).toEqual(['c']);
    expect(mergeQueue([], [b, b], new Set()).queue).toHaveLength(1);
  });

  it('Chrome yorlig\'i: dialogsiz chop etish bayroqlari, alohida profil, manzil; Windows «Obyekt» ga sig\'adi', () => {
    const url = printStationUrl('https://savora.uz');
    expect(url).toBe('https://savora.uz/app/kitchen/print');
    const win = chromeCommand('windows', url);
    for (const f of CHROME_FLAGS) expect(win).toContain(f);
    expect(win).toContain('--user-data-dir=C:\\SavoraPrinter');
    expect(win.endsWith(`--app=${url}`)).toBe(true);
    // Uzunroq domen bilan ham 260 belgidan oshmasin
    expect(chromeCommand('windows', printStationUrl('https://restoran-filial.savora.uz')).length).toBeLessThanOrEqual(WINDOWS_TARGET_MAX);
    expect(chromeCommand('mac', 'https://x.uz/a"b c')).toContain('--app="https://x.uz/abc"');
  });

  it('qurilma kaliti server sxemasiga mos', () => {
    expect(validDeviceId(newDeviceId())).toBe(true);
    let n = 0;
    const g = globalThis as { crypto?: unknown };
    const saved = Object.getOwnPropertyDescriptor(g, 'crypto');
    Object.defineProperty(g, 'crypto', { value: undefined, configurable: true });
    try {
      expect(validDeviceId(newDeviceId(() => ((n++ * 7) % 36) / 36))).toBe(true);
    } finally {
      if (saved) Object.defineProperty(g, 'crypto', saved);
    }
    expect(validDeviceId('short')).toBe(false);
    expect(validDeviceId('pr-bad id with spaces')).toBe(false);
    expect(validDeviceId(null)).toBe(false);
  });
});

describe('varaq (KitchenTicket)', () => {
  const html = (j: PrintJobView, test = false) => renderToStaticMarkup(createElement(KitchenTicket, { job: j, d, test }));

  it('oddiy varaq: stansiya, stol, ofitsant, modifikator, izoh; narx yo\'q', () => {
    const out = html(view({ lines: [{ name: 'Osh', qty: 2, unit: null, modifiers: [{ group: 'Porsiya', name: 'Katta' }], note: 'piyozsiz', fromQr: true, reason: null }], orderNote: 'tezroq' }));
    expect(out).toContain('Issiq sex');
    expect(out).toContain('STOL 12');
    expect(out).toContain('Ofitsant: Ali');
    expect(out).toContain('+ Katta');
    expect(out).toContain('! piyozsiz');
    expect(out).toContain('Izoh: tezroq');
    expect(out).not.toContain("so'm");
    expect(out).not.toContain('BEKOR');
  });

  it('bekor va nusxa belgilari, sinov varag\'i', () => {
    const v = html(view({ kind: 'void', copy: true, lines: [{ name: 'Osh', qty: 1, unit: null, modifiers: [], note: null, fromQr: false, reason: 'xato' }] }));
    expect(v).toContain('BEKOR QILINDI');
    expect(v).toContain('TAYYORLAMANG!');
    expect(v).toContain('NUSXA');
    expect(v).toContain('Sabab: xato');
    expect(html(sampleJob(d, 'Bar', NOW), true)).toContain("SINOV VARAG&#x27;I");
  });
});
