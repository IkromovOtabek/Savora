/**
 * Restoran bronlari — mobil API turlari va so'rovlar. Yagona manba: web/docs/RESTORAN_API.md §18
 * (`/api/mobile/restaurant/reservations/*`). Shakllar web lib/restaurant/reservations.ts bilan bir xil
 * (mobil web kodini import qila olmaydi).
 *
 * Huquqlar (server tekshiradi, ilova faqat tugmalarni yashiradi): ro'yxat va «Keldi» — `order.create` yoki
 * `reservation.manage`; yaratish/tahrirlash/bekor/«Kelmadi» — `reservation.manage`.
 */
import { api } from './api';
import type { Menu, OrderView } from './restaurant';

export type ReservationStatus = 'booked' | 'seated' | 'cancelled' | 'no_show';

export interface ReservationItem {
  productId: string;
  name: string;
  qty: number;
  note: string | null;
  optionIds: string[];
  options: string[];
}

export interface Reservation {
  id: string;
  branchId: string;
  tableId: string;
  tableNumber: number;
  hallId: string | null;
  hallName: string | null;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  guests: number;
  startAt: string;
  endAt: string;
  /** Toshkent kuni va soatlari */
  day: string;
  time: string;
  endTime: string;
  durationMin: number;
  items: ReservationItem[];
  note: string | null;
  status: ReservationStatus;
  late: boolean;
  orderId: string | null;
  seatedAt: string | null;
  seatedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  noShowAt: string | null;
  remindedAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

export interface ReservationsDay {
  serverTime: string;
  date: string;
  today: string;
  branchId: string;
  branches: { id: string; name: string; isMain: boolean }[];
  items: Reservation[];
  counts: Record<ReservationStatus, number> & { guests: number };
  can: { manage: boolean; seat: boolean };
}

export interface ReservationFormData {
  branchId: string;
  branches: { id: string; name: string; isMain: boolean }[];
  halls: { id: string; name: string }[];
  tables: { id: string; number: number; seats: number; hallId: string }[];
  menu: Pick<Menu, 'categories' | 'items'>;
}

export interface FreeTable {
  id: string;
  number: number;
  seats: number;
  hallId: string;
  hallName: string | null;
  fits: boolean;
  busyNow: boolean;
}

export interface CustomerHit { id: string; name: string; phone: string }

export interface ReservationBody {
  branchId?: string;
  tableId: string;
  date: string;
  time: string;
  durationMin: number;
  guests: number;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  items: { productId: string; qty: number; optionIds?: string[]; note?: string }[];
  note: string;
}

export interface SeatResult {
  reservation: Reservation;
  orderId: string;
  order: OrderView | null;
  skipped: { name: string; message: string }[];
  existing: boolean;
}

const BASE = '/api/mobile/restaurant/reservations';
const qs = (p: Record<string, string | number | null | undefined>) => {
  const q = Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return q ? `?${q}` : '';
};

export const reservationsApi = {
  day: (date?: string | null, branchId?: string | null) => api<ReservationsDay>(`${BASE}${qs({ date, branchId })}`),
  one: (id: string) => api<{ reservation: Reservation }>(`${BASE}/${encodeURIComponent(id)}`),
  form: (branchId?: string | null) => api<ReservationFormData>(`${BASE}/form${qs({ branchId })}`),
  freeTables: (p: { date: string; time: string; durationMin: number; guests: number; branchId?: string | null; excludeId?: string | null }) =>
    api<{ tables: FreeTable[] }>(`${BASE}/free-tables${qs(p)}`),
  customers: (q: string) => api<{ customers: CustomerHit[] }>(`${BASE}/customers${qs({ q })}`),
  create: (body: ReservationBody) => api<{ reservation: Reservation }>(BASE, { method: 'POST', body }),
  update: (id: string, body: ReservationBody) =>
    api<{ reservation: Reservation }>(`${BASE}/${encodeURIComponent(id)}`, { method: 'POST', body: { op: 'update', ...body } }),
  cancel: (id: string, reason?: string) =>
    api<{ reservation: Reservation }>(`${BASE}/${encodeURIComponent(id)}`, { method: 'POST', body: { op: 'cancel', reason } }),
  noShow: (id: string) => api<{ reservation: Reservation }>(`${BASE}/${encodeURIComponent(id)}`, { method: 'POST', body: { op: 'noShow' } }),
  seat: (id: string) => api<SeatResult>(`${BASE}/${encodeURIComponent(id)}`, { method: 'POST', body: { op: 'seat' } }),
};
