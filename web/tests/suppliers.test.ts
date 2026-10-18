import { describe, it, expect } from 'vitest';
import { sumSupplierEntries } from '@/lib/suppliers';
import { PERMISSIONS, ROLE_DEFAULT_PERMISSIONS, hasPermission } from '@/lib/permissions';

describe('sumSupplierEntries', () => {
  it("qarz = olingan tovar − to'langan", () => {
    expect(sumSupplierEntries([
      { type: 'purchase', amount: 1_000_000 },
      { type: 'payment', amount: 300_000 },
      { type: 'purchase', amount: 200_000 },
    ])).toEqual({ purchased: 1_200_000, paid: 300_000, debt: 900_000 });
  });

  it("bo'sh ro'yxat", () => {
    expect(sumSupplierEntries([])).toEqual({ purchased: 0, paid: 0, debt: 0 });
  });
});

describe('suppliers.manage huquqi', () => {
  it("ombor guruhida, standartda faqat egasida", () => {
    expect(PERMISSIONS['suppliers.manage'].group).toBe('ombor');
    expect(ROLE_DEFAULT_PERMISSIONS.user).not.toContain('suppliers.manage');
    expect(hasPermission({ role: 'admin' }, 'suppliers.manage')).toBe(true);
    expect(hasPermission({ role: 'user', permissions: ['suppliers.manage'] }, 'suppliers.manage')).toBe(true);
  });
});
