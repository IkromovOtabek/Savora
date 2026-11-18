/**
 * Savora — DEMO ISHLAB CHIQARISH SEXI (faqat lokal dev bazasi). Sex modulini (texkarta, akt, kirim, xarid, ishbay)
 * uchdan-uchgacha sinash uchun.
 *
 *   npm run seed:sex          (yoki: node --env-file-if-exists=.env scripts/seed-demo-sex.mjs)
 *
 * Yaratadi (idempotent — qayta ishga tushsa takrorlamaydi, mavjudini to'ldiradi):
 *   - do'kon «Demo Sex» (slug `demo-sex`, turi manufacturing, profil bakery, tarif Pro → production/purchasing/piecework);
 *   - omborlar: «Xom ashyo» (asosiy) va «Tayyor mahsulot»;
 *   - loginlar: ds_admin (egasi), ds_boshliq (Sex boshlig'i), ds_usta (Usta / ishchi), ds_omborchi (Omborchi),
 *     ds_hisobchi (Hisobchi) — rol shablonlari (MANUFACTURING_ROLES), hammasi «Xom ashyo» filialida;
 *     parol: SEED_SEX_PASSWORD yoki pastdagi DEV_PASSWORD (faqat lokal dev);
 *   - 1 yetkazib beruvchi; 8 xom ashyo (xarid birligi bilan: 1 qop un = 50 kg, 1 quti tuxum = 30 dona …, minimal
 *     qoldiq, sut va sariyog' — yaroqlilik muddati bilan); 2 tayyor mahsulot (boshlang'ich qoldiq bilan);
 *   - 2 texkarta (operatsiyalar narxi, ustama) — lib/production/recipes.ts → saveRecipe orqali;
 *   - ShopSettings.stock.expiryWarnDays = 7 (muddati yaqin tovarlar bloki va kunlik xabar).
 * Kirish: http://localhost:3000/t/demo-sex/login
 *
 * XAVFSIZLIK: production'da va localhost bo'lmagan MONGO_URI'da ishlamaydi (aniq rad etadi).
 * Biznes mantiqi qayta yozilmagan — lib/organizations, lib/roles, lib/production/* chaqiriladi
 * (scripts/ts-hooks.mjs orqali TypeScript to'g'ridan-to'g'ri yuklanadi).
 */
import { registerTsHooks } from './ts-hooks.mjs';

/* ───────────────────────────── himoya: faqat lokal dev ───────────────────────────── */

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017'; // lib/db.ts bilan bir xil standart
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function refuse(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') refuse("NODE_ENV=production — demo sex seed'i production'da ishlamaydi.");
if (!/^mongodb:\/\//.test(URI)) refuse("MONGO_URI faqat mongodb://localhost bo'lishi mumkin (mongodb+srv va masofaviy bazalar rad etiladi).");
{
  const hostPart = URI.replace(/^mongodb:\/\//, '').split('/')[0].split('?')[0];
  const hosts = hostPart.slice(hostPart.lastIndexOf('@') + 1).split(',').map((h) => h.replace(/:\d+$/, '').toLowerCase());
  if (!hosts.length || !hosts.every((h) => LOCAL_HOSTS.has(h))) {
    refuse(`MONGO_URI lokal emas (${hosts.join(', ') || '—'}). Seed faqat localhost/127.0.0.1 bazasiga yozadi.`);
  }
}
process.env.MONGO_URI = URI;

/* ───────────────────────────── ma'lumot ───────────────────────────── */

/** Faqat lokal dev uchun parol (chatga/hujjatga yozilmaydi) */
const DEV_PASSWORD = process.env.SEED_SEX_PASSWORD || 'DemoSex!2026';
const ORG = { name: 'Demo Sex', slug: 'demo-sex', ownerName: 'Demo Sex egasi', phone: '+998900000001' };
const ADMIN = 'ds_admin';
const BRANCH_RAW = 'Xom ashyo';
const BRANCH_FIN = 'Tayyor mahsulot';
const STAFF = [
  { username: 'ds_boshliq', fullName: 'Bahrom (sex boshlig\'i)', role: "Sex boshlig'i" },
  { username: 'ds_usta', fullName: 'Ulug\'bek (usta)', role: 'Usta / ishchi' },
  { username: 'ds_omborchi', fullName: 'Odil (omborchi)', role: 'Omborchi' },
  { username: 'ds_hisobchi', fullName: 'Hilola (hisobchi)', role: 'Hisobchi' },
];
const SUPPLIER = { name: 'Don mahsulotlari MChJ', phone: '+998901112233', company: 'Don mahsulotlari' };
const CATS = { raw: 'Xom ashyo', fin: 'Tayyor mahsulot' };
const DAY = 86_400_000;

/**
 * Xom ashyo («Xom ashyo» ombori). `code` — barqaror kod (Product.itemCode), seed kaliti. `pu`/`pf` — xarid birligi
 * (1 pu = pf asosiy birlik), `min` — minimal qoldiq, `exp` — yaroqlilik muddati (bugundan N kun).
 */
const RAW = [
  { code: 'DS-UN', name: 'Un (oliy nav)', unit: 'kg', qty: 100, cost: 6000, pu: 'qop', pf: 50, min: 150 },
  { code: 'DS-SHAKAR', name: 'Shakar', unit: 'kg', qty: 30, cost: 13000, pu: 'qop', pf: 50, min: 20 },
  { code: 'DS-TUZ', name: 'Tuz', unit: 'kg', qty: 10, cost: 2500, pu: 'qop', pf: 25, min: 5 },
  { code: 'DS-XAMIRTURUSH', name: 'Xamirturush', unit: 'kg', qty: 3, cost: 60000, pu: 'quti', pf: 0.5, min: 1 },
  { code: 'DS-SUT', name: 'Sut', unit: 'l', qty: 20, cost: 9000, min: 10, exp: 3 },
  { code: 'DS-SARIYOG', name: "Sariyog'", unit: 'kg', qty: 4, cost: 85000, min: 3, exp: 20 },
  { code: 'DS-TUXUM', name: 'Tuxum', unit: 'dona', qty: 120, cost: 1500, pu: 'quti', pf: 30, min: 60 },
  { code: 'DS-KUNJUT', name: 'Kunjut', unit: 'kg', qty: 2, cost: 40000, min: 1 },
];
/** Tayyor mahsulot («Tayyor mahsulot» ombori, boshlang'ich qoldiq bilan) */
const FIN = [
  { code: 'DS-PATIR', name: 'Patir non', unit: 'dona', qty: 20, cost: 2800, price: 5000 },
  { code: 'DS-BULOCHKA', name: 'Bulochka (sutli)', unit: 'dona', qty: 10, cost: 3500, price: 6000 },
];
/** Texkartalar: `items` — [kod, partiya uchun miqdor (asosiy birlikda), yo'qotish %]; operatsiya narxi — 1 dona uchun */
const RECIPES = [
  {
    name: 'Patir non', output: 'DS-PATIR', outputQty: 50, overheadPerUnit: 200,
    items: [['DS-UN', 12.5, 2], ['DS-XAMIRTURUSH', 0.25, 0], ['DS-TUZ', 0.25, 0], ['DS-SUT', 3, 0], ['DS-KUNJUT', 0.2, 5]],
    operations: [{ name: 'Xamir qorish', rate: 300, normMin: 2 }, { name: 'Yopish (tandir)', rate: 500, normMin: 3 }],
  },
  {
    name: 'Bulochka (sutli)', output: 'DS-BULOCHKA', outputQty: 40, overheadPerUnit: 150,
    items: [['DS-UN', 4, 2], ['DS-SHAKAR', 0.8, 0], ['DS-SUT', 2, 0], ['DS-SARIYOG', 0.4, 0], ['DS-TUXUM', 8, 0], ['DS-XAMIRTURUSH', 0.08, 0]],
    operations: [{ name: 'Xamir qorish', rate: 250 }, { name: 'Shakl berish', rate: 200 }, { name: 'Pishirish', rate: 300 }],
  },
];

/* ───────────────────────────── ishga tushirish ───────────────────────────── */

registerTsHooks();
const lib = (p) => import(new URL(`../lib/${p}.ts`, import.meta.url).href);

const [
  { createOrganization }, { getMasterModels }, { getTenantModels }, { getBaseConnection },
  { resolveOrgFeatures }, { loadUserPermissions }, { getDictionary }, { ensureDefaultRoles },
  { reserveUsername, isUsernameAvailable }, { addOrgUser }, { ensureMainBranchId },
  { generateProductCode, generateSku }, { saveShopSettingsPart }, { tashkentDayKey }, recipes,
] = await Promise.all([
  lib('organizations'), lib('masterDb'), lib('tenantDb'), lib('db'),
  lib('features'), lib('permissionGuard'), lib('i18n/dict/index'), lib('roles'),
  lib('userDirectory'), lib('orgUsers'), lib('mainBranch'),
  lib('productId'), lib('shopSettings'), lib('period'), lib('production/recipes'),
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
      businessType: 'manufacturing',
      industryProfile: 'bakery',
      expiresAt: new Date(Date.now() + 365 * DAY),
      mustChangePassword: false,
      termsAcceptedAt: new Date(),
    });
    if (created.slug !== ORG.slug) throw new Error(`Slug «${ORG.slug}» band ekan (yaratildi: ${created.slug}).`);
    org = await Organization.findById(created.orgId).lean();
    console.log(`✓ Do'kon yaratildi: ${ORG.name} (${org.dbName})`);
  } else {
    console.log(`• Do'kon bor: ${org.name} (${org.dbName})`);
  }
  if (org.businessType !== 'manufacturing') throw new Error(`«${ORG.slug}» do'koni ishlab chiqarish turida emas (${org.businessType}).`);

  // Modullar: Pro + manufacturing preseti yoqadi; Super Admin o'chirib qo'ygan bo'lsa — qayta yoqamiz
  let features = resolveOrgFeatures(org);
  if (!features.production || !features.purchasing || !features.piecework) {
    await Organization.updateOne({ _id: org._id }, { $set: { 'features.production': true, 'features.purchasing': true, 'features.piecework': true } });
    org = await Organization.findById(org._id).lean();
    features = resolveOrgFeatures(org);
    console.log('✓ Modullar yoqildi: production, purchasing, piecework');
  }

  const m = await getTenantModels(org.dbName);
  const admin = await m.User.findOne({ username: ADMIN, role: 'admin' }).lean();
  if (!admin) throw new Error(`Admin «${ADMIN}» topilmadi (${org.dbName}).`);

  /* 2) Omborlar: «Xom ashyo» (asosiy) va «Tayyor mahsulot» */
  const rawId = await ensureMainBranchId(m.Branch, BRANCH_RAW);
  const fin = await m.Branch.findOne({ name: BRANCH_FIN }).lean()
    ?? await m.Branch.create({ name: BRANCH_FIN, active: true, isMain: false });
  const finId = String(fin._id);
  console.log(`• Omborlar: ${BRANCH_RAW}, ${BRANCH_FIN}`);

  /* 3) Rollar (sex shablonlari) va xodimlar — hammasi «Xom ashyo» filialida */
  await ensureDefaultRoles(m.Role, 'manufacturing');
  for (const s of STAFF) {
    const role = await m.Role.findOne({ name: s.role }).select('_id').lean();
    if (!role) throw new Error(`Rol «${s.role}» topilmadi.`);
    const exists = await m.User.findOne({ username: s.username }).lean();
    if (exists) {
      await m.User.updateOne({ _id: exists._id }, { $set: { roleId: role._id, branchId: rawId, active: true } });
      console.log(`• Login bor: ${s.username} (${s.role})`);
      continue;
    }
    if (!(await isUsernameAvailable(s.username))) throw new Error(`«${s.username}» login boshqa do'konda band.`);
    const u = new m.User({
      username: s.username, password: DEV_PASSWORD, role: 'user', fullName: s.fullName,
      branchId: rawId, roleId: role._id, active: true, mustChangePassword: false,
    });
    await u.save();
    try {
      await reserveUsername({ username: s.username, organizationId: String(org._id), dbName: org.dbName, role: 'user', branchId: rawId });
    } catch (e) {
      await m.User.deleteOne({ _id: u._id });
      throw e;
    }
    await addOrgUser(String(org._id), { username: s.username, name: s.fullName, role: 'user', branchId: rawId });
    console.log(`✓ Login: ${s.username} (${s.role})`);
  }

  /* 4) Yetkazib beruvchi */
  const sup = await m.Supplier.findOne({ name: SUPPLIER.name }).lean()
    ?? await m.Supplier.create({ ...SUPPLIER, createdBy: ADMIN });
  console.log(`• Yetkazib beruvchi: ${sup.name}`);

  /* 5) Kategoriyalar va mahsulotlar */
  const catIds = {};
  for (const [key, name] of Object.entries(CATS)) {
    const c = await m.ProductCategory.findOne({ name, parentId: null }).lean()
      ?? await m.ProductCategory.create({ name, parentId: null, createdBy: ADMIN });
    catIds[key] = c._id;
  }
  const today = new Date(`${tashkentDayKey(new Date())}T00:00:00.000Z`);
  const ids = {};
  let createdN = 0;
  for (const [list, cat, branchId] of [[RAW, 'raw', rawId], [FIN, 'fin', finId]]) {
    for (const p of list) {
      const found = await m.Product.findOne({ itemCode: p.code, branchId }).select('_id').lean();
      if (found) {
        ids[p.code] = String(found._id);
        // Ombor sozlamalari (minimal qoldiq, xarid birligi) — qayta ishga tushganda ham joyida bo'lsin
        await m.Product.updateOne({ _id: found._id }, { $set: { ...(p.min ? { minStock: p.min } : {}), ...(p.pu ? { purchaseUnit: p.pu, purchaseFactor: p.pf } : {}) } });
        continue;
      }
      const doc = await m.Product.create({
        productId: generateProductCode(),
        itemCode: p.code,
        imei: generateSku(),
        kind: 'goods',
        name: p.name,
        purchasePrice: p.cost,
        salePrice: p.price ?? 0,
        trackQuantity: true,
        quantity: p.qty,
        soldQuantity: 0,
        status: 'in_stock',
        branchId,
        unit: p.unit,
        category: CATS[cat],
        categoryId: catIds[cat],
        supplierId: cat === 'raw' ? sup._id : undefined,
        ...(p.pu ? { purchaseUnit: p.pu, purchaseFactor: p.pf } : {}),
        ...(p.min ? { minStock: p.min } : {}),
        ...(p.exp ? { expiryDate: new Date(today.getTime() + p.exp * DAY) } : {}),
        createdBy: ADMIN,
        history: [{ action: 'created', detail: 'Demo sex (seed)', by: ADMIN, at: new Date() }],
      });
      ids[p.code] = String(doc._id);
      createdN++;
    }
  }
  console.log(createdN ? `✓ Mahsulotlar: ${createdN} ta qo'shildi` : '• Mahsulotlar bor');

  /* 6) Texkartalar — lib/production/recipes.ts (egasi nomidan) */
  const user = { id: String(admin._id), username: admin.username, role: 'admin', tokenVersion: admin.tokenVersion ?? 0, organizationId: String(org._id), dbName: org.dbName };
  const ctx = {
    user, orgId: String(org._id), orgName: org.name, m, features,
    perms: await loadUserPermissions(user), d: getDictionary('uz'), via: ' (seed)',
  };
  for (const r of RECIPES) {
    if (await m.Recipe.exists({ name: r.name })) { console.log(`• Texkarta bor: ${r.name}`); continue; }
    must(await recipes.saveRecipe(ctx, {
      name: r.name,
      outputProductId: ids[r.output],
      outputQty: r.outputQty,
      items: r.items.map(([code, qty, lossPct]) => ({ productId: ids[code], qty, lossPct })),
      operations: r.operations,
      overheadPerUnit: r.overheadPerUnit,
    }), `Texkarta ${r.name}`);
    console.log(`✓ Texkarta: ${r.name}`);
  }

  /* 7) Yaroqlilik muddati ogohlantirishi (bakery: 7 kun) */
  await saveShopSettingsPart(m.ShopSettings, 'stock', { expiryWarnDays: 7 }, ADMIN);

  console.log(`\nKirish: http://localhost:3000/t/${org.slug}/login — ${ADMIN}, ${STAFF.map((s) => s.username).join(', ')} (parol — skriptda/SEED_SEX_PASSWORD)`);
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
