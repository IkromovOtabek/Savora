/**
 * Savora — TAQDIMOT UCHUN telefon do'koni demo ma'lumotlari. MAVJUD do'konga (prod ham — faqat ruxsat etilgan
 * slug'larga, pastdagi ALLOWED) o'tgan N kunlik «jonli» savdoni yozadi: telefonlar (IMEI) va aksessuarlar, filialga
 * o'tkazish, kassa (POS) sotuvlari — naqd/karta/aralash, nasiya va oylik to'lovlar, bank krediti (Kredit kassa) va
 * bank o'tkazmalari, qarzga sotuv, qaytarish, kassa smenalari va xarajatlar. Hammasi tizimning o'z server amallari
 * orqali (app/actions/*: sessiya, huquq va ombor tekshiruvlari bilan) — hisobotlar, kassa, nasiya jadvali va
 * Kredit kassa bir-biriga mos chiqadi.
 *
 *   node --env-file=.env scripts/seed-presentation-phone.mjs --slug rami                — REJA (hech narsa yozmaydi)
 *   node --env-file=.env scripts/seed-presentation-phone.mjs --slug rami --sync-master  — master: turi «Telefon do'kon»,
 *        tarif limitlari (kamida 5 filial / 15 xodim / 5000 mahsulot), demo xodim loginlari, onboarding belgilari
 *   node --env-file=.env scripts/seed-presentation-phone.mjs --slug rami --apply        — yozadi (standart 30 kun)
 *   node --env-file=.env scripts/seed-presentation-phone.mjs --slug rami --remove       — demo ma'lumotni o'chiradi
 *
 * Uzoq bazada (Atlas) --apply juda sekin: do'kon bazasini mongodump → lokal mongod'da --sync-master va --apply →
 * mongorestore --drop bilan qaytarish → prodda --sync-master (restoran seed'i bilan bir xil yo'l).
 * Skript boshqa papkada turgan bo'lsa: SAVORA_WEB=/root/Savora/web. Xodimlar paroli: DEMO_STAFF_PASSWORD.
 *
 * Belgilar (o'chirish shular bo'yicha): xodimlar — `<slug>_…` loginlari (STAFF); mahsulotlar — demo xodim yaratgan;
 * sotuvlar — demo xodim sotgan; o'tkazmalar, smenalar — demo xodim; bank tushumlari va xarajatlar — egasi nomidan,
 * DEMO_NOTES matnlari bilan. Vaqt simulyatsiya qilinadi (Toshkent, UTC+5); tasodif — urug'li (qayta ishga tushsa bir xil).
 * Ataylab YOZILMAYDI: IMEI qora ro'yxati va sharhlar (master — barcha do'konlarga umumiy), Telegram/push xabarlari.
 * XAVFSIZLIK: haqiqiy sotuvi bor do'konga `--force` siz yozmaydi; ALLOWED'da bo'lmagan slug — faqat lokal bazada.
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
const DAYS = Math.min(60, Math.max(3, Number.parseInt(opt('days') ?? '30', 10) || 30));
const FORCE = flag('force');
if (!SLUG || !/^[a-z0-9-]{2,40}$/.test(SLUG)) refuse("--slug <do'kon-slug> majburiy (masalan: --slug rami)");
if (!process.env.MONGO_URI) refuse("MONGO_URI yo'q — `node --env-file=.env …` bilan ishga tushiring.");
/** Prodda demo ma'lumot faqat shu do'konlarga (egasi tasdiqlagan; qolganlari — haqiqiy mijozlar) */
const ALLOWED = ['rami'];
const LOCAL_DB = /^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(process.env.MONGO_URI);
if (!ALLOWED.includes(SLUG) && !LOCAL_DB) refuse(`«${SLUG}» demo ro'yxatida yo'q (${ALLOWED.join(', ')}) — prod bazada boshqa do'konga yozilmaydi.`);

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
Object.defineProperty(SimDate, 'name', { value: 'Date' });
globalThis.Date = SimDate;
const setClock = (ms) => { SIM = ms; };
const realNow = () => RealDate.now();

const TZ = 5 * 3600e3; // Toshkent, UTC+5
const MIN = 60e3;
const DAY = 864e5;
const at = (day, h, m = 0) => day + h * 3600e3 + m * MIN - TZ;
const dayOf = (ms) => Math.floor((ms + TZ) / DAY) * DAY;
const ymd = (day) => new RealDate(day).toISOString().slice(0, 10);
const dom = (day) => new RealDate(day).getUTCDate();
const dow = (day) => new RealDate(day).getUTCDay(); // 0 — yakshanba
const fmt = (n) => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' ');

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
    if (e?.code === 'MODULE_NOT_FOUND' && !req.startsWith('.') && !path.isAbsolute(req) && !/\.[cm]?js$/.test(req)) {
      return resolveOrig.call(this, `${req}.js`, parent, isMain, options);
    }
    throw e;
  }
};
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
const action = (p) => require(path.join(WEB, 'app', 'actions', `${p}.ts`));

/* ───────── Next.js muhiti o'rnida: sessiya — joriy simulyatsiya foydalanuvchisi, redirect — signal ───────── */

const CURRENT = { user: null };
class SeedRedirect extends Error {
  constructor(url) {
    super(`redirect → ${url}`);
    this.url = String(url);
    // Amallar `catch` ichida redirect'ni shu belgidan taniydi va qayta otadi (Next.js bilan bir xil)
    this.digest = `NEXT_REDIRECT;replace;${url};307;`;
  }
}
function stubModule(request, exports) {
  const file = require.resolve(request);
  const mod = new Module(file);
  mod.filename = file;
  mod.loaded = true;
  mod.exports = exports;
  require.cache[file] = mod;
}
stubModule('next/cache', { revalidatePath() {}, revalidateTag() {}, unstable_cache: (fn) => fn });
stubModule('next/navigation', {
  redirect(url) { throw new SeedRedirect(url); },
  permanentRedirect(url) { throw new SeedRedirect(url); },
  notFound() { throw new SeedRedirect('not-found'); },
});
stubModule('next/headers', {
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set() {}, delete() {} }),
  headers: async () => new Headers(),
});
stubModule(path.join(WEB, 'lib', 'session.ts'), {
  getSession: async () => ({ user: CURRENT.user ?? undefined, save: async () => {}, destroy() {} }),
  extendSession() {},
});

/* ───────────────────────────── urug'li tasodif ───────────────────────────── */

let seed = [...`savora-phone-${SLUG}`].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
function rnd() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
function pickW(items, w = (x) => x.w) {
  const total = items.reduce((s, x) => s + w(x), 0);
  let r = rnd() * total;
  for (const x of items) if ((r -= w(x)) < 0) return x;
  return items[items.length - 1];
}
const round = (n, step) => Math.round(n / step) * step;

/* ───────────────────────────── ma'lumot ───────────────────────────── */

const P = (name) => `${SLUG.replace(/-/g, '_')}_${name}`;
const STAFF = [
  { key: 'manager', username: P('jamshid'), fullName: 'Jamshid Olimov', role: 'Menejer', branch: 'main' },
  { key: 'mainSeller', username: P('sardor'), fullName: 'Sardor Rasulov', role: 'Sotuvchi', branch: 'main', dayOff: 1 },
  { key: 'filSeller', username: P('nodira'), fullName: 'Nodira Hasanova', role: 'Sotuvchi', branch: 'fil' },
];
const CAT_PHONES = 'Smartfonlar';
const CAT_ACC = 'Aksessuarlar';
const DEMO_BANKS = ['Uzum Nasiya', 'Alif'];
const RECEIPT_NOTE = (n) => `${n} ta shartnoma bo'yicha o'tkazma`;
const RECEIPT_NOTE_RE = /^\d+ ta shartnoma bo'yicha o'tkazma$/;

// Telefonlar: narxlar so'mda (kelish / sotish), w — talab, stock — boshlang'ich dona
const PHONES = [
  { key: 'i17pm', brand: 'Apple', name: 'iPhone 17 Pro Max 256GB', buy: 17_200_000, sell: 18_900_000, colors: ['Cosmic Orange', 'Deep Blue', 'Silver'], w: 5, stock: 5, tac: '35325511' },
  { key: 'i17p', brand: 'Apple', name: 'iPhone 17 Pro 256GB', buy: 15_400_000, sell: 16_900_000, colors: ['Deep Blue', 'Silver', 'Cosmic Orange'], w: 5, stock: 5, tac: '35325512' },
  { key: 'i17', brand: 'Apple', name: 'iPhone 17 256GB', buy: 11_300_000, sell: 12_500_000, colors: ['Black', 'Lavender', 'Sage'], w: 7, stock: 6, tac: '35325513' },
  { key: 'i17air', brand: 'Apple', name: 'iPhone 17 Air 256GB', buy: 12_800_000, sell: 14_100_000, colors: ['Space Black', 'Sky Blue'], w: 3, stock: 3, tac: '35325514' },
  { key: 'i16', brand: 'Apple', name: 'iPhone 16 128GB', buy: 9_300_000, sell: 10_300_000, colors: ['Black', 'Teal', 'Pink'], w: 8, stock: 6, tac: '35325515' },
  { key: 'i15', brand: 'Apple', name: 'iPhone 15 128GB', buy: 7_900_000, sell: 8_800_000, colors: ['Black', 'Blue'], w: 6, stock: 5, tac: '35325516' },
  { key: 's25u', brand: 'Samsung', name: 'Galaxy S25 Ultra 256GB', buy: 13_900_000, sell: 15_400_000, colors: ['Titanium Black', 'Titanium Silverblue'], w: 4, stock: 4, tac: '35467812' },
  { key: 's25fe', brand: 'Samsung', name: 'Galaxy S25 FE 128GB', buy: 6_900_000, sell: 7_700_000, colors: ['Navy', 'Icyblue'], w: 4, stock: 4, tac: '35467813' },
  { key: 'a56', brand: 'Samsung', name: 'Galaxy A56 256GB', buy: 4_900_000, sell: 5_500_000, colors: ['Awesome Graphite', 'Awesome Lightgray'], w: 8, stock: 6, tac: '35467814' },
  { key: 'a36', brand: 'Samsung', name: 'Galaxy A36 128GB', buy: 3_700_000, sell: 4_200_000, colors: ['Awesome Black', 'Awesome Lavender'], w: 8, stock: 6, tac: '35467815' },
  { key: 'a16', brand: 'Samsung', name: 'Galaxy A16 128GB', buy: 2_050_000, sell: 2_400_000, colors: ['Black', 'Light Green'], w: 9, stock: 7, tac: '35467816' },
  { key: 'x15t', brand: 'Xiaomi', name: 'Xiaomi 15T Pro 512GB', buy: 8_200_000, sell: 9_100_000, colors: ['Black', 'Mocha Gold'], w: 3, stock: 3, tac: '86471205' },
  { key: 'rn14p', brand: 'Xiaomi', name: 'Redmi Note 14 Pro 256GB', buy: 3_350_000, sell: 3_800_000, colors: ['Midnight Black', 'Lavender Purple'], w: 9, stock: 7, tac: '86471206' },
  { key: 'rn14', brand: 'Xiaomi', name: 'Redmi Note 14 128GB', buy: 2_250_000, sell: 2_600_000, colors: ['Midnight Black', 'Mist Purple'], w: 9, stock: 7, tac: '86471207' },
  { key: 'r14c', brand: 'Xiaomi', name: 'Redmi 14C 128GB', buy: 1_450_000, sell: 1_700_000, colors: ['Midnight Black', 'Sage Green'], w: 8, stock: 6, tac: '86471208' },
  { key: 'h400', brand: 'Honor', name: 'Honor 400 256GB', buy: 4_600_000, sell: 5_200_000, colors: ['Midnight Black', 'Desert Gold'], w: 3, stock: 3, tac: '86790307' },
  { key: 'tc40', brand: 'Tecno', name: 'Tecno Camon 40 256GB', buy: 2_600_000, sell: 3_000_000, colors: ['Galaxy Black', 'Emerald Lake Green'], w: 4, stock: 4, tac: '35898409' },
];
// Aksessuarlar (sanaladigan): har filialga alohida kirim
const ACCS = [
  { key: 'case', brand: 'Baseus', name: 'Chexol silikon (iPhone 15–17)', buy: 45_000, sell: 90_000, main: 110, fil: 60, w: 10, attach: 0.5 },
  { key: 'glass', brand: 'Baseus', name: 'Himoya oynasi 3D', buy: 15_000, sell: 50_000, main: 160, fil: 90, w: 12, attach: 0.6 },
  { key: 'charger', brand: 'Anker', name: 'Zaryadlovchi 20W USB-C', buy: 120_000, sell: 220_000, main: 30, fil: 18, w: 5, attach: 0.15 },
  { key: 'cable', brand: 'Anker', name: 'Kabel USB-C 1 m', buy: 25_000, sell: 60_000, main: 50, fil: 30, w: 6, attach: 0.1 },
  { key: 'pbank', brand: 'Baseus', name: 'Powerbank 10000 mAh', buy: 160_000, sell: 260_000, main: 20, fil: 12, w: 3, attach: 0 },
  { key: 'holder', brand: 'Baseus', name: 'Avtomobil ushlagichi', buy: 50_000, sell: 110_000, main: 18, fil: 10, w: 2, attach: 0 },
  { key: 'airpods', brand: 'Apple', name: 'AirPods 4', buy: 1_750_000, sell: 2_050_000, main: 12, fil: 6, w: 2, attach: 0 },
  { key: 'buds', brand: 'Samsung', name: 'Galaxy Buds3 FE', buy: 900_000, sell: 1_100_000, main: 12, fil: 6, w: 2, attach: 0 },
];
const ACC_BRANDS = [...new Set(ACCS.map((a) => a.brand))];
const BRANDS = [...new Set([...PHONES.map((p) => p.brand), ...ACC_BRANDS])];
const FIRST = ['Akmal', 'Bekzod', 'Dilshod', 'Eldor', 'Farrux', 'G\'ayrat', 'Hasan', 'Islom', 'Javohir', 'Kamol', 'Laziz', 'Mansur', 'Nodir',
  'Otabek', 'Rustam', 'Sanjar', 'Temur', 'Ulug\'bek', 'Xurshid', 'Zafar', 'Aziza', 'Barno', 'Dildora', 'Feruza', 'Gulnora', 'Hilola', 'Kamola',
  'Lola', 'Madina', 'Nargiza', 'Ozoda', 'Shahnoza', 'Umida', 'Zarina', 'Sevara', 'Mohira'];
const LAST_M = ['Abdullayev', 'Aliyev', 'Karimov', 'Rahimov', 'Tursunov', 'Yusupov', 'Ergashev', 'Qodirov', 'Saidov', 'Mirzayev', 'Nazarov',
  'Xolmatov', 'Ismoilov', 'Raximov', 'Sobirov', 'Jo\'rayev', 'Hamidov', 'Umarov'];
const FEMALE = new Set(['Aziza', 'Barno', 'Dildora', 'Feruza', 'Gulnora', 'Hilola', 'Kamola', 'Lola', 'Madina', 'Nargiza', 'Ozoda', 'Shahnoza',
  'Umida', 'Zarina', 'Sevara', 'Mohira']);
const OPS = ['90', '91', '93', '94', '97', '99', '33', '88', '95', '50'];
// Xarajatlar: oy kuni → yozuvlar (egasi kiritadi). branch: main | fil | undefined (umumiy)
const EXPENSES = [
  { day: 1, category: 'Ijara', amount: 12_000_000, note: 'Ijara — Asosiy do\'kon', branch: 'main' },
  { day: 1, category: 'Ijara', amount: 7_000_000, note: 'Ijara — filial', branch: 'fil' },
  { day: 3, category: 'Reklama', amount: 1_200_000, note: 'Instagram reklama (target)' },
  { day: 5, category: 'Ish haqi', amount: 6_000_000, note: 'Ish haqi — Jamshid Olimov' },
  { day: 5, category: 'Ish haqi', amount: 4_500_000, note: 'Ish haqi — Sardor Rasulov' },
  { day: 5, category: 'Ish haqi', amount: 4_500_000, note: 'Ish haqi — Nodira Hasanova' },
  { day: 10, category: 'Kommunal xizmatlar', amount: 850_000, note: 'Elektr va internet — Asosiy do\'kon', branch: 'main' },
  { day: 10, category: 'Kommunal xizmatlar', amount: 520_000, note: 'Elektr va internet — filial', branch: 'fil' },
  { day: 15, category: 'Soliq', amount: 6_800_000, note: 'Aylanmadan olinadigan soliq' },
  { day: 17, category: 'Reklama', amount: 900_000, note: 'Telegram kanal reklamasi' },
  { day: 20, category: 'Boshqa xarajat', amount: 350_000, note: 'Vitrina va chiroqlar ta\'miri', branch: 'main' },
];
const DELIVERY_NOTE = 'Toshkentdan tovar olib kelish';
const DEMO_NOTES = new Set([...EXPENSES.map((e) => e.note), DELIVERY_NOTE]);
const RETURN_REASONS = ['Mijoz boshqa rangini tanladi', 'Zaryadlovchi ishlamadi — almashtirildi', 'Mos kelmadi — mijoz qaytardi'];

/* ───────────────────────────── kutubxonalar ───────────────────────────── */

const { getMasterModels } = lib('masterDb');
const { getTenantModels } = lib('tenantDb');
const { resolveOrgFeatures } = lib('features');
const { getDictionary } = lib('i18n/dict/index');
const { ensureDefaultRoles } = lib('roles');
const { reserveUsername, isUsernameAvailable, releaseUsername, lookupUser } = lib('userDirectory');
const { markOnboardingStep } = lib('onboarding');
const { addOrgUser, removeOrgUserByUsername } = lib('orgUsers');
const { updateOrganization } = lib('orgUpdate');
const { computeInstallmentPlan } = lib('installment');
const shiftOps = lib('cashShiftOps');
// Tashqi xabarlar o'chiriladi (CommonJS eksport ob'ekti — chaqiruv paytida o'qiladi)
const shopNotify = lib('shopNotify');
shopNotify.notifyNewSale = async () => {};
shopNotify.notifyShiftClosed = async () => {};
const telegram = lib('telegram');
telegram.sendTelegram = async () => false;

const d = getDictionary('uz');

/* ───────────────────────────── yordamchilar ───────────────────────────── */

function fd(obj) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null) f.append(k, typeof v === 'string' ? v : String(v));
  return f;
}
/** Server amalini simulyatsiya foydalanuvchisi nomidan chaqiradi. Muvaffaqiyatli redirect → { ok, redirect } */
async function act(user, fn, ...args) {
  // Har amal ~1,5 s keyin (Date.now'dan olinadigan PRD-…/SKU-… kodlari takrorlanmasin)
  if (SIM !== null) SIM += 1500;
  CURRENT.user = user;
  try {
    const res = await fn(...args);
    if (res && typeof res === 'object' && ('error' in res) && res.error) return { ok: false, error: res.error, res };
    if (res && typeof res === 'object' && res.ok === false) return { ok: false, error: res.error ?? 'xato', res };
    return { ok: true, res };
  } catch (e) {
    if (e instanceof SeedRedirect) {
      const good = /^\/app\/(sales|products)\/[0-9a-f]{24}/.test(e.url);
      return good ? { ok: true, redirect: e.url, id: e.url.split('/')[3].split('?')[0] } : { ok: false, error: `yo'naltirildi: ${e.url}` };
    }
    throw e;
  } finally {
    CURRENT.user = null;
  }
}
function must(r, what) {
  if (!r.ok) throw new Error(`${what}: ${r.error}`);
  return r;
}
function luhn(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let n = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return String((10 - (sum % 10)) % 10);
}
const usedImei = new Set();
function newImei(tac) {
  for (;;) {
    const body = tac + String(rint(0, 999999)).padStart(6, '0');
    const imei = body + luhn(body);
    if (!usedImei.has(imei)) { usedImei.add(imei); return imei; }
  }
}
function newCustomer() {
  const first = pick(FIRST);
  const last = pick(LAST_M);
  return { name: `${first} ${FEMALE.has(first) ? `${last}a` : last}`, phone: `+998${pick(OPS)}${String(rint(1000000, 9999999))}` };
}

/* ───────────────────────────── holat ───────────────────────────── */

async function loadOrg() {
  const { Organization } = await getMasterModels();
  const org = await Organization.findOne({ slug: SLUG }).lean();
  if (!org) refuse(`«${SLUG}» do'koni topilmadi.`);
  return org;
}

async function status(m) {
  const names = STAFF.map((s) => s.username);
  const [users, demoProducts, demoSales, realSales] = await Promise.all([
    m.User.find({ username: { $in: names } }).select('username').lean(),
    m.Product.countDocuments({ createdBy: { $in: names } }).setOptions({ withDeleted: true }),
    m.Sale.countDocuments({ soldBy: { $in: names } }),
    m.Sale.countDocuments({ soldBy: { $nin: names } }),
  ]);
  return { demoUsers: users.map((u) => u.username), demoProducts, demoSales, realSales };
}

function sessionUser(org, u) {
  return {
    id: String(u._id), username: u.username, role: u.role === 'admin' ? 'admin' : 'user', tokenVersion: u.tokenVersion ?? 0,
    organizationId: String(org._id), dbName: org.dbName, ...(u.role !== 'admin' && u.branchId ? { branchId: String(u.branchId) } : {}),
  };
}

/* ───────────────────────────── master ───────────────────────────── */

async function syncMaster(org, m) {
  const { Organization } = await getMasterModels();
  if (org.businessType !== 'phone_shop') {
    await updateOrganization(String(org._id), { businessType: 'phone_shop' });
    console.log(`✓ Biznes turi: ${org.businessType} → phone_shop (Telefon do'kon)`);
  }
  // Demo xodimlar va telefonlar sig'sin — limit faqat oshiriladi (kamaytirilmaydi)
  await Organization.collection.updateOne({ _id: org._id }, { $max: { 'plan.maxFilial': 5, 'plan.maxUsers': 15, 'plan.maxProducts': 5000 } });
  const fresh = await Organization.findById(org._id).lean();
  const users = await m.User.find({ username: { $in: STAFF.map((s) => s.username) } }).select('username fullName branchId').lean();
  const listed = new Set((fresh.users ?? []).map((u) => u.username));
  let reserved = 0;
  let added = 0;
  for (const u of users) {
    const dir = await lookupUser(u.username);
    if (dir && dir.organizationId !== String(org._id)) throw new Error(`«${u.username}» login boshqa do'konda band.`);
    if (!dir) {
      await reserveUsername({ username: u.username, organizationId: String(org._id), dbName: org.dbName, role: 'user', ...(u.branchId ? { branchId: String(u.branchId) } : {}) });
      reserved++;
    }
    if (!listed.has(u.username)) {
      await addOrgUser(String(org._id), { username: u.username, name: u.fullName, role: 'user', ...(u.branchId ? { branchId: String(u.branchId) } : {}) });
      added++;
    }
  }
  const st = await status(m);
  if (st.demoProducts) await markOnboardingStep(String(org._id), 'productAdded');
  if (st.demoSales) await markOnboardingStep(String(org._id), 'saleMade');
  const p = fresh.plan ?? {};
  console.log(`✓ Master: tarif limitlari ${p.maxFilial} filial / ${p.maxUsers} xodim / ${p.maxProducts} mahsulot; `
    + `${users.length} demo xodim — katalogga ${reserved}, do'kon ro'yxatiga ${added} ta qo'shildi; onboarding belgilari yangilandi`);
}

/* ───────────────────────────── o'chirish ───────────────────────────── */

async function removeDemo(org, m, admin) {
  const names = STAFF.map((s) => s.username);
  const products = await m.Product.find({ createdBy: { $in: names } }).setOptions({ withDeleted: true }).select('_id').lean();
  const productIds = products.map((p) => p._id);
  const foreign = await m.Sale.countDocuments({ productId: { $in: productIds }, soldBy: { $nin: names } });
  if (foreign && !FORCE) refuse(`Demo mahsulotlardan ${foreign} tasini demo bo'lmagan xodim sotgan — o'chirish to'xtatildi (baribir: --force).`);
  const sales = await m.Sale.find({ soldBy: { $in: names } }).select('_id customerId').lean();
  const saleIds = sales.map((s) => s._id);
  const shifts = await m.CashShift.find({ openedBy: { $in: names } }).select('_id').lean();
  const shiftIds = shifts.map((s) => s._id);
  const adminName = admin?.username ?? '—';
  const receipts = await m.BankReceipt.find({ recordedBy: adminName, note: RECEIPT_NOTE_RE }).setOptions({ withDeleted: true }).select('_id').lean();
  const flows = await m.CashFlow.find({
    $or: [{ recordedBy: { $in: names } }, { shiftId: { $in: shiftIds } }, { recordedBy: adminName, description: { $in: [...DEMO_NOTES] } }],
  }).setOptions({ withDeleted: true }).select('_id').lean();
  const transfers = await m.Transfer.find({ transferredBy: { $in: names } }).select('_id').lean();
  const demoBanks = await m.CreditBank.find({ name: { $in: DEMO_BANKS } }).select('_id').lean();
  const entityIds = [...saleIds, ...productIds, ...shiftIds, ...receipts.map((r) => r._id), ...flows.map((f) => f._id), ...demoBanks.map((b) => b._id)].map(String);

  const r = {};
  r.sales = (await m.Sale.deleteMany({ _id: { $in: saleIds } })).deletedCount;
  r.products = (await m.Product.deleteMany({ _id: { $in: productIds } }).setOptions({ withDeleted: true })).deletedCount;
  r.flows = (await m.CashFlow.deleteMany({ _id: { $in: flows.map((f) => f._id) } }).setOptions({ withDeleted: true })).deletedCount;
  r.receipts = (await m.BankReceipt.deleteMany({ _id: { $in: receipts.map((x) => x._id) } }).setOptions({ withDeleted: true })).deletedCount;
  r.shifts = (await m.CashShift.deleteMany({ _id: { $in: shiftIds } })).deletedCount;
  r.transfers = (await m.Transfer.deleteMany({ _id: { $in: transfers.map((t) => t._id) } })).deletedCount;
  r.audits = (await m.AuditLog.deleteMany({ $or: [{ entityId: { $in: entityIds } }, { by: { $in: names } }] })).deletedCount;
  // Mijozlar — faqat demo sotuvlarida qatnashgan va boshqa yozuvi yo'qlari
  const custIds = [...new Set(sales.filter((s) => s.customerId).map((s) => String(s.customerId)))];
  let customers = 0;
  for (const id of custIds) {
    const used = await m.Sale.exists({ customerId: id }) || await m.LedgerEntry.exists({ customerId: id });
    if (!used) customers += (await m.Customer.deleteOne({ _id: id })).deletedCount;
  }
  let banks = 0;
  for (const name of DEMO_BANKS) {
    const used = await m.Sale.exists({ 'bankParts.bankName': name }) || await m.BankReceipt.exists({ bankName: name });
    if (!used) banks += (await m.CreditBank.deleteOne({ name })).deletedCount;
  }
  let cats = 0;
  for (const name of [CAT_PHONES, CAT_ACC]) {
    const c = await m.ProductCategory.findOne({ name, parentId: null }).select('_id').lean();
    if (c && !(await m.Product.exists({ categoryId: c._id }).setOptions({ withDeleted: true }))) cats += (await m.ProductCategory.deleteOne({ _id: c._id })).deletedCount;
  }
  let brands = 0;
  for (const name of BRANDS) {
    if (!(await m.Product.exists({ brand: name }).setOptions({ withDeleted: true }))) brands += (await m.Brand.deleteOne({ name })).deletedCount;
  }
  const users = await m.User.find({ username: { $in: names } }).select('_id username').lean();
  for (const u of users) {
    await m.User.deleteOne({ _id: u._id });
    await releaseUsername(u.username).catch(() => {});
    await removeOrgUserByUsername(String(org._id), u.username).catch(() => {});
  }
  console.log(`✓ O'chirildi: ${r.sales} sotuv, ${r.products} mahsulot, ${customers} mijoz, ${r.receipts} bank tushumi, ${r.flows} kassa/xarajat yozuvi, `
    + `${r.shifts} smena, ${r.transfers} o'tkazma, ${r.audits} audit, ${users.length} xodim, ${banks} bank, ${cats} kategoriya, ${brands} brend`);
  console.log("  Qoldi: biznes turi (Telefon do'kon) va tarif limitlari — kerak bo'lsa Super Admin'dan qaytaring.");
}

/* ───────────────────────────── sozlash ───────────────────────────── */

async function ensureStaff(org, m, branches, password) {
  await ensureDefaultRoles(m.Role, org.businessType);
  for (const s of STAFF) {
    if (await m.User.exists({ username: s.username })) continue;
    const role = await m.Role.findOne({ name: s.role }).select('_id').lean();
    if (!role) throw new Error(`Rol «${s.role}» topilmadi.`);
    if (!(await isUsernameAvailable(s.username))) throw new Error(`«${s.username}» login boshqa do'konda band.`);
    const branchId = branches[s.branch];
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
    console.log(`✓ Xodim: ${s.fullName} — ${s.username} (${s.role}, ${s.branch === 'main' ? 'asosiy' : 'filial'})`);
  }
}

/* ───────────────────────────── asosiy ───────────────────────────── */

async function main() {
  const org = await loadOrg();
  const m = await getTenantModels(org.dbName);
  const st = await status(m);
  const features = resolveOrgFeatures(org);
  console.log(`Do'kon: ${org.name} (${org.slug}, ${org.dbName}) · turi ${org.businessType} · holat ${org.status} · TZ ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  console.log(`Hozir: demo xodim ${st.demoUsers.length}/${STAFF.length}, demo mahsulot ${st.demoProducts}, demo sotuv ${st.demoSales}, boshqa sotuv ${st.realSales}`);
  const admin = await m.User.findOne({ username: org.adminUsername, role: 'admin' }).lean();
  if (!admin) refuse(`Admin «${org.adminUsername}» topilmadi.`);

  if (MODE === 'remove') return removeDemo(org, m, admin);
  if (MODE === 'sync') return syncMaster(org, m);

  const mainBranch = await m.Branch.findOne({ isMain: true, active: true }).lean();
  if (!mainBranch) refuse("Asosiy ombor (isMain) filiali yo'q.");
  const filBranch = await m.Branch.findOne({ isMain: { $ne: true }, active: true }).sort({ createdAt: 1 }).lean();
  const branches = { main: mainBranch._id, fil: (filBranch ?? mainBranch)._id };
  console.log(`Filiallar: asosiy «${mainBranch.name}»${filBranch ? `, filial «${filBranch.name}»` : ' (ikkinchi filial yo\'q — hammasi asosiyda)'}`);

  const now = realNow();
  const today = dayOf(now);
  const firstDay = today - (DAYS - 1) * DAY;
  console.log(`\nReja: ${ymd(firstDay)} … ${ymd(today)} (${DAYS} kun) — ${PHONES.length} xil telefon (IMEI bilan), ${ACCS.length} xil aksessuar, `
    + `har 6 kunda yangi kirim; POS (naqd/karta), nasiya, bank krediti, qarz; smenalar, xarajatlar, bank o'tkazmalari; xodimlar: ${STAFF.length}`);
  if (MODE === 'plan') {
    console.log("\nBu faqat reja — hech narsa yozilmadi. Avval --sync-master (turi va limitlar), keyin --apply (o'chirish: --remove)");
    return;
  }

  if (org.businessType !== 'phone_shop') refuse("Do'kon «Telefon do'kon» turida emas — avval --sync-master.");
  if (!features.sales || !features.kassa) refuse("«Sotuv» yoki «Kassa» moduli o'chiq.");
  if (st.demoSales || st.demoProducts) refuse("Demo ma'lumot allaqachon bor — avval --remove.");
  if (st.realSales > 0 && !FORCE) refuse(`Do'konda ${st.realSales} ta boshqa sotuv bor — demo aralashmasin. Baribir yozish uchun: --force`);
  const nasiyaOn = !!(features.nasiya || features.variant);
  const creditOn = !!features.creditKassa;
  const expensesOn = !!features.kirimChiqim;
  console.log(`Modullar: nasiya=${nasiyaOn} kreditKassa=${creditOn} kirimChiqim=${expensesOn} kassa=${!!features.kassa}`);

  const sales = action('sales');
  const pos = action('pos');
  const products = action('products');
  const transfer = action('transfer');
  const finance = action('finance');
  const shiftAct = action('cashShift');

  const password = process.env.DEMO_STAFF_PASSWORD || `Demo-${randomBytes(4).toString('hex')}`;
  setClock(at(firstDay, 8, 0));
  const t0 = realNow();
  await ensureStaff(org, m, branches, password);
  if (!process.env.DEMO_STAFF_PASSWORD) console.log(`  Parol (barcha demo xodimlar): ${password}`);

  const staffDocs = await m.User.find({ username: { $in: STAFF.map((s) => s.username) } }).lean();
  const U = Object.fromEntries(STAFF.map((s) => [s.key, sessionUser(org, staffDocs.find((u) => u.username === s.username))]));
  const OWNER = sessionUser(org, admin);
  const sellerOf = (branch, day) => (branch === 'fil' ? U.filSeller : (STAFF.find((s) => s.key === 'mainSeller').dayOff === dow(day) ? U.manager : (rnd() < 0.35 ? U.manager : U.mainSeller)));

  // Katalog: kategoriyalar, brendlar, banklar
  const catPhones = must(await act(U.manager, products.createCategoryAction, CAT_PHONES), 'Kategoriya').res.item.id;
  const catAcc = must(await act(U.manager, products.createCategoryAction, CAT_ACC), 'Kategoriya').res.item.id;
  for (const b of BRANDS) must(await act(U.manager, products.createBrandAction, b), `Brend ${b}`);
  if (creditOn) for (const b of DEMO_BANKS) must(await act(OWNER, finance.quickCreditBankAction, b), `Bank ${b}`);
  const banks = (await m.CreditBank.find({ active: true }).select('name').lean()).map((b) => b.name);
  if (creditOn && !banks.length) refuse("Faol bank yo'q (Kredit kassa).");

  // Ombor (xotirada): telefonlar — filial → model → [productId]; aksessuarlar — filial → key → productId
  const phoneStock = { main: new Map(), fil: new Map() };
  const accId = { main: {}, fil: {} };
  const stats = { phones: 0, accs: 0, transfers: 0, pos: 0, nasiya: 0, bank: 0, debt: 0, payments: 0, receipts: 0, expenses: 0, returns: 0, shifts: 0, revenue: 0, skipped: 0 };

  async function addPhones(model, n) {
    const ids = [];
    for (let i = 0; i < n; i++) {
      const color = pick(model.colors);
      let r;
      for (let tries = 0; tries < 5; tries++) {
        r = await act(U.manager, products.createProductAction, null, fd({
          name: model.name, imei: newImei(model.tac), color, brand: model.brand, categoryId: catPhones, warrantyMonths: 12,
          purchasePrice: model.buy, salePrice: model.sell, kind: 'goods',
        }));
        if (r.ok || r.error !== d.stock.msg.imeiDup) break;
      }
      must(r, `Telefon ${model.name}`);
      ids.push(r.id);
      stats.phones++;
    }
    const list = phoneStock.main.get(model.key) ?? [];
    list.push(...ids);
    phoneStock.main.set(model.key, list);
    return ids;
  }
  async function moveToFilial(model, n) {
    if (!filBranch) return;
    const list = phoneStock.main.get(model.key) ?? [];
    for (let i = 0; i < n && list.length > 1; i++) {
      const id = list.shift();
      must(await act(U.manager, transfer.transferProductAction, null, fd({ productId: id, branchId: String(branches.fil), qty: 1 })), 'O\'tkazma');
      const fl = phoneStock.fil.get(model.key) ?? [];
      fl.push(id);
      phoneStock.fil.set(model.key, fl);
      stats.transfers++;
    }
  }
  async function addAccessories() {
    for (const a of ACCS) {
      for (const br of filBranch ? ['main', 'fil'] : ['main']) {
        const who = br === 'main' ? U.manager : U.filSeller;
        const r = must(await act(who, products.createProductAction, null, fd({
          name: a.name, imei: `AKS${br === 'main' ? 'A' : 'F'}${a.key.toUpperCase()}${String(rint(1000, 9999))}`, brand: a.brand, categoryId: catAcc,
          purchasePrice: a.buy, salePrice: a.sell, kind: 'goods', trackQuantity: 'on', quantity: br === 'main' ? a.main : a.fil,
        })), `Aksessuar ${a.name}`);
        accId[br][a.key] = r.id;
        stats.accs++;
      }
    }
  }

  // Kelgusi kunlarga rejalangan to'lovlar va bank o'tkazmalari
  const futurePayments = []; // { t, saleId, amount, branch, kind }
  const pendingBank = []; // { day, bank, amount, branch }
  const customersPool = [];
  const phoneSales = []; // qaytarish uchun: { saleId, t, branch, cash }
  const accSales = [];

  function payMethod() {
    return pickW([{ m: 'cash', w: 50 }, { m: 'uzcard', w: 20 }, { m: 'humo', w: 15 }, { m: 'click', w: 8 }, { m: 'payme', w: 7 }], (x) => x.w).m;
  }
  function customerFor(repeatChance = 0.12) {
    if (customersPool.length && rnd() < repeatChance) return pick(customersPool);
    const c = newCustomer();
    customersPool.push(c);
    return c;
  }
  function pickModel(branch) {
    const avail = PHONES.filter((p) => (phoneStock[branch].get(p.key) ?? []).length > 0);
    return avail.length ? pickW(avail) : null;
  }
  const takePhone = (branch, model) => phoneStock[branch].get(model.key).shift();
  const putBack = (branch, model, id) => phoneStock[branch].get(model.key).unshift(id);

  async function schedulePlanPayments(saleId, branch, behaviour, endT) {
    const sale = await m.Sale.findById(saleId).lean();
    const plan = computeInstallmentPlan(sale, new Date());
    if (!plan) return;
    for (const mo of plan.schedule) {
      const due = +new RealDate(mo.dueDate);
      if (due > endT) break;
      if (behaviour === 'late' && mo.month >= 1) break;
      const amount = behaviour === 'partial' && rnd() < 0.6 ? round(mo.amount / 2, 10_000) : mo.amount;
      const t = dayOf(due) + rint(-2, behaviour === 'good' ? 1 : 3) * DAY;
      futurePayments.push({ t: at(t, rint(11, 18), rint(0, 59)), saleId, amount, branch, kind: 'nasiya' });
    }
  }

  async function phoneSale(branch, day, t) {
    const model = pickModel(branch);
    if (!model) { stats.skipped++; return; }
    const seller = sellerOf(branch, day);
    const productId = takePhone(branch, model);
    const r = rnd();
    const endT = now - 5 * MIN;
    const mode = r < 0.45 || (!nasiyaOn && !creditOn) ? 'full' : r < 0.70 && nasiyaOn ? 'nasiya' : r < 0.90 && creditOn ? 'bank' : 'debt';
    if (mode === 'full') {
      const lines = [{ productId, qty: 1 }];
      let total = model.sell;
      for (const a of ACCS) {
        if (a.attach > 0 && rnd() < a.attach * 0.6) {
          lines.push({ productId: accId[branch][a.key], qty: 1 });
          total += a.sell;
        }
      }
      const disc = model.sell >= 3_000_000 && rnd() < 0.3 ? round(rint(50_000, 200_000), 50_000) : 0;
      total -= disc;
      const method = payMethod();
      const parts = method !== 'cash' && rnd() < 0.25
        ? [{ method: 'cash', amount: round(total * 0.4, 50_000) }, { method, amount: total - round(total * 0.4, 50_000) }]
        : [{ method, amount: total }];
      const c = rnd() < 0.55 ? customerFor() : null;
      const res = await act(seller, pos.posSaleAction, {
        lines, wholesale: false, discount: { kind: 'amount', value: disc }, ...(c ? { customerName: c.name, customerPhone: c.phone } : {}),
        payment: { mode: 'full', parts },
      });
      if (!res.ok) { putBack(branch, model, productId); console.log(`  ! POS ${ymd(day)} ${model.name}: ${res.error}`); stats.skipped++; return; }
      stats.pos++;
      stats.revenue += total;
      phoneSales.push({ saleId: res.res.done.saleIds[0], t, branch, model, cash: method === 'cash' && parts.length === 1 });
      return;
    }
    const c = customerFor(0.05);
    if (mode === 'debt') {
      const paid = round(model.sell * (0.3 + rnd() * 0.3), 100_000);
      const due = ymd(dayOf(t) + rint(7, 21) * DAY);
      const res = await act(seller, pos.posSaleAction, {
        lines: [{ productId, qty: 1 }], wholesale: false, discount: { kind: 'amount', value: 0 }, customerName: c.name, customerPhone: c.phone,
        payment: { mode: 'debt', parts: [{ method: payMethod(), amount: paid }], dueDate: due },
      });
      if (!res.ok) { putBack(branch, model, productId); console.log(`  ! Qarz ${ymd(day)}: ${res.error}`); stats.skipped++; return; }
      stats.debt++;
      stats.revenue += model.sell;
      const saleId = res.res.done.saleIds[0];
      const left = model.sell - paid;
      const b = rnd();
      const dueT = +new RealDate(`${due}T12:00:00+05:00`);
      if (b < 0.55) futurePayments.push({ t: at(dayOf(t) + rint(3, Math.max(3, Math.round((dueT - t) / DAY))) * DAY, rint(11, 18), rint(0, 59)), saleId, amount: left, branch, kind: 'debt' });
      else if (b < 0.8) futurePayments.push({ t: at(dayOf(t) + rint(4, 10) * DAY, rint(11, 18), rint(0, 59)), saleId, amount: round(left / 2, 50_000), branch, kind: 'debt' });
      return;
    }
    const base = {
      items: JSON.stringify([{ productId, qty: 1 }]), customerName: c.name, customerPhone: c.phone, totalAmount: model.sell,
    };
    if (mode === 'nasiya') {
      const down = round(model.sell * (0.2 + rnd() * 0.2), 100_000);
      const months = pick([3, 6, 6, 9, 12, 12]);
      const payDay = Math.min(28, dom(dayOf(t)));
      const res = await act(seller, sales.createSaleAction, null, fd({ ...base, paymentType: 'installment', paidAmount: down, installmentMonths: months, payDay }));
      if (!res.ok) { putBack(branch, model, productId); console.log(`  ! Nasiya ${ymd(day)}: ${res.error}`); stats.skipped++; return; }
      stats.nasiya++;
      stats.revenue += model.sell;
      const b = rnd();
      await schedulePlanPayments(res.id, branch, b < 0.7 ? 'good' : b < 0.85 ? 'partial' : 'late', endT);
      return;
    }
    // Bank krediti: bosh to'lov 0–20%, ba'zan ikki bank yoki bank + nasiya
    const down = rnd() < 0.5 ? 0 : round(model.sell * (0.1 + rnd() * 0.1), 100_000);
    const rest = model.sell - down;
    const withNasiya = nasiyaOn && rnd() < 0.15;
    const nasiyaPart = withNasiya ? round(rest * (0.2 + rnd() * 0.1), 100_000) : 0;
    const financed = rest - nasiyaPart;
    const b1 = pick(banks);
    const split = banks.length > 1 && rnd() < 0.15;
    const b2 = split ? pick(banks.filter((b) => b !== b1)) : null;
    const parts = split ? [{ bankName: b1, amount: round(financed / 2, 100_000) }, { bankName: b2, amount: financed - round(financed / 2, 100_000) }] : [{ bankName: b1, amount: financed }];
    const res = await act(seller, sales.createSaleAction, null, fd({
      ...base, paymentType: 'bank_credit', paidAmount: down, bankParts: JSON.stringify(parts),
      ...(withNasiya ? { nasiyaAmount: nasiyaPart, installmentMonths: pick([3, 6]), payDay: Math.min(28, dom(dayOf(t))) } : {}),
    }));
    if (!res.ok) { putBack(branch, model, productId); console.log(`  ! Bank ${ymd(day)}: ${res.error}`); stats.skipped++; return; }
    stats.bank++;
    stats.revenue += model.sell;
    for (const p of parts) pendingBank.push({ day: dayOf(t) + rint(2, 5) * DAY, bank: p.bankName, amount: p.amount, branch });
    if (withNasiya) await schedulePlanPayments(res.id, branch, rnd() < 0.8 ? 'good' : 'late', endT);
  }

  async function accSale(branch, day, t) {
    const seller = sellerOf(branch, day);
    const n = rnd() < 0.7 ? 1 : 2;
    const chosen = [];
    while (chosen.length < n) {
      const a = pickW(ACCS);
      if (!chosen.includes(a)) chosen.push(a);
    }
    const lines = chosen.map((a) => ({ productId: accId[branch][a.key], qty: a.sell < 100_000 && rnd() < 0.2 ? 2 : 1 }));
    const total = lines.reduce((s, l, i) => s + chosen[i].sell * l.qty, 0);
    const method = rnd() < 0.65 ? 'cash' : payMethod();
    const c = rnd() < 0.2 ? customerFor(0.4) : null;
    const res = await act(seller, pos.posSaleAction, {
      lines, wholesale: false, discount: { kind: 'amount', value: 0 }, ...(c ? { customerName: c.name, customerPhone: c.phone } : {}),
      payment: { mode: 'full', parts: [{ method, amount: total }] },
    });
    if (!res.ok) { stats.skipped++; return; }
    stats.pos++;
    stats.revenue += total;
    accSales.push({ saleId: res.res.done.saleIds[0], t, branch, qty: lines[0].qty });
  }

  async function payment(p) {
    const offToday = STAFF.find((s) => s.key === 'mainSeller').dayOff === dow(dayOf(p.t));
    const seller = p.branch === 'fil' ? U.filSeller : offToday ? U.manager : U.mainSeller;
    const sale = await m.Sale.findById(p.saleId).select('remainingAmount status').lean();
    if (!sale || sale.status === 'cancelled' || !(sale.remainingAmount > 0)) return;
    const amount = Math.min(p.amount, sale.remainingAmount);
    const method = rnd() < 0.7 ? 'cash' : pick(['uzcard', 'humo', 'click']);
    const res = await act(seller, sales.addSalePaymentAction, null, fd({ saleId: p.saleId, amount, method, note: '' }));
    if (res.ok) stats.payments++;
    else console.log(`  ! To'lov: ${res.error}`);
  }

  async function bankReceipts(day) {
    const due = pendingBank.filter((b) => b.day <= day);
    if (!due.length) return;
    const groups = new Map();
    for (const b of due) {
      const k = `${b.bank}|${b.branch}`;
      const g = groups.get(k) ?? { bank: b.bank, branch: b.branch, amount: 0, n: 0 };
      g.amount += b.amount;
      g.n++;
      groups.set(k, g);
    }
    for (const b of due) pendingBank.splice(pendingBank.indexOf(b), 1);
    for (const g of groups.values()) {
      const bank = await m.CreditBank.findOne({ name: g.bank }).select('_id').lean();
      const res = await act(OWNER, finance.createBankReceiptAction, null, fd({ bankId: String(bank._id), amount: g.amount, note: RECEIPT_NOTE(g.n), branchId: String(branches[g.branch]) }));
      if (res.ok) stats.receipts++;
      else console.log(`  ! Bank tushumi: ${res.error}`);
    }
  }

  async function expense(e) {
    const res = await act(OWNER, finance.createQuickExpenseAction, null, fd({
      amount: e.amount, category: e.category, note: e.note, ...(e.branch ? { branchId: String(branches[e.branch]) } : {}),
    }));
    if (res.ok) stats.expenses++;
    else console.log(`  ! Xarajat ${e.note}: ${res.error}`);
  }

  // Qaytarish: aksessuar — 2 donali sotuvdan 1 dona (qisman qaytarish); telefon — sotuvni bekor qilish (pul qaytariladi)
  async function doReturn(kind, day) {
    const recent = (arr) => arr.filter((x) => x.branch === 'main' && x.t > at(day, 0) - 3 * DAY);
    if (kind === 'acc') {
      const pool = recent(accSales).filter((x) => x.qty >= 2);
      if (!pool.length) return;
      const s = pick(pool);
      const res = await act(U.manager, sales.returnSaleItemsAction, null, fd({ saleId: s.saleId, qty: 1, reason: pick(RETURN_REASONS.slice(1)) }));
      if (!res.ok) { console.log(`  ! Qaytarish: ${res.error}`); return; }
      stats.returns++;
      s.qty--;
      return;
    }
    const pool = recent(phoneSales).filter((x) => x.cash);
    if (!pool.length) return;
    const s = pick(pool);
    const res = await act(U.manager, sales.cancelSaleAction, null, fd({ saleId: s.saleId }));
    if (!res.ok) { console.log(`  ! Bekor qilish: ${res.error}`); return; }
    stats.returns++;
    const doc = await m.Sale.findById(s.saleId).select('productId').lean();
    putBack('main', s.model, String(doc.productId));
    phoneSales.splice(phoneSales.indexOf(s), 1);
  }

  /* ───── kunma-kun ───── */
  const k = d.sales.shifts;
  console.log(`\nBajarilmoqda…`);
  for (let day = firstDay; day <= today; day += DAY) {
    const events = [];
    const add = (t, fn) => { if (t < now - 5 * MIN) events.push({ t, fn }); };
    const idx = Math.round((day - firstDay) / DAY);
    const weekend = dow(day) === 0 || dow(day) === 6;

    if (idx === 0) {
      add(at(day, 8, 10), async () => {
        for (const p of PHONES) await addPhones(p, p.stock);
        await addAccessories();
      });
      add(at(day, 8, 40), async () => { for (const p of PHONES) await moveToFilial(p, Math.floor(p.stock * 0.4)); });
    } else if (idx % 6 === 0) {
      add(at(day, 9, 30), async () => {
        let n = 0;
        for (const p of PHONES) {
          const have = (phoneStock.main.get(p.key) ?? []).length + (phoneStock.fil.get(p.key) ?? []).length;
          const need = Math.max(0, p.stock + 1 - have);
          if (need) { await addPhones(p, need); n += need; }
        }
        if (n && expensesOn) await expense({ category: 'Transport', amount: 180_000, note: DELIVERY_NOTE });
      });
      add(at(day, 10, 15), async () => {
        for (const p of PHONES) {
          const fil = (phoneStock.fil.get(p.key) ?? []).length;
          const want = Math.ceil(p.stock * 0.4);
          if (fil < want) await moveToFilial(p, want - fil);
        }
      });
    }

    // Smenalar
    const shiftsToday = {};
    for (const br of filBranch ? ['main', 'fil'] : ['main']) {
      const who = br === 'fil' ? U.filSeller : (STAFF.find((s) => s.key === 'mainSeller').dayOff === dow(day) ? U.manager : U.mainSeller);
      add(at(day, 9, br === 'main' ? 0 : 5), async () => {
        const res = await act(who, shiftAct.openShiftAction, null, fd({ branchId: String(branches[br]), openingCash: br === 'main' ? 500_000 : 300_000 }));
        if (!res.ok) { console.log(`  ! Smena ${ymd(day)}: ${res.error}`); return; }
        shiftsToday[br] = await m.CashShift.findOne({ branchId: branches[br], status: 'open' }).sort({ openedAt: -1 }).lean();
        stats.shifts++;
      });
      add(at(day, 20, 30 + (br === 'fil' ? 5 : 0)), async () => {
        const shift = shiftsToday[br];
        if (!shift) return;
        const totals = await shiftOps.shiftTotalsNow(m, shift, new Date());
        const diff = rnd() < 0.08 ? pick([-20_000, -10_000, 5_000]) : 0;
        const res = await act(who, shiftAct.closeShiftAction, null, fd({ shiftId: String(shift._id), countedCash: Math.max(0, Math.round(totals.current) + diff), note: diff ? 'Qayta sanaldi' : '' }));
        if (!res.ok) console.log(`  ! Smena yopish ${ymd(day)}: ${res.error}`);
      });
    }

    // Sotuvlar
    const plan = [
      ['main', rint(1, 3) + (weekend ? 1 : 0), rint(2, 5) + (weekend ? 1 : 0)],
      ...(filBranch ? [['fil', rint(0, 2) + (weekend ? 1 : 0), rint(1, 3) + (weekend ? 1 : 0)]] : []),
    ];
    for (const [br, phonesN, accN] of plan) {
      for (let i = 0; i < phonesN; i++) { const t = at(day, rint(10, 19), rint(0, 59)); add(t, () => phoneSale(br, day, t)); }
      for (let i = 0; i < accN; i++) { const t = at(day, rint(10, 19), rint(0, 59)); add(t, () => accSale(br, day, t)); }
    }

    // To'lovlar, bank tushumlari, xarajatlar, qaytarishlar
    for (const p of futurePayments.filter((x) => dayOf(x.t) === day)) add(p.t, () => payment(p));
    if (creditOn) add(at(day, 15, 20), () => bankReceipts(day));
    if (expensesOn) for (const e of EXPENSES.filter((x) => x.day === dom(day) && (x.branch !== 'fil' || filBranch))) add(at(day, 12, rint(0, 50)), () => expense(e));
    if (idx === 8) add(at(day, 16, 10), () => doReturn('acc', day));
    if (idx === 19) add(at(day, 17, 25), () => doReturn('phone', day));
    if (idx === 24) add(at(day, 13, 40), () => doReturn('acc', day));

    events.sort((a, b) => a.t - b.t);
    for (const e of events) {
      setClock(Math.max(e.t, SIM ?? 0)); // soat orqaga yurmaydi
      await e.fn();
    }
    // Kun tugadi — keyingi kunga ko'chgan to'lovlar ham o'z kunida bajariladi
    if ((day - firstDay) / DAY % 5 === 4) console.log(`  ${ymd(day)}: sotuv ${stats.pos + stats.nasiya + stats.bank + stats.debt}, tushum ~${fmt(stats.revenue)} so'm`);
  }
  setClock(null);
  await syncMaster(await loadOrg(), m);

  console.log(`\n✓ Tayyor (${Math.round((realNow() - t0) / 1000)} s): telefon ${stats.phones} dona, aksessuar ${stats.accs} xil, filialga o'tkazma ${stats.transfers}`);
  console.log(`  Sotuv: POS ${stats.pos}, nasiya ${stats.nasiya}, bank krediti ${stats.bank}, qarz ${stats.debt} — tushum ~${fmt(stats.revenue)} so'm; `
    + `to'lov ${stats.payments}, bank o'tkazmasi ${stats.receipts}, xarajat ${stats.expenses}, qaytarish/bekor ${stats.returns}, smena ${stats.shifts}, o'tkazib yuborildi ${stats.skipped}`);
  console.log(`Kirish: /t/${org.slug}/login — ${STAFF.map((s) => `${s.username} (${s.role})`).join(', ')}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('✖ Xato:', e);
    process.exit(1);
  });
