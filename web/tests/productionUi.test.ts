import { describe, it, expect } from 'vitest';
import { isNavLinkActive } from '@/lib/navConfig';
import { cleanQtyInput, newClientId, parseActualQty, parseNorm, parseSum, signedQty } from '@/components/production/common/ui';

describe('menyu faolligi (isNavLinkActive)', () => {
  const production = { href: '/app/production' };
  const recipes = { href: '/app/production/recipes' };

  it('texkartalar ochiq — faqat «Texkartalar» faol, «Ishlab chiqarish» emas', () => {
    expect(isNavLinkActive(recipes, '/app/production/recipes')).toBe(true);
    expect(isNavLinkActive(recipes, '/app/production/recipes/abc')).toBe(true);
    expect(isNavLinkActive(production, '/app/production/recipes')).toBe(false);
    expect(isNavLinkActive(production, '/app/production/recipes/new')).toBe(false);
  });

  it('akt sahifasi — «Ishlab chiqarish» faol', () => {
    expect(isNavLinkActive(production, '/app/production')).toBe(true);
    expect(isNavLinkActive(production, '/app/production/65f0c0ffee0000000000abcd')).toBe(true);
    expect(isNavLinkActive(production, '/app/production/65f0c0ffee0000000000abcd/print')).toBe(true);
    expect(isNavLinkActive(recipes, '/app/production/65f0c0ffee0000000000abcd')).toBe(false);
  });

  it('exact va also avvalgidek', () => {
    expect(isNavLinkActive({ href: '/app', exact: true }, '/app/sales')).toBe(false);
    expect(isNavLinkActive({ href: '/app/reports', also: ['/app/monitoring'] }, '/app/monitoring')).toBe(true);
    expect(isNavLinkActive({ href: '/app/sales' }, '/app/salesx')).toBe(false);
  });
});

describe('ishlab chiqarish UI yordamchilari', () => {
  it('haqiqiy sarf: 0 mumkin, birlik qoidasi', () => {
    expect(parseActualQty('0', 'kg')).toBe(0);
    expect(parseActualQty('0,0', 'kg')).toBe(0);
    expect(parseActualQty('1,5', 'kg')).toBe(1.5);
    expect(parseActualQty('1,5', 'dona')).toBeNull();
    expect(parseActualQty('', 'kg')).toBeNull();
    expect(parseActualQty('0,25', 'list')).toBe(0.25);
  });

  it('texkarta normasi istalgan birlikda kasr', () => {
    expect(parseNorm('0,5')).toBe(0.5);
    expect(parseNorm('0')).toBeNull();
    expect(parseNorm('1,2345')).toBeNull();
  });

  it("so'm va kiritishni tozalash", () => {
    expect(parseSum('12 000')).toBe(12000);
    expect(parseSum('')).toBeNull();
    expect(parseSum('1.5')).toBeNull();
    expect(cleanQtyInput('1,5a', 'kg')).toBe('1,5');
    expect(cleanQtyInput('1,5a', 'dona')).toBe('15');
    expect(cleanQtyInput('2.5', null, { fractional: true })).toBe('2.5');
  });

  it('farq belgisi', () => {
    expect(signedQty(0.5)).toBe('+0,5');
    expect(signedQty(-1)).toBe('−1');
    expect(signedQty(0.0001)).toBe('0');
  });

  it('clientId server talabiga mos', () => {
    const id = newClientId();
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(/^[A-Za-z0-9:_-]+$/.test(id)).toBe(true);
  });
});
