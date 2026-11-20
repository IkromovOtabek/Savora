/**
 * Bron — sof qoidalar (DB importi yo'q, client'da ham): Toshkent vaqti (UTC+5), 15 daqiqa qadam, davomiylik,
 * ustma-ust tekshiruvi, bo'sh stollar tartibi, holat bo'yicha amallar, eslatma oynasi. Server
 * (lib/restaurant/reservations.ts), web forma va testlar shu bitta manbadan foydalanadi.
 */
import { TASHKENT_OFFSET_MS, isDayPeriod, tashkentDayKey, tashkentDayStart } from '../period';
import { canonicalPhone, uzLocalDigits } from '../phone';

export const RESERVATION_STATUSES = ['booked', 'seated', 'cancelled', 'no_show'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Stolni band qiladigan holatlar (ustma-ust qoidasi shular orasida) */
export const ACTIVE_RESERVATION_STATUSES: readonly ReservationStatus[] = ['booked', 'seated'];

export const RESERVATION_LIMITS = {
  /** Vaqt qadami (daqiqa) */
  stepMin: 15,
  defaultDurationMin: 120,
  minDurationMin: 30,
  maxDurationMin: 480,
  maxItems: 30,
  maxGuests: 100,
  nameMax: 80,
  phoneMax: 40,
  noteMax: 300,
  reasonMax: 200,
  /** Yaratishda o'tgan vaqt chegarasi — shuncha daqiqa oldingi vaqtga ham yozish mumkin (hozirgina qo'ng'iroq qilgan mijoz) */
  pastGraceMin: 15,
  /** Necha kun oldinga bron qilish mumkin */
  maxDaysAhead: 366,
  /** «Keldi» — boshlanishidan shuncha daqiqa oldin ham mumkin (erta kelgan mehmon) */
  seatEarlyMin: 180,
  /** Eslatma: boshlanishiga shuncha daqiqa qolganda */
  remindBeforeMin: 30,
  /** Eslatma: cron kechiksa — boshlangandan shuncha daqiqa o'tgan bron ham (undan eskisi — yuborilmaydi) */
  remindLateMin: 10,
  /** Kechikayotgan mehmon: boshlangandan shuncha daqiqa o'tsa — «kechikmoqda» belgisi */
  lateAfterMin: 15,
  /** Stollar taxtasi: kelmagan bron boshlangandan keyin ham shuncha daqiqa ko'rinadi */
  boardGraceMin: 30,
  /** Mijoz qidiruvi natijalari */
  searchLimit: 8,
} as const;

/** Formadagi davomiylik tugmalari (daqiqa) */
export const DURATION_PRESETS = [60, 90, 120, 180, 240] as const;
/** Formadagi mehmonlar soni tugmalari */
export const GUEST_PRESETS = [1, 2, 3, 4, 5, 6, 8, 10] as const;
/** Formadagi daqiqa tugmalari */
export const MINUTE_STEPS = [0, 15, 30, 45] as const;

const MIN = 60_000;

/** YYYY-MM-DD (haqiqiy sana) */
export const isDayKey = (v: unknown): v is string => isDayPeriod(v);

/** «HH:MM» → daqiqa (00:00–23:45, 15 daqiqa qadam); noto'g'ri — null */
export function parseTime(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59 || min % RESERVATION_LIMITS.stepMin !== 0) return null;
  return h * 60 + min;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Daqiqa → «HH:MM» */
export function fmtTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Toshkent kuni + vaqti → lahza; noto'g'ri kirish — null */
export function reservationStart(day: string, time: string): Date | null {
  if (!isDayKey(day)) return null;
  const minutes = parseTime(time);
  if (minutes === null) return null;
  return new Date(tashkentDayStart(day).getTime() + minutes * MIN);
}

/** Lahza → Toshkent soati «HH:MM» */
export function tashkentClock(d: Date | string): string {
  const t = new Date(new Date(d).getTime() + TASHKENT_OFFSET_MS);
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** Lahza → Toshkent kuni (YYYY-MM-DD) */
export function tashkentDay(d: Date | string): string {
  return tashkentDayKey(new Date(d));
}

/** Kun kaliti + n kun */
export function addDays(day: string, n: number): string {
  return tashkentDayKey(new Date(tashkentDayStart(day).getTime() + n * 86_400_000));
}

/** Kunning [boshi, oxiri) oralig'i (Toshkent) */
export function dayRange(day: string): { start: Date; end: Date } {
  const start = tashkentDayStart(day);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** Davomiylik to'g'rimi: 30–480 daqiqa, 15 daqiqa qadam */
export function isValidDuration(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= RESERVATION_LIMITS.minDurationMin
    && n <= RESERVATION_LIMITS.maxDurationMin && n % RESERVATION_LIMITS.stepMin === 0;
}

export function reservationEnd(start: Date, durationMin: number): Date {
  return new Date(start.getTime() + durationMin * MIN);
}

/** [aStart, aEnd) va [bStart, bEnd) kesishadimi (tutashgan — kesishmaydi: 18:00–20:00 va 20:00–22:00 mumkin) */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Yaratish/vaqtini o'zgartirish mumkinmi: o'tgan vaqt (kichik chegara bilan) va juda uzoq kelajak — yo'q */
export function startProblem(start: Date, now: Date): 'past' | 'tooFar' | null {
  if (start.getTime() < now.getTime() - RESERVATION_LIMITS.pastGraceMin * MIN) return 'past';
  if (start.getTime() > now.getTime() + RESERVATION_LIMITS.maxDaysAhead * 86_400_000) return 'tooFar';
  return null;
}

export type ReservationOp = 'edit' | 'cancel' | 'seat' | 'noShow';

/** Holat bo'yicha amallar: faqat `booked` bron o'zgaradi (seated/cancelled/no_show — yakunlangan) */
export function reservationAllows(status: ReservationStatus, op: ReservationOp): boolean {
  void op;
  return status === 'booked';
}

/** «Keldi» — boshlanishiga ko'pi bilan 3 soat qolganda (ertangi bronni adashib ochib qo'ymaslik uchun) */
export function seatTooEarly(start: Date, now: Date): boolean {
  return start.getTime() - now.getTime() > RESERVATION_LIMITS.seatEarlyMin * MIN;
}

/** «Kelmadi» — faqat boshlanish vaqti kelgach */
export function noShowTooEarly(start: Date, now: Date): boolean {
  return now.getTime() < start.getTime();
}

/** Mehmon kechikmoqdami (bron hali «booked», boshlanganiga 15 daqiqadan oshdi) */
export function isLate(r: { status: ReservationStatus; startAt: Date | string }, now: Date): boolean {
  return r.status === 'booked' && now.getTime() - new Date(r.startAt).getTime() > RESERVATION_LIMITS.lateAfterMin * MIN;
}

/** Eslatma oynasi: boshlanishiga ≤ 30 daqiqa qolgan (cron kechiksa — boshlanganiga ≤ 10 daqiqa) */
export function reminderWindow(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - RESERVATION_LIMITS.remindLateMin * MIN),
    to: new Date(now.getTime() + RESERVATION_LIMITS.remindBeforeMin * MIN),
  };
}

/** Bron eslatmaga tushadimi (`booked`, eslatilmagan, oynada) */
export function isDueForReminder(r: { status: ReservationStatus; remindedAt?: Date | string | null; startAt: Date | string }, now: Date): boolean {
  if (r.status !== 'booked' || r.remindedAt) return false;
  const t = new Date(r.startAt).getTime();
  const w = reminderWindow(now);
  return t >= w.from.getTime() && t <= w.to.getTime();
}

/**
 * Bo'sh stollar tartibi: avval mehmonlarga sig'adiganlar (o'rindig'i kamrog'i birinchi — katta stol kichik guruhga
 * band bo'lmasin), keyin sig'maydiganlar (ko'prog'i birinchi); teng bo'lsa — stol raqami.
 */
export function sortTablesForGuests<T extends { seats: number; number: number }>(list: readonly T[], guests: number): (T & { fits: boolean })[] {
  return list
    .map((t) => ({ ...t, fits: t.seats >= guests }))
    .sort((a, b) => {
      if (a.fits !== b.fits) return a.fits ? -1 : 1;
      if (a.seats !== b.seats) return a.fits ? a.seats - b.seats : b.seats - a.seats;
      return a.number - b.number;
    });
}

/**
 * Bron telefoni: O'zbekiston raqami — to'liq 9 raqam, «+998 90 123 45 67» ko'rinishida; xorijiy — «+» bilan 8–15 raqam
 * (kiritilganicha). Noto'g'ri — null.
 */
export function normalizeReservationPhone(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const uz = uzLocalDigits(v);
  if (uz) return uz.local.length === 9 ? canonicalPhone(v) : null;
  const digits = v.replace(/\D/g, '');
  return v.startsWith('+') && digits.length >= 8 && digits.length <= 15 && /^\+[\d\s()-]+$/.test(v) ? v : null;
}

/** Ro'yxatni soat bo'yicha guruhlash (UI): «18:00» → bronlar */
export function groupByHour<T extends { time: string }>(list: readonly T[]): { hour: string; items: T[] }[] {
  const out: { hour: string; items: T[] }[] = [];
  for (const r of list) {
    const hour = `${r.time.slice(0, 2)}:00`;
    const last = out[out.length - 1];
    if (last && last.hour === hour) last.items.push(r);
    else out.push({ hour, items: [r] });
  }
  return out;
}
