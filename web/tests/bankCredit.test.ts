import { describe, expect, it } from 'vitest';
import {
  bankBalanceOf,
  bankPartsLabel,
  bankPartsTotal,
  isBankDebt,
  isBankNasiya,
  bankFinancedFilter,
  computeBankBalances,
  parseBankPartsInput,
  saleBankParts,
  validateBankParts,
  MAX_BANK_PARTS,
} from '@/lib/bankCredit';

describe('validateBankParts — bitta sotuvda bir nechta bank', () => {
  it("10 mln telefon, 2 mln bosh to'lov, qolgan 8 mln uch bankka bo'linadi", () => {
    const r = validateBankParts([
      { bankName: 'Ishonch', amount: 3_000_000 },
      { bankName: 'Uzum Nasiya', amount: 3_000_000 },
      { bankName: ' TezPay ', amount: 2_000_000 },
    ], 8_000_000);
    expect(r).toEqual({
      ok: true,
      parts: [
        { bankName: 'Ishonch', amount: 3_000_000 },
        { bankName: 'Uzum Nasiya', amount: 3_000_000 },
        { bankName: 'TezPay', amount: 2_000_000 },
      ],
    });
  });

  it('banklar jami qolgan summaga teng bo\'lmasa — rad', () => {
    expect(validateBankParts([
      { bankName: 'Ishonch', amount: 3_000_000 },
      { bankName: 'TezPay', amount: 2_000_000 },
    ], 8_000_000)).toEqual({ ok: false, error: 'sumMismatch' });
  });

  it('bir bank ikki marta — rad (katta-kichik harf farqsiz)', () => {
    expect(validateBankParts([
      { bankName: 'Ishonch', amount: 4 },
      { bankName: 'ishonch', amount: 4 },
    ], 8)).toEqual({ ok: false, error: 'duplicate' });
  });

  it("bo'sh bank, 0 yoki kasr summa, juda ko'p bank — rad", () => {
    expect(validateBankParts([], 8)).toEqual({ ok: false, error: 'required' });
    expect(validateBankParts([{ bankName: ' ', amount: 8 }], 8)).toEqual({ ok: false, error: 'required' });
    expect(validateBankParts([{ bankName: 'A', amount: 0 }, { bankName: 'B', amount: 8 }], 8)).toEqual({ ok: false, error: 'badAmount' });
    expect(validateBankParts([{ bankName: 'A', amount: 7.5 }, { bankName: 'B', amount: 0.5 }], 8)).toEqual({ ok: false, error: 'badAmount' });
    const many = Array.from({ length: MAX_BANK_PARTS + 1 }, (_, i) => ({ bankName: `B${i}`, amount: 1 }));
    expect(validateBankParts(many, many.length)).toEqual({ ok: false, error: 'tooMany' });
  });

  it("bosh to'lov jami summaga teng — bankka hech narsa qolmaydi", () => {
    expect(validateBankParts([{ bankName: 'A', amount: 0 }], 0)).toEqual({ ok: false, error: 'nothingFinanced' });
  });
});

describe('parseBankPartsInput', () => {
  it('JSON qatorni o\'qiydi, bo\'shliqli summani tozalaydi', () => {
    expect(parseBankPartsInput('[{"bankName":"Ishonch","amount":"3 000 000"}]')).toEqual([{ bankName: 'Ishonch', amount: 3_000_000 }]);
    expect(parseBankPartsInput('')).toEqual([]);
  });
  it("noto'g'ri shakl — null", () => {
    expect(parseBankPartsInput('{bad')).toBeNull();
    expect(parseBankPartsInput('{"a":1}')).toBeNull();
    expect(parseBankPartsInput('[1]')).toBeNull();
  });
});

describe('computeBankBalances — Kiritilgan − Olingan = Qoldiq', () => {
  const sale = (bankParts: { bankName: string; amount: number }[], status: 'partial' | 'cancelled' = 'partial') => ({
    paymentType: 'bank_credit' as const,
    status,
    bankParts,
    totalAmount: 0,
    paidAmount: 0,
    remainingAmount: 0,
  });

  it('100 mln kiritilgan, 80 mln olingan → 20 mln qoladi', () => {
    const map = computeBankBalances(
      [sale([{ bankName: 'Ishonch', amount: 60_000_000 }]), sale([{ bankName: 'Ishonch', amount: 40_000_000 }])],
      [{ bankName: 'Ishonch', amount: 50_000_000 }, { bankName: 'Ishonch', amount: 30_000_000 }],
    );
    expect(bankBalanceOf(map, 'Ishonch')).toEqual({ financed: 100_000_000, received: 80_000_000, balance: 20_000_000, salesCount: 2 });
  });

  it('100 mln kiritilgan, 110 mln olingan → −10 mln', () => {
    const map = computeBankBalances(
      [sale([{ bankName: 'Ishonch', amount: 100_000_000 }])],
      [{ bankName: 'Ishonch', amount: 110_000_000 }],
    );
    expect(bankBalanceOf(map, 'Ishonch').balance).toBe(-10_000_000);
  });

  it('bir sotuv uch bankka — har bankda o\'z ulushi; bekor qilingan sotuv hisoblanmaydi', () => {
    const map = computeBankBalances(
      [
        sale([
          { bankName: 'Ishonch', amount: 3_000_000 },
          { bankName: 'Uzum Nasiya', amount: 3_000_000 },
          { bankName: 'TezPay', amount: 2_000_000 },
        ]),
        sale([{ bankName: 'TezPay', amount: 5_000_000 }], 'cancelled'),
      ],
      [{ bankName: 'Uzum Nasiya', amount: 1_000_000 }],
    );
    expect(bankBalanceOf(map, 'Ishonch')).toEqual({ financed: 3_000_000, received: 0, balance: 3_000_000, salesCount: 1 });
    expect(bankBalanceOf(map, 'Uzum Nasiya').balance).toBe(2_000_000);
    expect(bankBalanceOf(map, 'TezPay')).toEqual({ financed: 2_000_000, received: 0, balance: 2_000_000, salesCount: 1 });
    expect(bankBalanceOf(map, "Yo'q bank")).toEqual({ financed: 0, received: 0, balance: 0, salesCount: 0 });
  });

  it('eski sotuv (bankParts yo\'q) — bitta bank, joriy qoldiq bilan', () => {
    const old = { paymentType: 'bank_credit' as const, status: 'partial' as const, bankName: 'Hamkorbank', totalAmount: 10, paidAmount: 4, remainingAmount: 6 };
    expect(saleBankParts(old)).toEqual([{ bankName: 'Hamkorbank', amount: 6 }]);
    expect(saleBankParts({ ...old, paymentType: 'cash' })).toEqual([]);
    expect(bankPartsLabel([{ bankName: 'A', amount: 1 }, { bankName: 'B', amount: 2 }])).toBe('A, B');
  });
});

describe('Bank krediti + nasiya — 12 mln = Ishonch 4 + BirZum 4 + nasiya 4', () => {
  const mixed = {
    paymentType: 'installment' as const,
    status: 'partial' as const,
    bankParts: [
      { bankName: 'Ishonch', amount: 4_000_000 },
      { bankName: 'BirZum', amount: 4_000_000 },
    ],
    totalAmount: 12_000_000,
    paidAmount: 0,
    // Qoldiq — faqat mijoz nasiyasi
    remainingAmount: 4_000_000,
  };

  it('banklar qolgan summadan nasiya qismi ayrilgan holda tekshiriladi', () => {
    const rest = 12_000_000 - 0;
    const nasiya = 4_000_000;
    expect(validateBankParts(mixed.bankParts, rest - nasiya)).toEqual({ ok: true, parts: mixed.bankParts });
    // Nasiyasiz bo'lsa banklar 12 mln bo'lishi kerak edi
    expect(validateBankParts(mixed.bankParts, rest)).toEqual({ ok: false, error: 'sumMismatch' });
  });

  it('bank ulushlari Kredit kassada «Kiritilgan» bo\'lib chiqadi, mijoz qoldig\'i emas', () => {
    expect(isBankNasiya(mixed)).toBe(true);
    expect(saleBankParts(mixed)).toEqual(mixed.bankParts);
    expect(bankPartsTotal(saleBankParts(mixed))).toBe(8_000_000);
    const map = computeBankBalances([mixed], [{ bankName: 'BirZum', amount: 4_000_000 }]);
    expect(bankBalanceOf(map, 'Ishonch')).toEqual({ financed: 4_000_000, received: 0, balance: 4_000_000, salesCount: 1 });
    expect(bankBalanceOf(map, 'BirZum').balance).toBe(0);
  });

  it('oddiy nasiya (bankParts yo\'q) bankka tegishli emas', () => {
    const plain = { ...mixed, bankParts: undefined, bankName: 'Ishonch' };
    expect(isBankNasiya(plain)).toBe(false);
    expect(saleBankParts(plain)).toEqual([]);
    expect(computeBankBalances([plain], []).size).toBe(0);
  });
});

describe('Bank krediti + qarz — 10 mln = Ishonch 8 + mijoz 2 mln (7 kunda bir martada)', () => {
  const mixed = {
    paymentType: 'debt' as const,
    status: 'partial' as const,
    bankParts: [{ bankName: 'Ishonch', amount: 8_000_000 }],
    totalAmount: 10_000_000,
    paidAmount: 0,
    // Qoldiq — faqat mijoz qarzi
    remainingAmount: 2_000_000,
  };

  it('bank ulushi Kredit kassada, mijoz qoldig\'i — qarz', () => {
    expect(isBankDebt(mixed)).toBe(true);
    expect(isBankNasiya(mixed)).toBe(false);
    expect(saleBankParts(mixed)).toEqual(mixed.bankParts);
    const map = computeBankBalances([mixed], []);
    expect(bankBalanceOf(map, 'Ishonch')).toEqual({ financed: 8_000_000, received: 0, balance: 8_000_000, salesCount: 1 });
  });

  it('oddiy qarz (bankParts yo\'q) bankka tegishli emas', () => {
    const plain = { ...mixed, bankParts: undefined, bankName: 'Ishonch' };
    expect(isBankDebt(plain)).toBe(false);
    expect(saleBankParts(plain)).toEqual([]);
    expect(computeBankBalances([plain], []).size).toBe(0);
  });

  it('Kredit kassa so\'rovi bank + qarzni ham oladi', () => {
    expect(bankFinancedFilter().$or).toContainEqual({ paymentType: 'debt', 'bankParts.0': { $exists: true } });
  });
});
