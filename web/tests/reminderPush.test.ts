import { describe, expect, it } from 'vitest';
import { installmentPush } from '@/lib/installmentReminders';
import { daftarPush } from '@/lib/daftarReminders';

describe('installmentPush — do\'kon bo\'yicha bitta xabar', () => {
  it('bitta sotuv', () => {
    const p = installmentPush({ sales: 1, overdueSum: 1200000, first: 'Samsung A54 — Vali' });
    expect(p.title).toBe("Nasiya: 1 ta to'lov muddati o'tdi");
    expect(p.body).toContain('Samsung A54 — Vali');
    expect(p.url).toBe('/(tabs)/nasiya');
  });
  it('bir nechta sotuv', () => {
    const p = installmentPush({ sales: 5, overdueSum: 3000000, first: 'X — Y' });
    expect(p.body).toMatch(/Jami muddati o'tgan: 3.000.000 so'm/);
    expect(p.body).toContain('va boshqalar');
  });
});

describe('daftarPush', () => {
  const due = new Date('2026-11-13T09:00:00');
  it("bitta yozuv — kim kimga qarzdor", () => {
    expect(daftarPush([{ personName: 'Ali', amount: 50000, type: 'given', dueDate: due }]).body).toContain('Sizga qarzdor');
    expect(daftarPush([{ personName: 'Ali', amount: 50000, type: 'taken', dueDate: due }]).body).toContain('Siz qarzdorsiz');
  });
  it('bir nechta yozuv — umumlashgan', () => {
    const p = daftarPush([
      { personName: 'Ali', amount: 50000, type: 'given', dueDate: due },
      { personName: 'Vali', amount: 10000, type: 'taken', dueDate: due },
    ]);
    expect(p.title).toBe('Daftar: 2 ta qarz muddati keldi');
    expect(p.url).toBe('/daftar');
  });
});
