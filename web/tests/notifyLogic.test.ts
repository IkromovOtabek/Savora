// Bildirishnomalar — bazasiz: matn (uz/ru), xavfsiz url, parametr tozalash, «oldin», chaqiruv auditoriyasi,
// qo'ng'iroqcha yordamchilari va render (lib/notifyView.ts, lib/restaurant/tableCalls.ts, components/notify/NotifyBell.tsx)
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getDictionary } from '@/lib/i18n/dict';
import { cleanParams, NOTIFY_DEDUPE_MS, NOTIFY_KINDS, notifyAgo, notifyText, notifyTone, safeAppUrl } from '@/lib/notifyView';
import { tableCallKeys, tableCallNotice } from '@/lib/restaurant/tableCalls';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));

const uz = getDictionary('uz');
const ru = getDictionary('ru');
const id = (n: number) => n.toString(16).padStart(24, 'a');

describe('matn (lug\'atdan, ko\'ruvchi tilida)', () => {
  it('har tur uchun sarlavha va matn; birlik va filial', () => {
    expect(notifyText(uz, 'waiterCall', { table: 7 })).toEqual({ title: 'Ofitsant chaqirilmoqda', body: '7-stol ofitsantni chaqiryapti' });
    expect(notifyText(ru, 'billCall', { table: 7 })).toEqual({ title: 'Просят счёт', body: 'Стол 7 просит счёт' });
    expect(notifyText(uz, 'lowStock', { product: 'Un', qty: 0.4, unit: 'kg', min: 2 })).toEqual({ title: 'Kam qoldi: Un', body: 'Omborda 0,4 kg qoldi (minimal — 2 kg)' });
    expect(notifyText(uz, 'dishLow', { dish: 'Osh', portions: 3, branch: 'Chilonzor' }).body).toBe('Xom ashyo yana 3 porsiyaga yetadi · Chilonzor');
    expect(notifyText(uz, 'dishLow', { dish: 'Osh', portions: 0 }).title).toBe('Tugadi: Osh');
    expect(notifyText(ru, 'dishLow', { dish: 'Плов', portions: 0 }).title).toBe('Закончилось: Плов');
    expect(notifyText(uz, 'reservationSoon', { table: null, time: '19:00', name: 'Aziz', guests: 2 })).toEqual({ title: 'Bron yaqinlashdi: 19:00', body: 'Aziz, 2 kishi' });
    expect(notifyText(uz, 'nomalum', {}).title).toBe(uz.notify.bell.title);
  });

  it('har tur — oyna va ohang belgilangan; uz va ru kalitlari bir xil', () => {
    for (const k of NOTIFY_KINDS) {
      expect(NOTIFY_DEDUPE_MS[k]).toBeGreaterThan(0);
      expect(['call', 'stock', 'info']).toContain(notifyTone(k));
    }
    expect(NOTIFY_DEDUPE_MS.waiterCall).toBe(2 * 60_000);
    expect(NOTIFY_DEDUPE_MS.lowStock).toBe(12 * 3600_000);
    expect(notifyTone('waiterCall')).toBe('call');
    expect(notifyTone('lowStock')).toBe('stock');
    expect(Object.keys(ru.notify.kinds).sort()).toEqual(Object.keys(uz.notify.kinds).sort());
  });

  it('«oldin»', () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    expect(notifyAgo(uz, '2026-11-20T11:59:30Z', now)).toBe('Hozirgina');
    expect(notifyAgo(uz, '2026-11-20T11:55:00Z', now)).toBe('5 daqiqa oldin');
    expect(notifyAgo(ru, '2026-11-20T09:00:00Z', now)).toBe('3 ч назад');
    expect(notifyAgo(uz, '2026-11-18T12:00:00Z', now)).toBe('2 kun oldin');
    // Server soati oldinda bo'lsa ham manfiy emas
    expect(notifyAgo(uz, '2026-11-20T12:05:00Z', now)).toBe('Hozirgina');
  });
});

describe('xavfsizlik: url va parametrlar', () => {
  it('faqat ilova ichidagi yo\'l', () => {
    expect(safeAppUrl('/app/tables')).toBe('/app/tables');
    expect(safeAppUrl('/app/products?low=1')).toBe('/app/products?low=1');
    expect(safeAppUrl('/app')).toBe('/app');
    for (const bad of ['//evil.com', 'https://evil.com/app', 'javascript:alert(1)', '/app//evil.com', '/application', '/app/"><script>', '', null, 5]) {
      expect(safeAppUrl(bad)).toBeNull();
    }
  });

  it('parametrlar: faqat oddiy qiymatlar, kalit va uzunlik cheklangan', () => {
    expect(cleanParams({ table: 5, name: ' Aziz ', $gt: 1, 'a.b': 2, obj: { x: 1 }, arr: [1], nan: NaN, nul: null })).toEqual({ table: 5, name: 'Aziz', nul: null });
    expect(String(cleanParams({ s: 'x'.repeat(500) }).s)).toHaveLength(120);
    expect(Object.keys(cleanParams(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]))))).toHaveLength(12);
    expect(cleanParams(null)).toEqual({});
  });
});

describe('mijoz chaqiruvi auditoriyasi', () => {
  const table = { _id: id(5), number: 5, branchId: id(1) };
  it('ofitsant bor: chaqiruv — faqat unga; hisob — unga va order.viewAll (kassir)', () => {
    expect(tableCallNotice(table, 'waiter', id(9))).toMatchObject({
      kind: 'waiterCall', branchId: id(1), params: { table: 5 }, url: '/app/tables',
      audience: { userIds: [id(9)] }, dedupeKey: `waiterCall:${id(5)}`,
    });
    expect(tableCallNotice(table, 'waiter', id(9)).audience.anyPermission).toBeUndefined();
    expect(tableCallNotice(table, 'bill', id(9))).toMatchObject({ kind: 'billCall', audience: { userIds: [id(9)], anyPermission: ['order.viewAll'] }, dedupeKey: `billCall:${id(5)}` });
  });
  it('ofitsant yo\'q (yoki yaroqsiz id): filialdagi buyurtma oluvchilar', () => {
    expect(tableCallNotice(table, 'waiter', null).audience).toEqual({ anyPermission: ['order.create'] });
    expect(tableCallNotice(table, 'bill', 'qr').audience).toEqual({ anyPermission: ['order.create', 'order.viewAll'] });
  });
  it('«Ko\'rdim» kalitlari', () => {
    expect(tableCallKeys('t1', 'waiter')).toEqual(['waiterCall:t1']);
    expect(tableCallKeys('t1', 'bill')).toEqual(['billCall:t1']);
    expect(tableCallKeys('t1')).toEqual(['waiterCall:t1', 'billCall:t1']);
  });
});

describe('qo\'ng\'iroqcha (web)', () => {
  it('ohang ustuvorligi va ro\'yxat birlashtirish', async () => {
    const { strongestTone, mergeItems } = await import('@/components/notify/NotifyBell');
    expect(strongestTone([{ kind: 'lowStock' }, { kind: 'billCall' }])).toBe('call');
    expect(strongestTone([{ kind: 'dishLow' }, { kind: 'reservationSoon' }])).toBe('stock');
    expect(strongestTone([])).toBeNull();
    const n = (i: number, at: string, read = false) => ({
      id: id(i), kind: 'waiterCall' as const, params: {}, url: null, createdAt: at, read, handled: false, title: 't', body: '',
    });
    const merged = mergeItems([n(1, '2026-11-20T10:00:00Z'), n(2, '2026-11-20T11:00:00Z')], [n(1, '2026-11-20T10:00:00Z', true), n(3, '2026-11-20T12:00:00Z')]);
    expect(merged.map((x) => x.id)).toEqual([id(3), id(2), id(1)]);
    expect(merged[2].read).toBe(true);
  });

  it('render: tugma va yorliq (o\'qilmaganlar yo\'q)', async () => {
    const { default: NotifyBell } = await import('@/components/notify/NotifyBell');
    const html = renderToStaticMarkup(createElement(NotifyBell));
    expect(html).toContain('aria-label="Bildirishnomalar"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('nb-badge');
  });
});
