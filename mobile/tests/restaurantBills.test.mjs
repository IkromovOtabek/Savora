// Stollar ekranidagi «Hisoblar» (lib/restaurantBills.ts) — web lib/restaurant/bills.ts bilan bir xil qoida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBills, linkedTakeaways, billRank } from '../lib/restaurantBills.ts';

const sum = (id, p = {}) => ({
  id, orderNo: `B20261120-${id.padStart(4, '0')}`, type: 'dine_in', status: 'open', source: 'waiter',
  tableId: null, tableNumber: null, forTableId: null, forTableNumber: null, guests: null,
  waiterId: 'u1', waiterName: 'Ali', openedAt: '2026-11-20T10:00:00.000Z', precheckAt: null, updatedAt: null,
  access: true, mine: true, total: 10000, due: 10000, counts: null, ...p,
});
const table = (id, number, order, billAt = null) => ({ id, hallId: 'h1', number, seats: 4, calls: { waiterAt: null, billAt }, order });

const t1 = table('t1', 1, sum('1', { tableId: 't1', tableNumber: 1, openedAt: '2026-11-20T10:00:00.000Z', due: 50000 }));
const t2 = table('t2', 2, sum('2', { tableId: 't2', tableNumber: 2, openedAt: '2026-11-20T09:00:00.000Z', status: 'precheck', due: 30000 }));
const t3 = table('t3', 3, sum('3', { tableId: 't3', tableNumber: 3, openedAt: '2026-11-20T08:00:00.000Z', due: 20000 }), '2026-11-20T11:30:00.000Z');
const t4 = table('t4', 4, sum('4', { tableId: 't4', tableNumber: 4, access: false, mine: false, total: null, due: null }));
const t5 = table('t5', 5, null);
const tk = [
  sum('11', { type: 'takeaway', forTableId: 't1', forTableNumber: 1, openedAt: '2026-11-20T10:30:00.000Z', due: 25000 }),
  sum('12', { type: 'takeaway', forTableId: 't1', forTableNumber: 1, openedAt: '2026-11-20T10:10:00.000Z', due: 5000 }),
  sum('13', { type: 'takeaway', forTableId: 't5', forTableNumber: 5, openedAt: '2026-11-20T06:00:00.000Z', due: 7000 }),
  sum('14', { type: 'takeaway', forTableId: 't4', forTableNumber: 4, openedAt: '2026-11-20T12:00:00.000Z', access: false, due: null }),
];
const board = { tables: [t1, t2, t3, t4, t5], takeaway: tk };

test('bog\'langan saboylar: stol bo\'yicha, eskisi birinchi, ko\'rinmaydigani yo\'q', () => {
  const m = linkedTakeaways(board);
  assert.deepEqual(m.get('t1').map((o) => o.id), ['12', '11']);
  assert.deepEqual(m.get('t5').map((o) => o.id), ['13']);
  assert.equal(m.has('t4'), false);
});

test('guruhlash va tartib: hisob so\'ragan / pre-chek birinchi, keyin eng eskisi', () => {
  const { rows } = buildBills(board);
  assert.deepEqual(rows.map((r) => r.order.id), ['3', '2', '13', '1']);
  assert.deepEqual(rows.find((r) => r.order.id === '1').linked.map((o) => o.id), ['12', '11']);
  assert.equal(rows.find((r) => r.order.id === '13').tableNumber, 5);
  assert.equal(billRank(rows[0]), 0);
  assert.equal(billRank(rows[3]), 1);
});

test('jamlama', () => {
  const { summary } = buildBills(board);
  assert.deepEqual(summary, { count: 6, due: 50000 + 30000 + 20000 + 25000 + 5000 + 7000, precheck: 1, billRequests: 1 });
  assert.deepEqual(buildBills({ tables: [t5], takeaway: [] }).summary, { count: 0, due: 0, precheck: 0, billRequests: 0 });
});
