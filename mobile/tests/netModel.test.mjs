// Tarmoq holati mashinasi (lib/netModel.ts) — sof funksiyalar testi.
// Ishga tushirish: `npm test` (Node ≥ 22.18: .ts fayl type stripping bilan to'g'ridan-to'g'ri o'qiladi, paket kerak emas)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialNet, netReduce, nextPingDelay, ewmaNext, NET_RULES } from '../lib/netModel.ts';

const run = (m, events) => events.reduce((acc, e) => netReduce(acc, e), m);
const sample = (ms, at) => ({ type: 'sample', ms, at });
const ping = (ok, at, ms = 300) => ({ type: 'ping', ok, ms, at });

test('EWMA: birinchi namuna o\'zi, keyin α=0.3', () => {
  assert.equal(ewmaNext(null, 1000), 1000);
  assert.equal(ewmaNext(1000, 2000), 1300);
  assert.equal(NET_RULES.alpha, 0.3);
});

test('online → slow: kamida 3 namuna va EWMA > 2,5 s', () => {
  let m = initialNet(0);
  m = run(m, [sample(5000, 1), sample(5000, 2)]);
  assert.equal(m.state, 'online', '2 namuna yetmaydi');
  m = netReduce(m, sample(5000, 3));
  assert.equal(m.state, 'slow');
});

test('online: tez namunalar orasida bitta sekin — holat o\'zgarmaydi', () => {
  const m = run(initialNet(0), [sample(300, 1), sample(400, 2), sample(6000, 3), sample(300, 4)]);
  // EWMA: 300 → 330 → 2031 → 1512 — chegaradan past
  assert.equal(m.state, 'online');
});

test('online → slow: kichik GET timeout darhol; katta so\'rov timeout — yo\'q', () => {
  assert.equal(netReduce(initialNet(0), { type: 'timeout', small: true, at: 1 }).state, 'slow');
  const big = netReduce(initialNet(0), { type: 'timeout', small: false, at: 1 });
  assert.equal(big.state, 'online');
  assert.equal(big.failStreak, 1);
});

test('slow → online: ketma-ket 3 namuna < 1,2 s; oradagi sekin namuna hisobni uzadi', () => {
  let m = netReduce(initialNet(0), { type: 'timeout', small: true, at: 1 });
  m = run(m, [sample(500, 2), sample(500, 3), sample(2000, 4), sample(500, 5), sample(500, 6)]);
  assert.equal(m.state, 'slow', 'zanjir uzildi — hali 2 ta');
  m = netReduce(m, sample(500, 7));
  assert.equal(m.state, 'online');
  assert.equal(m.ewma, null, 'yangi holatda EWMA boshidan (darhol qaytib sekinga tushmasin)');
});

test('→ offline: 2 ketma-ket javobsiz so\'rov (tarmoq xatosi yoki timeout)', () => {
  assert.equal(run(initialNet(0), [{ type: 'fail', at: 1 }]).state, 'online');
  assert.equal(run(initialNet(0), [{ type: 'fail', at: 1 }, { type: 'fail', at: 2 }]).state, 'offline');
  // orada javob — hisob nolga
  assert.equal(run(initialNet(0), [{ type: 'fail', at: 1 }, { type: 'reach', at: 2 }, { type: 'fail', at: 3 }]).state, 'online');
  // sekin holatdan ham
  const slow = netReduce(initialNet(0), { type: 'timeout', small: true, at: 1 });
  assert.equal(slow.state, 'slow');
  assert.equal(netReduce(slow, { type: 'timeout', small: true, at: 2 }).state, 'offline');
});

test('offline → online: 2 ping (orasi ≥ 5 s) va kamida 15 s oflaynda', () => {
  const off = run(initialNet(0), [{ type: 'fail', at: 0 }, { type: 'fail', at: 0 }]);
  assert.equal(off.state, 'offline');
  // 5 s va 10 s da — 2 ta tasdiq bor, lekin 15 s o'tmagan
  let m = run(off, [ping(true, 5000), ping(true, 10000)]);
  assert.equal(m.state, 'offline');
  m = netReduce(m, ping(true, 15000));
  assert.equal(m.state, 'online');
});

test('offline: 5 s dan yaqin pinglar hisoblanmaydi; muvaffaqiyatsiz ping zanjirni uzadi', () => {
  const off = run(initialNet(0), [{ type: 'fail', at: 0 }, { type: 'fail', at: 0 }]);
  let m = run(off, [ping(true, 16000), ping(true, 18000)]); // orasi 2 s
  assert.equal(m.state, 'offline');
  assert.equal(m.okStreak, 1);
  m = run(off, [ping(true, 16000), ping(false, 21000), ping(true, 26000)]);
  assert.equal(m.state, 'offline', 'xato ping zanjirni uzdi — 1 ta tasdiq');
  m = netReduce(m, ping(true, 31000));
  assert.equal(m.state, 'online');
});

test('offline: boshqa so\'rov javobi (POST — reach) ham tasdiq sifatida hisoblanadi', () => {
  const off = run(initialNet(0), [{ type: 'fail', at: 0 }, { type: 'fail', at: 0 }]);
  const m = run(off, [{ type: 'reach', at: 16000 }, ping(true, 21000)]);
  assert.equal(m.state, 'online');
});

test('ping oralig\'i: online — yo\'q; oflaynda 5 → 10 → 20 → 40 → 60 → 60 s, tasdiqdan keyin yana 5 s', () => {
  assert.equal(nextPingDelay(initialNet(0)), null);
  let m = run(initialNet(0), [{ type: 'fail', at: 0 }, { type: 'fail', at: 0 }]);
  const seen = [nextPingDelay(m)];
  for (let i = 1; i <= 5; i++) {
    m = netReduce(m, ping(false, i * 1000));
    seen.push(nextPingDelay(m));
  }
  assert.deepEqual(seen, [5000, 10000, 20000, 40000, 60000, 60000]);
  m = netReduce(m, ping(true, 100000));
  assert.equal(nextPingDelay(m), 5000);
});

test('sekin holatda: sekin ping — oralig\'i oshadi, tez ping — 5 s', () => {
  let m = netReduce(initialNet(0), { type: 'timeout', small: true, at: 0 });
  assert.equal(nextPingDelay(m), 5000);
  m = netReduce(m, ping(true, 5000, 3000));
  assert.equal(nextPingDelay(m), 10000);
  m = netReduce(m, ping(true, 15000, 400));
  assert.equal(nextPingDelay(m), 5000);
});

test('wake: ilova oldinga chiqdi — ping oralig\'i boshidan', () => {
  let m = run(initialNet(0), [{ type: 'fail', at: 0 }, { type: 'fail', at: 0 }, ping(false, 1), ping(false, 2)]);
  assert.equal(nextPingDelay(m), 20000);
  m = netReduce(m, { type: 'wake', at: 3 });
  assert.equal(nextPingDelay(m), 5000);
  assert.equal(m.state, 'offline');
});
