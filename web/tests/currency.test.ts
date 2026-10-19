import { describe, expect, it } from 'vitest';
import { effectiveUsdRate, parseCbuResponse } from '@/lib/currency';
import { usdToSom } from '@/lib/currencyMath';

describe('parseCbuResponse', () => {
  it('CBU javobidan kurs va sana', () => {
    expect(parseCbuResponse([{ Ccy: 'USD', Rate: '12055.90', Date: '17.10.2026' }])).toEqual({ rate: 12055.9, date: '2026-10-17' });
  });
  it("noto'g'ri javob — null", () => {
    expect(parseCbuResponse({})).toBeNull();
    expect(parseCbuResponse([{ Ccy: 'EUR', Rate: '1', Date: '17.10.2026' }])).toBeNull();
    expect(parseCbuResponse([{ Ccy: 'USD', Rate: 'abc', Date: '17.10.2026' }])).toBeNull();
  });
});

describe('effectiveUsdRate', () => {
  it("qo'lda rejimda egasining kursi, aks holda CBU", () => {
    expect(effectiveUsdRate({ rateMode: 'manual', manualRate: 12800, cbuRate: 12055 })).toBe(12800);
    expect(effectiveUsdRate({ rateMode: 'cbu', manualRate: 12800, cbuRate: 12055 })).toBe(12055);
    expect(effectiveUsdRate({ rateMode: 'manual', cbuRate: 12055 })).toBe(12055);
    expect(effectiveUsdRate({ rateMode: 'cbu' })).toBeNull();
  });
});

describe('usdToSom', () => {
  it("100 so'mgacha yaxlitlaydi", () => {
    expect(usdToSom(120, 12055.9)).toBe(1446700);
    expect(usdToSom(0.05, 12055.9)).toBe(603); // 1000 dan kichik — yaxlitlanmaydi
    expect(usdToSom(0, 12000)).toBe(0);
  });
});
