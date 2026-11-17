// Restoran sozlamalari UI (components/restaurant/settings): render smoke + modifikator tekshiruvi server qoidasi bilan mosligi
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {}, push() {} }),
  usePathname: () => '/app/restaurant/tables',
  useSearchParams: () => new URLSearchParams('branch=aaaaaaaaaaaaaaaaaaaaaaaa'),
  redirect: () => { throw new Error('redirect'); },
}));
vi.mock('@/app/actions/restaurant', () => {
  const f = async () => ({ ok: true, data: {} });
  return {
    saveRestaurantSettingsAction: f, saveHallAction: f, deleteHallAction: f, saveTableAction: f, createTablesRangeAction: f,
    deleteTableAction: f, regenerateTableQrAction: f, saveStationAction: f, deleteStationAction: f, updateMenuItemAction: f, setStopListAction: f,
  };
});

import GeneralSettingsForm from '@/components/restaurant/settings/GeneralSettingsForm';
import HallsTablesManager from '@/components/restaurant/settings/HallsTablesManager';
import StationsManager from '@/components/restaurant/settings/StationsManager';
import MenuEditor from '@/components/restaurant/settings/MenuEditor';
import RestaurantTabs from '@/components/restaurant/settings/RestaurantTabs';
import BranchPicker from '@/components/restaurant/settings/BranchPicker';
import { validateGroups, toDraft } from '@/components/restaurant/settings/ModifierGroupsEditor';
import { normalizeModifierGroups } from '@/lib/restaurant/modifiers';
import { DEFAULT_RESTAURANT_SETTINGS } from '@/lib/restaurant/types';

const id = (n: number) => n.toString(16).padStart(24, 'a');

const setup = {
  branchId: id(1),
  branches: [{ id: id(1), name: 'Asosiy', isMain: true }, { id: id(2), name: 'Chilonzor', isMain: false }],
  settings: { ...DEFAULT_RESTAURANT_SETTINGS, serviceChargePct: 10, brand: { color: '#E11D48' } },
  menuSlug: 'demo',
  qrBaseUrl: 'https://savora.uz/m/demo/',
  halls: [{ id: id(10), name: 'Asosiy zal', sort: 0, active: true }, { id: id(11), name: 'Terrasa', sort: 1, active: false }],
  tables: [
    { id: id(20), hallId: id(10), number: 1, seats: 4, x: null, y: null, active: true, qrToken: 'tok1tok1tok1tok1tok1', qrPath: '/m/demo/tok1', qrUrl: 'https://savora.uz/m/demo/tok1', busy: true },
    { id: id(21), hallId: id(10), number: 2, seats: 2, x: null, y: null, active: false, qrToken: 'tok2tok2tok2tok2tok2', qrPath: '/m/demo/tok2', qrUrl: 'https://savora.uz/m/demo/tok2', busy: false },
  ],
  stations: [
    { id: id(30), name: 'Issiq sex', kind: 'kitchen' as const, printerIp: null, sort: 0, active: true },
    { id: id(31), name: 'Bar', kind: 'bar' as const, printerIp: '192.168.1.5', sort: 1, active: false },
  ],
};

describe('restoran sozlamalari UI (smoke)', () => {
  it('tablar', () => {
    const html = renderToStaticMarkup(createElement(RestaurantTabs, { title: 'Restoran sozlamalari', sub: 'x', canManage: true, canReports: true }));
    expect(html).toContain('Zal va stollar');
    expect(html).toContain('Hisobotlar');
    expect(html).toContain('/app/restaurant/tables?branch=');
    expect(html).toContain('aria-current="page"');
  });
  it('filial tanlash', () => {
    expect(renderToStaticMarkup(createElement(BranchPicker, { branches: setup.branches, value: id(1) }))).toContain('Chilonzor');
  });
  it('umumiy forma', () => {
    const html = renderToStaticMarkup(createElement(GeneralSettingsForm, { initial: setup.settings, shopName: 'Navro\'z', kitchen: true, qrMenu: true, qrBaseUrl: setup.qrBaseUrl }));
    expect(html).toContain('Raqobat qo');
    expect(html).toContain('Xizmat haqi 10% — faqat zalda');
    expect(html).toContain('https://savora.uz/m/demo/');
  });
  it('zal va stollar', () => {
    const html = renderToStaticMarkup(createElement(HallsTablesManager, { data: setup, qrMenu: true }));
    expect(html).toContain('Asosiy zal');
    expect(html).toContain('/app/restaurant/tables/print?hall=');
    expect(html).toContain('Band');
    const pro = renderToStaticMarkup(createElement(HallsTablesManager, { data: setup, qrMenu: false }));
    expect(pro).toContain('Pro tarifda');
    const empty = renderToStaticMarkup(createElement(HallsTablesManager, { data: { ...setup, halls: [], tables: [] }, qrMenu: true }));
    expect(empty).toContain("Hali zal yo");
  });
  it('stansiyalar', () => {
    const html = renderToStaticMarkup(createElement(StationsManager, { stations: setup.stations, branchId: id(1) }));
    expect(html).toContain('Issiq sex');
    expect(html).toContain('192.168.1.5');
  });
  it('menyu', () => {
    const view = {
      branchId: id(1), branches: [], categories: ['Ichimliklar', 'Milliy'], stations: [{ id: id(30), name: 'Issiq sex', kind: 'kitchen' as const, active: true }],
      items: [
        { id: id(40), name: 'Osh', price: 45000, photoUrl: null, category: 'Milliy', categoryId: null, kind: 'bundle' as const, unit: null, stationId: id(30), stopListed: false, available: null, ikpu: '10202001001000000',
          modifierGroups: [{ id: id(50), name: 'Porsiya', required: true, min: 1, max: 1, options: [{ id: id(51), name: 'Yarim', price: 0 }, { id: id(52), name: "To'liq", price: 15000 }] }] },
        { id: id(41), name: 'Choy', price: 5000, photoUrl: null, category: null, categoryId: null, kind: 'service' as const, unit: null, stationId: null, stopListed: true, available: null, ikpu: null, modifierGroups: [] },
      ],
    };
    const html = renderToStaticMarkup(createElement(MenuEditor, { view, canEdit: true, canStop: true }));
    expect(html).toContain('Osh');
    expect(html).toContain('Kategoriyasiz');
    expect(html).toContain('aria-pressed="true"');
    const empty = renderToStaticMarkup(createElement(MenuEditor, { view: { ...view, items: [] }, canEdit: false, canStop: false }));
    expect(empty).toContain("sotuvdagi taom yo");
  });
  it('validateGroups server qoidasi bilan mos', () => {
    const cases: unknown[] = [
      [{ name: 'Porsiya', required: true, min: 1, max: 1, options: [{ name: 'Yarim', price: 0 }, { name: 'Katta', price: 5000 }] }],
      [{ name: 'Qo\'shimcha', required: false, min: 0, max: 2, options: [{ name: 'Pishloq', price: 3000 }, { name: 'Tuxum', price: 2000 }] }],
      [{ name: 'A', required: true, min: 0, max: 1, options: [{ name: 'x', price: 0 }] }],
      [{ name: 'A', required: false, min: 0, max: 3, options: [{ name: 'x', price: 0 }] }],
      [{ name: 'A', required: false, min: 2, max: 1, options: [{ name: 'x', price: 0 }, { name: 'y', price: 0 }] }],
      [{ name: 'A', required: false, min: 0, max: 1, options: [{ name: 'x', price: 0 }, { name: 'X', price: 0 }] }],
      [{ name: 'A', required: false, min: 0, max: 1, options: [{ name: 'x', price: 0 }] }, { name: 'a', required: false, min: 0, max: 1, options: [{ name: 'y', price: 0 }] }],
    ];
    for (const c of cases) {
      const ui = validateGroups(toDraft(c as Parameters<typeof toDraft>[0]));
      const srv = normalizeModifierGroups(c);
      expect(ui.ok, JSON.stringify(c)).toBe(srv.ok);
      if (ui.ok && srv.ok) expect(ui.groups).toEqual(srv.groups);
    }
  });
});
