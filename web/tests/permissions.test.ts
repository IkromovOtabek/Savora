import { describe, it, expect } from 'vitest';
import {
  PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  effectivePermissions,
  hasPermission,
  normalizeUserPermissions,
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

  it('bo\'sh ro\'yxat — hech qanday huquq', () => {
    expect(effectivePermissions({ role: 'user', permissions: [] }).size).toBe(0);
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
