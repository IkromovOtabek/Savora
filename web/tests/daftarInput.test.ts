import { describe, it, expect } from 'vitest';
import { parseLedgerInput } from '@/lib/daftarInput';

const now = new Date('2026-10-22T10:00:00');
const base = { type: 'given', personName: '  Ali   Valiyev ', personPhone: '+998 90 123 45 67', amount: 150000, dueDate: '2026-11-01' };

describe('parseLedgerInput — mobil Daftar kiritmasi', () => {
  it('to\'g\'ri yozuv: ism tozalanadi, telefon normallashadi', () => {
    const r = parseLedgerInput(base, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.personName).toBe('Ali Valiyev');
    expect(r.data.personPhone).toBe('998901234567');
    expect(r.data.type).toBe('given');
  });

  it('noma\'lum tur — «given»', () => {
    const r = parseLedgerInput({ ...base, type: 'xyz' }, now);
    expect(r.ok && r.data.type).toBe('given');
    const t = parseLedgerInput({ ...base, type: 'taken' }, now);
    expect(t.ok && t.data.type).toBe('taken');
  });

  it('xatolar: ism, telefon, summa, o\'tgan sana', () => {
    expect(parseLedgerInput({ ...base, personName: ' ' }, now).ok).toBe(false);
    expect(parseLedgerInput({ ...base, personPhone: '123' }, now).ok).toBe(false);
    expect(parseLedgerInput({ ...base, amount: 0 }, now).ok).toBe(false);
    expect(parseLedgerInput({ ...base, amount: 10.5 }, now).ok).toBe(false);
    expect(parseLedgerInput({ ...base, dueDate: '2026-10-01' }, now).ok).toBe(false);
    expect(parseLedgerInput({ ...base, dueDate: 'abc' }, now).ok).toBe(false);
  });

  it('bugungi sana qabul qilinadi', () => {
    expect(parseLedgerInput({ ...base, dueDate: '2026-10-22T00:00:00' }, now).ok).toBe(true);
  });
});
