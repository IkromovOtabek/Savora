/**
 * Savora — DEMO RESTORAN (faqat lokal dev bazasi). Restoran modulini uchdan-uchgacha sinash uchun.
 *
 *   npm run seed:restaurant          (yoki: node --env-file-if-exists=.env scripts/seed-demo-restaurant.mjs)
 *
 * Yaratadi (idempotent — qayta ishga tushsa takrorlamaydi, mavjudini to'ldiradi):
 *   - do'kon «Demo Restoran» (slug `demo-restoran`, turi restaurant, tarif Pro → tables/kitchen/qrMenu);
 *   - loginlar: dr_admin (egasi), dr_ofitsant, dr_oshpaz, dr_kassir (rol shablonlari: Ofitsant, Oshpaz,
 *     Kassir (restoran)) — parol: SEED_RESTAURANT_PASSWORD yoki pastdagi DEV_PASSWORD;
 *   - zallar «Asosiy zal» (1–4-stol) va «Terrasa» (5–6), stansiyalar «Issiq sex» va «Bar»;
 *   - menyu: 11 taom (2 tasida modifikator, Shashlik — texkarta, Manti — stop-listda, ichimliklar — Bar,
 *     non va suv — stansiyasiz), xomashyo (go'sht, piyoz); xizmat haqi 10%, saboy qadoq 3 000 so'm.
 * Kirish: http://localhost:3000/t/demo-restoran/login · QR havolalar — Restoran sozlamalari → Zal va stollar.
 *
 * XAVFSIZLIK: production'da va localhost bo'lmagan MONGO_URI'da ishlamaydi (aniq rad etadi).
 * Biznes mantiqi qayta yozilmagan — lib/organizations (createOrganization), lib/roles, lib/restaurant/setup
 * chaqiriladi (scripts/ts-hooks.mjs orqali TypeScript to'g'ridan-to'g'ri yuklanadi).
 */
import { registerTsHooks } from './ts-hooks.mjs';

/* ───────────────────────────── himoya: faqat lokal dev ───────────────────────────── */

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017'; // lib/db.ts bilan bir xil standart
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function refuse(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') refuse("NODE_ENV=production — demo restoran seed'i production'da ishlamaydi.");
if (!/^mongodb:\/\//.test(URI)) refuse("MONGO_URI faqat mongodb://localhost bo'lishi mumkin (mongodb+srv va masofaviy bazalar rad etiladi).");
{
  // mongodb://[user:pass@]host1[:port][,host2[:port]]/... — har bir xost lokal bo'lsin
  const hostPart = URI.replace(/^mongodb:\/\//, '').split('/')[0].split('?')[0];
  const hosts = hostPart.slice(hostPart.lastIndexOf('@') + 1).split(',').map((h) => h.replace(/:\d+$/, '').toLowerCase());
  if (!hosts.length || !hosts.every((h) => LOCAL_HOSTS.has(h))) {
    refuse(`MONGO_URI lokal emas (${hosts.join(', ') || '—'}). Seed faqat localhost/127.0.0.1 bazasiga yozadi.`);
  }
}
process.env.MONGO_URI = URI;

/* ───────────────────────────── ma'lumot ───────────────────────────── */

/** Faqat lokal dev uchun parol (chatga/hujjatga yozilmaydi) */
const DEV_PASSWORD = process.env.SEED_RESTAURANT_PASSWORD || 'DemoRest!2026';
const ORG = { name: 'Demo Restoran', slug: 'demo-restoran', ownerName: 'Demo Restoran egasi', phone: '+998900000000' };
const ADMIN = 'dr_admin';
const STAFF = [
  { username: 'dr_ofitsant', fullName: 'Aziz (ofitsant)', role: 'Ofitsant' },
  { username: 'dr_oshpaz', fullName: 'Rustam (oshpaz)', role: 'Oshpaz' },
  { username: 'dr_kassir', fullName: 'Dilnoza (kassir)', role: 'Kassir (restoran)' },
];
const HALLS = [
  { name: 'Asosiy zal', tables: [[1, 4], [2, 4], [3, 6], [4, 2]] },
  { name: 'Terrasa', tables: [[5, 4], [6, 8]] },
];
const STATIONS = [
  { key: 'hot', name: 'Issiq sex', kind: 'kitchen' },
  { key: 'bar', name: 'Bar', kind: 'bar' },
];
const CATS = { hot: 'Issiq taomlar', salad: 'Salatlar', drinks: 'Ichimliklar', bread: 'Non va pishiriqlar', raw: 'Xomashyo' };

/**
 * Taomlar. `code` — seed kaliti (Product.itemCode, takrorlanmaslik uchun). kind: service — cheksiz (oshxona
 * ishlab chiqaradi); goods — ombordagi qoldiq bilan; bundle — texkarta (yuborishda tarkib ombordan ayriladi).
 */
const RAW = [
  { code: 'DR-GOSHT', name: "Mol go'shti", cat: 'raw', kind: 'goods', unit: 'kg', qty: 5, cost: 95000, price: 120000 },
  { code: 'DR-PIYOZ', name: 'Piyoz', cat: 'raw', kind: 'goods', unit: 'kg', qty: 10, cost: 4000, price: 6000 },
];
const DISHES = [
  {
    code: 'DR-OSH', name: 'Osh', cat: 'hot', kind: 'service', price: 45000, cost: 22000, station: 'hot', ikpu: '10202001001000000',
    mods: [
      { name: 'Porsiya', required: true, min: 1, max: 1, options: [{ name: 'Oddiy', price: 0 }, { name: 'Katta', price: 15000 }] },
      { name: "Qo'shimcha", required: false, min: 0, max: 2, options: [{ name: 'Qazi', price: 12000 }, { name: 'Tuxum', price: 3000 }] },
    ],
  },
  { code: 'DR-LAGMON', name: "Lag'mon", cat: 'hot', kind: 'service', price: 38000, cost: 16000, station: 'hot' },
  { code: 'DR-SHASHLIK', name: 'Shashlik (mol)', cat: 'hot', kind: 'bundle', price: 24000, cost: 0, station: 'hot', bundle: [['DR-GOSHT', 0.15], ['DR-PIYOZ', 0.05]] },
  { code: 'DR-MANTI', name: 'Manti', cat: 'hot', kind: 'service', price: 30000, cost: 12000, station: 'hot', stop: true },
  { code: 'DR-SOMSA', name: 'Somsa', cat: 'bread', kind: 'service', price: 12000, cost: 5000, station: 'hot' },
  { code: 'DR-SEZAR', name: 'Sezar salat', cat: 'salad', kind: 'service', price: 32000, cost: 14000, station: 'hot' },
  { code: 'DR-ACHCHIQ', name: 'Achchiq-chuchuk', cat: 'salad', kind: 'service', price: 15000, cost: 5000, station: 'hot' },
  { code: 'DR-NON', name: 'Non', cat: 'bread', kind: 'goods', unit: 'dona', qty: 60, price: 5000, cost: 3000 },
  { code: 'DR-CHOY', name: "Ko'k choy (choynak)", cat: 'drinks', kind: 'service', price: 8000, cost: 1500, station: 'bar' },
  {
    code: 'DR-KOFE', name: 'Kofe Amerikano', cat: 'drinks', kind: 'service', price: 18000, cost: 5000, station: 'bar',
    mods: [{ name: 'Hajmi', required: true, min: 1, max: 1, options: [{ name: 'Kichik', price: 0 }, { name: 'Katta', price: 6000 }] }],
  },
  { code: 'DR-COLA', name: 'Coca-Cola 0,5 l', cat: 'drinks', kind: 'goods', unit: 'dona', qty: 3, price: 10000, cost: 6500, station: 'bar' },
  { code: 'DR-SUV', name: 'Mineral suv 0,5 l', cat: 'drinks', kind: 'goods', unit: 'dona', qty: 40, price: 6000, cost: 3000 },
];

/* ───────────────────────────── ishga tushirish ───────────────────────────── */

registerTsHooks();
const lib = (p) => import(new URL(`../lib/${p}.ts`, import.meta.url).href);

const [
  { createOrganization }, { getMasterModels }, { getTenantModels }, { getBaseConnection },
  { resolveOrgFeatures }, { loadUserPermissions }, { getDictionary }, { ensureDefaultRoles },
  { reserveUsername, isUsernameAvailable }, { addOrgUser }, { ensureMainBranchId },
  { generateProductCode, generateSku }, setup,
] = await Promise.all([
  lib('organizations'), lib('masterDb'), lib('tenantDb'), lib('db'),
  lib('features'), lib('permissionGuard'), lib('i18n/dict/index'), lib('roles'),
  lib('userDirectory'), lib('orgUsers'), lib('mainBranch'),
  lib('productId'), lib('restaurant/setup'),
]);

function must(r, what) {
  if (!r.ok) throw new Error(`${what}: ${r.error}`);
  return r.data;
}

async function main() {
  const { Organization } = await getMasterModels();

  /* 1) Do'kon (mavjud bo'lsa — o'sha) */
  let org = await Organization.findOne({ slug: ORG.slug }).lean();
  if (!org) {
    if (!(await isUsernameAvailable(ADMIN))) throw new Error(`«${ADMIN}» login boshqa do'konda band — skriptdagi ADMIN ni o'zgartiring.`);
    const created = await createOrganization({
      name: ORG.name,
      slug: ORG.slug,
      ownerName: ORG.ownerName,
      phone: ORG.phone,
      adminUsername: ADMIN,
      adminPassword: DEV_PASSWORD,
      planTier: 'pro',
      businessType: 'restaurant',
      expiresAt: new Date(Date.now() + 365 * 864e5),
      mustChangePassword: false,
      termsAcceptedAt: new Date(),
    });
    if (created.slug !== ORG.slug) throw new Error(`Slug «${ORG.slug}» band ekan (yaratildi: ${created.slug}).`);
    org = await Organization.findById(created.orgId).lean();
    console.log(`✓ Do'kon yaratildi: ${ORG.name} (${org.dbName})`);
  } else {
    console.log(`• Do'kon bor: ${org.name} (${org.dbName})`);
  }
  if (org.businessType !== 'restaurant') throw new Error(`«${ORG.slug}» do'koni restoran turida emas (${org.businessType}).`);

  // Modullar: Pro + restoran preseti yoqadi; Super Admin o'chirib qo'ygan bo'lsa — qayta yoqamiz
  let features = resolveOrgFeatures(org);
  if (!features.tables || !features.kitchen || !features.qrMenu) {
    await Organization.updateOne({ _id: org._id }, { $set: { 'features.tables': true, 'features.kitchen': true, 'features.qrMenu': true } });
    org = await Organization.findById(org._id).lean();
    features = resolveOrgFeatures(org);
    console.log('✓ Modullar yoqildi: tables, kitchen, qrMenu');
  }

  const m = await getTenantModels(org.dbName);
  const admin = await m.User.findOne({ username: ADMIN, role: 'admin' }).lean();
  if (!admin) throw new Error(`Admin «${ADMIN}» topilmadi (${org.dbName}).`);

  /* 2) Filial: bitta joyli restoran — asosiy ombor (egasi qo'shgan taom shu yerda turadi, menyuga darhol chiqadi) */
  const branchId = await ensureMainBranchId(m.Branch, 'Restoran (asosiy)');

  /* 3) Rollar va xodimlar (bir filialda bir nechta login) */
  await ensureDefaultRoles(m.Role, 'restaurant');
  for (const s of STAFF) {
    const role = await m.Role.findOne({ name: s.role }).select('_id').lean();
    if (!role) throw new Error(`Rol «${s.role}» topilmadi.`);
    const exists = await m.User.findOne({ username: s.username }).lean();
    if (exists) {
      await m.User.updateOne({ _id: exists._id }, { $set: { roleId: role._id, branchId, active: true } });
      console.log(`• Login bor: ${s.username} (${s.role})`);
      continue;
    }
    if (!(await isUsernameAvailable(s.username))) throw new Error(`«${s.username}» login boshqa do'konda band.`);
    const u = new m.User({
      username: s.username, password: DEV_PASSWORD, role: 'user', fullName: s.fullName,
      branchId, roleId: role._id, active: true, mustChangePassword: false,
    });
    await u.save();
    try {
      await reserveUsername({ username: s.username, organizationId: String(org._id), dbName: org.dbName, role: 'user', branchId });
    } catch (e) {
      await m.User.deleteOne({ _id: u._id });
      throw e;
    }
    await addOrgUser(String(org._id), { username: s.username, name: s.fullName, role: 'user', branchId });
    console.log(`✓ Login: ${s.username} (${s.role})`);
  }

  /* 4) Restoran sozlamalari, zallar, stollar, stansiyalar — lib/restaurant/setup orqali (egasi nomidan) */
  const user = { id: String(admin._id), username: admin.username, role: 'admin', tokenVersion: admin.tokenVersion ?? 0, organizationId: String(org._id), dbName: org.dbName };
  const ctx = {
    user, orgId: String(org._id), orgSlug: org.slug, m, features,
    perms: await loadUserPermissions(user), d: getDictionary('uz'), via: ' (seed)',
  };

  must(await setup.saveRestaurantSettings(ctx, {
    serviceChargePct: 10, takeawayPackFee: 3000, requireVoidReason: true, kdsWarnMinutes: 10, kdsAlertMinutes: 20,
  }), 'Sozlamalar');

  for (const [i, h] of HALLS.entries()) {
    let hall = await m.Hall.findOne({ branchId, name: h.name }).lean();
    const hallId = hall ? String(hall._id) : must(await setup.saveHall(ctx, { name: h.name, branchId, sort: i }), `Zal ${h.name}`).id;
    for (const [number, seats] of h.tables) {
      if (await m.Table.exists({ branchId, number })) continue;
      must(await setup.saveTable(ctx, { hallId, number, seats }), `Stol ${number}`);
    }
  }
  const stationIds = {};
  for (const [i, s] of STATIONS.entries()) {
    const st = await m.KitchenStation.findOne({ branchId, name: s.name }).lean();
    stationIds[s.key] = st ? String(st._id) : must(await setup.saveStation(ctx, { name: s.name, kind: s.kind, branchId, sort: i }), `Stansiya ${s.name}`).id;
  }

  /* 5) Kategoriyalar va mahsulotlar */
  const catIds = {};
  for (const [key, name] of Object.entries(CATS)) {
    const c = await m.ProductCategory.findOne({ name, parentId: null }).lean()
      ?? await m.ProductCategory.create({ name, parentId: null, createdBy: ADMIN });
    catIds[key] = c._id;
  }
  const productIds = {};
  let createdN = 0;
  for (const p of [...RAW, ...DISHES]) {
    const found = await m.Product.findOne({ itemCode: p.code, branchId }).select('_id').lean();
    if (found) { productIds[p.code] = found._id; continue; }
    const goods = p.kind === 'goods';
    const doc = await m.Product.create({
      productId: generateProductCode(),
      itemCode: p.code,
      imei: generateSku(),
      kind: p.kind,
      name: p.name,
      purchasePrice: p.cost,
      salePrice: p.price,
      trackQuantity: goods,
      quantity: goods ? p.qty : 1,
      soldQuantity: 0,
      status: 'in_stock',
      branchId,
      unit: p.unit ?? 'dona',
      category: CATS[p.cat],
      categoryId: catIds[p.cat],
      ...(p.bundle ? { bundleItems: p.bundle.map(([code, qty]) => ({ productId: productIds[code], qty })) } : {}),
      ...(p.ikpu ? { ikpu: p.ikpu } : {}),
      createdBy: ADMIN,
      history: [{ action: 'created', detail: 'Demo restoran (seed)', by: ADMIN, at: new Date() }],
    });
    productIds[p.code] = doc._id;
    createdN++;
    // Restoran maydonlari (stansiya, modifikator) va stop-list — menyu muharriri bilan bir xil yo'l
    if (p.station || p.mods) {
      must(await setup.updateMenuItem(ctx, String(doc._id), {
        ...(p.station ? { stationId: stationIds[p.station] } : {}),
        ...(p.mods ? { modifierGroups: p.mods } : {}),
      }), `Menyu ${p.name}`);
    }
    if (p.stop) must(await setup.setStopList(ctx, String(doc._id), true), `Stop-list ${p.name}`);
  }
  console.log(createdN ? `✓ Mahsulotlar: ${createdN} ta qo'shildi` : '• Mahsulotlar bor');

  const tables = await m.Table.find({ branchId }).sort({ number: 1 }).select('number qrToken').lean();
  console.log(`\nKirish: http://localhost:3000/t/${org.slug}/login — ${ADMIN}, ${STAFF.map((s) => s.username).join(', ')} (parol — skriptda/SEED_RESTAURANT_PASSWORD)`);
  console.log(`Stollar: ${tables.length} ta · QR misol: http://localhost:3000/m/${org.slug}/${tables[0]?.qrToken ?? '—'}`);
}

let code = 0;
try {
  await main();
} catch (e) {
  console.error('✖ Seed xatosi:', e instanceof Error ? e.message : e);
  code = 1;
} finally {
  await (await getBaseConnection()).close().catch(() => {});
}
process.exit(code);
