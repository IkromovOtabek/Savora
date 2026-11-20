/**
 * Bron eslatmalari (cron, har 5 daqiqada — /api/cron/reservation-reminders, deploy/crontab.example):
 * boshlanishiga ≤ 30 daqiqa qolgan (cron kechiksa — boshlanganiga ≤ 10 daqiqa), hali eslatilmagan `booked` bronlar uchun
 * ilova ichidagi bildirishnoma (lib/notify.ts, `reservationSoon`) — filialning bron/kassa xodimlari va do'kon egasiga.
 *
 * Takror bo'lmasligi: har bron avval atomik «olinadi» (`remindedAt` yo'q → hozir), keyin `notify` (ikki ilova nusxasi yoki
 * ustma-ust cron bir bronni ikki marta eslatmaydi; `dedupeKey` ham bor). Vaqt o'zgartirilsa — `remindedAt` tozalanadi.
 */
import type { Types } from 'mongoose';
import { getMasterModels } from '../masterDb';
import { getTenantModels } from '../tenantDb';
import { resolveOrgFeatures } from '../features';
import { isOrganizationActive } from '../models/master/Organization';
import { logError } from '../logger';
import { notify, type NotifyOrg } from '../notify';
import type { ReservationDoc } from '../models/tenant/Reservation';
import type { TenantModels } from './context';
import { reminderWindow, tashkentClock } from './reservationRules';

/** Bitta ishga tushishda bir do'kon uchun eng ko'p eslatma (himoya) */
const MAX_PER_ORG = 200;

/** Eslatma oynasidagi, eslatilmagan bronlar (vaqt tartibida) */
export function dueReservationsFilter(now: Date): Record<string, unknown> {
  const w = reminderWindow(now);
  return { status: 'booked', remindedAt: { $exists: false }, startAt: { $gte: w.from, $lte: w.to } };
}

/**
 * Bitta do'kon: oynadagi bronlarni atomik olib (`remindedAt`), har biriga `notify`. Natija — yuborilganlar soni.
 * `send` — testlar uchun almashtiriladi.
 */
export async function remindDueReservations(
  org: NotifyOrg,
  m: Pick<TenantModels, 'Reservation'>,
  now: Date = new Date(),
  send: typeof notify = notify,
): Promise<number> {
  const due = await m.Reservation.find(dueReservationsFilter(now)).sort({ startAt: 1 }).select('_id').limit(MAX_PER_ORG).lean<{ _id: Types.ObjectId }[]>();
  let sent = 0;
  for (const { _id } of due) {
    const r = await m.Reservation.findOneAndUpdate(
      { _id, status: 'booked', remindedAt: { $exists: false } },
      { $set: { remindedAt: now } },
      { new: true },
    ).lean<ReservationDoc>();
    if (!r) continue; // boshqa nusxa olib bo'lgan yoki bron o'zgargan
    await send(org, {
      kind: 'reservationSoon',
      branchId: String(r.branchId),
      params: { table: r.tableNumber, time: tashkentClock(r.startAt), name: r.customerName, guests: r.guests },
      url: '/app/restaurant/reservations',
      audience: { anyPermission: ['reservation.manage', 'order.viewAll'], admins: true },
      dedupeKey: `res:${String(r._id)}`,
    });
    sent++;
  }
  return sent;
}

/** Cron: faol, `tables` moduli yoqiq do'konlar bo'yicha. Bir do'kon xatosi qolganlarini to'xtatmaydi */
export async function sendReservationReminders(now: Date = new Date()): Promise<{ orgs: number; sent: number; failed: number }> {
  const { Organization } = await getMasterModels();
  const orgs = await Organization.find({ status: 'active' }).lean();
  let orgCount = 0;
  let sent = 0;
  let failed = 0;
  for (const org of orgs) {
    if (!isOrganizationActive(org) || !org.dbName) continue;
    if (!resolveOrgFeatures(org).tables) continue;
    try {
      const m = await getTenantModels(org.dbName);
      const n = await remindDueReservations({ id: String(org._id), dbName: org.dbName }, m, now);
      if (n) orgCount++;
      sent += n;
    } catch (err) {
      failed++;
      logError('reservation reminders failed', err, { db: org.dbName });
    }
  }
  return { orgs: orgCount, sent, failed };
}
