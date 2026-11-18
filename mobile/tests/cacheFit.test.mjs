// O'qish keshini AsyncStorage chegarasiga sig'dirish (lib/cacheFit.ts) — sof funksiyalar testi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitPersisted, fitQuery, firstPageOnly, halveLargestArray } from '../lib/cacheFit.ts';

const q = (hash, data, at, extra = {}) => ({
  queryKey: [hash], queryHash: hash,
  state: { data, dataUpdatedAt: at, status: 'success', fetchStatus: 'idle', error: null, ...extra },
});
const items = (n, pad = '') => Array.from({ length: n }, (_, i) => ({ id: String(i), name: `x${i}${pad}` }));

test('cheksiz ro\'yxat: faqat 1-sahifa', () => {
  const d = { pages: [{ page: 1, items: [1] }, { page: 2, items: [2] }], pageParams: [1, 2] };
  assert.deepEqual(firstPageOnly(d), { pages: [{ page: 1, items: [1] }], pageParams: [1] });
  const plain = { items: [1, 2] };
  assert.equal(firstPageOnly(plain), plain, 'oddiy resurs o\'zgarmaydi');
});

test('eng uzun massiv yarmiga qisqaradi (yuqori darajada va 1-sahifada)', () => {
  assert.deepEqual(halveLargestArray({ a: [1, 2], b: [1, 2, 3, 4], t: 5 }), { a: [1, 2], b: [1, 2], t: 5 });
  const inf = halveLargestArray({ pages: [{ items: [1, 2, 3, 4] }], pageParams: [1] });
  assert.deepEqual(inf, { pages: [{ items: [1, 2] }], pageParams: [1] });
  assert.equal(halveLargestArray({ total: 1 }), null);
  assert.equal(halveLargestArray([1]), null);
});

test('holat tozalanadi: xato/yuklanish tiklanmaydi, promise tashlanadi', () => {
  const s = fitQuery({ ...q('a', { v: 1 }, 5, { status: 'error', error: { message: 'x' }, fetchStatus: 'fetching', fetchFailureCount: 2 }), promise: {} });
  const o = JSON.parse(s);
  assert.equal(o.state.status, 'success');
  assert.equal(o.state.error, null);
  assert.equal(o.state.fetchStatus, 'idle');
  assert.equal(o.state.fetchFailureCount, 0);
  assert.equal('promise' in o, false);
  assert.equal(fitQuery(q('b', undefined, 1)), null, 'ma\'lumotsiz so\'rov saqlanmaydi');
});

test('katta so\'rov sig\'guncha qisqaradi', () => {
  const big = q('big', { total: 5000, items: items(5000, '-------------------') }, 1);
  const s = fitQuery(big, 20_000);
  assert.ok(s && s.length <= 20_000);
  const o = JSON.parse(s);
  assert.ok(o.state.data.items.length < 5000 && o.state.data.items.length > 0);
  assert.equal(o.state.data.total, 5000, 'server jami o\'zgarmaydi');
});

test('jami chegara: eng yangilari qoladi, natija to\'g\'ri JSON', () => {
  const client = {
    buster: 'u1|1.5.0|1', timestamp: 42,
    clientState: { mutations: [{ x: 1 }], queries: [q('old', { items: items(200) }, 1), q('new', { items: items(200) }, 3), q('mid', { items: items(200) }, 2)] },
  };
  const one = fitQuery(client.clientState.queries[0]).length;
  const out = fitPersisted(client, one * 2 + 200);
  const o = JSON.parse(out);
  assert.equal(o.buster, 'u1|1.5.0|1');
  assert.equal(o.timestamp, 42);
  assert.deepEqual(o.clientState.mutations, []);
  assert.deepEqual(o.clientState.queries.map((x) => x.queryHash), ['new', 'mid']);
  assert.ok(out.length <= one * 2 + 200);
});

test('bo\'sh kesh ham to\'g\'ri JSON', () => {
  const o = JSON.parse(fitPersisted({ buster: 'b', timestamp: 1, clientState: { queries: [], mutations: [] } }));
  assert.deepEqual(o.clientState.queries, []);
});
