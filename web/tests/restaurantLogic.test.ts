/**
 * Restoran moduli — sof logika: hisob (xizmat haqi, qadoq, chegirma, bo'lish), holat o'tishlari va
 * ruxsatlar, modifikatorlar, vaqt o'lchovlari, QR token/slug, tarif/preset va huquqlar katalogi.
 */
import { describe, it, expect } from 'vitest';
import {
  computeBill,
  computePartTotals,
  effectiveServicePct,
  isBillable,
  itemTotal,
  serviceChargeAmount,
  splitEqually,
} from '@/lib/restaurant/bill';
import {
  ITEM_TRANSITIONS,
  bumpPermissions,
  canAccessOrder,
  canTransition,
  inBranchScope,
  orderAllows,
  orderCapabilities,
  voidRule,
  voidStageOf,
} from '@/lib/restaurant/rules';
import { itemDisplayName, normalizeModifierGroups, resolveModifiers } from '@/lib/restaurant/modifiers';
import { durationStats, itemTimings, kdsLevel, summarizeTimings } from '@/lib/restaurant/timings';
import { isBrandColor, isMenuSlug, isQrToken, qrMenuPath } from '@/lib/restaurant/qr';
import { ITEM_STATUSES, type ItemStatus } from '@/lib/restaurant/types';
import { resolveOrgFeatures } from '@/lib/features';
import {
  PERMISSIONS,
  PERMISSIONS_VERSION,
  PERMISSION_KEYS,
  ROLE_DEFAULT_PERMISSIONS,
  effectivePermissions,
  isPermissionKey,
  upgradeLegacyPermissions,
  type PermissionKey,
} from '@/lib/permissions';
import { RESTAURANT_ROLES } from '@/lib/models/tenant/Role';
import { roleTemplatesFor } from '@/lib/roles';
import { PAY_METHODS, CARD_METHODS } from '@/lib/payMethods';
import { DEFAULT_SHOP_SETTINGS, mergeShopSettings } from '@/lib/shopSettings';
import { newQrToken } from '@/lib/restaurant/setup';

const it_ = (price: number, qty: number, status: ItemStatus = 'served', paidCheckoutId?: string) => ({ price, qty, status, paidCheckoutId });

describe('hisob: qator, xizmat haqi, qadoq', () => {
  it('qator jami butun so\'m (kasr miqdorda yaxlitlanadi)', () => {
    expect(itemTotal({ price: 25000, qty: 2 })).toBe(50000);
    expect(itemTotal({ price: 1999, qty: 0.335 })).toBe(670);
  });

  it('bekor qilingan va tasdiqlanmagan (pending) taom hisobga kirmaydi', () => {
    expect(isBillable({ status: 'voided' })).toBe(false);
    expect(isBillable({ status: 'pending' })).toBe(false);
    expect(isBillable({ status: 'new' })).toBe(true);
    expect(isBillable({ status: 'served' })).toBe(true);
  });

  it('xizmat haqi faqat zalda, 0–30% oralig\'ida', () => {
    expect(effectiveServicePct('dine_in', 10)).toBe(10);
    expect(effectiveServicePct('takeaway', 10)).toBe(0);
    expect(effectiveServicePct('qr_self', 15)).toBe(0);
    expect(effectiveServicePct('dine_in', 55)).toBe(30);
    expect(effectiveServicePct('dine_in', -5)).toBe(0);
    expect(effectiveServicePct('dine_in', NaN)).toBe(0);
    expect(serviceChargeAmount(123_456, 10)).toBe(12_346);
    expect(serviceChargeAmount(0, 10)).toBe(0);
  });

  it('qism summasi: chegirma qatorlarga bo\'linadi, xizmat haqi chegirmadan keyin, qadoq qo\'shiladi', () => {
    const t = computePartTotals([{ price: 30000, qty: 2 }, { price: 40000, qty: 1 }], { servicePct: 10, packFee: 2000, discount: { kind: 'percent', value: 10 } })!;
    expect(t.subtotal).toBe(100_000);
    expect(t.discount).toBe(10_000);
    expect(t.lineDiscounts.reduce((s, n) => s + n, 0)).toBe(10_000);
    expect(t.serviceCharge).toBe(9_000);
    expect(t.packFee).toBe(2_000);
    expect(t.total).toBe(101_000);
  });

  it('chegirma summadan katta/teng — null', () => {
    expect(computePartTotals([{ price: 5000, qty: 1 }], { servicePct: 0, discount: { kind: 'amount', value: 5000 } })).toBeNull();
    expect(computePartTotals([{ price: 5000, qty: 1 }], { servicePct: 0, discount: { kind: 'percent', value: 100 } })).toBeNull();
  });

  it('buyurtma hisobi: to\'langan qism, qolgan qism, qadoq bir marta', () => {
    const order = {
      type: 'takeaway' as const, serviceChargePct: 10, packFee: 3000, packFeePaid: false,
      items: [it_(20000, 1, 'served', 'c1'), it_(15000, 2, 'cooking'), it_(9000, 1, 'voided'), it_(5000, 1, 'pending'), it_(7000, 1, 'new')],
      payments: [{ total: 23000 }],
    };
    const b = computeBill(order);
    expect(b.servicePct).toBe(0); // saboy
    expect(b.subtotal).toBe(57_000);
    expect(b.dueSubtotal).toBe(37_000);
    expect(b.duePackFee).toBe(3_000);
    expect(b.due).toBe(40_000);
    expect(b.paid).toBe(23_000);
    expect(b.counts).toMatchObject({ items: 3, pending: 1, unsent: 1, active: 1, voided: 1, unpaid: 2 });
    expect(computeBill({ ...order, packFeePaid: true }).duePackFee).toBe(0);
  });

  it('zalda xizmat haqi qolgan qismdan', () => {
    const b = computeBill({ type: 'dine_in', serviceChargePct: 12, packFee: 0, items: [it_(50000, 2)], payments: [] });
    expect(b.dueServiceCharge).toBe(12_000);
    expect(b.due).toBe(112_000);
  });

  it('teng bo\'lish: yig\'indi aniq, qoldiq birinchilarga', () => {
    expect(splitEqually(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
    expect(splitEqually(10, 4).reduce((s, n) => s + n, 0)).toBe(10);
    expect(splitEqually(5000, 0)).toEqual([5000]);
  });
});

describe('holat o\'tishlari va ruxsatlar', () => {
  it('o\'tishlar jadvali: barcha holatlar ta\'riflangan, voided va served — oxirgi', () => {
    for (const s of ITEM_STATUSES) expect(ITEM_TRANSITIONS[s]).toBeDefined();
    expect(canTransition('sent', 'cooking')).toBe(true);
    expect(canTransition('sent', 'ready')).toBe(true);
    expect(canTransition('cooking', 'ready')).toBe(true);
    expect(canTransition('ready', 'served')).toBe(true);
    expect(canTransition('ready', 'cooking')).toBe(true); // «qaytarish»
    expect(canTransition('new', 'served')).toBe(false); // ombor band qilinmasdan yetkazib bo'lmaydi
    expect(canTransition('pending', 'cooking')).toBe(false);
    expect(canTransition('served', 'ready')).toBe(false);
    expect(ITEM_TRANSITIONS.voided).toEqual([]);
  });

  it('bump huquqlari: tayyorlash — oshxona, yetkazildi — ofitsant yoki oshxona', () => {
    expect(bumpPermissions('cooking')).toEqual(['kitchen.bump']);
    expect(bumpPermissions('ready')).toEqual(['kitchen.bump']);
    expect(bumpPermissions('served')).toEqual(['order.create', 'kitchen.bump']);
  });

  it('bekor qilish bosqichlari', () => {
    expect(voidStageOf('new')).toBe('unsent');
    expect(voidStageOf('pending')).toBe('unsent');
    expect(voidStageOf('sent')).toBe('beforeCook');
    expect(voidStageOf('cooking')).toBe('afterCook');
    expect(voidStageOf('served')).toBe('afterCook');
    expect(voidStageOf('voided')).toBeNull();
  });

  it('bekor qilish qoidasi: huquq, sabab, ombor qaytishi, yo\'qotish', () => {
    const strict = { requireVoidReason: true };
    expect(voidRule({ status: 'new' }, strict)).toMatchObject({ permission: 'order.create', reasonRequired: false, releaseStock: false, loss: false });
    expect(voidRule({ status: 'sent', stockReserved: true }, strict)).toMatchObject({ permission: 'order.voidItem', reasonRequired: true, releaseStock: true, loss: false });
    expect(voidRule({ status: 'cooking', stockReserved: true }, strict)).toMatchObject({ permission: 'order.voidItem', releaseStock: false, loss: true });
    expect(voidRule({ status: 'sent' }, { requireVoidReason: false })?.reasonRequired).toBe(false);
    expect(voidRule({ status: 'served', paidCheckoutId: 'x' }, strict)).toBeNull(); // to'langan
    expect(voidRule({ status: 'voided' }, strict)).toBeNull();
  });

  it('buyurtma holati: pre-chek tarkibni qulflaydi, to\'langanda faqat oshxona', () => {
    expect(orderAllows('open', 'addItems')).toBe(true);
    expect(orderAllows('precheck', 'addItems')).toBe(false);
    expect(orderAllows('precheck', 'void')).toBe(false);
    expect(orderAllows('precheck', 'pay')).toBe(true);
    expect(orderAllows('precheck', 'reopen')).toBe(true);
    expect(orderAllows('open', 'reopen')).toBe(false);
    expect(orderAllows('paid', 'bump')).toBe(true);
    expect(orderAllows('paid', 'pay')).toBe(false);
    expect(orderAllows('cancelled', 'bump')).toBe(false);
  });

  const waiter = { id: 'w1', role: 'user', branchId: 'b1' };
  const perms = (...k: PermissionKey[]) => new Set<PermissionKey>(k);

  it('buyurtmaga kirish: filial doirasi, o\'z stoli, ofitsantsiz (QR), barcha buyurtmalar', () => {
    const own = { branchId: 'b1', waiterId: 'w1' };
    const other = { branchId: 'b1', waiterId: 'w2' };
    const qr = { branchId: 'b1' };
    const foreign = { branchId: 'b2', waiterId: 'w1' };
    expect(canAccessOrder(waiter, perms('order.create'), own)).toBe(true);
    expect(canAccessOrder(waiter, perms('order.create'), other)).toBe(false);
    expect(canAccessOrder(waiter, perms('order.create'), qr)).toBe(true);
    expect(canAccessOrder(waiter, perms('order.create', 'order.viewAll'), other)).toBe(true);
    expect(canAccessOrder(waiter, perms('order.viewAll'), foreign)).toBe(false); // boshqa filial
    expect(canAccessOrder(waiter, perms('kitchen.view'), own)).toBe(false);
    expect(canAccessOrder({ id: 'a', role: 'admin' }, perms('order.viewAll'), foreign)).toBe(true);
    expect(inBranchScope({ id: 'x', role: 'user' }, 'b1')).toBe(false); // filialsiz user — fail-closed
  });

  it('UI imkoniyatlari: huquq + holat', () => {
    const c = orderCapabilities(waiter, perms('order.create'), { branchId: 'b1', waiterId: 'w1', status: 'open' });
    expect(c).toMatchObject({ view: true, edit: true, send: true, voidUnsent: true, voidSent: false, transfer: false, pay: false, split: false });
    const pre = orderCapabilities(waiter, perms('order.create', 'order.reopen', 'sale.create', 'order.split'), { branchId: 'b1', waiterId: 'w1', status: 'precheck' });
    expect(pre).toMatchObject({ edit: false, reopen: true, pay: true, split: true, discount: false });
  });
});

describe('modifikatorlar', () => {
  const groups = [
    { _id: 'g1', name: 'Porsiya', required: true, min: 1, max: 1, options: [{ _id: 'o1', name: 'Kichik', price: 0 }, { _id: 'o2', name: 'Katta', price: 8000 }] },
    { _id: 'g2', name: "Qo'shimcha", required: false, min: 0, max: 2, options: [{ _id: 'o3', name: 'Pishloq', price: 5000 }, { _id: 'o4', name: 'Achchiq', price: 0 }, { _id: 'o5', name: 'Tuxum', price: 3000 }] },
  ];

  it('tanlov narxi va nusxasi', () => {
    const r = resolveModifiers(groups, ['o2', 'o3']);
    expect(r).toMatchObject({ ok: true, extra: 13000 });
    if (r.ok) expect(r.modifiers).toEqual([{ group: 'Porsiya', name: 'Katta', price: 8000 }, { group: "Qo'shimcha", name: 'Pishloq', price: 5000 }]);
  });

  it('majburiy guruh, ko\'p tanlov, noma\'lum va takroriy id — rad', () => {
    expect(resolveModifiers(groups, [])).toMatchObject({ ok: false, reason: 'tooFew', group: 'Porsiya' });
    expect(resolveModifiers(groups, ['o1', 'o2'])).toMatchObject({ ok: false, reason: 'tooMany', group: 'Porsiya' });
    expect(resolveModifiers(groups, ['o1', 'o3', 'o4', 'o5'])).toMatchObject({ ok: false, reason: 'tooMany' });
    expect(resolveModifiers(groups, ['o1', 'zz'])).toMatchObject({ ok: false, reason: 'unknownOption' });
    expect(resolveModifiers(groups, ['o1', 'o1'])).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(resolveModifiers(undefined, [])).toMatchObject({ ok: true, extra: 0 });
  });

  it('saqlashdan oldin tekshiruv', () => {
    expect(normalizeModifierGroups(null)).toEqual({ ok: true, groups: [] });
    const ok = normalizeModifierGroups([{ name: ' Porsiya ', required: true, options: [{ name: 'Kichik', price: 0 }, { name: 'Katta', price: '8000' }] }]);
    expect(ok).toEqual({ ok: true, groups: [{ name: 'Porsiya', required: true, min: 1, max: 1, options: [{ name: 'Kichik', price: 0 }, { name: 'Katta', price: 8000 }] }] });
    expect(normalizeModifierGroups([{ name: 'A', options: [] }]).ok).toBe(false);
    expect(normalizeModifierGroups([{ name: 'A', min: 2, max: 1, options: [{ name: 'x' }] }]).ok).toBe(false);
    expect(normalizeModifierGroups([{ name: 'A', max: 3, options: [{ name: 'x' }, { name: 'y' }] }]).ok).toBe(false);
    expect(normalizeModifierGroups([{ name: 'A', options: [{ name: 'x', price: -1 }] }]).ok).toBe(false);
    expect(normalizeModifierGroups([{ name: 'A', options: [{ name: 'x' }, { name: 'X' }] }]).ok).toBe(false);
    expect(normalizeModifierGroups([{ name: 'A', options: [{ name: 'x' }] }, { name: 'a', options: [{ name: 'y' }] }]).ok).toBe(false);
    expect(normalizeModifierGroups({ $ne: 1 }).ok).toBe(false);
  });

  it('chek nomi', () => {
    expect(itemDisplayName('Osh', [{ name: 'Katta' }, { name: 'Achchiq' }])).toBe('Osh (Katta, Achchiq)');
    expect(itemDisplayName('Osh', [])).toBe('Osh');
  });
});

describe('vaqt o\'lchovlari', () => {
  const t0 = new Date('2026-11-18T12:00:00Z').getTime();
  const at = (min: number) => new Date(t0 + min * 60_000);

  it('tayyorlanish = ready − sent, yetkazish = served − ready', () => {
    const t = itemTimings({ sentAt: at(0), cookStartedAt: at(2), readyAt: at(14), servedAt: at(17) });
    expect(t).toEqual({ waitMs: 2 * 60_000, prepMs: 14 * 60_000, deliveryMs: 3 * 60_000, totalMs: 17 * 60_000 });
  });

  it('belgi yo\'q yoki teskari — null', () => {
    expect(itemTimings({ sentAt: at(5) })).toEqual({ waitMs: null, prepMs: null, deliveryMs: null, totalMs: null });
    expect(itemTimings({ sentAt: at(10), readyAt: at(5) }).prepMs).toBeNull();
  });

  it('statistika: o\'rtacha, mediana, p90', () => {
    const s = durationStats([60_000, 120_000, 180_000, null, 240_000]);
    expect(s).toMatchObject({ count: 4, avgMs: 150_000, medianMs: 150_000, maxMs: 240_000, p90Ms: 240_000 });
    expect(durationStats([]).avgMs).toBeNull();
    expect(summarizeTimings([{ sentAt: at(0), readyAt: at(10), servedAt: at(12) }]).prep.avgMs).toBe(600_000);
  });

  it('KDS rangi', () => {
    const s = { kdsWarnMinutes: 10, kdsAlertMinutes: 20 };
    expect(kdsLevel(at(0), at(5), s)).toBe('ok');
    expect(kdsLevel(at(0), at(12), s)).toBe('warn');
    expect(kdsLevel(at(0), at(25), s)).toBe('alert');
    expect(kdsLevel(null, at(25), s)).toBe('ok');
  });
});

describe('QR token va slug', () => {
  it('token: tasodifiy 22 belgi base64url, takrorlanmaydi', () => {
    const a = newQrToken();
    const b = newQrToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
    expect(isQrToken(a)).toBe(true);
  });

  it('yaroqsiz token va slug rad etiladi (injection, qisqa, katta harf)', () => {
    expect(isQrToken('short')).toBe(false);
    expect(isQrToken('a'.repeat(65))).toBe(false);
    expect(isQrToken('abc/def/ghi/jkl/mno')).toBe(false);
    expect(isQrToken({ $ne: 1 })).toBe(false);
    expect(isMenuSlug('osh-markazi')).toBe(true);
    expect(isMenuSlug('Osh')).toBe(false);
    expect(isMenuSlug('ab')).toBe(false);
    expect(isMenuSlug('-osh')).toBe(false);
    expect(isMenuSlug('../x')).toBe(false);
  });

  it('manzil va brend rangi', () => {
    expect(qrMenuPath('osh-markazi', 'AbC_123-xyzAbC_123-xy')).toBe('/m/osh-markazi/AbC_123-xyzAbC_123-xy');
    expect(isBrandColor('#E4572E')).toBe(true);
    expect(isBrandColor('red')).toBe(false);
    expect(isBrandColor('#E4572')).toBe(false);
  });
});

describe('modul kalitlari, preset va huquqlar katalogi', () => {
  const plan = (tier: string) => ({ tier, maxFilial: 1, maxUsers: 3 });

  it('restoran preseti: starter — stollar va oshxona, pro — QR-menyu ham; bepul — yo\'q', () => {
    expect(resolveOrgFeatures({ plan: plan('free'), businessType: 'restaurant' })).toMatchObject({ tables: false, kitchen: false, qrMenu: false });
    expect(resolveOrgFeatures({ plan: plan('starter'), businessType: 'restaurant' })).toMatchObject({ tables: true, kitchen: true, qrMenu: false });
    expect(resolveOrgFeatures({ plan: plan('pro'), businessType: 'restaurant' })).toMatchObject({ tables: true, kitchen: true, qrMenu: true });
    expect(resolveOrgFeatures({ plan: plan('business'), businessType: 'general' })).toMatchObject({ tables: false, kitchen: false, qrMenu: false });
  });

  it('3-versiya: v2 ro\'yxatda egasi olib qo\'ygan eski huquq qayta qo\'shilmaydi, restoran huquqlari meros', () => {
    // 4-versiya (ishlab chiqarish) qo'shilgan — restoran qoidalari o'zgarmaydi
    expect(PERMISSIONS_VERSION).toBeGreaterThanOrEqual(3);
    // v2'da «Sotuvlarni ko'rish» olib qo'yilgan, sotuv qila oladi
    const v2 = effectivePermissions({ role: 'user', permissions: ['sale.create', 'kassa.view'], permVersion: 2 });
    expect(v2.has('sales.view')).toBe(false);
    expect(v2.has('order.create')).toBe(true);
    expect(v2.has('kitchen.view')).toBe(true);
    expect(v2.has('order.voidItem')).toBe(false); // nazorat amallari — faqat aniq berilsa
    expect(v2.has('tables.manage')).toBe(false);
    // Sotuv qila olmagan xodimga restoran huquqlari berilmaydi
    expect(new Set(upgradeLegacyPermissions(['kassa.view'], 2)).has('order.create')).toBe(false);
  });

  it('yangi huquqlar: sahifa, modul, filial standarti', () => {
    const fresh: PermissionKey[] = ['order.create', 'order.viewAll', 'order.transfer', 'order.voidItem', 'order.split', 'order.reopen', 'kitchen.view', 'kitchen.bump', 'menu.stopList', 'tables.manage'];
    for (const k of fresh) {
      expect(PERMISSION_KEYS).toContain(k);
      expect(PERMISSIONS[k].since).toBe(3);
      expect(PERMISSIONS[k].adminOnly).toBeFalsy();
    }
    expect(ROLE_DEFAULT_PERMISSIONS.user).toContain('order.create');
    expect(ROLE_DEFAULT_PERMISSIONS.user).not.toContain('order.voidItem');
  });

  it('restoran rol shablonlari: mavjud, filialga beriladigan kalitlar; faqat restoran turida', () => {
    expect(RESTAURANT_ROLES.map((r) => r.name)).toEqual(['Ofitsant', 'Oshpaz', 'Barmen', 'Kassir (restoran)', 'Administrator']);
    for (const r of RESTAURANT_ROLES) {
      expect(r.name.length).toBeLessThanOrEqual(40);
      for (const k of r.permissions) {
        expect(isPermissionKey(k), `${r.name}: ${k}`).toBe(true);
        expect(PERMISSIONS[k].adminOnly ?? false).toBe(false);
      }
      const set = effectivePermissions({ role: 'user', permissions: r.permissions, permVersion: r.permVersion });
      expect([...set].sort()).toEqual([...r.permissions].sort());
    }
    const waiter = RESTAURANT_ROLES.find((r) => r.name === 'Ofitsant')!;
    expect(waiter.permissions).not.toContain('order.viewAll');
    expect(RESTAURANT_ROLES.find((r) => r.name === 'Administrator')!.permissions).toEqual(expect.arrayContaining(['order.voidItem', 'order.reopen', 'order.transfer', 'tables.manage']));
    expect(roleTemplatesFor('restaurant')).toBe(RESTAURANT_ROLES);
    expect(roleTemplatesFor('grocery')).toEqual([]);
  });

  it('UzQR to\'lov usuli — karta/o\'tkazma qatorida (naqd kassaga kirmaydi)', () => {
    expect(PAY_METHODS).toContain('uzqr');
    expect(CARD_METHODS).toContain('uzqr');
  });

  it('do\'kon sozlamalari: restoran standartlari, saqlangan qiymat ustiga yoziladi', () => {
    expect(mergeShopSettings(null).restaurant).toEqual(DEFAULT_SHOP_SETTINGS.restaurant);
    const s = mergeShopSettings({ restaurant: { serviceChargePct: 12, brand: { color: '#112233' } } } as never);
    expect(s.restaurant).toMatchObject({ serviceChargePct: 12, takeawayPackFee: 0, requireVoidReason: true, kdsWarnMinutes: 10, brand: { color: '#112233' } });
  });
});

describe('kirish sxemalari (zod): injection va chegaralar', async () => {
  const { restaurantSchemas } = await import('@/lib/restaurant/inputs');
  const { getDictionary } = await import('@/lib/i18n/dict');
  const { parseInput } = await import('@/lib/validation');
  const { z } = await import('zod');
  const e = getDictionary('uz').restaurant.errors;
  const s = restaurantSchemas(e);
  const id = 'a'.repeat(24);

  it('stol ochish: minimal kirish, bo\'sh maydonlar undefined', () => {
    const r = parseInput(s.openOrder, { type: 'dine_in', tableId: id }, e.badInput);
    expect(r).toMatchObject({ ok: true, data: { type: 'dine_in', tableId: id, note: '' } });
    expect(r.ok && r.data.clientOrderId).toBeUndefined();
    expect(parseInput(s.openOrder, { type: 'delivery' }, e.badInput).ok).toBe(false);
  });

  it('NoSQL operator obyekti id/matn sifatida o\'tmaydi', () => {
    expect(parseInput(s.addItems, { items: [{ productId: { $ne: null }, qty: 1 }] }, e.badInput).ok).toBe(false);
    expect(parseInput(s.voidItem, { itemId: { $gt: '' } }, e.badInput).ok).toBe(false);
    expect(parseInput(s.publicOrder, { clientOrderId: { $ne: 1 }, items: [{ productId: id, qty: 1 }] }, e.badInput).ok).toBe(false);
    expect(parseInput(s.settings, { brand: { logoUrl: { $where: '1' } } }, e.badInput).ok).toBe(false);
  });

  it('to\'lov: usul ro\'yxatdan, summa butun manfiy emas; chegirma ixtiyoriy', () => {
    expect(parseInput(s.pay, { parts: [{ method: 'uzqr', amount: 5000 }] }, e.badInput).ok).toBe(true);
    expect(parseInput(s.pay, { parts: [{ method: 'bitcoin', amount: 5000 }] }, e.badInput).ok).toBe(false);
    expect(parseInput(s.pay, { parts: [{ method: 'cash', amount: -1 }] }, e.badInput).ok).toBe(false);
    expect(parseInput(s.pay, { parts: [{ method: 'cash', amount: 1.5 }] }, e.badInput).ok).toBe(false);
    expect(parseInput(s.pay, { parts: [] }, e.badInput).ok).toBe(false);
    const r = parseInput(s.pay, { parts: [{ method: 'cash', amount: '10 000' }], discount: { kind: 'percent', value: '10' } }, e.badInput);
    expect(r).toMatchObject({ ok: true, data: { parts: [{ method: 'cash', amount: 10000 }], discount: { kind: 'percent', value: 10 } } });
  });

  it('mijoz QR: chegaralar (≤30 taom, kalit 8–40)', () => {
    const item = { productId: id, qty: 1 };
    expect(parseInput(s.publicOrder, { clientOrderId: 'abcdefgh', items: [item] }, e.badInput).ok).toBe(true);
    expect(parseInput(s.publicOrder, { clientOrderId: 'short', items: [item] }, e.badInput).ok).toBe(false);
    expect(parseInput(s.publicOrder, { clientOrderId: 'abcdefgh:1', items: [item] }, e.badInput).ok).toBe(false);
    expect(parseInput(s.publicOrder, { clientOrderId: 'abcdefgh', items: Array(31).fill(item) }, e.badInput).ok).toBe(false);
    expect(parseInput(s.publicCall, { kind: 'manager' }, e.badInput).ok).toBe(false);
  });

  it('polling so\'rovi: since sana, noma\'lum status e\'tiborsiz', () => {
    const r = parseInput(s.query, { since: '2026-11-18T10:00:00Z', status: 'hack', stationId: '' }, e.badInput);
    expect(r).toMatchObject({ ok: true, data: { status: undefined, stationId: undefined } });
    expect(r.ok && r.data.since instanceof Date).toBe(true);
    expect(parseInput(s.query, { since: 'kecha' }, e.badInput).ok).toBe(false);
  });

  it('mobil op birlashmasi (discriminated union) va ackCall kesishmasi', () => {
    const ack = z.object({ op: z.literal('ackCall') }).and(s.ackCall);
    expect(parseInput(ack, { op: 'ackCall', tableId: id, kind: 'bill' }, e.badInput)).toMatchObject({ ok: true, data: { tableId: id, kind: 'bill' } });
    expect(parseInput(ack, { op: 'ackCall', tableId: 'x' }, e.badInput).ok).toBe(false);
    const ops = z.discriminatedUnion('op', [
      z.object({ op: z.literal('send'), itemIds: s.send.shape.itemIds }),
      z.object({ op: z.literal('precheck') }),
    ]);
    expect(parseInput(ops, { op: 'send' }, e.badInput)).toMatchObject({ ok: true, data: { op: 'send' } });
    expect(parseInput(ops, { op: 'pay' }, e.badInput).ok).toBe(false);
  });

  it('sozlamalar: berilmagan maydon undefined (o\'zgarmaydi), null — tozalash', () => {
    const r = parseInput(s.settings, { serviceChargePct: '12.5', brand: { color: null } }, e.badSettings);
    expect(r).toMatchObject({ ok: true, data: { serviceChargePct: 12.5, brand: { color: '' } } });
    expect(r.ok && r.data.takeawayPackFee).toBeUndefined();
    expect(r.ok && r.data.brand?.logoUrl).toBeUndefined();
    expect(parseInput(s.settings, { serviceChargePct: 31 }, e.badSettings).ok).toBe(false);
  });
});
