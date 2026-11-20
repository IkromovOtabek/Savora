'use server';

/**
 * Restoran bronlari — web server action'lari (docs/RESTORAN_API.md §18). Har biri: sessiya → zod → lib/restaurant/reservations
 * (huquq, modul, filial — o'sha yerda). Natija: `{ ok: true, data, success? }` yoki `{ ok: false, error, code }`
 * (useRun / useToastOnState bilan mos). Sahifa (`/app/restaurant/reservations`) natijadan keyin `router.refresh()` qiladi.
 */
import { parseInput } from '@/lib/validation';
import { tr } from '@/lib/i18n/fmt';
import { restaurantCtxFromSession, type ActionResult } from '@/lib/restaurant/session';
import { reservationSchemas, type ReservationSaveInput } from '@/lib/restaurant/reservationInputs';
import { reservationStart } from '@/lib/restaurant/reservationRules';
import * as res from '@/lib/restaurant/reservations';

async function prep() {
  const ctx = await restaurantCtxFromSession();
  return { ctx, s: reservationSchemas(ctx.d), t: ctx.d.reservations };
}

function invalid(error: string): { ok: false; error: string; code: 'badInput' } {
  return { ok: false, error, code: 'badInput' };
}

/** Formadagi bo'sh stollar (tanlangan sana, vaqt, davomiylik, mehmonlar) */
export async function reservationFreeTablesAction(input: {
  branchId?: string; date: string; time: string; durationMin?: number; guests: number; excludeId?: string;
}): Promise<ActionResult<res.FreeTable[]>> {
  const { ctx, s } = await prep();
  const p = parseInput(s.free, input, ctx.d.restaurant.errors.badInput);
  if (!p.ok) return invalid(p.error);
  const start = reservationStart(p.data.date, p.data.time);
  if (!start) return invalid(ctx.d.reservations.errors.badTime);
  return res.toResAction(await res.freeTables(ctx, p.data.branchId, start, p.data.durationMin, p.data.guests, { excludeId: p.data.excludeId }));
}

/** Mijoz qidiruvi (ism yoki telefon) */
export async function searchReservationCustomersAction(q: string): Promise<ActionResult<res.ReservationCustomerHit[]>> {
  const { ctx, s } = await prep();
  const p = parseInput(s.search, { q }, ctx.d.restaurant.errors.badInput);
  if (!p.ok) return invalid(p.error);
  return res.toResAction(await res.searchReservationCustomers(ctx, p.data.q));
}

const toInput = (x: ReservationSaveInput): res.ReservationInput => ({
  ...x,
  items: x.items?.map((i) => ({ productId: i.productId, qty: i.qty, optionIds: i.optionIds, note: i.note || undefined })),
});

/** Yangi bron */
export async function createReservationAction(input: unknown): Promise<ActionResult<{ reservation: res.ReservationView }>> {
  const { ctx, s, t } = await prep();
  const p = parseInput(s.save, input, ctx.d.restaurant.errors.badInput);
  if (!p.ok) return invalid(p.error);
  return res.toResAction(await res.createReservation(ctx, toInput(p.data)), t.created);
}

/** Bronni tahrirlash */
export async function updateReservationAction(id: string, input: unknown): Promise<ActionResult<{ reservation: res.ReservationView }>> {
  const { ctx, s, t } = await prep();
  const i = parseInput(s.id, { id }, t.errors.reservationNotFound);
  if (!i.ok) return invalid(i.error);
  const p = parseInput(s.save, input, ctx.d.restaurant.errors.badInput);
  if (!p.ok) return invalid(p.error);
  return res.toResAction(await res.updateReservation(ctx, i.data.id, toInput(p.data)), t.updated);
}

/** Bekor qilish (sabab ixtiyoriy) */
export async function cancelReservationAction(id: string, input: { reason?: string } = {}): Promise<ActionResult<{ reservation: res.ReservationView }>> {
  const { ctx, s, t } = await prep();
  const i = parseInput(s.id, { id }, t.errors.reservationNotFound);
  if (!i.ok) return invalid(i.error);
  const p = parseInput(s.cancel, input, ctx.d.restaurant.errors.badInput);
  if (!p.ok) return invalid(p.error);
  return res.toResAction(await res.cancelReservation(ctx, i.data.id, p.data.reason), t.cancelled);
}

/** «Kelmadi» */
export async function noShowReservationAction(id: string): Promise<ActionResult<{ reservation: res.ReservationView }>> {
  const { ctx, s, t } = await prep();
  const i = parseInput(s.id, { id }, t.errors.reservationNotFound);
  if (!i.ok) return invalid(i.error);
  return res.toResAction(await res.markNoShow(ctx, i.data.id), t.noShowDone);
}

/** «Keldi» — stol ochiladi (oldindan taomlar bilan); natijadagi `orderId` bo'yicha buyurtma ekraniga o'ting */
export async function seatReservationAction(id: string): Promise<ActionResult<res.SeatResult>> {
  const { ctx, s, t } = await prep();
  const i = parseInput(s.id, { id }, t.errors.reservationNotFound);
  if (!i.ok) return invalid(i.error);
  const r = await res.seatReservation(ctx, i.data.id);
  const success = r.ok && r.data.skipped.length
    ? tr(t.seatedSkipped, { n: r.data.skipped.length, names: r.data.skipped.map((x) => x.name).join(', ') })
    : t.seated;
  return res.toResAction(r, success);
}
