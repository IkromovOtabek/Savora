/**
 * O'zbekiston telefon raqami ko'rinishi: «+998 99 000 00 00».
 * Sof funksiyalar — brauzerdagi niqob (PhonePrefix) va server (saqlashdan oldin) bir xil qoidada.
 */
export const PHONE_PLACEHOLDER = '+998 99 000 00 00';

const PREFIX = '+998 ';
/** Mahalliy 9 raqam guruhlari: 99 000 00 00 */
const GROUPS = [2, 3, 2, 2];

function groupLocal(local: string): string {
  const out: string[] = [];
  let i = 0;
  for (const g of GROUPS) {
    if (i >= local.length) break;
    out.push(local.slice(i, i + g));
    i += g;
  }
  return out.join(' ');
}

/**
 * Matndan mahalliy (998 dan keyingi) raqamlarni ajratadi.
 * null — O'zbekiston raqami emas (xorijiy «+7 …», 10+ raqamli boshqa format) — tegilmaydi.
 */
export function uzLocalDigits(raw: string): { local: string; hadCode: boolean } | null {
  const v = raw.trim();
  const digits = v.replace(/\D/g, '');
  if (v.startsWith('+')) {
    if (!digits.startsWith('998')) return null;
    return { local: digits.slice(3), hadCode: true };
  }
  if (digits.startsWith('998') && digits.length > 9) return { local: digits.slice(3), hadCode: true };
  if (digits.length <= 9) return { local: digits, hadCode: false };
  return null;
}

/**
 * Yozilayotgan qiymatni niqoblaydi: «901234567» → «+998 90 123 45 67», «+998901234567» → shu.
 * Bo'sh — bo'sh; «+9», «+99» (998 yozilmoqda) va xorijiy raqam — o'zgarishsiz; ortiqcha raqamlar kesiladi.
 */
export function formatUzPhoneInput(raw: string): string {
  const v = raw.trimStart();
  const digits = v.replace(/\D/g, '');
  if (!digits) return v.startsWith('+') ? '+' : '';
  // «+9», «+99» — kod yozilmoqda (yoki o'chirilmoqda)
  if (v.startsWith('+') && digits.length < 3 && '998'.startsWith(digits)) return `+${digits}`;
  const parts = uzLocalDigits(v);
  if (!parts) return v;
  return `${PREFIX}${groupLocal(parts.local.slice(0, 9))}`;
}

/**
 * Saqlash uchun: to'liq O'zbekiston raqami — «+998 90 123 45 67»; boshqasi — kiritilganicha (trim).
 * Eski yozuvlar erkin formatda — qidiruv raqamlar bo'yicha (lib/daftarOps phoneTailPattern).
 */
export function canonicalPhone(raw: string): string {
  const v = raw.trim();
  const parts = uzLocalDigits(v);
  if (!parts || parts.local.length !== 9) return v;
  return `${PREFIX}${groupLocal(parts.local)}`;
}
