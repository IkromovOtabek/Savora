import { describe, it, expect } from 'vitest';
import {
  PERMISSION_KEYS,
  PERMISSION_PAGE_DEFS,
  PERMISSION_PAGES,
  PERMISSIONS,
  PERMISSIONS_VERSION,
  ROLE_DEFAULT_PERMISSIONS,
  effectivePermissions,
  effectivePermissionsWithRole,
  hasPermission,
  normalizeUserPermissions,
  permissionsOfPage,
  rolePermissionList,
  upgradeLegacyPermissions,
} from '@/lib/permissions';
import { FEATURE_KEYS } from '@/lib/featureKeys';
import { userSchema } from '@/lib/models/tenant/User';

describe('hasPermission', () => {
  it('admin — doim barcha huquq (bazada ro\'yxat bo\'lsa ham)', () => {
    for (const k of PERMISSION_KEYS) expect(hasPermission({ role: 'admin', permissions: [] }, k)).toBe(true);
  });

  it('filial login — permissions yo\'q bo\'lsa rol standarti', () => {
    const u = { role: 'user' };
    expect(hasPermission(u, 'sale.create')).toBe(true);
    expect(hasPermission(u, 'product.viewCost')).toBe(true);
    expect(hasPermission(u, 'sale.cancel')).toBe(false);
    expect(hasPermission(u, 'product.delete')).toBe(false);
    expect(hasPermission(u, 'export.data')).toBe(false);
  });

  it('filial login — aniq ro\'yxat standartni almashtiradi', () => {
    const u = { role: 'user', permissions: ['sale.cancel'] };
    expect(hasPermission(u, 'sale.cancel')).toBe(true);
    expect(hasPermission(u, 'sale.create')).toBe(false);
  });

  it('bo\'sh ro\'yxat (joriy versiya) — hech qanday huquq', () => {
    expect(effectivePermissions({ role: 'user', permissions: [], permVersion: PERMISSIONS_VERSION }).size).toBe(0);
  });

  it('adminOnly huquqlar filialga berilmaydi (bazaga yozilgan bo\'lsa ham)', () => {
    const u = { role: 'user', permissions: ['users.manage', 'audit.view', 'kirimChiqim.manage', 'sale.create'] };
    expect(hasPermission(u, 'users.manage')).toBe(false);
    expect(hasPermission(u, 'audit.view')).toBe(false);
    expect(hasPermission(u, 'kirimChiqim.manage')).toBe(false);
    expect(hasPermission(u, 'sale.create')).toBe(true);
  });

  it('noma\'lum rol / null — huquq yo\'q', () => {
    expect(hasPermission(null, 'sale.create')).toBe(false);
    expect(hasPermission({ role: 'super_admin' }, 'sale.create')).toBe(false);
  });
});

describe('normalizeUserPermissions', () => {
  it('begona va adminOnly kalitlarni tashlaydi', () => {
    expect(normalizeUserPermissions(['sale.cancel', 'hack.all', 'users.manage', 5])).toEqual(['sale.cancel']);
  });

  it('standartga teng bo\'lsa — undefined (rol standartiga qaytadi)', () => {
    expect(normalizeUserPermissions([...ROLE_DEFAULT_PERMISSIONS.user].reverse())).toBeUndefined();
  });

  it('bo\'sh ro\'yxat saqlanadi (barcha huquq olingan)', () => {
    expect(normalizeUserPermissions([])).toEqual([]);
  });
});

describe('huquqlar ro\'yxati butunligi', () => {
  it('har huquq uchun ta\'rif, feature kaliti mavjud', () => {
    for (const k of PERMISSION_KEYS) {
      expect(PERMISSIONS[k].key).toBe(k);
      expect(PERMISSIONS[k].label).toBeTruthy();
      if (PERMISSIONS[k].feature) expect(FEATURE_KEYS as readonly string[]).toContain(PERMISSIONS[k].feature);
    }
  });

  it('filial standartida adminOnly huquq yo\'q', () => {
    for (const k of ROLE_DEFAULT_PERMISSIONS.user) expect(PERMISSIONS[k].adminOnly).toBeFalsy();
  });

  it('User sxemasida permissions default undefined (rol standarti ishlashi uchun)', () => {
    const path = userSchema.path('permissions') as unknown as { defaultValue?: unknown };
    expect(path).toBeDefined();
    expect(path.defaultValue).toBeUndefined();
  });
});

describe('sahifa bo\'yicha huquqlar', () => {
  it('har huquq ma\'lum sahifaga tegishli, har sahifa ta\'riflangan', () => {
    for (const k of PERMISSION_KEYS) expect(PERMISSION_PAGES as readonly string[]).toContain(PERMISSIONS[k].page);
    for (const p of PERMISSION_PAGES) expect(PERMISSION_PAGE_DEFS[p].id).toBe(p);
  });

  it('adminOnly huquqlar faqat «faqat egasi» sahifalarida', () => {
    for (const k of PERMISSION_KEYS) {
      expect(!!PERMISSIONS[k].adminOnly, k).toBe(!!PERMISSION_PAGE_DEFS[PERMISSIONS[k].page].ownerOnly);
    }
  });

  it('har filial sahifasida amal bor; legacy qoidasi mavjud kalitga ishora qiladi', () => {
    for (const p of PERMISSION_PAGES) {
      if (PERMISSION_PAGE_DEFS[p].ownerOnly) continue;
      expect(permissionsOfPage(p).length, p).toBeGreaterThan(0);
    }
    for (const k of PERMISSION_KEYS) {
      const rule = PERMISSIONS[k].legacy;
      if (rule && rule !== 'open') expect(PERMISSION_KEYS as readonly string[]).toContain(rule);
    }
  });
});

describe('eski (1-versiya) ro\'yxatlarni yangilash', () => {
  it('ilgari ochiq bo\'lgan sahifalar saqlanadi, bo\'lingan huquqlar asl kalitdan meros oladi', () => {
    const up = new Set(upgradeLegacyPermissions(['sale.cancel', 'stock.adjust']));
    for (const k of ['sales.view', 'products.view', 'debts.view', 'nasiya.view', 'inventory.view', 'transferred.view', 'tasks.view', 'profile.password']) {
      expect(up.has(k), k).toBe(true);
    }
    expect(up.has('sale.return')).toBe(true);
    expect(up.has('stock.writeOff')).toBe(true);
    expect(up.has('customers.view')).toBe(false);
    expect(up.has('suppliers.view')).toBe(false);
  });

  it('1-versiya bo\'sh ro\'yxat: faqat ilgari ochiq bo\'lgan sahifalar', () => {
    const set = effectivePermissions({ role: 'user', permissions: [] });
    expect(set.has('sales.view')).toBe(true);
    expect(set.has('sale.create')).toBe(false);
    expect(set.has('customers.view')).toBe(false);
  });

  it('joriy versiyada saqlangan ro\'yxat o\'zgarmaydi', () => {
    const set = effectivePermissions({ role: 'user', permissions: ['sale.create'], permVersion: PERMISSIONS_VERSION });
    expect([...set]).toEqual(['sale.create']);
  });

  it('eski standart rol ro\'yxati yangilansa — yangi standartga teng', () => {
    const oldDefaults = ['sale.create', 'sale.discount', 'sale.editPrice', 'payment.accept', 'product.create', 'product.edit', 'product.viewCost', 'transfer.create', 'kassa.view', 'kassa.shift', 'reports.view', 'customers.manage', 'daftar.manage'];
    expect(new Set(upgradeLegacyPermissions(oldDefaults))).toEqual(new Set(ROLE_DEFAULT_PERMISSIONS.user));
  });

  it('rol biriktirilgan bo\'lsa — huquqlar roldan', () => {
    const set = effectivePermissionsWithRole({ role: 'user', permissions: ['sale.create'] }, { permissions: ['kassa.view'], permVersion: PERMISSIONS_VERSION });
    expect([...set]).toEqual(['kassa.view']);
    expect(rolePermissionList({ permissions: ['customers.manage'] })).toContain('customers.view');
  });
});
