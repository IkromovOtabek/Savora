import { describe, it, expect } from 'vitest';
import {
  KDS_ALERT_MIN,
  KDS_WARN_MIN,
  cardTimer,
  clockHHMM,
  elapsedMinutes,
  elapsedMs,
  formatTimer,
  kdsCounts,
  kdsOrderFromView,
  kdsThresholds,
  mergeBoard,
  nextBump,
  readyGroups,
  shortOrderNo,
  sortOrders,
  timerLevel,
} from '@/components/restaurant/kitchen/kdsLogic';
import type { KdsItem, KdsOrder } from '@/lib/restaurant/queries';
import type { OrderView } from '@/lib/restaurant/view';

const MIN = 60_000;
const T0 = Date.parse('2026-11-18T09:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

function item(id: string, p: Partial<KdsItem> = {}): KdsItem {
  return {
    id, name: 'Osh', displayName: 'Osh', qty: 1, unit: null, modifiers: [], note: null,
    status: 'sent', stationId: 's1', stationKind: 'kitchen', fromQr: false,
    sentAt: iso(T0), cookStartedAt: null, readyAt: null, elapsedMs: 0, level: 'ok', ...p,
  };
}

function order(id: string, items: KdsItem[], p: Partial<KdsOrder> = {}): KdsOrder {
  return {
    id, orderNo: `B20261118-${id}`, type: 'dine_in', status: 'open', source: 'waiter', tableNumber: 5,
    waiterName: 'Ali', guests: 2, note: null, updatedAt: iso(T0), items, voided: [], ...p,
  };
}

describe('KDS: chegaralar', () => {
  it('sozlama yo\'q — konstantalar', () => {
    expect(kdsThresholds()).toEqual({ warnMin: KDS_WARN_MIN, alertMin: KDS_ALERT_MIN });
    expect(kdsThresholds(null)).toEqual({ warnMin: 10, alertMin: 20 });
  });
  it('sozlamadagi qiymatlar ishlatiladi', () => {
    expect(kdsThresholds({ kdsWarnMinutes: 7, kdsAlertMinutes: 15 })).toEqual({ warnMin: 7, alertMin: 15 });
  });
  it('yaroqsiz qiymat — konstanta; qizil har doim sariqdan keyin', () => {
    expect(kdsThresholds({ kdsWarnMinutes: 0, kdsAlertMinutes: Number.NaN })).toEqual({ warnMin: 10, alertMin: 20 });
    expect(kdsThresholds({ kdsWarnMinutes: 25 })).toEqual({ warnMin: 25, alertMin: 35 });
    expect(kdsThresholds({ kdsWarnMinutes: 12, kdsAlertMinutes: 12 })).toEqual({ warnMin: 12, alertMin: 22 });
  });
});

describe('KDS: taymer', () => {
  const th = kdsThresholds();
  it('rang darajasi chegaralarda almashadi', () => {
    expect(timerLevel(0, th)).toBe('ok');
    expect(timerLevel(10 * MIN - 1, th)).toBe('ok');
    expect(timerLevel(10 * MIN, th)).toBe('warn');
    expect(timerLevel(20 * MIN - 1, th)).toBe('warn');
    expect(timerLevel(20 * MIN, th)).toBe('alert');
    expect(timerLevel(3 * 60 * MIN, th)).toBe('alert');
  });
  it('maxsus chegaralar', () => {
    const t = kdsThresholds({ kdsWarnMinutes: 5, kdsAlertMinutes: 8 });
    expect(timerLevel(4 * MIN, t)).toBe('ok');
    expect(timerLevel(5 * MIN, t)).toBe('warn');
    expect(timerLevel(8 * MIN, t)).toBe('alert');
  });
  it('o\'tgan vaqt: belgi yo\'q yoki kelajakda (soat farqi) — 0', () => {
    expect(elapsedMs(null, T0)).toBe(0);
    expect(elapsedMs('yaroqsiz', T0)).toBe(0);
    expect(elapsedMs(iso(T0 + MIN), T0)).toBe(0);
    expect(elapsedMs(iso(T0 - 90_000), T0)).toBe(90_000);
  });
  it('format: m:ss va h:mm:ss', () => {
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(-5000)).toBe('0:00');
    expect(formatTimer(65_000)).toBe('1:05');
    expect(formatTimer(10 * MIN + 999)).toBe('10:00');
    expect(formatTimer(60 * MIN)).toBe('1:00:00');
    expect(formatTimer(61 * MIN + 7_000)).toBe('1:01:07');
    expect(elapsedMinutes(59_999)).toBe(0);
    expect(elapsedMinutes(12 * MIN + 30_000)).toBe(12);
  });
  it('mahalliy soat HH:MM', () => {
    expect(clockHHMM(new Date(2026, 10, 18, 9, 5).getTime())).toBe('09:05');
  });
  it('kartochka taymeri — eng eski faol taom, tayyorlar hisobga olinmaydi', () => {
    const items = [
      item('a', { status: 'ready', sentAt: iso(T0 - 40 * MIN) }),
      item('b', { status: 'cooking', sentAt: iso(T0 - 12 * MIN) }),
      item('c', { status: 'sent', sentAt: iso(T0 - 3 * MIN) }),
    ];
    const t = cardTimer(items, T0, th);
    expect(t.startMs).toBe(T0 - 12 * MIN);
    expect(t.elapsed).toBe(12 * MIN);
    expect(t.level).toBe('warn');
    expect(cardTimer([item('x', { status: 'ready' })], T0, th)).toEqual({ startMs: null, elapsed: 0, level: 'ok' });
  });
  it('keyingi amal: sent → cooking → ready', () => {
    expect(nextBump('sent')).toBe('cooking');
    expect(nextBump('cooking')).toBe('ready');
    expect(nextBump('ready')).toBeNull();
    expect(nextBump('served')).toBeNull();
  });
  it('qisqa buyurtma raqami', () => {
    expect(shortOrderNo('B20261118-0012')).toBe('0012');
    expect(shortOrderNo('X12')).toBe('X12');
    expect(shortOrderNo('B-')).toBe('B-');
  });
});

describe('KDS: polling birlashtirish', () => {
  it('full — ro\'yxat almashadi, yo\'qolgan taomlar qaytariladi', () => {
    const prev = [order('1', [item('a'), item('b')]), order('2', [item('c')])];
    const inc = [order('1', [item('a')], { updatedAt: iso(T0 + 1000) })];
    const m = mergeBoard(prev, inc, 'full', new Set(['a', 'b', 'c']));
    expect(m.orders.map((o) => o.id)).toEqual(['1']);
    expect(m.vanished.map((v) => v.item.id).sort()).toEqual(['b', 'c']);
    expect(m.added).toEqual([]);
  });

  it('since — id bo\'yicha almashtiradi, bo\'sh items kartochkani olib tashlaydi, notanish bo\'sh — e\'tiborsiz', () => {
    const prev = [order('1', [item('a')]), order('2', [item('c')])];
    const inc = [
      order('1', [item('a', { status: 'cooking' })], { updatedAt: iso(T0 + 1000) }),
      order('2', [], { updatedAt: iso(T0 + 1000) }),
      order('9', [], { updatedAt: iso(T0 + 1000) }),
    ];
    const m = mergeBoard(prev, inc, 'since', new Set(['a', 'c']));
    expect(m.orders.map((o) => o.id)).toEqual(['1']);
    expect(m.orders[0].items[0].status).toBe('cooking');
    expect(m.vanished.map((v) => v.item.id)).toEqual(['c']);
  });

  it('since — javobda yo\'q buyurtmalar o\'z holicha qoladi', () => {
    const prev = [order('1', [item('a')]), order('2', [item('c')])];
    const m = mergeBoard(prev, [], 'since', new Set(['a', 'c']));
    expect(m.orders.map((o) => o.id)).toEqual(['1', '2']);
    expect(m.vanished).toEqual([]);
  });

  it('eskirgan javob (updatedAt kichik) yangiroq mahalliy holatni bosmaydi', () => {
    const local = order('1', [item('a', { status: 'ready' })], { updatedAt: iso(T0 + 5000) });
    const stale = order('1', [item('a', { status: 'sent' })], { updatedAt: iso(T0) });
    for (const mode of ['since', 'full'] as const) {
      const m = mergeBoard([local], [stale], mode, new Set(['a']));
      expect(m.orders[0].items[0].status).toBe('ready');
      expect(m.vanished).toEqual([]);
    }
  });

  it('yangi taomlar: ko\'rilmagan faol taom — signal; yangi kartochka belgisi', () => {
    const prev = [order('1', [item('a')])];
    const inc = [
      order('1', [item('a'), item('b')], { updatedAt: iso(T0 + 1000) }),
      order('2', [item('c'), item('d', { status: 'ready' })], { updatedAt: iso(T0 + 1000) }),
    ];
    const m = mergeBoard(prev, inc, 'since', new Set(['a']));
    expect(m.added).toEqual([
      { orderId: '1', itemIds: ['b'], newOrder: false },
      { orderId: '2', itemIds: ['c'], newOrder: true },
    ]);
  });

  it('ko\'rilgan taom qaytsa (ready → cooking) — signal yo\'q', () => {
    const m = mergeBoard([], [order('1', [item('a', { status: 'cooking' })])], 'full', new Set(['a']));
    expect(m.added).toEqual([]);
  });

  it('miqdor kamaysa (qisman bekor) — reduced', () => {
    const prev = [order('1', [item('a', { qty: 3 })])];
    const inc = [order('1', [item('a', { qty: 2 })], { updatedAt: iso(T0 + 1000) })];
    const m = mergeBoard(prev, inc, 'since', new Set(['a']));
    expect(m.reduced).toEqual([{ orderId: '1', itemId: 'a', from: 3, to: 2 }]);
  });

  it('tartib — eng eski yuborilgan birinchi', () => {
    const list = sortOrders([
      order('1', [item('a', { sentAt: iso(T0) })]),
      order('2', [item('b', { sentAt: iso(T0 - 5 * MIN) })]),
      order('3', [item('c', { sentAt: iso(T0 - 2 * MIN) }), item('d', { sentAt: iso(T0 - 9 * MIN) })]),
    ]);
    expect(list.map((o) => o.id)).toEqual(['3', '2', '1']);
  });
});

describe('KDS: bump javobi va «Tayyor» ustuni', () => {
  const th = kdsThresholds();

  it('OrderView → kartochka: faqat KDS holatlari va tanlangan stansiya; bekorlar sababi bilan', () => {
    const base = { unit: null, modifiers: [{ group: 'Porsiya', name: 'Katta', price: 5000 }], note: 'achchiq', stationKind: 'kitchen' as const, cookStartedAt: null, readyAt: null, voidReason: null };
    const v = {
      id: '1', orderNo: 'B20261118-0001', type: 'dine_in', status: 'open', tableNumber: 4, waiterName: 'Ali', guests: 3,
      updatedAt: iso(T0),
      items: [
        { ...base, id: 'a', name: 'Osh', displayName: 'Osh (Katta)', qty: 2, status: 'cooking', stationId: 's1', sentAt: iso(T0 - 11 * MIN) },
        { ...base, id: 'b', name: 'Choy', displayName: 'Choy', qty: 1, status: 'sent', stationId: 's2', sentAt: iso(T0) },
        { ...base, id: 'c', name: 'Non', displayName: 'Non', qty: 1, status: 'served', stationId: 's1', sentAt: iso(T0) },
        { ...base, id: 'd', name: 'Lag\'mon', displayName: 'Lag\'mon', qty: 1, status: 'voided', stationId: 's1', sentAt: iso(T0), voidReason: 'mijoz rad etdi' },
      ],
    } as unknown as OrderView;
    const r = kdsOrderFromView(v, 's1', T0, th);
    expect(r.order.items.map((i) => i.id)).toEqual(['a']);
    expect(r.order.items[0].modifiers).toEqual([{ group: 'Porsiya', name: 'Katta' }]);
    expect(r.order.items[0].level).toBe('warn');
    expect(r.voided.get('d')).toBe('mijoz rad etdi');
    expect(kdsOrderFromView(v, null, T0, th).order.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(kdsOrderFromView({ ...v, status: 'cancelled' }, null, T0, th).order.items).toEqual([]);
  });

  it('tayyorlar: oxirgi N daqiqa — recent, eskilari — older; uzoq kutayotgani birinchi', () => {
    const orders = [
      order('1', [item('a', { status: 'ready', readyAt: iso(T0 - 2 * MIN) })]),
      order('2', [item('b', { status: 'ready', readyAt: iso(T0 - 8 * MIN) }), item('x', { status: 'cooking' })]),
      order('3', [item('c', { status: 'ready', readyAt: iso(T0 - 45 * MIN) })]),
      order('4', [item('d', { status: 'sent' })]),
    ];
    const r = readyGroups(orders, T0, 30);
    expect(r.recent.map((g) => g.order.id)).toEqual(['2', '1']);
    expect(r.recent[0].items.map((i) => i.id)).toEqual(['b']);
    expect(r.older.map((g) => g.order.id)).toEqual(['3']);
    expect(kdsCounts(orders)).toEqual({ waiting: 1, cooking: 1, ready: 3 });
  });
});
