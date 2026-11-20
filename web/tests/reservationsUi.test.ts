// Bronlar UI (components/restaurant/reservations): render smoke — ro'yxat (holatlar, amallar huquq bo'yicha), forma (tahrir),
// restoran sozlamalari sarlavhasi/tablari bron sahifasida chiqmaydi.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let pathname = '/app/restaurant/reservations';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {}, push() {} }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(''),
  redirect: () => { throw new Error('redirect'); },
}));
vi.mock('@/app/actions/reservations', () => {
  const f = async () => ({ ok: true, data: [] });
  return {
    reservationFreeTablesAction: f, searchReservationCustomersAction: f, createReservationAction: f, updateReservationAction: f,
    cancelReservationAction: f, noShowReservationAction: f, seatReservationAction: f,
  };
});

import ReservationsBoard from '@/components/restaurant/reservations/ReservationsBoard';
import ReservationForm from '@/components/restaurant/reservations/ReservationForm';
import RestaurantTabs from '@/components/restaurant/settings/RestaurantTabs';
import type { ReservationView, ReservationsDay, ReservationForm as FormData } from '@/lib/restaurant/reservations';

const id = (n: number) => n.toString(16).padStart(24, 'a');

const rv = (over: Partial<ReservationView>): ReservationView => ({
  id: id(1), branchId: id(9), tableId: id(20), tableNumber: 5, hallId: id(10), hallName: 'Asosiy zal', customerId: id(40),
  customerName: 'Aziz', customerPhone: '+998 90 111 22 33', guests: 4, startAt: '2026-11-21T14:00:00.000Z', endAt: '2026-11-21T16:00:00.000Z',
  day: '2026-11-21', time: '19:00', endTime: '21:00', durationMin: 120,
  items: [{ productId: id(50), name: 'Osh', qty: 2, note: null, optionIds: [id(51)], options: ['Katta'] }],
  note: "Tug'ilgan kun", status: 'booked', late: false, orderId: null, seatedAt: null, seatedBy: null, cancelledAt: null, cancelledBy: null,
  cancelReason: null, noShowAt: null, remindedAt: null, createdBy: 'Malika', createdAt: null, ...over,
});

const day = (manage: boolean): ReservationsDay => ({
  // 17:30 Toshkent — 19:00 bronigacha 1,5 soat («Keldi» ko'rinadi)
  serverTime: '2026-11-21T12:30:00.000Z', date: '2026-11-21', today: '2026-11-21', branchId: id(9), branches: [],
  items: [
    rv({}),
    rv({ id: id(2), time: '19:30', endTime: '21:30', customerName: 'Bobur', status: 'seated', orderId: id(60), items: [], note: null }),
    rv({ id: id(3), time: '20:00', endTime: '22:00', customerName: 'Vali', status: 'cancelled', cancelReason: 'Mijoz bekor qildi', items: [] }),
  ],
  counts: { booked: 1, seated: 1, cancelled: 1, no_show: 0, guests: 8 },
  can: { manage, seat: true },
});

const form: FormData = {
  branchId: id(9), branches: [], halls: [{ id: id(10), name: 'Asosiy zal' }],
  tables: [{ id: id(20), number: 5, seats: 4, hallId: id(10) }],
  menu: {
    categories: [],
    items: [{
      id: id(50), name: 'Osh', price: 45000, photoUrl: null, category: null, categoryId: null, kind: 'bundle', unit: null, stationId: null,
      stopListed: false, available: null, ikpu: null,
      modifierGroups: [{ id: id(52), name: 'Porsiya', required: true, min: 1, max: 1, options: [{ id: id(51), name: 'Katta', price: 8000 }] }],
    }],
  },
};

describe('bronlar UI (smoke)', () => {
  it('ro\'yxat: soat guruhlari, holatlar, amallar (bron huquqi bilan)', () => {
    const html = renderToStaticMarkup(createElement(ReservationsBoard, { data: day(true), form }));
    expect(html).toContain('Yangi bron');
    expect(html).toContain('19:00');
    expect(html).toContain('5-stol');
    expect(html).toContain('Osh (Katta) ×2');
    expect(html).toContain('tel:+998901112233');
    expect(html).toContain('>Keldi</button>');
    expect(html).toContain('Tahrirlash');
    expect(html).toContain('Buyurtmani ochish');
    expect(html).toContain('Sabab: Mijoz bekor qildi');
  });

  it('ofitsant: «Yangi bron», «Tahrirlash», «Bekor qilish» yo\'q, «Keldi» bor', () => {
    const html = renderToStaticMarkup(createElement(ReservationsBoard, { data: day(false), form: null }));
    expect(html).not.toContain('Yangi bron');
    expect(html).not.toContain('Tahrirlash');
    expect(html).not.toContain('>Bekor qilish<');
    expect(html).toContain('>Keldi</button>');
  });

  it('«Keldi» tugmasi — boshlanishiga 3 soatdan ko\'p bo\'lsa yo\'q', () => {
    const early = { ...day(true), serverTime: '2026-11-21T07:00:00.000Z' };
    expect(renderToStaticMarkup(createElement(ReservationsBoard, { data: early, form }))).not.toContain('>Keldi</button>');
  });

  it('forma (tahrir): mijoz, vaqt, taom modifikatori', () => {
    const html = renderToStaticMarkup(createElement(ReservationForm, {
      form, date: '2026-11-21', today: '2026-11-21', editing: rv({}), onClose: () => {}, onSaved: () => {},
    }));
    expect(html).toContain('Bronni tahrirlash');
    expect(html).toContain('Aziz');
    expect(html).toContain('Tanlang: Porsiya');
    expect(html).toContain('Katta +8');
    expect(html).toContain('stollar qidirilmoqda');
  });

  it('bron sahifasida restoran sozlamalari sarlavhasi va tablari yo\'q', () => {
    pathname = '/app/restaurant/reservations';
    expect(renderToStaticMarkup(createElement(RestaurantTabs, { title: 'Restoran sozlamalari', sub: 'x', canManage: true, canReports: true }))).toBe('');
    pathname = '/app/restaurant/tables';
    expect(renderToStaticMarkup(createElement(RestaurantTabs, { title: 'Restoran sozlamalari', sub: 'x', canManage: true, canReports: true }))).toContain('Restoran sozlamalari');
  });
});
