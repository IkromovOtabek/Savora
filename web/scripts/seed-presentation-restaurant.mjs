/**
 * Savora — TAQDIMOT UCHUN restoran demo ma'lumotlari. MAVJUD restoranga (prod ham) menyu, xodimlar va o'tgan
 * N kunlik «jonli» faoliyatni yozadi: stol buyurtmalari, oshxona (KDS) vaqtlari, to'lovlar, kassa smenalari,
 * ombor kirimi va xarajatlar. Hammasi tizimning o'z mantiqi orqali (lib/restaurant/*, lib/cashShiftOps) —
 * hisobotlar, bosh sahifa, ombor qoldig'i va kassa bir-biriga mos chiqadi.
 *
 *   node --env-file=.env scripts/seed-presentation-restaurant.mjs --slug dom24                 — REJA (hech narsa yozmaydi)
 *   node --env-file=.env scripts/seed-presentation-restaurant.mjs --slug dom24 --apply         — yozadi (standart 30 kun)
 *   node --env-file=.env scripts/seed-presentation-restaurant.mjs --slug dom24 --apply --days 45
 *   node --env-file=.env scripts/seed-presentation-restaurant.mjs --slug dom24 --remove        — demo ma'lumotni o'chiradi
 *   node --env-file=.env scripts/seed-presentation-restaurant.mjs --slug dom24 --sync-master   — faqat master yozuvlari
 *
 * Uzoq bazada (Atlas, so'rov ~100+ ms) --apply soatlab ketadi (bir amal ≈ 19 so'rov). Unda: do'kon bazasini mongodump →
 * lokal mongod'da --apply → mongorestore --drop bilan qaytarish → prodda --sync-master (xodim loginlari master
 * katalogiga va do'kon ro'yxatiga, onboarding belgilari — tenant nusxasiga kirmaydigan qism).
 *
 * Qayta `--apply` — oxirgi demo buyurtmadan bugungacha bo'lgan bo'shliqni to'ldiradi (taqdimot oldidan yangilash).
 * Skript boshqa papkada turgan bo'lsa: SAVORA_WEB=/root/Savora/web (lib va node_modules shu yerdan olinadi).
 * Xodimlar paroli: DEMO_STAFF_PASSWORD (bo'lmasa — tasodifiy, faqat terminalga bir marta chiqadi).
 * Node ≥ 20.19 (CommonJS `require` orqali .ts yuklanadi — serverdagi Node 20 da ham ishlaydi).
 *
 * Belgilar (o'chirish shular bo'yicha, boshqa ma'lumotga tegilmaydi):
 *   buyurtmalar — clientOrderId `demo-…`; sotuvlar — shu buyurtmalarning orderId'si; mahsulotlar — itemCode `DEMO-…`;
 *   xodimlar — `<slug>_…` loginlari (STAFF ro'yxati); smena va xarajatlar — demo kassir yozgan.
 * Vaqt: skript ichida `Date` simulyatsiya qilinadi — har amal o'z (o'tgan) vaqtida bajariladi; Toshkent vaqti (UTC+5).
 * Bildirishnomalar (yangi sotuv push, smena farqi) skript davomida o'chiriladi — egaga yuzlab xabar bormaydi.
 * XAVFSIZLIK: haqiqiy sotuvi bor do'konga `--force` siz yozmaydi; restoran turida bo'lmasa — rad etadi.
 */
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

/* ───────────────────────────── argumentlar ───────────────────────────── */

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};
function refuse(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}
const SLUG = opt('slug');
const MODE = flag('remove') ? 'remove' : flag('sync-master') ? 'sync' : flag('apply') ? 'apply' : 'plan';
const DAYS = Math.min(90, Math.max(1, Number.parseInt(opt('days') ?? '30', 10) || 30));
const FORCE = flag('force');
if (!SLUG || !/^[a-z0-9-]{2,40}$/.test(SLUG)) refuse("--slug <do'kon-slug> majburiy (masalan: --slug dom24)");
if (!process.env.MONGO_URI) refuse("MONGO_URI yo'q — `node --env-file=.env …` bilan ishga tushiring.");

/* ───────────────────────────── simulyatsiya soati ───────────────────────────── */

const RealDate = Date;
let SIM = null;
class SimDate extends RealDate {
  constructor(...a) {
    if (a.length === 0 && SIM !== null) super(SIM);
    else super(...a);
  }
  static now() {
    return SIM !== null ? SIM : RealDate.now();
  }
}
// Mongoose sxema turini nomidan taniydi (`{ type: Date }`)
Object.defineProperty(SimDate, 'name', { value: 'Date' });
// Kutubxonalar yuklanishidan OLDIN (sxemadagi `default: Date.now` ham simulyatsiya soatini olsin)
globalThis.Date = SimDate;
const setClock = (ms) => { SIM = ms; };
/** Soatni oldinga surish (Date.now'dan olinadigan PRD-… kodlari takrorlanmasin) */
const tick = (ms = 1500) => { if (SIM !== null) SIM += ms; };
const realNow = () => RealDate.now();

const TZ = 5 * 3600e3; // Toshkent, UTC+5 (yozgi vaqt yo'q)
const MIN = 60e3;
/** Toshkent kuni (UTC yarim tun ms) → shu kunning soat:daqiqasi (absolyut ms) */
const at = (day, h, m = 0) => day + h * 3600e3 + m * MIN - TZ;
const dayOf = (ms) => Math.floor((ms + TZ) / 864e5) * 864e5;
const ymd = (day) => new RealDate(day).toISOString().slice(0, 10);
const hm = (ms) => new RealDate(ms + TZ).toISOString().slice(11, 16);

/* ───────────────────────────── TypeScript yuklagich (CommonJS) ───────────────────────────── */

const WEB = path.resolve(process.env.SAVORA_WEB || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const require = createRequire(path.join(WEB, 'package.json'));
const ts = require('typescript');

const resolveOrig = Module._resolveFilename;
Module._resolveFilename = function resolveTs(request, parent, isMain, options) {
  const req = request.startsWith('@/') ? path.join(WEB, request.slice(2)) : request;
  try {
    return resolveOrig.call(this, req, parent, isMain, options);
  } catch (e) {
    // `next/server` kabi kengaytmasiz paket ichki yo'li → `.js`
    if (e?.code === 'MODULE_NOT_FOUND' && !req.startsWith('.') && !path.isAbsolute(req) && !/\.[cm]?js$/.test(req)) {
      return resolveOrig.call(this, `${req}.js`, parent, isMain, options);
    }
    throw e;
  }
};
// __importStar faqat «o'z» xususiyatlarni ko'chiradi — mongoose kabi prototipdagi eksportlar yo'qolmasin (ts-hooks.mjs bilan bir xil)
globalThis.__savoraImportStar = (mod) => {
  if (mod && mod.__esModule) return mod;
  const ns = Object.create(mod && (typeof mod === 'object' || typeof mod === 'function') ? mod : null);
  Object.defineProperty(ns, 'default', { value: mod, enumerable: true });
  return ns;
};
function compileTs(module, filename) {
  const out = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, sourceMap: false },
  });
  module._compile(out.outputText.replace('(this && this.__importStar) ||', 'globalThis.__savoraImportStar ||'), filename);
}
Module._extensions['.ts'] = compileTs;
Module._extensions['.tsx'] = compileTs;
const lib = (p) => require(path.join(WEB, 'lib', `${p}.ts`));

/* ───────────────────────────── ma'lumot ───────────────────────────── */

const P = (name) => `${SLUG.replace(/-/g, '_')}_${name}`;
const STAFF = [
  { key: 'w1', username: P('aziz'), fullName: 'Aziz Karimov', role: 'Ofitsant', dayOff: 1 },
  { key: 'w2', username: P('jasur'), fullName: 'Jasur Toshmatov', role: 'Ofitsant', dayOff: 3 },
  { key: 'w3', username: P('madina'), fullName: 'Madina Yusupova', role: 'Ofitsant', dayOff: 5 },
  { key: 'chef', username: P('rustam'), fullName: 'Rustam Aliyev', role: 'Oshpaz' },
  { key: 'grill', username: P('bobur'), fullName: 'Bobur Rahimov', role: 'Oshpaz' },
  { key: 'bar', username: P('sardor'), fullName: 'Sardor Nazarov', role: 'Barmen' },
  { key: 'cashier', username: P('dilnoza'), fullName: 'Dilnoza Ergasheva', role: 'Kassir (restoran)' },
  { key: 'manager', username: P('shoxrux'), fullName: 'Shoxrux Qodirov', role: 'Administrator' },
];
const WAITERS = STAFF.filter((s) => s.role === 'Ofitsant');
const STATIONS = [
  { key: 'kitchen', name: 'Oshxona', kind: 'kitchen', cook: 'chef' },
  { key: 'grill', name: 'Mangal', kind: 'kitchen', cook: 'grill' },
  { key: 'bar', name: 'Bar', kind: 'bar', cook: 'bar' },
];
const CATS = {
  milliy: 'Milliy taomlar', shorva: "Sho'rvalar", mangal: 'Shashliklar', salat: 'Salatlar',
  non: 'Non va pishiriqlar', ichimlik: 'Ichimliklar', desert: 'Desertlar', raw: 'Xom ashyo',
};
/** Xom ashyo: omborda, menyuda emas. `step` — kirim yaxlitlash birligi */
const RAW = [
  ['GURUCH', 'Guruch (lazer)', 'kg', 16000], ['MOL', "Mol go'shti", 'kg', 98000], ['QOY', "Qo'y go'shti", 'kg', 110000],
  ['TOVUQ', 'Tovuq filesi', 'kg', 46000], ['JIGAR', "Qo'y jigari", 'kg', 60000], ['QIYMA', 'Qiyma (mol)', 'kg', 90000],
  ['SABZI', 'Sabzi', 'kg', 5000], ['PIYOZ', 'Piyoz', 'kg', 4000], ['KARTOSHKA', 'Kartoshka', 'kg', 6000],
  ['POMIDOR', 'Pomidor', 'kg', 14000], ['BODRING', 'Bodring', 'kg', 11000], ['QALAMPIR', "Bulg'or qalampiri", 'kg', 18000],
  ['SALAT', 'Aysberg salat', 'kg', 32000], ['PISHLOQ', 'Pishloq', 'kg', 85000], ['MAYONEZ', 'Mayonez', 'kg', 28000],
  ['UN', 'Un (oliy nav)', 'kg', 7000], ['TUXUM', 'Tuxum', 'dona', 1500], ['YOG', "O'simlik yog'i", 'l', 22000],
  ['KOFE', 'Kofe doni', 'kg', 240000], ['SUT', 'Sut', 'l', 12000], ['KOLBASA', 'Kolbasa (doktorskaya)', 'kg', 70000],
].map(([code, name, unit, cost]) => ({ code: `DEMO-${code}`, name, unit, cost }));
const r = (code) => `DEMO-${code}`;
/** Taomlar: retsept 1 porsiyaga (asosiy birlikda), `prep` — tayyorlash daqiqasi [min, max] */
const DISHES = [
  { code: 'DEMO-OSH', name: "To'y oshi", cat: 'milliy', price: 45000, st: 'kitchen', prep: [3, 6], ikpu: '10202001001000000',
    recipe: [['GURUCH', 0.15], ['MOL', 0.1], ['SABZI', 0.12], ['YOG', 0.03], ['PIYOZ', 0.03]],
    mods: [
      { name: 'Porsiya', required: true, min: 1, max: 1, options: [{ name: 'Oddiy', price: 0 }, { name: 'Katta', price: 15000 }] },
      { name: "Qo'shimcha", required: false, min: 0, max: 2, options: [{ name: 'Qazi', price: 12000 }, { name: 'Bedana tuxum', price: 5000 }] },
    ] },
  { code: 'DEMO-LAGMON', name: "Lag'mon", cat: 'milliy', price: 38000, st: 'kitchen', prep: [10, 15],
    recipe: [['UN', 0.12], ['MOL', 0.08], ['PIYOZ', 0.03], ['POMIDOR', 0.05], ['QALAMPIR', 0.03], ['YOG', 0.02]] },
  { code: 'DEMO-MANTI', name: 'Manti (5 dona)', cat: 'milliy', price: 34000, st: 'kitchen', prep: [18, 25],
    recipe: [['UN', 0.12], ['QOY', 0.12], ['PIYOZ', 0.06]] },
  { code: 'DEMO-QOZON', name: 'Qozon kabob', cat: 'milliy', price: 58000, st: 'kitchen', prep: [20, 28],
    recipe: [['QOY', 0.2], ['KARTOSHKA', 0.2], ['PIYOZ', 0.04], ['YOG', 0.03]] },
  { code: 'DEMO-DIMLAMA', name: 'Dimlama', cat: 'milliy', price: 42000, st: 'kitchen', prep: [8, 14],
    recipe: [['MOL', 0.12], ['KARTOSHKA', 0.15], ['SABZI', 0.08], ['PIYOZ', 0.05], ['QALAMPIR', 0.05], ['POMIDOR', 0.05]] },
  { code: 'DEMO-MASTAVA', name: 'Mastava', cat: 'shorva', price: 28000, st: 'kitchen', prep: [4, 8],
    recipe: [['GURUCH', 0.05], ['MOL', 0.06], ['KARTOSHKA', 0.08], ['SABZI', 0.04], ['POMIDOR', 0.04]] },
  { code: 'DEMO-SHORVA', name: "Sho'rva", cat: 'shorva', price: 36000, st: 'kitchen', prep: [4, 8],
    recipe: [['QOY', 0.15], ['KARTOSHKA', 0.15], ['SABZI', 0.05], ['PIYOZ', 0.03]] },
  { code: 'DEMO-SH-MOL', name: "Mol go'shti shashlik", cat: 'mangal', price: 24000, st: 'grill', prep: [12, 18], recipe: [['MOL', 0.12], ['PIYOZ', 0.03]] },
  { code: 'DEMO-SH-QOY', name: "Qo'y go'shti shashlik", cat: 'mangal', price: 27000, st: 'grill', prep: [12, 18], recipe: [['QOY', 0.12], ['PIYOZ', 0.03]] },
  { code: 'DEMO-SH-JIGAR', name: 'Jigar shashlik', cat: 'mangal', price: 18000, st: 'grill', prep: [10, 15], recipe: [['JIGAR', 0.12], ['PIYOZ', 0.02]] },
  { code: 'DEMO-SH-TOVUQ', name: 'Tovuq shashlik', cat: 'mangal', price: 19000, st: 'grill', prep: [12, 16], recipe: [['TOVUQ', 0.15]] },
  { code: 'DEMO-LULA', name: 'Lula kabob', cat: 'mangal', price: 22000, st: 'grill', prep: [10, 15], recipe: [['QIYMA', 0.13], ['PIYOZ', 0.03]] },
  { code: 'DEMO-ACHCHIQ', name: 'Achchiq-chuchuk', cat: 'salat', price: 15000, st: 'kitchen', prep: [4, 7], recipe: [['POMIDOR', 0.15], ['BODRING', 0.1], ['PIYOZ', 0.03]] },
  { code: 'DEMO-SEZAR', name: 'Sezar salat', cat: 'salat', price: 34000, st: 'kitchen', prep: [6, 10],
    recipe: [['TOVUQ', 0.12], ['SALAT', 0.08], ['PISHLOQ', 0.03], ['POMIDOR', 0.04]] },
  { code: 'DEMO-OLIVYE', name: 'Olivye', cat: 'salat', price: 26000, st: 'kitchen', prep: [4, 7],
    recipe: [['KOLBASA', 0.08], ['KARTOSHKA', 0.1], ['TUXUM', 1], ['BODRING', 0.05], ['MAYONEZ', 0.05]] },
  { code: 'DEMO-YUNON', name: 'Yunon salati', cat: 'salat', price: 30000, st: 'kitchen', prep: [5, 8],
    recipe: [['POMIDOR', 0.1], ['BODRING', 0.1], ['QALAMPIR', 0.05], ['PISHLOQ', 0.05], ['YOG', 0.01]] },
  { code: 'DEMO-SOMSA', name: 'Tandir somsa', cat: 'non', price: 12000, st: 'kitchen', prep: [3, 6], recipe: [['UN', 0.08], ['QOY', 0.06], ['PIYOZ', 0.04], ['YOG', 0.01]] },
  { code: 'DEMO-AMERIKANO', name: 'Kofe Amerikano', cat: 'ichimlik', price: 18000, st: 'bar', prep: [2, 4], recipe: [['KOFE', 0.012]],
    mods: [{ name: 'Hajmi', required: true, min: 1, max: 1, options: [{ name: 'Kichik', price: 0 }, { name: 'Katta', price: 6000 }] }] },
  { code: 'DEMO-KAPUCHINO', name: 'Kapuchino', cat: 'ichimlik', price: 22000, st: 'bar', prep: [3, 5], recipe: [['KOFE', 0.012], ['SUT', 0.15]] },
].map((d) => ({ ...d, recipe: d.recipe.map(([c, q]) => [r(c), q]) }));
/** Retseptsiz xizmat (ombor o'zgarmaydi) */
const SERVICES = [
  { code: 'DEMO-CHOY-KOK', name: "Ko'k choy (choynak)", cat: 'ichimlik', price: 8000, cost: 1500, st: 'bar', prep: [1, 3] },
  { code: 'DEMO-CHOY-QORA', name: 'Qora choy (choynak)', cat: 'ichimlik', price: 8000, cost: 1500, st: 'bar', prep: [1, 3] },
  { code: 'DEMO-CHOY-LIMON', name: 'Limonli choy', cat: 'ichimlik', price: 12000, cost: 3000, st: 'bar', prep: [2, 4] },
  { code: 'DEMO-KOMPOT', name: 'Kompot (1 l)', cat: 'ichimlik', price: 15000, cost: 5000, st: 'bar', prep: [1, 2] },
];
/** Tayyor tovar: omborda sanaladi va menyuda. Stansiyasiz — darhol beriladi */
const GOODS = [
  { code: 'DEMO-NON', name: 'Tandir non', cat: 'non', unit: 'dona', price: 5000, cost: 3000, daily: true },
  { code: 'DEMO-COLA', name: 'Coca-Cola 0,5 l', cat: 'ichimlik', unit: 'dona', price: 10000, cost: 6500 },
  { code: 'DEMO-FANTA', name: 'Fanta 0,5 l', cat: 'ichimlik', unit: 'dona', price: 10000, cost: 6500 },
  { code: 'DEMO-SUV', name: 'Mineral suv 0,5 l', cat: 'ichimlik', unit: 'dona', price: 6000, cost: 3000 },
  { code: 'DEMO-NAPOLEON', name: 'Napoleon (bo\'lak)', cat: 'desert', unit: 'dona', price: 22000, cost: 12000, st: 'bar', prep: [1, 3] },
  { code: 'DEMO-CHAKCHAK', name: 'Chak-chak', cat: 'desert', unit: 'dona', price: 18000, cost: 9000, st: 'bar', prep: [1, 2] },
  { code: 'DEMO-MUZQAYMOQ', name: 'Muzqaymoq', cat: 'desert', unit: 'dona', price: 15000, cost: 7000, st: 'bar', prep: [1, 3] },
];
const MENU = new Map([...DISHES, ...SERVICES, ...GOODS].map((x) => [x.code, x]));
const PAY_WEIGHTS = [['cash', 42], ['uzcard', 18], ['humo', 16], ['click', 12], ['payme', 8], ['uzqr', 4]];
const VOID_REASONS = ["Mijoz fikrini o'zgartirdi", 'Ofitsant xato kiritdi', 'Mijoz kutishni xohlamadi'];
const SETTINGS = { serviceChargePct: 10, takeawayPackFee: 3000, requireVoidReason: true, kdsWarnMinutes: 12, kdsAlertMinutes: 25 };

/* ───────────────────────────── tasodif (kun bo'yicha takrorlanadigan) ───────────────────────────── */

function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    real: (lo, hi) => lo + next() * (hi - lo),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (pairs) => {
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let x = next() * total;
      for (const [v, w] of pairs) if ((x -= w) < 0) return v;
      return pairs[pairs.length - 1][0];
    },
  };
}

/* ───────────────────────────── kun rejasi (buyurtmalar) ───────────────────────────── */

const HOURS = [[10, 2], [11, 4], [12, 10], [13, 11], [14, 7], [15, 4], [16, 3], [17, 4], [18, 8], [19, 11], [20, 10], [21, 6], [22, 2]];
const BASE_ORDERS = [42, 30, 30, 31, 32, 37, 47]; // Yakshanba … Shanba

function line(code, qty, mods) {
  return { code, qty, ...(mods ? { mods } : {}) };
}
/** Mehmonlar soniga mos buyurtma tarkibi */
function tableItems(R, guests, dinner) {
  const out = new Map();
  const add = (code, qty, mods) => {
    const key = mods ? `${code}|${JSON.stringify(mods)}` : code;
    const prev = out.get(key);
    if (prev) prev.qty += qty;
    else out.set(key, line(code, qty, mods));
  };
  const mains = dinner
    ? [['osh', 14], ['DEMO-LAGMON', 10], ['DEMO-MANTI', 8], ['DEMO-QOZON', 10], ['DEMO-DIMLAMA', 6], ['DEMO-SHORVA', 6], ['DEMO-MASTAVA', 3], ['shashlik', 40]]
    : [['osh', 30], ['DEMO-LAGMON', 16], ['DEMO-MANTI', 10], ['DEMO-QOZON', 4], ['DEMO-DIMLAMA', 7], ['DEMO-SHORVA', 8], ['DEMO-MASTAVA', 9], ['shashlik', 16]];
  for (let g = 0; g < guests; g++) {
    const m = R.weighted(mains);
    if (m === 'osh') {
      const mods = { Porsiya: R.chance(0.2) ? 'Katta' : 'Oddiy', ...(R.chance(0.15) ? { "Qo'shimcha": 'Qazi' } : {}) };
      add('DEMO-OSH', 1, mods);
    } else if (m === 'shashlik') {
      const n = R.int(2, 3);
      for (let k = 0; k < n; k++) add(R.weighted([['DEMO-SH-MOL', 35], ['DEMO-SH-QOY', 25], ['DEMO-LULA', 18], ['DEMO-SH-TOVUQ', 12], ['DEMO-SH-JIGAR', 10]]), 1);
    } else {
      add(m, 1);
    }
  }
  const salads = Math.max(0, Math.round(guests * R.real(0.25, 0.7)));
  for (let k = 0; k < salads; k++) add(R.weighted([['DEMO-ACHCHIQ', 40], ['DEMO-SEZAR', 20], ['DEMO-OLIVYE', 20], ['DEMO-YUNON', 20]]), 1);
  if (R.chance(0.85)) add('DEMO-NON', Math.max(1, Math.ceil(guests / 2)));
  if (R.chance(0.8)) add(R.weighted([['DEMO-CHOY-KOK', 60], ['DEMO-CHOY-QORA', 25], ['DEMO-CHOY-LIMON', 15]]), Math.max(1, Math.round(guests / 2)));
  if (R.chance(0.35)) add(R.weighted([['DEMO-COLA', 40], ['DEMO-FANTA', 25], ['DEMO-SUV', 35]]), R.int(1, Math.min(3, guests)));
  if (R.chance(0.15)) add('DEMO-KOMPOT', 1);
  if (R.chance(dinner ? 0.12 : 0.06)) add('DEMO-SOMSA', R.int(1, guests));
  return [...out.values()];
}
function secondRound(R) {
  const kind = R.weighted([['desert', 45], ['kofe', 30], ['choy', 15], ['shashlik', 10]]);
  if (kind === 'desert') return [line(R.weighted([['DEMO-NAPOLEON', 40], ['DEMO-CHAKCHAK', 30], ['DEMO-MUZQAYMOQ', 30]]), R.int(1, 3))];
  if (kind === 'kofe') {
    return R.chance(0.5) ? [line('DEMO-AMERIKANO', R.int(1, 2), { Hajmi: R.chance(0.3) ? 'Katta' : 'Kichik' })] : [line('DEMO-KAPUCHINO', R.int(1, 2))];
  }
  if (kind === 'choy') return [line('DEMO-CHOY-KOK', 1)];
  return [line('DEMO-SH-MOL', R.int(2, 4))];
}
function takeawayItems(R) {
  const kind = R.weighted([['osh', 35], ['somsa', 25], ['shashlik', 20], ['lagmon', 12], ['mix', 8]]);
  const out = [];
  if (kind === 'osh' || kind === 'mix') out.push(line('DEMO-OSH', R.int(1, 4), { Porsiya: 'Oddiy' }));
  if (kind === 'somsa' || kind === 'mix') out.push(line('DEMO-SOMSA', R.int(2, 8)));
  if (kind === 'shashlik') out.push(line(R.weighted([['DEMO-SH-MOL', 50], ['DEMO-LULA', 30], ['DEMO-SH-TOVUQ', 20]]), R.int(4, 10)));
  if (kind === 'lagmon') out.push(line('DEMO-LAGMON', R.int(1, 3)));
  if (R.chance(0.5)) out.push(line('DEMO-NON', R.int(1, 3)));
  if (R.chance(0.3)) out.push(line('DEMO-COLA', R.int(1, 2)));
  return out;
}

/**
 * Bir kunlik reja: buyurtmalar va har birining vaqt jadvali. Stollar band bo'lishi hisobga olinadi (bir stolda bir
 * vaqtda bitta buyurtma). Hodisalar keyin umumiy vaqt tartibida bajariladi (soat faqat oldinga yuradi).
 */
function planDay(day, tables) {
  const R = makeRng(Number(ymd(day).replace(/-/g, '')));
  const dow = new RealDate(day).getUTCDay();
  const count = Math.round(BASE_ORDERS[dow] * R.real(0.85, 1.15));
  const opens = Array.from({ length: count }, () => {
    const h = R.weighted(HOURS);
    return at(day, h, R.int(0, 59)) + R.int(0, 59) * 1e3;
  }).sort((a, b) => a - b);
  const waiters = WAITERS.filter((w) => w.dayOff !== dow);
  const busyUntil = new Map(tables.map((t) => [t.id, 0]));
  const orders = [];

  opens.forEach((t0, n) => {
    const dinner = t0 >= at(day, 16);
    const rush = (t0 >= at(day, 12, 30) && t0 < at(day, 14)) || (t0 >= at(day, 19) && t0 < at(day, 21));
    let type = R.chance(0.18) ? 'takeaway' : 'dine_in';
    let table = null;
    if (type === 'dine_in') {
      const free = tables.filter((tb) => busyUntil.get(tb.id) < t0);
      if (!free.length) type = 'takeaway';
      else table = R.pick(free);
    }
    const o = {
      key: `demo-${ymd(day).replace(/-/g, '')}-${String(n + 1).padStart(3, '0')}`,
      day, type, table, events: [], rounds: [], voids: [],
    };
    const guests = type === 'dine_in' ? R.weighted([[1, 8], [2, 30], [3, 22], [4, 22], [5, 9], [6, 6], [7, 2], [8, 1]]) : 1;
    o.guests = guests;
    o.waiter = type === 'dine_in' ? R.pick(waiters).key : 'cashier';
    const ev = (t, kind, extra = {}) => o.events.push({ t: Math.round(t), kind, o, ...extra });

    o.rounds.push(type === 'dine_in' ? tableItems(R, guests, dinner) : takeawayItems(R));
    ev(t0, 'open');
    // Bekor qilingan buyurtma (yuborilmasdan)
    if (type === 'dine_in' && R.chance(0.015)) {
      o.cancelled = true;
      ev(t0 + R.int(2, 5) * MIN, 'cancel');
      busyUntil.set(table.id, t0 + 6 * MIN);
      orders.push(o);
      return;
    }

    let cursor = t0;
    let lastServe = t0;
    const scheduleRound = (ri, sendAt) => {
      ev(sendAt, 'send', { round: ri });
      // Stansiya bo'yicha: oshpaz boshlaydi → har taom o'z vaqtida tayyor → ofitsant olib boradi
      const groups = new Map();
      o.rounds[ri].forEach((it, idx) => {
        const st = MENU.get(it.code).st;
        if (!st) return;
        if (!groups.has(st)) groups.set(st, []);
        groups.get(st).push(idx);
      });
      // Bekor qilish (oshxonaga yuborilgandan keyin) — faqat 1-raundda
      let voidIdx = null;
      let voidAfterCook = false;
      if (ri === 0 && type === 'dine_in' && R.chance(0.05)) {
        const cand = [...groups.values()].flat();
        if (cand.length > 1) {
          voidIdx = R.pick(cand);
          voidAfterCook = R.chance(0.25);
        }
      }
      let roundEnd = sendAt;
      for (const [st, idxs] of groups) {
        const slow = R.chance(0.08) ? R.int(8, 15) * MIN : 0;
        const cookAt = sendAt + R.int(60, rush ? 300 : 150) * 1e3 + slow;
        const live = idxs.filter((i) => i !== voidIdx);
        if (voidIdx !== null && idxs.includes(voidIdx)) {
          const vAt = voidAfterCook ? cookAt + R.int(60, 150) * 1e3 : sendAt + R.int(15, 50) * 1e3;
          o.voids.push({ round: ri, idx: voidIdx, afterCook: voidAfterCook });
          ev(vAt, 'void', { round: ri, idx: voidIdx, reason: voidAfterCook ? 'Taom sifatsiz chiqdi — qayta tayyorlandi' : R.pick(VOID_REASONS), afterCook: voidAfterCook });
        }
        if (!live.length && !(voidAfterCook && idxs.includes(voidIdx))) continue;
        ev(cookAt, 'cook', { round: ri, idxs: voidAfterCook ? idxs : live, station: st });
        let maxReady = cookAt;
        for (const i of live) {
          const [lo, hi] = MENU.get(o.rounds[ri][i].code).prep;
          const readyAt = cookAt + R.real(lo, hi) * MIN * (rush ? 1.2 : 1);
          maxReady = Math.max(maxReady, readyAt);
          ev(readyAt, 'ready', { round: ri, idxs: [i], station: st });
        }
        if (live.length) {
          const serveAt = maxReady + R.int(40, rush ? 300 : 180) * 1e3;
          ev(serveAt, 'serve', { round: ri, idxs: live });
          roundEnd = Math.max(roundEnd, serveAt);
        }
      }
      return roundEnd;
    };

    cursor = scheduleRound(0, t0 + R.int(60, 240) * 1e3);
    lastServe = cursor;
    if (type === 'dine_in' && R.chance(0.2)) {
      const addAt = lastServe + R.int(8, 25) * MIN;
      o.rounds.push(secondRound(R));
      ev(addAt, 'add', { round: 1 });
      lastServe = scheduleRound(1, addAt + R.int(30, 120) * 1e3);
    }
    let payAt;
    if (type === 'dine_in') {
      const pre = lastServe + (dinner ? R.int(25, 60) : R.int(15, 35)) * MIN;
      ev(pre, 'precheck');
      payAt = pre + R.int(2, 6) * MIN;
    } else {
      payAt = lastServe + R.int(20, 90) * 1e3;
    }
    o.discount = R.chance(0.05);
    o.pay = { method: R.weighted(PAY_WEIGHTS), split: R.chance(0.07), tenderUp: R.chance(0.5) };
    ev(payAt, 'pay');
    if (table) busyUntil.set(table.id, payAt + 2 * MIN);
    o.endAt = payAt;
    orders.push(o);
  });
  return orders;
}

/* ───────────────────────────── ishga tushirish ───────────────────────────── */

const { getMasterModels } = lib('masterDb');
const { getTenantModels } = lib('tenantDb');
const { getBaseConnection } = lib('db');
const { resolveOrgFeatures } = lib('features');
const { loadUserPermissions } = lib('permissionGuard');
const { getDictionary } = lib('i18n/dict/index');
const { ensureDefaultRoles } = lib('roles');
const { reserveUsername, isUsernameAvailable, releaseUsername, lookupUser } = lib('userDirectory');
const { markOnboardingStep } = lib('onboarding');
const { addOrgUser, removeOrgUserByUsername } = lib('orgUsers');
const { generateProductCode, generateSku } = lib('productId');
const setup = lib('restaurant/setup');
const menu = lib('restaurant/menuAdmin');
const { ensureMenuFlags } = lib('restaurant/menuFlags');
const ops = lib('restaurant/ops');
const { computePartTotals, effectiveServicePct, isBillable } = lib('restaurant/bill');
const shiftOps = lib('cashShiftOps');
const { receiveStock } = lib('production/stock');
const { getStockQty } = lib('productQuantity');
// Bildirishnomalar o'chiriladi (CommonJS eksport ob'ekti — chaqiruv paytida o'qiladi)
const shopNotify = lib('shopNotify');
shopNotify.notifyNewSale = async () => {};
shopNotify.notifyShiftClosed = async () => {};

const d = getDictionary('uz');
const fmt = (n) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

function must(res, what) {
  if (!res || res.ok === false) throw new Error(`${what}: ${res?.error ?? 'xato'}`);
  return res.data;
}

async function loadOrg() {
  const { Organization } = await getMasterModels();
  const org = await Organization.findOne({ slug: SLUG }).lean();
  if (!org) refuse(`«${SLUG}» do'koni topilmadi.`);
  if (org.businessType !== 'restaurant') refuse(`«${SLUG}» restoran turida emas (${org.businessType}).`);
  return org;
}

async function makeCtx(org, m, features, u) {
  const user = {
    id: String(u._id), username: u.username, role: u.role === 'admin' ? 'admin' : 'user', tokenVersion: u.tokenVersion ?? 0,
    organizationId: String(org._id), dbName: org.dbName, ...(u.role !== 'admin' && u.branchId ? { branchId: String(u.branchId) } : {}),
  };
  return { user, orgId: String(org._id), orgSlug: org.slug, m, features, perms: await loadUserPermissions(user), d, via: '' };
}

/** Hozirgi holat: demo va haqiqiy ma'lumot sonlari */
async function status(m) {
  const demoOrders = await m.Order.find({ clientOrderId: /^demo-/ }).select('_id openedAt status').lean();
  const ids = demoOrders.map((o) => o._id);
  const [products, demoProducts, realSales, demoSales, users] = await Promise.all([
    m.Product.countDocuments({}),
    m.Product.countDocuments({ itemCode: /^DEMO-/ }),
    m.Sale.countDocuments({ orderId: { $nin: ids } }),
    m.Sale.countDocuments({ orderId: { $in: ids } }),
    m.User.find({ username: { $in: STAFF.map((s) => s.username) } }).select('username').lean(),
  ]);
  const last = demoOrders.reduce((mx, o) => Math.max(mx, +new RealDate(o.openedAt)), 0);
  return { demoOrders, ids, products, demoProducts, realSales, demoSales, demoUsers: users.map((u) => u.username), last };
}

/* ───────────── sozlash: rollar, xodimlar, stansiyalar, menyu ───────────── */

async function ensureSetup(org, m, features, adminCtx, branchId, password, initialQty) {
  await ensureDefaultRoles(m.Role, 'restaurant');
  for (const s of STAFF) {
    const role = await m.Role.findOne({ name: s.role }).select('_id').lean();
    if (!role) throw new Error(`Rol «${s.role}» topilmadi.`);
    if (await m.User.exists({ username: s.username })) continue;
    if (!(await isUsernameAvailable(s.username))) throw new Error(`«${s.username}» login boshqa do'konda band.`);
    const u = new m.User({
      username: s.username, password, role: 'user', fullName: s.fullName, branchId, staff: true, roleId: role._id,
      active: true, mustChangePassword: false,
    });
    await u.save();
    try {
      await reserveUsername({ username: s.username, organizationId: String(org._id), dbName: org.dbName, role: 'user', branchId: String(branchId) });
    } catch (e) {
      await m.User.deleteOne({ _id: u._id });
      throw e;
    }
    await addOrgUser(String(org._id), { username: s.username, name: s.fullName, role: 'user', branchId: String(branchId) });
    console.log(`✓ Xodim: ${s.fullName} — ${s.username} (${s.role})`);
  }

  must(await setup.saveRestaurantSettings(adminCtx, SETTINGS), 'Restoran sozlamalari');

  const stationIds = {};
  for (const [i, s] of STATIONS.entries()) {
    const st = await m.KitchenStation.findOne({ branchId, name: s.name }).lean();
    stationIds[s.key] = st ? String(st._id) : must(await setup.saveStation(adminCtx, { name: s.name, kind: s.kind, branchId: String(branchId), sort: i }), `Stansiya ${s.name}`).id;
  }

  const catIds = {};
  for (const [key, name] of Object.entries(CATS)) {
    const c = await m.ProductCategory.findOne({ name, parentId: null }).lean()
      ?? await m.ProductCategory.create({ name, parentId: null, createdBy: adminCtx.user.username });
    catIds[key] = c._id;
  }
  await ensureMenuFlags(m);

  const ids = {};
  const byCode = async (code) => (await m.Product.findOne({ itemCode: code, branchId }).select('_id').lean())?._id ?? null;
  const newGoods = (p, cat) => (tick(), m.Product.create({
    productId: generateProductCode(), itemCode: p.code, imei: generateSku(), kind: 'goods', name: p.name,
    purchasePrice: p.cost, salePrice: 0, trackQuantity: true, quantity: initialQty(p), soldQuantity: 0, status: 'in_stock',
    branchId, unit: p.unit, category: CATS[cat], categoryId: catIds[cat], menuItem: false, createdBy: adminCtx.user.username,
    history: [{ action: 'created', detail: "Mahsulot qo'shildi", by: adminCtx.user.username, at: new Date() }],
  }));
  let created = 0;
  let stockValue = 0;
  for (const p of RAW) {
    const found = await byCode(p.code);
    if (found) { ids[p.code] = found; continue; }
    ids[p.code] = (await newGoods(p, 'raw'))._id;
    stockValue += initialQty(p) * p.cost;
    created++;
  }
  for (const p of GOODS) {
    const found = await byCode(p.code);
    if (found) { ids[p.code] = found; continue; }
    const doc = await newGoods(p, p.cat);
    stockValue += initialQty(p) * p.cost;
    must(await menu.saveMenuDish(adminCtx, {
      type: 'goods', productId: String(doc._id), name: p.name, price: p.price, categoryId: String(catIds[p.cat]),
      stationId: p.st ? stationIds[p.st] : null,
    }), `Menyu ${p.name}`);
    ids[p.code] = doc._id;
    created++;
  }
  for (const p of [...DISHES, ...SERVICES]) {
    const found = await byCode(p.code);
    if (found) { ids[p.code] = found; continue; }
    tick();
    const res = must(await menu.saveMenuDish(adminCtx, {
      type: p.recipe ? 'dish' : 'service', branchId: String(branchId), name: p.name, price: p.price, categoryId: String(catIds[p.cat]),
      stationId: p.st ? stationIds[p.st] : null,
      ...(p.recipe ? { recipe: p.recipe.map(([code, qty]) => ({ productId: String(ids[code]), qty })) } : { cost: p.cost }),
      ...(p.mods ? { modifierGroups: p.mods } : {}),
      ...(p.ikpu ? { ikpu: p.ikpu } : {}),
    }), `Menyu ${p.name}`);
    await m.Product.updateOne({ _id: res.id }, { $set: { itemCode: p.code } });
    ids[p.code] = res.id;
    created++;
  }
  if (created) console.log(`✓ Ombor va menyu: ${created} ta mahsulot qo'shildi (${RAW.length} xom ashyo, ${DISHES.length + SERVICES.length + GOODS.length} menyu pozitsiyasi)`);
  if (created) await markOnboardingStep(String(org._id), 'productAdded');
  if (stockValue > 0) {
    await m.CashFlow.create({ type: 'expense', amount: Math.round(stockValue / 1000) * 1000, category: 'Boshqa xarajat',
      description: "Boshlang'ich zaxira (oziq-ovqat va ichimliklar)", recordedBy: STAFF.find((x) => x.key === 'cashier').username });
  }
  // Indekslar (noyob stol buyurtmasi, idempotentlik) tayyor bo'lsin
  await Promise.all(Object.values(m).filter((x) => x && typeof x.init === 'function').map((x) => x.init().catch(() => {})));
  return ids;
}

/** Modifikator variantlari: code → { guruh → { variant nomi → _id } } */
async function optionMap(m, ids) {
  const docs = await m.Product.find({ _id: { $in: Object.values(ids) } }).select('itemCode modifierGroups').lean();
  const map = new Map();
  for (const p of docs) {
    const g = {};
    for (const grp of p.modifierGroups ?? []) g[grp.name] = Object.fromEntries((grp.options ?? []).map((o) => [o.name, String(o._id)]));
    map.set(p.itemCode, g);
  }
  return map;
}

/* ───────────── ombor kirimi: rejadagi sarf bo'yicha (hech qachon tugamasin) ───────────── */

function usageByDay(plans) {
  const out = new Map(); // day → Map(code → qty)
  for (const o of plans) {
    if (o.cancelled) continue;
    const u = out.get(o.day) ?? new Map();
    out.set(o.day, u);
    for (const round of o.rounds) {
      for (const it of round) {
        const p = MENU.get(it.code);
        if (p.recipe) for (const [code, q] of p.recipe) u.set(code, (u.get(code) ?? 0) + q * it.qty);
        else if (GOODS.includes(p)) u.set(p.code, (u.get(p.code) ?? 0) + it.qty);
      }
    }
  }
  return out;
}
const STOCKED = [...RAW, ...GOODS];
const stepOf = (p) => (p.unit === 'dona' ? 10 : 1);
const roundUp = (q, p) => Math.ceil(q / stepOf(p)) * stepOf(p);
function restockPlan(usage, day, days) {
  const need = new Map();
  for (let k = 0; k < days; k++) {
    for (const [code, q] of usage.get(day + k * 864e5) ?? []) need.set(code, (need.get(code) ?? 0) + q);
  }
  return need;
}
/** Kirim — lib/production/stock → receiveStock (qoldiq = quantity − soldQuantity, o'rtacha tannarx, holat) */
async function doRestock(m, ids, branchId, need, factor, onlyCodes, by) {
  let sum = 0;
  let n = 0;
  for (const p of STOCKED) {
    if (onlyCodes && !onlyCodes.has(p.code)) continue;
    const want = (need.get(p.code) ?? 0) * factor;
    if (!want) continue;
    const doc = await m.Product.findById(ids[p.code]).lean();
    if (!doc) throw new Error(`${p.name} topilmadi`);
    const addQty = roundUp(Math.max(0, want - getStockQty(doc)), p);
    if (!addQty) continue;
    const res = await receiveStock(m.Product, {
      branchId, template: doc, code: p.code, qty: addQty, unitCost: p.cost,
      history: { action: 'restocked', detail: `Kirim: +${addQty} ${p.unit}`, by, at: new Date() },
      by, expiryDate: null, supplierId: null,
    });
    if (!res.ok) throw new Error(`Kirim ${p.name}: ${res.reason}`);
    sum += addQty * p.cost;
    n++;
  }
  return { sum, n };
}

/* ───────────── hodisalarni bajarish ───────────── */

function payParts(R, total, plan) {
  if (plan.split && total > 20000) {
    const cash = Math.round((total * R.real(0.3, 0.6)) / 1000) * 1000;
    return [{ method: 'cash', amount: cash }, { method: plan.method === 'cash' ? 'uzcard' : plan.method, amount: total - cash }];
  }
  if (plan.method === 'cash') {
    const step = R.pick([5000, 10000, 50000]);
    return [{ method: 'cash', amount: plan.tenderUp ? Math.ceil(total / step) * step : total }];
  }
  return [{ method: plan.method, amount: total }];
}

async function runEvents(env, events, onDayDone) {
  const { m, ctxs, ids, opts } = env;
  const R = makeRng(4242);
  let stop = false;
  const onSig = () => { stop = true; console.log("\n… to'xtatilmoqda (joriy buyurtmalar tozalanadi)"); };
  process.once('SIGINT', onSig);
  const failed = new Set();
  const stats = { orders: 0, paid: 0, cancelled: 0, revenue: 0, errors: 0 };
  let curDay = null;

  for (const e of events) {
    if (stop) break;
    const o = e.o;
    if (o && failed.has(o)) continue;
    if (curDay !== null && dayOf(e.t) !== curDay) await onDayDone(curDay);
    curDay = dayOf(e.t);
    setClock(e.t);
    try {
      if (e.kind === 'restock' || e.kind === 'expense' || e.kind === 'shiftOpen' || e.kind === 'shiftClose') {
        await e.run();
        continue;
      }
      const ctxOf = (key) => ctxs[key];
      const itemIds = (round, idxs) => idxs.map((i) => o.ids[round][i]).filter(Boolean);
      const toInputs = (round) => o.rounds[round].map((it) => {
        const groups = opts.get(it.code) ?? {};
        const optionIds = it.mods ? Object.entries(it.mods).map(([g, v]) => groups[g]?.[v]).filter(Boolean) : [];
        return { productId: String(ids[it.code]), qty: it.qty, ...(optionIds.length ? { optionIds } : {}) };
      });
      switch (e.kind) {
        case 'open': {
          const res = must(await ops.openOrder(ctxOf(o.waiter), {
            type: o.type, ...(o.table ? { tableId: o.table.id } : {}), ...(o.type === 'dine_in' ? { guests: o.guests } : {}),
            clientOrderId: o.key, items: toInputs(0),
          }), 'Stol ochish');
          if (res.existing) throw new Error(`stol band yoki takror (${o.key})`);
          o.id = res.order.id;
          o.ids = [res.order.items.map((i) => i.id)];
          stats.orders++;
          break;
        }
        case 'add': {
          const res = must(await ops.addItems(ctxOf(o.waiter), o.id, toInputs(e.round)), "Taom qo'shish");
          o.ids[e.round] = res.added;
          break;
        }
        case 'send': {
          const res = must(await ops.sendItems(ctxOf(o.waiter), o.id, o.ids[e.round]), 'Oshxonaga yuborish');
          if (res.failed.length) throw new Error(`yuborilmadi: ${res.failed.map((f) => `${f.name} (${f.reason})`).join(', ')}`);
          break;
        }
        case 'void':
          must(await ops.voidItem(ctxOf('manager'), o.id, { itemId: o.ids[e.round][e.idx], reason: e.reason }), 'Bekor qilish');
          break;
        case 'cook':
          must(await ops.bumpItems(ctxOf(STATIONS.find((s) => s.key === e.station).cook), o.id, { itemIds: itemIds(e.round, e.idxs), to: 'cooking' }), 'Oshxona: boshlandi');
          break;
        case 'ready':
          must(await ops.bumpItems(ctxOf(STATIONS.find((s) => s.key === e.station).cook), o.id, { itemIds: itemIds(e.round, e.idxs), to: 'ready' }), 'Oshxona: tayyor');
          break;
        case 'serve':
          must(await ops.bumpItems(ctxOf(o.waiter), o.id, { itemIds: itemIds(e.round, e.idxs), to: 'served' }), 'Yetkazildi');
          break;
        case 'precheck':
          must(await ops.precheckOrder(ctxOf(o.waiter), o.id), 'Pre-chek');
          break;
        case 'cancel':
          must(await ops.cancelOrder(ctxOf(o.waiter), o.id, 'Mijoz ketib qoldi'), 'Bekor qilish');
          stats.cancelled++;
          break;
        case 'pay': {
          // To'lanadigan summa — payOrder bilan aynan bir xil hisob (lib/restaurant/bill)
          const doc = await m.Order.findById(o.id).lean();
          const unpaid = doc.items.filter((i) => isBillable(i) && !i.paidCheckoutId);
          const discount = o.discount ? { kind: 'percent', value: 10 } : null;
          const totals = computePartTotals(unpaid, {
            servicePct: effectiveServicePct(doc.type, doc.serviceChargePct),
            packFee: !doc.packFeePaid && doc.packFee > 0 ? doc.packFee : 0,
            discount,
          });
          if (!totals) throw new Error("to'lov summasi hisoblanmadi");
          const res = must(await ops.payOrder(ctxOf(o.discount ? 'manager' : 'cashier'), o.id, {
            parts: payParts(R, totals.total, o.pay), ...(discount ? { discount } : {}),
          }), "To'lov");
          if (!res.closed) throw new Error("buyurtma to'liq yopilmadi");
          stats.paid++;
          stats.revenue += res.total;
          break;
        }
        default:
          throw new Error(`noma'lum hodisa ${e.kind}`);
      }
    } catch (err) {
      stats.errors++;
      if (o) failed.add(o);
      console.error(`  ✖ ${o?.key ?? e.kind} ${ymd(dayOf(e.t))} ${hm(e.t)}: ${err instanceof Error ? err.message : err}`);
      if (o?.id) {
        const doc = await m.Order.findById(o.id).lean();
        if (doc && ['open', 'precheck'].includes(doc.status)) await abortOrder(ctxs.manager, doc);
      }
      if (stats.errors > 25) {
        console.error("✖ Xatolar ko'p — to'xtatildi.");
        stop = true;
      }
    }
  }
  if (curDay !== null && !stop) await onDayDone(curDay);
  process.removeListener('SIGINT', onSig);
  return { stats, failed, stopped: stop };
}

/** Demo buyurtmani bekor qiladi (taomlari bekor, ombor qaytadi) — stol bo'shaydi */
async function abortOrder(ctx, o) {
  try {
    if (o.status === 'precheck') must(await ops.reopenOrder(ctx, String(o._id)), 'Qayta ochish');
    for (const it of o.items) {
      if (it.status === 'voided' || it.paidCheckoutId) continue;
      await ops.voidItem(ctx, String(o._id), { itemId: String(it._id), reason: 'Mijoz ketib qoldi' });
    }
    must(await ops.cancelOrder(ctx, String(o._id), 'Mijoz ketib qoldi'), 'Bekor qilish');
    console.log(`  • ${o.orderNo} bekor qilindi (stol bo'shadi)`);
  } catch (err) {
    console.error(`  ✖ ${o.orderNo} ochiq qoldi: ${err instanceof Error ? err.message : err} — qo'lda yoping`);
  }
}

/** Ochiq qolgan demo buyurtmalar (oldingi uzilish) — ochilgan vaqtidan 5 daqiqa keyin bekor */
async function cleanupOpen(env) {
  const open = await env.m.Order.find({ clientOrderId: /^demo-/, status: { $in: ['open', 'precheck'] } }).lean();
  for (const o of open) {
    setClock(+new RealDate(o.openedAt) + 5 * MIN);
    await abortOrder(env.ctxs.manager, o);
  }
  setClock(null);
}

/* ───────────── master yozuvlari (tenant bazasi boshqa joyda to'ldirilgan bo'lsa) ───────────── */

async function syncMaster(org, m, st) {
  const users = await m.User.find({ username: { $in: STAFF.map((s) => s.username) } }).select('username fullName branchId').lean();
  const listed = new Set((org.users ?? []).map((u) => u.username));
  let reserved = 0;
  let addedToOrg = 0;
  for (const u of users) {
    const dir = await lookupUser(u.username);
    if (dir && dir.organizationId !== String(org._id)) throw new Error(`«${u.username}» login boshqa do'konda band.`);
    if (!dir) {
      await reserveUsername({ username: u.username, organizationId: String(org._id), dbName: org.dbName, role: 'user', ...(u.branchId ? { branchId: String(u.branchId) } : {}) });
      reserved++;
    }
    if (!listed.has(u.username)) {
      await addOrgUser(String(org._id), { username: u.username, name: u.fullName, role: 'user', ...(u.branchId ? { branchId: String(u.branchId) } : {}) });
      addedToOrg++;
    }
  }
  if (st.demoProducts) await markOnboardingStep(String(org._id), 'productAdded');
  if (st.demoSales) await markOnboardingStep(String(org._id), 'saleMade');
  console.log(`✓ Master: ${users.length} xodim — katalogga ${reserved}, do'kon ro'yxatiga ${addedToOrg} ta qo'shildi; onboarding belgilari yangilandi`);
}

/* ───────────── o'chirish ───────────── */

async function removeDemo(org, m) {
  const st = await status(m);
  const users = await m.User.find({ username: { $in: STAFF.map((s) => s.username) } }).select('_id username').lean();
  const demoProducts = await m.Product.find({ itemCode: /^DEMO-/ }).setOptions({ withDeleted: true }).select('_id').lean();
  const productIds = demoProducts.map((p) => p._id);
  const names = STAFF.map((s) => s.username);
  const shifts = await m.CashShift.find({ openedBy: { $in: names } }).select('_id').lean();
  const entityIds = [...st.ids, ...productIds, ...shifts.map((s) => s._id)].map(String);

  const sales = await m.Sale.deleteMany({ orderId: { $in: st.ids } });
  const orders = await m.Order.deleteMany({ _id: { $in: st.ids } });
  const products = await m.Product.deleteMany({ _id: { $in: productIds } }).setOptions({ withDeleted: true });
  const flows = await m.CashFlow.deleteMany({ $or: [{ recordedBy: { $in: names } }, { shiftId: { $in: shifts.map((s) => s._id) } }] });
  const shiftDel = await m.CashShift.deleteMany({ _id: { $in: shifts.map((s) => s._id) } });
  const audits = await m.AuditLog.deleteMany({ $or: [{ entityId: { $in: entityIds } }, { by: { $in: names } }] });
  for (const u of users) {
    await m.User.deleteOne({ _id: u._id });
    await releaseUsername(u.username).catch(() => {});
    await removeOrgUserByUsername(String(org._id), u.username).catch(() => {});
  }
  // Seed yaratgan stansiya va kategoriyalar — boshqa mahsulot ishlatmasa
  let st2 = 0;
  for (const s of STATIONS) {
    const doc = await m.KitchenStation.findOne({ name: s.name }).select('_id').lean();
    if (doc && !(await m.Product.exists({ stationId: doc._id }))) { await m.KitchenStation.deleteOne({ _id: doc._id }); st2++; }
  }
  let cats = 0;
  for (const name of Object.values(CATS)) {
    const doc = await m.ProductCategory.findOne({ name, parentId: null }).select('_id').lean();
    if (doc && !(await m.Product.exists({ categoryId: doc._id }).setOptions({ withDeleted: true }))) { await m.ProductCategory.deleteOne({ _id: doc._id }); cats++; }
  }
  console.log(`✓ O'chirildi: ${orders.deletedCount} buyurtma, ${sales.deletedCount} sotuv qatori, ${products.deletedCount} mahsulot, `
    + `${shiftDel.deletedCount} smena, ${flows.deletedCount} kassa yozuvi, ${audits.deletedCount} audit, ${users.length} xodim, ${st2} stansiya, ${cats} kategoriya`);
  console.log("  Qoldi: rollar, restoran sozlamalari (xizmat haqi 10% va h.k.), zal/stollar, hisoblagichlar — kerak bo'lsa sozlamadan o'zgartiring.");
}

/* ───────────── asosiy ───────────── */

async function main() {
  const org = await loadOrg();
  const features = resolveOrgFeatures(org);
  const m = await getTenantModels(org.dbName);
  const st = await status(m);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log(`Do'kon: ${org.name} (${org.slug}, ${org.dbName}) · holat ${org.status} · muddati ${org.expiresAt ? ymd(dayOf(+new RealDate(org.expiresAt))) : '—'} · server TZ ${tz}`);
  console.log(`Modullar: tables=${!!features.tables} kitchen=${!!features.kitchen} qrMenu=${!!features.qrMenu}`);
  console.log(`Hozir: ${st.products} mahsulot (demo ${st.demoProducts}), demo buyurtma ${st.demoOrders.length}, demo sotuv ${st.demoSales}, `
    + `haqiqiy sotuv ${st.realSales}, demo xodim ${st.demoUsers.length}/${STAFF.length}${st.last ? `, oxirgi demo buyurtma ${ymd(dayOf(st.last))} ${hm(st.last)}` : ''}`);

  if (MODE === 'remove') {
    await removeDemo(org, m);
    return;
  }
  if (MODE === 'sync') {
    await syncMaster(org, m, st);
    return;
  }
  if (!features.tables || !features.kitchen) refuse("Do'konda «Stollar» yoki «Oshxona» moduli o'chiq — avval tarif/modulni yoqing.");
  if (st.realSales > 0 && !FORCE) refuse(`Do'konda ${st.realSales} ta haqiqiy sotuv bor — demo aralashmasin. Baribir yozish uchun: --force`);

  const admin = await m.User.findOne({ username: org.adminUsername, role: 'admin' }).lean();
  if (!admin) refuse(`Admin «${org.adminUsername}» topilmadi.`);
  const tablesDocs = await m.Table.find({ active: true }).sort({ number: 1 }).select('_id number branchId').lean();
  if (!tablesDocs.length) refuse("Do'konda stol yo'q — avval Restoran sozlamalari → Zal va stollar.");
  const branchId = tablesDocs[0].branchId;
  const tables = tablesDocs.filter((t) => String(t.branchId) === String(branchId)).map((t) => ({ id: String(t._id), number: t.number }));

  // Reja: oxirgi demo buyurtmadan (yoki N kun oldindan) hozirgacha
  const now = realNow();
  const today = dayOf(now);
  const firstDay = st.last ? dayOf(st.last) : today - (DAYS - 1) * 864e5;
  const startAfter = st.last || 0;
  const allPlans = [];
  for (let day = firstDay; day <= today; day += 864e5) allPlans.push(...planDay(day, tables));
  const plans = allPlans.filter((o) => o.events[0].t > startAfter && o.events[o.events.length - 1].t < now - 2 * MIN);
  const usage = usageByDay(allPlans);
  const estRevenue = plans.reduce((s, o) => s + (o.cancelled ? 0 : o.rounds.flat().reduce((a, it) => a + MENU.get(it.code).price * it.qty, 0)), 0);
  console.log(`\nReja: ${ymd(firstDay)} … ${ymd(today)} — ${plans.length} buyurtma (${plans.filter((o) => o.type === 'takeaway').length} saboy, `
    + `${plans.filter((o) => o.cancelled).length} bekor), taxminiy tushum ~${fmt(estRevenue * 1.08)} so'm; ${tables.length} stol, xodimlar: ${STAFF.length}`);
  if (MODE === 'plan') {
    const conn = await getBaseConnection();
    const pings = [];
    for (let i = 0; i < 5; i++) {
      const t = realNow();
      await conn.db.admin().ping();
      pings.push(realNow() - t);
    }
    const ping = pings.sort((a, b) => a - b)[2];
    const actions = plans.reduce((s, o) => s + o.events.length, 0);
    // Bir amal ≈ 19 ta so'rov (lokal o'lchov: buyurtma, ombor, sotuv qatorlari, ko'rinish, audit)
    const minutes = Math.max(1, Math.round((actions * 19 * (ping + 1.5)) / 60e3));
    console.log(`Baza kechikishi ~${ping} ms → ${actions} amal, taxminan ${minutes} daqiqa${minutes > 60 ? ' — uzoq: lokal nusxada --apply qilib, mongorestore bilan yuklang (yuqoridagi izoh)' : ''}`);
    console.log("\nBu faqat reja — hech narsa yozilmadi. Yozish uchun: --apply (o'chirish: --remove)");
    return;
  }
  if (!plans.length) {
    console.log("• Qo'shiladigan yangi buyurtma yo'q (demo ma'lumot yangi).");
    return;
  }

  // Sozlash — birinchi demo kunidan oldin (ertalab)
  const simStart = at(firstDay, 7);
  setClock(st.last ? Math.max(st.last, now - 864e5 * DAYS) : simStart);
  const password = process.env.DEMO_STAFF_PASSWORD || `Demo-${randomBytes(4).toString('hex')}`;
  const adminCtx = await makeCtx(org, m, features, admin);
  const newUsers = STAFF.filter((s) => !st.demoUsers.includes(s.username)).length;
  // Boshlang'ich qoldiq — birinchi kirim (haftalik; non — kunlik), mahsulot 0 qoldiq bilan yaratilmaydi
  const firstWeek = restockPlan(usage, firstDay, 7);
  const firstDayNeed = restockPlan(usage, firstDay, 1);
  const initialQty = (p) => roundUp(Math.max(stepOf(p), p.daily ? (firstDayNeed.get(p.code) ?? 0) * 1.1 : (firstWeek.get(p.code) ?? 0) * 1.15), p);
  const ids = await ensureSetup(org, m, features, adminCtx, branchId, password, initialQty);
  setClock(null);
  if (newUsers && !process.env.DEMO_STAFF_PASSWORD) console.log(`  Xodimlar paroli (faqat shu yerda ko'rinadi): ${password}`);

  const ctxs = { admin: adminCtx };
  for (const s of STAFF) ctxs[s.key] = await makeCtx(org, m, features, await m.User.findOne({ username: s.username }).lean());
  const opts = await optionMap(m, ids);
  const env = { m, ctxs, ids, opts };
  await cleanupOpen(env);

  // Kunlik hodisalar: kirim, xarajat, smena — buyurtmalar bilan bir vaqt chizig'ida
  const cashierName = ctxs.cashier.user.username;
  const extra = [];
  const k = d.sales.shifts;
  for (let day = firstDay; day <= today; day += 864e5) {
    const date = new RealDate(day);
    const dom = date.getUTCDate();
    const dow = date.getUTCDay();
    const push = (t, kind, run) => { if (t > startAfter && t < now - MIN) extra.push({ t, kind, run }); };
    // Kirim: dushanba va birinchi kuni — haftalik; non — har kuni
    const weekly = day === firstDay || dow === 1;
    push(at(day, 8), 'restock', async () => {
      const dailyCodes = new Set(GOODS.filter((g) => g.daily).map((g) => g.code));
      const buys = [{ codes: dailyCodes, days: 1, factor: 1.1, label: () => 'Non (novvoyxona)' }];
      if (weekly) buys.push({ codes: new Set(STOCKED.map((p) => p.code).filter((c) => !dailyCodes.has(c))), days: 7, factor: 1.15, label: (n) => `Oziq-ovqat xaridi (bozor, ${n} xil)` });
      for (const b of buys) {
        const { sum, n } = await doRestock(m, ids, branchId, restockPlan(usage, day, b.days), b.factor, b.codes, admin.username);
        if (sum > 0) {
          await m.CashFlow.create({ type: 'expense', amount: Math.round(sum / 1000) * 1000, category: 'Boshqa xarajat', description: b.label(n), recordedBy: cashierName });
        }
      }
    });
    const expense = (h, category, amount, description) => push(at(day, h, 30), 'expense', () =>
      m.CashFlow.create({ type: 'expense', amount, category, description, recordedBy: cashierName }));
    if (dom === 1) { expense(8, 'Ijara', 9000000, 'Bino ijarasi (oylik)'); expense(8, 'Ish haqi', 18500000, 'Xodimlar oyligi'); }
    if (dom === 5) expense(8, 'Kommunal xizmatlar', 1650000, 'Elektr, gaz, suv');
    if (dom === 10) expense(8, 'Reklama', 1200000, 'Instagram reklama');
    if (dom === 15) expense(8, 'Ish haqi', 7000000, 'Avans');
    if (dow === 3) expense(8, 'Transport', 150000, 'Mahsulot tashish');
    // Kassa smenasi: 09:50 ochiladi, 23:30 yopiladi (sanalgan = kutilgan, ba'zan kichik farq)
    push(at(day, 9, 50), 'shiftOpen', async () => {
      const res = await shiftOps.openShift(ctxs.cashier.user, m, k, { branchId: String(branchId), openingCash: 500000 });
      if ('error' in res && res.error !== k.alreadyOpen) throw new Error(res.error);
    });
    push(at(day, 23, 30), 'shiftClose', async () => {
      const shift = await m.CashShift.findOne({ status: 'open', openedBy: cashierName }).lean();
      if (!shift) return;
      const totals = await shiftOps.shiftTotalsNow(m, shift, new Date());
      const R = makeRng(day / 1000);
      const diff = R.chance(0.1) ? -R.int(1, 4) * 5000 : 0;
      const res = await shiftOps.closeShift(ctxs.cashier.user, m, k, { shiftId: String(shift._id), countedCash: Math.max(0, Math.round(totals.current) + diff) });
      if ('error' in res) throw new Error(res.error);
    });
  }

  const events = [...extra, ...plans.flatMap((o) => o.events)]
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => a.t - b.t || a.i - b.i);
  console.log(`\nBajarilmoqda: ${events.length} amal…`);
  const t0 = realNow();
  const dayStats = new Map();
  const { stats, failed, stopped } = await runEvents(env, events, async (day) => {
    const [agg] = await m.Sale.aggregate([
      { $match: { createdAt: { $gte: new RealDate(day - TZ), $lt: new RealDate(day - TZ + 864e5) }, orderId: { $exists: true } } },
      { $group: { _id: null, sum: { $sum: '$paidAmount' }, orders: { $addToSet: '$orderId' } } },
    ]);
    if (!dayStats.has(day)) {
      dayStats.set(day, true);
      console.log(`  ${ymd(day)}: ${agg?.orders.length ?? 0} buyurtma, ${fmt(agg?.sum ?? 0)} so'm`);
    }
  });
  if (failed.size || stopped) await cleanupOpen(env);
  setClock(null);
  console.log(`\n✓ Tayyor (${Math.round((realNow() - t0) / 1000)} s): ${stats.orders} buyurtma ochildi, ${stats.paid} to'landi, ${stats.cancelled} bekor, `
    + `tushum ${fmt(stats.revenue)} so'm${stats.errors ? `, xato ${stats.errors}` : ''}${stopped ? " — TO'XTATILDI, qayta --apply qolganini to'ldiradi" : ''}`);
  console.log(`Kirish: /t/${org.slug}/login — ${STAFF.map((s) => `${s.username} (${s.role})`).join(', ')}`);
}

let code = 0;
try {
  await main();
} catch (e) {
  console.error('✖ Xato:', e instanceof Error ? e.stack : e);
  code = 1;
} finally {
  setClock(null);
  await (await getBaseConnection()).close().catch(() => {});
}
process.exit(code);
