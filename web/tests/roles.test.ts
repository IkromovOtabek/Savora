import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLES } from '@/lib/models/tenant/Role';
import { PERMISSIONS, isPermissionKey, effectivePermissions } from '@/lib/permissions';

describe('rol shablonlari', () => {
  it("faqat mavjud va egasiga xos bo'lmagan huquqlar", () => {
    for (const r of DEFAULT_ROLES) {
      for (const k of r.permissions) {
        expect(isPermissionKey(k), `${r.name}: ${k}`).toBe(true);
        expect(PERMISSIONS[k].adminOnly ?? false, `${r.name}: ${k}`).toBe(false);
      }
    }
  });

  it("rol huquqlari filial xodimiga aynan qo'llanadi (effectivePermissions)", () => {
    const kassir = DEFAULT_ROLES.find((r) => r.name === 'Kassir')!;
    const set = effectivePermissions({ role: 'user', permissions: kassir.permissions });
    expect([...set].sort()).toEqual([...kassir.permissions].sort());
    expect(set.has('product.delete')).toBe(false);
  });
});
