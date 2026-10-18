import { describe, it, expect } from 'vitest';
import { applyPercent, planWriteOff } from '@/lib/stockAdjust';

describe('applyPercent', () => {
  it("foizni qo'llaydi va 100 so'mgacha yaxlitlaydi", () => {
    expect(applyPercent(1_250_000, 10)).toBe(1_375_000);
    expect(applyPercent(12_345, 10)).toBe(13_600); // 13 579.5 → 13 600
    expect(applyPercent(10_000, -5)).toBe(9_500);
    expect(applyPercent(500, 10)).toBe(550); // kichik narx — so'mgacha
    expect(applyPercent(0, 10)).toBe(0);
    expect(applyPercent(1000, -150)).toBe(0); // manfiyga tushmaydi
  });
});

describe('planWriteOff', () => {
  it("dona mahsulot — faqat 1 ta, holati Nuqsonli", () => {
    expect(planWriteOff({ trackQuantity: false }, 1)).toEqual({ ok: true, set: { status: 'defective' } });
    expect(planWriteOff({ trackQuantity: false }, 2)).toEqual({ ok: false, reason: 'qty' });
  });

  it("sanaladigan: qisman — quantity kamayadi", () => {
    expect(planWriteOff({ trackQuantity: true, quantity: 10, soldQuantity: 3 }, 2)).toEqual({ ok: true, set: { quantity: 8 } });
  });

  it("sanaladigan: butun qoldiq — sotilgan bo'lsa 'Sotilgan', sotilmagan bo'lsa 'Nuqsonli'", () => {
    expect(planWriteOff({ trackQuantity: true, quantity: 10, soldQuantity: 3 }, 7)).toEqual({ ok: true, set: { quantity: 3, status: 'sold' } });
    expect(planWriteOff({ trackQuantity: true, quantity: 5, soldQuantity: 0 }, 5)).toEqual({ ok: true, set: { status: 'defective' } });
  });

  it("qoldiqdan ko'p yoki noto'g'ri son rad etiladi", () => {
    expect(planWriteOff({ trackQuantity: true, quantity: 10, soldQuantity: 3 }, 8).ok).toBe(false);
    expect(planWriteOff({ trackQuantity: true, quantity: 10, soldQuantity: 3 }, 0).ok).toBe(false);
    expect(planWriteOff({ trackQuantity: true, quantity: 10, soldQuantity: 3 }, 1.5).ok).toBe(false);
  });
});
