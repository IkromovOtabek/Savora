import { describe, it, expect } from 'vitest';
import { canonicalPhone, formatUzPhoneInput } from '@/lib/phone';

describe('telefon niqobi (+998 99 000 00 00)', () => {
  it('yozilayotgan raqam guruhlanadi', () => {
    expect(formatUzPhoneInput('+998 ')).toBe('+998 ');
    expect(formatUzPhoneInput('+998 9')).toBe('+998 9');
    expect(formatUzPhoneInput('+998 990')).toBe('+998 99 0');
    expect(formatUzPhoneInput('+998 99 00000')).toBe('+998 99 000 00');
    expect(formatUzPhoneInput('+998990000000')).toBe('+998 99 000 00 00');
  });

  it("prefiksiz va boshqa ko'rinishdagi raqam", () => {
    expect(formatUzPhoneInput('901234567')).toBe('+998 90 123 45 67');
    expect(formatUzPhoneInput('998901234567')).toBe('+998 90 123 45 67');
    expect(formatUzPhoneInput('+998 (90) 123-45-67')).toBe('+998 90 123 45 67');
  });

  it("ortiqcha raqam kesiladi, o'chirish va xorijiy raqamga tegilmaydi", () => {
    expect(formatUzPhoneInput('+998 90 123 45 6789')).toBe('+998 90 123 45 67');
    expect(formatUzPhoneInput('+99')).toBe('+99');
    expect(formatUzPhoneInput('+')).toBe('+');
    expect(formatUzPhoneInput('')).toBe('');
    expect(formatUzPhoneInput('+7 900 123 45 67')).toBe('+7 900 123 45 67');
  });

  it("saqlash: to'liq raqam — bir xil ko'rinish, chala/xorijiy — o'zgarmaydi", () => {
    expect(canonicalPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(canonicalPhone(' 90 123 45 67 ')).toBe('+998 90 123 45 67');
    expect(canonicalPhone('+998 90 12')).toBe('+998 90 12');
    expect(canonicalPhone('+7 900 123')).toBe('+7 900 123');
  });
});
