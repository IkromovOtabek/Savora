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
vi.mock('@/app/actions/menu', () => {
  const f = async () => ({ ok: true, data: {} });
  return { saveMenuDishAction: f, setMenuMembershipAction: f, quickCreateIngredientAction: f };
});
vi.mock('@/app/actions/products', () => ({ createCategoryAction: async () => ({ ok: true, item: { id: 'x', name: 'x', parentId: null } }) }));

import GeneralSettingsForm from '@/components/restaurant/settings/GeneralSettingsForm';
import HallsTablesManager from '@/components/restaurant/settings/HallsTablesManager';
import StationsManager from '@/components/restaurant/settings/StationsManager';
import MenuBoard from '@/components/restaurant/menu/MenuBoard';
import DishForm from '@/components/restaurant/menu/DishForm';
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
    { id: id(30), name: 'Issiq sex', kind: 'kitchen' as const, printerIp: null, printEnabled: true, sort: 0, active: true },
    { id: id(31), name: 'Bar', kind: 'bar' as const, printerIp: '192.168.1.5', printEnabled: false, sort: 1, active: false },
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
  it('menyu (/app/menu): porsiya, tannarx/foyda, tugagan, stop-list, bo\'sh holat', () => {
    const can = { create: true, edit: true, stop: true, viewCost: true };
    const row = (over: Record<string, unknown>) => ({
      id: id(40), name: 'Osh', type: 'dish' as const, price: 45000, photoUrl: null, category: 'Milliy', stationId: id(30), stopListed: false,
      section: 'kitchen' as 'kitchen' | 'bar', barcode: null as string | null,
      portions: 12, recipeCount: 4, modifierCount: 1, ikpu: null, cost: 18400, margin: 59.1, ...over,
    });
    const view = {
      branchId: id(1), branches: [], stations: [{ id: id(30), name: 'Issiq sex', kind: 'kitchen' as const, active: true }],
      categories: ['Milliy'], can, flags: true, barMenu: false, hidden: [row({ id: id(44), name: 'Manti', portions: 3 })],
      items: [
        row({}),
        row({ id: id(41), name: 'Somsa', portions: 0, cost: 9000, margin: 25 }),
        row({ id: id(42), name: 'Choy', type: 'service' as const, category: null, portions: null, recipeCount: 0, stopListed: true, cost: 1500, margin: 81.3 }),
        row({ id: id(43), name: 'Cola', type: 'goods' as const, category: 'Ichimliklar', portions: 24, recipeCount: 0, cost: 6500, margin: 35 }),
      ],
    };
    const html = renderToStaticMarkup(createElement(MenuBoard, { view }));
    expect(html).toContain('≈ 12 porsiya');
    expect(html).toContain('Tugagan');
    expect(html).toMatch(/Tannarx 18\s400/);
    expect(html).toContain('foyda 59,1%');
    expect(html).toContain('24 qoldi');
    expect(html).toContain('Kategoriyasiz');
    expect(html).toContain('aria-pressed="true"'); // Choy — stop-listda
    expect(html).toContain('Menyudan olingan');
    expect(html).toContain('/app/menu/' + id(40));
    const noCost = renderToStaticMarkup(createElement(MenuBoard, { view: { ...view, can: { ...can, viewCost: false, edit: false }, items: view.items.map((i) => ({ ...i, cost: null, margin: null })) } }));
    expect(noCost).not.toContain('Tannarx');
    expect(noCost).not.toContain('/app/menu/' + id(40));
    const empty = renderToStaticMarkup(createElement(MenuBoard, { view: { ...view, items: [], hidden: [] } }));
    expect(empty).toContain("Menyuda hali taom yo");
    // «Bar bo'limi va barkod» moduli: o'chiq — tablar yo'q; yoqiq — Taomlar/Bar, bar bandi alohida, barkod chiqadi
    expect(html).not.toContain('Taomlar ·');
    const barView = {
      ...view, barMenu: true,
      items: [...view.items, row({ id: id(45), name: 'Sprite', type: 'goods' as const, category: 'Ichimliklar', section: 'bar', barcode: '2001234567893', portions: 12 })],
    };
    const kitchenTab = renderToStaticMarkup(createElement(MenuBoard, { view: barView }));
    expect(kitchenTab).toContain('Taomlar · 4');
    expect(kitchenTab).toContain('Bar · 1');
    expect(kitchenTab).not.toContain('Sprite');
    const barTab = renderToStaticMarkup(createElement(MenuBoard, { view: barView, section: 'bar' }));
    expect(barTab).toContain('Sprite');
    expect(barTab).toContain('barkod 2001234567893');
    expect(barTab).not.toContain('>Osh<');
  });
  it('taom formasi: retsept (g ↔ kg), tannarx, porsiya', () => {
    const data = {
      branchId: id(1), branches: [], categories: [{ id: id(60), name: 'Milliy', parentId: null }],
      stations: [{ id: id(30), name: 'Issiq sex', kind: 'kitchen' as const, active: true }],
      can: { create: true, edit: true, stop: true, viewCost: true },
      barMenu: false,
      stock: [
        { id: id(70), name: 'Guruch', unit: 'kg', available: 10, cost: 15000, price: 0, tracked: true },
        { id: id(71), name: "Mol go'shti", unit: 'kg', available: 0.5, cost: 95000, price: 0, tracked: true },
      ],
      dish: {
        id: id(40), type: 'dish' as const, name: 'Osh', price: 45000, photoUrl: null, categoryId: id(60), categoryName: 'Milliy', stationId: id(30),
        section: 'kitchen' as const, barcode: null, ikpu: null, modifierGroups: [], recipe: [{ productId: id(70), qty: 0.15 }, { productId: id(71), qty: 0.1 }], cost: null, unit: 'dona', available: null, stopListed: false,
      },
    };
    const html = renderToStaticMarkup(createElement(DishForm, { data, mediaEnabled: false }));
    expect(html).toContain('Retsept — 1 porsiya');
    expect(html).toContain('value="150"'); // 0,15 kg → 150 g
    expect(html).toContain('Guruch');
    expect(html).toMatch(/11\s750/); // 0,15×15 000 + 0,1×95 000 = 2 250 + 9 500
    expect(html).toContain('≈ 5 porsiya'); // go'sht 0,5 kg / 0,1
    expect(html).not.toContain("Bo'lim"); // modul o'chiq — bo'lim tanlovi yo'q
    const barForm = renderToStaticMarkup(createElement(DishForm, {
      data: { ...data, barMenu: true, dish: null, stations: [...data.stations, { id: id(31), name: 'Bar', kind: 'bar' as const, active: true }] },
      initialType: 'service' as const, initialSection: 'bar' as const, mediaEnabled: false,
    }));
    expect(barForm).toContain('Bar mahsuloti qo&#x27;shish');
    expect(barForm).toContain('Barkod kerak');
    expect(barForm).toMatch(/<option value="[a-f0-9]{24}" selected="">Bar<\/option>/); // bar stansiyasi o'zi tanlandi
    const fresh = renderToStaticMarkup(createElement(DishForm, { data: { ...data, dish: null }, initialType: 'goods' as const, mediaEnabled: true }));
    expect(fresh).toContain('Ombordagi tovar');
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
