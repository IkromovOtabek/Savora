import { describe, it, expect } from 'vitest';
import { NAV_GROUPS, applyNavLayout, sanitizeNavLayout } from '@/lib/navConfig';

const order = (groups: ReturnType<typeof applyNavLayout>) => groups.map((g) => `${g.title}:${g.links.map((l) => l.href).join(',')}`);

describe('sanitizeNavLayout', () => {
  it("noma'lum guruh, havola va takrorlarni tashlaydi", () => {
    const res = sanitizeNavLayout({
      groups: [
        { title: 'Moliya', hrefs: ['/app/monitoring', '/evil', '/app/monitoring'] },
        { title: 'Xakker', hrefs: ['/app/sales'] },
        { title: 'Moliya', hrefs: ['/app/kassa'] },
      ],
      hidden: ['/app/daftar', '/app', '/app/profile', 42, '/nope'],
    });
    expect(res).toEqual({ groups: [{ title: 'Moliya', hrefs: ['/app/monitoring'] }], hidden: ['/app/daftar'] });
  });

  it('yaroqsiz kirishga null qaytaradi', () => {
    expect(sanitizeNavLayout(null)).toBeNull();
    expect(sanitizeNavLayout('x')).toBeNull();
    expect(sanitizeNavLayout({ groups: 'x' })).toBeNull();
  });
});

describe('applyNavLayout', () => {
  it('layout bo\'lmasa standart tartib', () => {
    expect(applyNavLayout(NAV_GROUPS, null)).toBe(NAV_GROUPS);
  });

  it("guruh tartibi va guruhlararo ko'chirishni qo'llaydi, yo'qolganlarni standart guruhga qaytaradi", () => {
    const res = applyNavLayout(NAV_GROUPS, {
      groups: [
        { title: 'Moliya', hrefs: ['/app/kassa'] },
        { title: 'Savdo', hrefs: ['/app/monitoring', '/app'] },
      ],
      hidden: [],
    });
    const o = order(res);
    expect(o[0]).toBe('Moliya:/app/kassa,/app/kredit-kassa,/app/kirim-chiqim');
    expect(o[1]).toBe('Savdo:/app/monitoring,/app,/app/sales,/app/transferred');
    // Qolgan guruhlar standart tartibda oxirida, barcha havolalar saqlanadi
    expect(res.map((g) => g.title)).toEqual(['Moliya', 'Savdo', 'Mijozlar', 'Ombor', 'Boshqaruv']);
    const all = res.flatMap((g) => g.links.map((l) => l.href)).sort();
    expect(all).toEqual(NAV_GROUPS.flatMap((g) => g.links.map((l) => l.href)).sort());
  });
});
