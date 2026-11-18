import { describe, expect, it } from 'vitest';
import { isStaffLogin } from '@/lib/staff';
import { displayNameOf, staffName, type StaffNames } from '@/lib/staffNames';

describe('isStaffLogin — filial logini va xodim farqi', () => {
  it('egasi (admin) — xodim emas', () => {
    expect(isStaffLogin({ role: 'admin', staff: true })).toBe(false);
  });
  it('staff belgisi — xodim', () => {
    expect(isStaffLogin({ role: 'user', staff: true }, { isMain: false })).toBe(true);
  });
  it('asosiy omborga bog\'langan login — har doim xodim (ombor filialining o\'z logini yo\'q)', () => {
    expect(isStaffLogin({ role: 'user' }, { isMain: true })).toBe(true);
  });
  it('oddiy filial logini — xodim emas', () => {
    expect(isStaffLogin({ role: 'user' }, { isMain: false })).toBe(false);
    expect(isStaffLogin({ role: 'user', staff: false }, null)).toBe(false);
  });
});

describe('staffName — login o\'rniga ism', () => {
  const names: StaffNames = {
    byId: new Map([['6afd223d0895c71f6747bf4b', 'Aziz (ofitsant)']]),
    byLogin: new Map([['dr_ofitsant', 'Aziz (ofitsant)'], ['dr_kassir', 'Dilnoza']]),
  };
  it('id bo\'yicha (login qayta nomlangan bo\'lsa ham)', () => {
    expect(staffName(names, 'eski_login', '6afd223d0895c71f6747bf4b')).toBe('Aziz (ofitsant)');
  });
  it('login bo\'yicha', () => {
    expect(staffName(names, 'dr_kassir')).toBe('Dilnoza');
  });
  it('topilmasa — login o\'zi; bo\'sh — null', () => {
    expect(staffName(names, 'qr')).toBe('qr');
    expect(staffName(names, null)).toBeNull();
    expect(staffName(null, 'dr_oshpaz')).toBe('dr_oshpaz');
  });
  it('displayNameOf: ism bo\'lmasa login', () => {
    expect(displayNameOf({ username: 'ali', fullName: '  ' })).toBe('ali');
    expect(displayNameOf({ username: 'ali', fullName: 'Ali Valiyev' })).toBe('Ali Valiyev');
  });
});
