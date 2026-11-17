/**
 * Ishlab chiqarish va kirim — sof logika (DB'siz): birlik konvertatsiyasi, ehtiyoj va yo'qotish, tannarx,
 * o'rtacha tortilgan narx, holat o'tishlari, ishbay jamlamasi, preset/huquq/rol, lug'at, kirish sxemalari.
 * MongoDB oqimi — tests/productionFlow.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  baseUnitCost, ceilQty, computeProductionCost, estimateUnitCost, isBelowMin, isValidFactor, lineAmount, lineQty,
  pieceworkAllows, planLabor, planMaterials, poAllows, poRemaining, poStatusAfterReceipt, productionAllows,
  receiptAllows, requiredQty, summarizePiecework, toBaseQty, unitFactor, weightedAverageCost,
} from '@/lib/production/calc';
import { productionSchemas } from '@/lib/production/inputs';
import { lowStockMessage } from '@/lib/production/lowStock';
import { getDictionary } from '@/lib/i18n/dict';
import { parseInput } from '@/lib/validation';
import { isFractionalUnit, isValidQty, qtyLabel } from '@/lib/qty';
import { resolveOrgFeatures } from '@/lib/features';
import {
  BUSINESS_TYPE_IDS, BUSINESS_TYPES, INDUSTRY_PROFILES, INDUSTRY_PROFILE_UNITS, PRODUCT_UNITS, TERMS,
  isIndustryProfile, parseIndustryProfile, productFieldsFor,
} from '@/lib/businessTypes';
import {
  PERMISSIONS, PERMISSIONS_VERSION, PERMISSION_KEYS, ROLE_DEFAULT_PERMISSIONS, effectivePermissions, isPermissionKey,
  permissionsOfPage, upgradeLegacyPermissions, type PermissionKey,
} from '@/lib/permissions';
import { MANUFACTURING_ROLES } from '@/lib/models/tenant/Role';
import { roleTemplatesFor } from '@/lib/roles';
import { organizationSchema } from '@/lib/models/master/Organization';
import { WRITE_OFF_REASONS } from '@/lib/models/tenant/StockAdjustment';
import { NAV_GROUPS } from '@/lib/navConfig';
import { parseUnit } from '@/lib/productImport';

describe('birliklar va konvertatsiya', () => {
  const un = { unit: 'kg', purchaseUnit: 'qop', purchaseFactor: 50 };

  it('yangi birliklar: list/rulon/m3/t — kasr, juft — butun', () => {
    for (const u of ['list', 'rulon', 'm3', 't', 'juft']) expect(PRODUCT_UNITS as readonly string[]).toContain(u);
    for (const u of ['list', 'rulon', 'm3', 't']) expect(isFractionalUnit(u)).toBe(true);
    expect(isFractionalUnit('juft')).toBe(false);
    expect(isValidQty(0.25, 'list')).toBe(true);
    expect(isValidQty(1.5, 'juft')).toBe(false);
    expect(qtyLabel(2.5, 'm3')).toBe('2,5 m³');
    expect(parseUnit('лист')).toBe('list');
    expect(parseUnit('м³')).toBe('m3');
    expect(parseUnit('тонна')).toBe('t');
    expect(parseUnit('пара')).toBe('juft');
  });

  it('unitFactor: asosiy — 1, xarid birligi — koeffitsient, boshqasi — null', () => {
    expect(unitFactor(un, 'kg')).toBe(1);
    expect(unitFactor(un, undefined)).toBe(1);
    expect(unitFactor(un, 'qop')).toBe(50);
    expect(unitFactor(un, 'l')).toBeNull();
    expect(unitFactor({ unit: 'kg' }, 'qop')).toBeNull();
    expect(unitFactor({}, 'dona')).toBe(1);
  });

  it('lineQty: 3 qop = 150 kg; dona birligida kasr — xato; noma\'lum birlik — badUnit', () => {
    expect(lineQty(un, 3, 'qop')).toEqual({ ok: true, factor: 50, baseQty: 150 });
    expect(lineQty(un, 2.5, 'kg')).toEqual({ ok: true, factor: 1, baseQty: 2.5 });
    expect(lineQty(un, 1.5, 'qop')).toEqual({ ok: false, reason: 'badQty' }); // qop — butun birlik
    expect(lineQty(un, 1, 'l')).toEqual({ ok: false, reason: 'badUnit' });
    expect(lineQty({ unit: 'dona', purchaseUnit: 'quti', purchaseFactor: 12 }, 2, 'quti')).toEqual({ ok: true, factor: 12, baseQty: 24 });
    // Asosiy birlikdagi natija ham yaroqli bo'lishi shart: 1 quti = 0,5 dona — mumkin emas
    expect(lineQty({ unit: 'dona', purchaseUnit: 'quti', purchaseFactor: 0.5 }, 1, 'quti')).toEqual({ ok: false, reason: 'badQty' });
    expect(toBaseQty(0.333, 3)).toBe(0.999);
  });

  it('koeffitsient va qator summasi', () => {
    expect(isValidFactor(50)).toBe(true);
    expect(isValidFactor(0)).toBe(false);
    expect(isValidFactor(0.0001)).toBe(false);
    expect(isValidFactor('50')).toBe(false);
    expect(lineAmount(400_000, 3)).toBe(1_200_000);
    expect(lineAmount(1999, 0.335)).toBe(670);
    expect(baseUnitCost(1_200_000, 150)).toBe(8000);
    expect(baseUnitCost(100, 0)).toBe(0);
  });
});

describe("o'rtacha tortilgan tannarx", () => {
  it('formula va chekka holatlar', () => {
    expect(weightedAverageCost(89, 7000, 100, 8000)).toBe(7529); // (623000 + 800000) / 189 = 7529,1
    expect(weightedAverageCost(0, 7000, 10, 8000)).toBe(8000); // qoldiq yo'q — yangi narx
    expect(weightedAverageCost(-5, 7000, 10, 8000)).toBe(8000);
    expect(weightedAverageCost(10, 0, 10, 8000)).toBe(8000); // eski narx kiritilmagan
    expect(weightedAverageCost(10, 7000, 0, 8000)).toBe(7000); // kirim yo'q
    expect(weightedAverageCost(1, 100, 1, 101)).toBe(101); // 100,5 → 101 (yarmi yuqoriga)
    expect(weightedAverageCost(3, 1000, 1, 0)).toBe(750); // bepul tovar narxni tushiradi
  });
});

describe("ehtiyoj (texkarta → reja) va yo'qotish", () => {
  const items = [
    { code: 'UN', name: 'Un', qty: 4, unit: 'kg', lossPct: 5 },
    { code: 'SHAKAR', name: 'Shakar', qty: 0.5, unit: 'kg', lossPct: 0 },
    { code: 'TUGMA', name: 'Tugma', qty: 5, unit: 'dona', lossPct: 2 },
  ];

  it('requiredQty: partiya bo\'yicha, yo\'qotish bilan, yuqoriga yaxlitlash', () => {
    expect(requiredQty(4, 5, 25, 10, 'kg')).toBe(10.5);
    expect(requiredQty(0.5, 0, 25, 10, 'kg')).toBe(1.25);
    expect(requiredQty(5, 2, 10, 10, 'dona')).toBe(6); // 5,1 → 6 (butun birlik — yuqoriga)
    expect(requiredQty(1, 0, 3, 1, 'dona')).toBe(3);
    expect(requiredQty(1, 0, 1, 3, 'kg')).toBe(0.334); // 0,3333 → 0,334
    expect(requiredQty(4, 200, 10, 10, 'kg')).toBe(7.6); // yo'qotish 90% bilan cheklanadi
    expect(requiredQty(4, 5, 0, 10, 'kg')).toBe(0);
    expect(ceilQty(2.0000000001, 'dona')).toBe(2);
  });

  it('planMaterials: sof va rejaviy miqdor', () => {
    const plan = planMaterials(items, 25, 10);
    expect(plan.map((p) => [p.code, p.netQty, p.plannedQty])).toEqual([
      ['UN', 10, 10.5],
      ['SHAKAR', 1.25, 1.25],
      ['TUGMA', 12.5, 13],
    ]);
  });

  it('planLabor: operatsiya narxi 1 birlikka', () => {
    expect(planLabor([{ name: 'Xamir', rate: 500 }, { name: 'Pishirish', rate: 300 }], 24)).toEqual([
      { operation: 'Xamir', qty: 24, rate: 500, amount: 12000 },
      { operation: 'Pishirish', qty: 24, rate: 300, amount: 7200 },
    ]);
  });
});

describe('ishlab chiqarish tannarxi', () => {
  it('materiallar + ish haqi + ustama; brak birlik tannarxiga bo\'linadi', () => {
    const c = computeProductionCost({
      materials: [{ qty: 11, unitCost: 7000 }, { qty: 1.25, unitCost: 12000 }],
      labor: [{ amount: 12000 }, { amount: 7200 }],
      overheadPerUnit: 200,
      producedQty: 24,
      scrapQty: 1,
    });
    expect(c).toEqual({ materialsCost: 92000, laborCost: 19200, overheadCost: 4800, costTotal: 116000, unitCost: 4640, scrapCost: 4640 });
    // Yaroqli × birlik + brak = jami
    expect(c.unitCost * 24 + c.scrapCost).toBe(c.costTotal);
  });

  it('braksiz va nol holatlar', () => {
    expect(computeProductionCost({ materials: [{ qty: 3, unitCost: 1000 }], labor: [], overheadPerUnit: 0, producedQty: 3, scrapQty: 0 }))
      .toMatchObject({ costTotal: 3000, unitCost: 1000, scrapCost: 0 });
    expect(computeProductionCost({ materials: [], labor: [], overheadPerUnit: 0, producedQty: 0, scrapQty: 0 }).unitCost).toBe(0);
  });

  it('taxminiy birlik tannarxi (texkarta kartochkasi)', () => {
    const est = estimateUnitCost(
      [{ code: 'UN', name: 'Un', qty: 4, lossPct: 5 }, { code: 'X', name: 'X', qty: 1, lossPct: 0 }],
      10, new Map([['UN', 7000]]), [{ name: 'Xamir', rate: 500 }], 200,
    );
    expect(est).toEqual({ materials: 2940, labor: 500, overhead: 200, total: 3640, missing: ['X'] });
  });
});

describe("holat o'tishlari", () => {
  it('akt', () => {
    expect(productionAllows('draft', 'start')).toBe(true);
    expect(productionAllows('in_progress', 'start')).toBe(false);
    expect(productionAllows('draft', 'complete')).toBe(true);
    expect(productionAllows('in_progress', 'complete')).toBe(true);
    for (const op of ['edit', 'start', 'complete', 'cancel'] as const) {
      expect(productionAllows('done', op)).toBe(false);
      expect(productionAllows('cancelled', op)).toBe(false);
    }
  });

  it('kirim akti — faqat qoralama', () => {
    expect(receiptAllows('draft', 'post')).toBe(true);
    expect(receiptAllows('posted', 'post')).toBe(false);
    expect(receiptAllows('posted', 'cancel')).toBe(false);
    expect(receiptAllows('cancelled', 'edit')).toBe(false);
  });

  it('xarid: holatlar va qabul', () => {
    expect(poAllows('draft', 'send')).toBe(true);
    expect(poAllows('sent', 'send')).toBe(false);
    expect(poAllows('partial', 'edit')).toBe(false);
    expect(poAllows('partial', 'receive')).toBe(true);
    expect(poAllows('received', 'receive')).toBe(false);
    expect(poAllows('received', 'cancel')).toBe(false);
    const lines = [{ qty: 10, receivedQty: 10 }, { qty: 5, receivedQty: 0 }];
    expect(poStatusAfterReceipt(lines, 'sent')).toBe('partial');
    expect(poStatusAfterReceipt([{ qty: 10, receivedQty: 10.0001 }], 'partial')).toBe('received');
    expect(poStatusAfterReceipt([{ qty: 10, receivedQty: 0 }], 'sent')).toBe('sent');
    expect(poStatusAfterReceipt(lines, 'cancelled')).toBe('cancelled');
    expect(poRemaining({ qty: 10, receivedQty: 12 })).toBe(0);
    expect(poRemaining({ qty: 1.5, receivedQty: 0.25 })).toBe(1.25);
  });

  it('ishbay', () => {
    expect(pieceworkAllows('logged', 'approve')).toBe(true);
    expect(pieceworkAllows('approved', 'approve')).toBe(false);
    expect(pieceworkAllows('approved', 'pay')).toBe(true);
    expect(pieceworkAllows('logged', 'pay')).toBe(false);
    expect(pieceworkAllows('paid', 'edit')).toBe(false);
  });
});

describe('ishbay jamlamasi', () => {
  it('xodim va operatsiya bo\'yicha, rad etilganlar kesimga kirmaydi', () => {
    const s = summarizePiecework([
      { workerId: 'a', workerName: 'Ali', operation: 'Tikish', qty: 10, amount: 5000, status: 'logged' },
      { workerId: 'a', workerName: 'Ali', operation: 'Tikish', qty: 20, amount: 10000, status: 'approved' },
      { workerId: 'a', workerName: 'Ali', operation: 'Bichish', qty: 5, amount: 1500, status: 'paid' },
      { workerId: 'a', workerName: 'Ali', operation: 'Tikish', qty: 3, amount: 1500, status: 'rejected' },
      { workerId: 'b', workerName: 'Vali', operation: 'Tikish', qty: 2, amount: 1000, status: 'approved' },
    ]);
    const ali = s.workers.find((w) => w.workerId === 'a')!;
    expect(ali.logged).toEqual({ count: 1, qty: 10, amount: 5000 });
    expect(ali.approved.amount).toBe(10000);
    expect(ali.paid.amount).toBe(1500);
    expect(ali.rejected.count).toBe(1);
    expect(ali.due).toBe(10000);
    expect(ali.byOperation).toEqual([{ operation: 'Tikish', qty: 30, amount: 15000 }, { operation: 'Bichish', qty: 5, amount: 1500 }]);
    expect(s.workers[0].workerId).toBe('a');
    expect(s.totals.approved).toEqual({ count: 2, qty: 22, amount: 11000 });
    expect(s.totals.due).toBe(11000);
  });

  it('minimal qoldiq', () => {
    expect(isBelowMin(5, 10)).toBe(true);
    expect(isBelowMin(10, 10)).toBe(false);
    expect(isBelowMin(0, null)).toBe(false);
    expect(isBelowMin(0, 0)).toBe(false);
  });
});

describe('biznes turi, profil, preset', () => {
  const plan = (tier: string) => ({ tier, maxFilial: 2, maxUsers: 5 });

  it('manufacturing — yangi tur, eskilar o\'zgarmagan, wholesale yorlig\'i', () => {
    expect(BUSINESS_TYPE_IDS).toContain('manufacturing');
    expect(BUSINESS_TYPE_IDS.indexOf('manufacturing')).toBe(BUSINESS_TYPE_IDS.length - 1);
    expect(BUSINESS_TYPES.manufacturing.icon).toBe('building');
    expect(TERMS.manufacturing.hasImei).toBe(false);
    expect(productFieldsFor('manufacturing').map((f) => f.key)).toEqual(['category', 'unit']);
    expect(BUSINESS_TYPES.wholesale.label).toBe('Optom savdo / distribyutor');
    expect(getDictionary('ru').catalog.businessTypes.manufacturing.label).toBe('Производственный цех');
  });

  it('industryProfile: ro\'yxat, faqat manufacturing turida, Mongoose enum', () => {
    expect(INDUSTRY_PROFILES).toEqual(['furniture_shop', 'sewing', 'bakery', 'meat', 'plastics_building', 'other_production']);
    expect(isIndustryProfile('sewing')).toBe(true);
    expect(isIndustryProfile('xxx')).toBe(false);
    expect(parseIndustryProfile('bakery', 'manufacturing')).toBe('bakery');
    expect(parseIndustryProfile('bakery', 'grocery')).toBeNull();
    expect(parseIndustryProfile('', 'manufacturing')).toBeNull();
    for (const p of INDUSTRY_PROFILES) for (const u of INDUSTRY_PROFILE_UNITS[p]) expect(PRODUCT_UNITS as readonly string[]).toContain(u);
    const path = organizationSchema.path('industryProfile') as unknown as { enumValues: string[] };
    expect([...path.enumValues]).toEqual([...INDUSTRY_PROFILES]);
  });

  it('preset: starter — ishlab chiqarish/kirim, pro — ishbay ham; bepul — yo\'q', () => {
    expect(resolveOrgFeatures({ plan: plan('free'), businessType: 'manufacturing' })).toMatchObject({ production: false, purchasing: false, piecework: false });
    expect(resolveOrgFeatures({ plan: plan('starter'), businessType: 'manufacturing' })).toMatchObject({ production: true, purchasing: true, piecework: false, daftar: true });
    const pro = resolveOrgFeatures({ plan: plan('pro'), businessType: 'manufacturing' });
    expect(pro).toMatchObject({ production: true, purchasing: true, piecework: true, inventory: true, transferred: true, daftar: true, variant: false, creditKassa: false });
    expect(resolveOrgFeatures({ plan: plan('pro'), businessType: 'wholesale' })).toMatchObject({ purchasing: true, production: false, piecework: false });
    expect(resolveOrgFeatures({ plan: plan('business'), businessType: 'general' })).toMatchObject({ production: false, purchasing: false, piecework: false });
  });
});

describe('huquqlar (4-versiya) va rollar', () => {
  const fresh: PermissionKey[] = ['production.view', 'production.manage', 'recipe.manage', 'production.viewCost', 'receipt.create', 'po.manage', 'piecework.log', 'piecework.approve'];

  it('yangi kalitlar: since 4, sahifa, modul', () => {
    expect(PERMISSIONS_VERSION).toBe(4);
    for (const k of fresh) {
      expect(PERMISSION_KEYS).toContain(k);
      expect(PERMISSIONS[k].since).toBe(4);
      expect(PERMISSIONS[k].adminOnly).toBeFalsy();
      expect(getDictionary('uz').catalog.permissions[k].label).toBeTruthy();
    }
    expect(permissionsOfPage('production')).toEqual(['production.view', 'production.manage', 'recipe.manage', 'production.viewCost']);
    expect(permissionsOfPage('receipts')).toEqual(['receipt.create', 'po.manage']);
    expect(permissionsOfPage('piecework')).toEqual(['piecework.log', 'piecework.approve']);
    expect(ROLE_DEFAULT_PERMISSIONS.user).toEqual(expect.arrayContaining(['production.view', 'receipt.create', 'piecework.log']));
    expect(ROLE_DEFAULT_PERMISSIONS.user).toContain('production.viewCost'); // kelish narxi (product.viewCost) kabi
    expect(ROLE_DEFAULT_PERMISSIONS.user).not.toContain('production.manage');
    expect(ROLE_DEFAULT_PERMISSIONS.user).not.toContain('piecework.approve');
  });

  it('v3 ro\'yxatdan meros: ko\'rish ← ombor, tannarx ← kelish narxi, kirim ← mahsulot qo\'shish, xarid ← yetkazib beruvchi', () => {
    const v3 = new Set(upgradeLegacyPermissions(['products.view', 'product.viewCost', 'product.create', 'suppliers.manage'], 3));
    expect(v3.has('production.view')).toBe(true);
    expect(v3.has('production.viewCost')).toBe(true);
    expect(v3.has('receipt.create')).toBe(true);
    expect(v3.has('po.manage')).toBe(true);
    expect(v3.has('piecework.log')).toBe(true); // o'z ishbayini yozish — hammaga
    // Boshqaruv va tasdiqlash — faqat aniq berilsa
    expect(v3.has('production.manage')).toBe(false);
    expect(v3.has('recipe.manage')).toBe(false);
    expect(v3.has('piecework.approve')).toBe(false);
    const cashier = new Set(upgradeLegacyPermissions(['sale.create', 'kassa.view'], 3));
    expect(cashier.has('receipt.create') || cashier.has('production.view') || cashier.has('po.manage')).toBe(false);
    // Joriy versiyadagi ro'yxat o'zgarmaydi (egasi olib qo'ygan huquq qaytmaydi)
    expect(effectivePermissions({ role: 'user', permissions: ['products.view'], permVersion: 4 }).has('production.view')).toBe(false);
  });

  it('sex rol shablonlari: Omborchi narx ko\'rmaydi, Usta — faqat ishbay, Hisobchi sotuv qilmaydi', () => {
    expect(MANUFACTURING_ROLES.map((r) => r.name)).toEqual(['Omborchi', "Sex boshlig'i", 'Usta / ishchi', 'Hisobchi']);
    for (const r of MANUFACTURING_ROLES) {
      expect(r.name.length).toBeLessThanOrEqual(40);
      for (const k of r.permissions) {
        expect(isPermissionKey(k), `${r.name}: ${k}`).toBe(true);
        expect(PERMISSIONS[k].adminOnly ?? false).toBe(false);
      }
      const set = effectivePermissions({ role: 'user', permissions: r.permissions, permVersion: r.permVersion });
      expect([...set].sort()).toEqual([...r.permissions].sort());
    }
    const by = (n: string) => MANUFACTURING_ROLES.find((r) => r.name === n)!.permissions;
    expect(by('Omborchi')).toEqual(expect.arrayContaining(['receipt.create', 'transfer.create', 'inventory.view', 'stock.writeOff']));
    expect(by('Omborchi')).not.toContain('product.viewCost');
    expect(by('Omborchi')).not.toContain('production.viewCost');
    expect(by("Sex boshlig'i")).toEqual(expect.arrayContaining(['production.manage', 'recipe.manage', 'piecework.approve']));
    expect(by('Usta / ishchi')).toEqual(expect.arrayContaining(['piecework.log']));
    expect(by('Usta / ishchi')).not.toContain('piecework.approve');
    expect(by('Hisobchi')).toEqual(expect.arrayContaining(['production.viewCost', 'product.viewCost', 'suppliers.manage']));
    expect(by('Hisobchi').some((k) => k.startsWith('sale.'))).toBe(false);
    expect(roleTemplatesFor('manufacturing')).toBe(MANUFACTURING_ROLES);
  });

  it('menyu va hisobdan chiqarish sabablari', () => {
    const g = NAV_GROUPS.find((x) => x.title === 'Ishlab chiqarish')!;
    expect(g.links.map((l) => [l.href, l.feature, l.permission])).toEqual([
      ['/app/production', 'production', 'production.view'],
      ['/app/production/recipes', 'production', 'production.view'],
      ['/app/receipts', 'purchasing', 'receipt.create'],
      ['/app/purchase-orders', 'purchasing', 'po.manage'],
      ['/app/piecework', 'piecework', 'piecework.log'],
    ]);
    const nav = getDictionary('ru').shell.nav;
    for (const l of g.links) expect(nav.links[l.href]).toBeTruthy();
    expect(nav.groups['Ishlab chiqarish']).toBe('Производство');
    expect(WRITE_OFF_REASONS).toEqual(expect.arrayContaining(['production_scrap', 'offcut']));
    expect(getDictionary('uz').stock.adjust.reasons.production_scrap).toBeTruthy();
  });
});

describe('kirish sxemalari (zod)', () => {
  const e = getDictionary('uz').production.errors;
  const s = productionSchemas(e);
  const id = 'a'.repeat(24);

  it('texkarta: majburiy maydonlar, yo\'qotish chegarasi, injection', () => {
    const okInput = { name: 'Non', outputProductId: id, outputQty: 10, items: [{ productId: id, qty: '4,5', unit: 'kg', lossPct: 5 }], operations: [{ name: 'Xamir', rate: 500 }] };
    const r = parseInput(s.recipe, okInput, e.badInput);
    expect(r.ok && r.data.items[0].qty).toBe(4.5);
    expect(parseInput(s.recipe, { ...okInput, items: [] }, e.badInput)).toEqual({ ok: false, error: e.emptyLines });
    expect(parseInput(s.recipe, { ...okInput, items: [{ productId: id, qty: 1, lossPct: 95 }] }, e.badInput).ok).toBe(false);
    expect(parseInput(s.recipe, { ...okInput, outputProductId: { $ne: null } }, e.badInput).ok).toBe(false);
    expect(parseInput(s.recipe, { ...okInput, items: [{ productId: id, qty: 1, unit: 'xyz' }] }, e.badInput).ok).toBe(false);
    expect(parseInput(s.recipe, { ...okInput, name: '' }, e.badInput).ok).toBe(false);
  });

  it('akt bajarildi: 0 sarf mumkin, manfiy — yo\'q; clientId formati', () => {
    expect(parseInput(s.orderComplete, { producedQty: 24, scrapQty: 1, materials: [{ id, actualQty: 0 }] }, e.badInput).ok).toBe(true);
    expect(parseInput(s.orderComplete, { producedQty: -1 }, e.badInput).ok).toBe(false);
    expect(parseInput(s.orderCreate, { recipeId: id, plannedQty: 5, clientId: 'abc' }, e.badInput).ok).toBe(false);
    expect(parseInput(s.orderCreate, { recipeId: id, plannedQty: 5, clientId: '3f1c9a2e-77aa-4c1d' }, e.badInput).ok).toBe(true);
  });

  it('kirim: narx butun so\'m, null — narxsiz; ombor sozlamasi null — tozalash', () => {
    const line = { productId: id, qty: 3, unit: 'qop', price: '400 000' };
    const r = parseInput(s.receipt, { lines: [line] }, e.badInput);
    expect(r.ok && r.data.lines[0].price).toBe(400000);
    const r2 = parseInput(s.receipt, { lines: [{ ...line, price: null }] }, e.badInput);
    expect(r2.ok && r2.data.lines[0].price).toBeNull();
    expect(parseInput(s.receipt, { lines: [{ ...line, price: 10.5 }] }, e.badInput).ok).toBe(false);
    const st = parseInput(s.stockSettings, { productId: id, minStock: null, purchaseUnit: null }, e.badInput);
    expect(st.ok && st.data).toMatchObject({ minStock: null, purchaseUnit: null });
    const st2 = parseInput(s.stockSettings, { productId: id, purchaseUnit: 'qop', purchaseFactor: '50' }, e.badInput);
    expect(st2.ok && st2.data).toMatchObject({ purchaseUnit: 'qop', purchaseFactor: 50 });
  });
});

describe('minimal qoldiq xabari', () => {
  it('Telegram HTML ekranlanadi, 10 tadan ortig\'i «yana N ta»', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ name: i === 0 ? '<Un>' : `Mahsulot ${i}`, available: 1.5, minStock: 10, unit: 'kg' }));
    const m = lowStockMessage("Non & Co", items);
    expect(m.text).toContain('Non &amp; Co: 12 ta mahsulot minimal qoldiqdan kam');
    expect(m.text).toContain('&lt;Un&gt;: 1,5 kg (min 10 kg)');
    expect(m.text).toContain('…va yana 2 ta');
    expect(m.push.title).toBe('Non & Co: 12 ta mahsulot minimal qoldiqdan kam');
    expect(m.push.body.split('\n')).toHaveLength(6);
  });
});
