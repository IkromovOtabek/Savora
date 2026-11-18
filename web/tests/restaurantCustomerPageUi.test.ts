// Umumiy mijoz sahifasi UI (render smoke): admin «Mijoz sahifasi» bloki, «faqat ko'rish» menyu va taom oynasi
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {}, push() {} }),
  usePathname: () => '/app/restaurant',
  useSearchParams: () => new URLSearchParams(),
  redirect: () => { throw new Error('redirect'); },
}));
vi.mock('@/app/actions/restaurant', () => ({ saveRestaurantSettingsAction: async () => ({ ok: true, data: {} }) }));
vi.mock('@/app/actions/locale', () => ({ setLocale: async () => {} }));

import GeneralSettingsForm from '@/components/restaurant/settings/GeneralSettingsForm';
import { infoDraft, infoErrors } from '@/components/restaurant/settings/CustomerPageSection';
import StoreMenu from '@/components/restaurant/qr/StoreMenu';
import ItemSheet from '@/components/restaurant/qr/ItemSheet';
import { MenuHead } from '@/components/restaurant/qr/MenuHeader';
import { DEFAULT_RESTAURANT_SETTINGS } from '@/lib/restaurant/types';
import { getDictionary } from '@/lib/i18n/dict';
import type { PublicMenuItem } from '@/lib/restaurant/public';

const settings = {
  ...DEFAULT_RESTAURANT_SETTINGS,
  serviceChargePct: 10,
  info: { address: 'Chilonzor 9', phone: '+998 90 123 45 67', instagram: 'navruz', takeawayByPhone: true },
};
const item = (over: Partial<PublicMenuItem> = {}): PublicMenuItem => ({
  id: 'p1', name: 'Osh', price: 45000, photoUrl: null, category: 'Issiq taomlar', categoryId: null, kind: 'bundle', unit: 'dona',
  modifierGroups: [{ id: 'g1', name: 'Porsiya', required: true, min: 1, max: 1, options: [{ id: 'o1', name: 'Katta', price: 10000 }, { id: 'o2', name: 'Kichik', price: 0 }] }],
  ...over,
});

describe('mijoz sahifasi UI (smoke)', () => {
  it('admin bloki: havola, ochib ko\'rish, QR yuklab olish, plakat, aloqa maydonlari', () => {
    const html = renderToStaticMarkup(createElement(GeneralSettingsForm, { initial: settings, shopName: 'Navro\'z', kitchen: true, qrMenu: true, qrBaseUrl: 'https://savora.uz/m/navruz-osh/' }));
    expect(html).toContain('id="rs-customer"');
    expect(html).toContain('https://savora.uz/m/navruz-osh<');
    expect(html).toContain('href="/m/navruz-osh"');
    expect(html).toContain('/app/restaurant/poster?size=a5');
    expect(html).toContain('/app/restaurant/poster?size=a4');
    expect(html).toContain('QR-kodni PNG faylida yuklab olish');
    expect(html).toContain('value="@navruz"');
    expect(html).toContain('value="+998 90 123 45 67"');
    expect(html).toContain("Aloqa ma&#x27;lumotlari");
  });

  it('admin bloki: QR-menyu moduli o\'chiq — havola/QR o\'rniga tarif haqida', () => {
    const html = renderToStaticMarkup(createElement(GeneralSettingsForm, { initial: settings, shopName: 'X', kitchen: false, qrMenu: false, qrBaseUrl: 'https://savora.uz/m/x-shop/' }));
    expect(html).toContain('Pro tarifda');
    expect(html).not.toContain('/app/restaurant/poster');
  });

  it('forma xatolari: telefon, Instagram, saboy telefonsiz', () => {
    const t = getDictionary('uz').restaurant.settings;
    expect(infoErrors(infoDraft(settings.info), t)).toEqual({});
    expect(Object.keys(infoErrors({ ...infoDraft({}), phone: '+998 90', instagram: 'a b', telegram: 'x', takeawayByPhone: true }, t)).sort())
      .toEqual(['instagram', 'phone', 'takeawayByPhone', 'telegram']);
  });

  it('menyu «faqat ko\'rish»: kartalar bor, «+» va savat yo\'q', () => {
    const html = renderToStaticMarkup(createElement(StoreMenu, { items: [item(), item({ id: 'p2', name: 'Choy', category: 'Ichimliklar', modifierGroups: [] })], categories: ['Ichimliklar', 'Issiq taomlar'] }));
    expect(html).toContain('Osh');
    expect(html).toContain('qm-tabs');
    expect(html).toContain('qm-item--view');
    expect(html).not.toContain('qm-item-add');
    expect(html).not.toContain('qm-bar');
  });

  it('taom oynasi ko\'rish rejimida: variantlar narxi bilan, miqdor/izoh/savat yo\'q, pastda eslatma', () => {
    const html = renderToStaticMarkup(createElement(ItemSheet, { item: item(), money: (n: number) => `${n} so'm`, priceSuffix: '', onClose() {}, viewNote: 'QR-ni skanerlang' }));
    expect(html).toContain('Katta');
    expect(html).toContain('+10000 so&#x27;m');
    expect(html).toContain('QR-ni skanerlang');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain("Savatga qo&#x27;shish");
  });

  it('sarlavha: logo o\'rnida bosh harf, nom va qo\'shimcha qator', () => {
    const html = renderToStaticMarkup(createElement(MenuHead, { name: 'navro\'z', brand: { logoUrl: null, color: null, coverUrl: null } }, 'Har kuni 10:00'));
    expect(html).toContain('qm-logo--letter');
    expect(html).toContain('>N<');
    expect(html).toContain('Har kuni 10:00');
  });
});
