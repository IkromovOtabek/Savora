/**
 * Restoranning umumiy mijoz sahifasi (/m/<slug>, stolsiz): sof funksiyalar (aloqa ma'lumoti, yo'llar, oq ro'yxat)
 * va ochiq API GET /api/public/menu/<slug> — bazasiz (master/tenant modellar va buildMenu soxta).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import {
  INFO_LIMITS, instagramUrl, normalizeRestaurantInfo, parseInstagram, parsePhone, parseTelegram, telHref, telegramUrl, toPublicInfo,
} from '@/lib/restaurant/info';
import { publicStoreApiPath, restaurantPagePath } from '@/lib/restaurant/qr';
import { mergeShopSettings } from '@/lib/shopSettings';
import type { MenuItemView } from '@/lib/restaurant/queries';

/* ───────────────────────────── soxta bazalar ───────────────────────────── */

type Org = { _id: Types.ObjectId; name: string; slug: string; dbName: string; status: string; expiresAt: Date; plan: { tier: string; maxFilial: number; maxUsers: number }; businessType: string; features?: Record<string, boolean> };
const orgs = new Map<string, Org>();
const orgLookups = vi.fn();
const branchId = new Types.ObjectId();

const chain = <T>(v: T) => {
  const c = { sort: () => c, select: () => c, lean: async () => v };
  return c;
};

let shopDoc: Record<string, unknown> | null = null;
const models = {
  Hall: { findOne: () => chain({ branchId }) },
  Branch: { findOne: () => chain(null) },
  ShopSettings: { findOne: () => chain(shopDoc) },
};

vi.mock('@/lib/masterDb', () => ({
  getMasterModels: async () => ({
    Organization: {
      findOne: (q: { slug: string }) => {
        orgLookups(q.slug);
        return chain(orgs.get(q.slug) ?? null);
      },
    },
  }),
}));
vi.mock('@/lib/tenantDb', () => ({ getTenantModels: async () => models }));

const menuItem = (over: Partial<MenuItemView> & Record<string, unknown>): MenuItemView => ({
  id: new Types.ObjectId().toString(),
  name: 'Osh',
  price: 45000,
  photoUrl: null,
  category: 'Issiq taomlar',
  categoryId: null,
  kind: 'bundle',
  unit: 'dona',
  stationId: new Types.ObjectId().toString(),
  stopListed: false,
  available: 7,
  ikpu: '10202001001000000',
  modifierGroups: [{ id: 'g1', name: 'Porsiya', required: true, min: 1, max: 1, options: [{ id: 'o1', name: 'Katta', price: 10000 }] }],
  ...over,
});
const buildMenu = vi.fn(async () => ({
  categories: ['Issiq taomlar'],
  // `costPrice`, `recipe` — MenuItemView'ga kelajakda qo'shilishi mumkin bo'lgan ichki maydonlar (oq ro'yxat tekshiruvi)
  items: [menuItem({ costPrice: 22500, recipe: [{ productId: 'x', qty: 0.2 }] } as never)],
}));
vi.mock('@/lib/restaurant/queries', () => ({ buildMenu }));

const addOrg = (slug: string, over: Partial<Org> = {}) =>
  orgs.set(slug, {
    _id: new Types.ObjectId(), name: 'Navro\'z', slug, dbName: `db_${slug}`, status: 'active',
    expiresAt: new Date(Date.now() + 86_400_000), plan: { tier: 'pro', maxFilial: 3, maxUsers: 10 }, businessType: 'restaurant',
    features: { tables: true, qrMenu: true }, ...over,
  });

let ipN = 0;
const req = (slug: string, ip = `10.0.0.${++ipN}`) =>
  new Request(`http://x${publicStoreApiPath(slug)}`, { headers: { 'x-forwarded-for': ip } });
const call = async (slug: string, ip?: string) => {
  const { GET } = await import('@/app/api/public/menu/[slug]/route');
  return GET(req(slug, ip), { params: Promise.resolve({ slug }) });
};

beforeEach(async () => {
  orgs.clear();
  orgLookups.mockClear();
  buildMenu.mockClear();
  shopDoc = null;
  (await import('@/lib/restaurant/public')).forgetPublicStore();
});

/* ───────────────────────────── sof funksiyalar ───────────────────────────── */

describe('mijoz sahifasi: aloqa ma\'lumoti (lib/restaurant/info)', () => {
  it('Instagram: login, @login, havola; xizmat yo\'llari va noto\'g\'ri belgilar rad', () => {
    expect(parseInstagram('')).toBe('');
    expect(parseInstagram('  @Navruz.Osh ')).toBe('navruz.osh');
    expect(parseInstagram('https://www.instagram.com/navruz_osh/?igsh=abc')).toBe('navruz_osh');
    expect(parseInstagram('instagram.com/navruz')).toBe('navruz');
    expect(parseInstagram('https://instagram.com/p/Cx1/')).toBeNull();
    expect(parseInstagram('https://evil.example/navruz')).toBeNull();
    expect(parseInstagram('nav ruz')).toBeNull();
    expect(parseInstagram('.navruz')).toBeNull();
  });

  it('Telegram: login, @login, t.me havola; 5–32 belgi, harf bilan boshlanadi', () => {
    expect(parseTelegram('@navruz_osh')).toBe('navruz_osh');
    expect(parseTelegram('https://t.me/NavruzOsh')).toBe('NavruzOsh');
    expect(parseTelegram('t.me/joinchat/abcdef')).toBeNull();
    expect(parseTelegram('https://t.me/+AbCdEf')).toBeNull();
    expect(parseTelegram('abc')).toBeNull();
    expect(parseTelegram('1navruz')).toBeNull();
    expect(parseTelegram('javascript:alert(1)')).toBeNull();
  });

  it('telefon: O\'zbekiston raqami keltiriladi, xorijiy +, qisqa raqam; yarim raqam rad', () => {
    expect(parsePhone('901234567')).toBe('+998 90 123 45 67');
    expect(parsePhone('+998 (71) 200-00-00')).toBe('+998 71 200 00 00');
    expect(parsePhone('+7 912 345 67 89')).toBe('+79123456789');
    expect(parsePhone('1170')).toBe('1170');
    expect(parsePhone('+998 90 12')).toBeNull();
    expect(parsePhone('12345678')).toBeNull();
    expect(parsePhone('tel:<script>')).toBeNull();
    expect(telHref('+998 90 123 45 67')).toBe('tel:+998901234567');
    expect(telHref('1170')).toBe('tel:1170');
    expect(instagramUrl('navruz.osh')).toBe('https://www.instagram.com/navruz.osh/');
    expect(telegramUrl('navruz_osh')).toBe('https://t.me/navruz_osh');
  });

  it('normalizeRestaurantInfo: undefined — o\'zgarmaydi, \'\' — o\'chadi, noto\'g\'ri maydon nomi bilan', () => {
    const cur = { address: 'Eski', phone: '+998 90 000 00 00', takeawayByPhone: true };
    const r = normalizeRestaurantInfo(cur, {
      about: '  Milliy taomlar\r\n\r\n\r\n\r\nchoyxona  ',
      address: '',
      workHours: 'Har kuni\t10:00 –  23:00',
      instagram: '@Navruz',
      takeawayByPhone: false,
    });
    expect(r).toEqual({ ok: true, info: { about: 'Milliy taomlar\n\nchoyxona', phone: '+998 90 000 00 00', workHours: 'Har kuni 10:00 – 23:00', instagram: 'navruz' } });
    expect(normalizeRestaurantInfo({}, { telegram: 'x' })).toEqual({ ok: false, field: 'telegram' });
    expect(normalizeRestaurantInfo({}, { phone: '123' + '4'.repeat(30) })).toEqual({ ok: false, field: 'phone' });
    expect(normalizeRestaurantInfo({}, { address: 'a'.repeat(INFO_LIMITS.address + 1) })).toEqual({ ok: false, field: 'address' });
    expect(normalizeRestaurantInfo({ about: 'x' }, { about: null })).toEqual({ ok: true, info: {} });
  });

  it('toPublicInfo: bo\'sh — null; saboy belgisi faqat telefon bo\'lsa', () => {
    expect(toPublicInfo(undefined)).toEqual({ about: null, address: null, phone: null, workHours: null, instagram: null, telegram: null, takeawayByPhone: false });
    expect(toPublicInfo({ takeawayByPhone: true }).takeawayByPhone).toBe(false);
    expect(toPublicInfo({ phone: '1170', takeawayByPhone: true })).toMatchObject({ phone: '1170', takeawayByPhone: true });
  });

  it('yo\'llar va sozlama birlashtirish', () => {
    expect(restaurantPagePath('navruz-osh')).toBe('/m/navruz-osh');
    expect(publicStoreApiPath('navruz-osh')).toBe('/api/public/menu/navruz-osh');
    expect(mergeShopSettings(null).restaurant.info).toEqual({});
    expect(mergeShopSettings({ restaurant: { info: { phone: '1170', address: null } } } as never).restaurant.info).toEqual({ phone: '1170' });
  });

  it('toPublicItem: faqat oq ro\'yxatdagi maydonlar', async () => {
    const { toPublicItem } = await import('@/lib/restaurant/public');
    const out = toPublicItem(menuItem({ costPrice: 1 } as never));
    expect(Object.keys(out).sort()).toEqual(['category', 'categoryId', 'id', 'kind', 'modifierGroups', 'name', 'photoUrl', 'price', 'unit']);
    expect(Object.keys(out.modifierGroups[0].options[0]).sort()).toEqual(['id', 'name', 'price']);
  });
});

/* ───────────────────────────── ochiq API ───────────────────────────── */

describe('GET /api/public/menu/<slug>', () => {
  it('modul yoqiq: brend, aloqa, menyu; ichki maydonlar yo\'q; 30 s ommaviy kesh', async () => {
    addOrg('navruz-osh');
    shopDoc = {
      restaurant: {
        serviceChargePct: 10,
        brand: { color: '#E11D48', logoUrl: '/uploads/db_navruz-osh/brand/a.png' },
        info: { address: 'Chilonzor 9', phone: '+998 90 123 45 67', instagram: 'navruz', takeawayByPhone: true },
      },
    };
    const res = await call('navruz-osh');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30, stale-while-revalidate=30');
    const body = await res.json();
    expect(body.org).toEqual({ name: 'Navro\'z', slug: 'navruz-osh' });
    expect(body.brand).toEqual({ logoUrl: '/api/uploads/db_navruz-osh/brand/a.png', color: '#E11D48', coverUrl: null });
    expect(body.info).toMatchObject({ address: 'Chilonzor 9', phone: '+998 90 123 45 67', instagram: 'navruz', telegram: null, takeawayByPhone: true });
    expect(body.serviceChargePct).toBe(10);
    expect(body.items).toHaveLength(1);
    const json = JSON.stringify(body);
    for (const internal of ['stationId', 'ikpu', 'available', 'stopListed', 'costPrice', 'recipe', 'dbName', 'purchasePrice', 'quantity']) {
      expect(json).not.toContain(internal);
    }
    expect(body.items[0].modifierGroups[0].options[0]).toEqual({ id: 'o1', name: 'Katta', price: 10000 });
    // Menyu — zal filiali, faqat mijoz uchun (stop-list/tugaganlar yashirin)
    expect(buildMenu).toHaveBeenCalledWith(models, branchId, { forPublic: true });
  });

  it('qrMenu o\'chiq, faol emas yoki yo\'q do\'kon — 404 qrUnavailable (sabab ochilmaydi)', async () => {
    addOrg('off-shop', { features: { tables: true, qrMenu: false } });
    addOrg('notables', { features: { tables: false, qrMenu: true } });
    addOrg('expired', { expiresAt: new Date(Date.now() - 1000) });
    for (const slug of ['off-shop', 'notables', 'expired', 'no-such-shop']) {
      const res = await call(slug);
      expect(res.status, slug).toBe(404);
      expect(await res.json()).toMatchObject({ code: 'qrUnavailable' });
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(buildMenu).not.toHaveBeenCalled();
  });

  it('noto\'g\'ri slug — bazaga so\'rovsiz 404', async () => {
    for (const slug of ['A', '../x', 'a'.repeat(40), 'ab$c']) {
      expect((await call(slug)).status).toBe(404);
    }
    expect(orgLookups).not.toHaveBeenCalled();
  });

  it('kesh: 30 s ichida takroriy so\'rov bazaga tushmaydi; forgetPublicStore — yangidan', async () => {
    addOrg('kesh-shop');
    await call('kesh-shop');
    await call('kesh-shop');
    expect(orgLookups).toHaveBeenCalledTimes(1);
    (await import('@/lib/restaurant/public')).forgetPublicStore('kesh-shop');
    await call('kesh-shop');
    expect(orgLookups).toHaveBeenCalledTimes(2);
  });

  it('rate-limit: bitta IP\'dan daqiqasiga 240 dan ortiq — 429 va Retry-After', async () => {
    addOrg('rl-shop');
    const ip = '203.0.113.7';
    for (let i = 0; i < 240; i++) expect((await call('rl-shop', ip)).status).toBe(200);
    const res = await call('rl-shop', ip);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(await res.json()).toMatchObject({ code: 'rateLimited' });
    // Boshqa IP — ta'sirlanmaydi
    expect((await call('rl-shop', '203.0.113.8')).status).toBe(200);
  });
});
