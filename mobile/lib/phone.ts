/**
 * Telefon katagi qoidalari (web: web/lib/phone.ts + components/ui/PhonePrefix.tsx bilan bir xil):
 *   — bo'sh katakka fokus berilganda "+998 " o'zi yoziladi, o'chirsa prefiks ham o'chadi (qulflanmaydi);
 *   — yozilayotganda «+998 90 123 45 67» ko'rinishiga keltiriladi;
 *   — faqat "+998" qolgan bo'lsa — bo'sh hisoblanadi (fokusdan chiqishda katak tozalanadi).
 * Sof funksiyalar — PhoneField (components/ui/Controls.tsx) va ekranlardagi tekshiruv shu yerdan.
 */
export const PHONE_PREFIX = '+998 ';

/** Mahalliy 9 raqam guruhlari: 90 123 45 67 */
const GROUPS = [2, 3, 2, 2];

const isDigit = (ch: string) => ch >= '0' && ch <= '9';
const countDigits = (s: string) => [...s].filter(isDigit).length;

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
 * Matndan mahalliy (998 dan keyingi) raqamlar.
 * null — O'zbekiston raqami emas (xorijiy «+7 …», 10+ raqamli boshqa format) — niqoblanmaydi.
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
 * Yozilayotgan qiymatni niqoblaydi: «901234567» → «+998 90 123 45 67».
 * Bo'sh — bo'sh; «+9», «+99» (kod yozilmoqda/o'chirilmoqda) va xorijiy raqam — o'zgarishsiz.
 */
export function formatUzPhoneInput(raw: string): string {
  const v = raw.trimStart();
  const digits = v.replace(/\D/g, '');
  if (!digits) return v.startsWith('+') ? '+' : '';
  if (v.startsWith('+') && digits.length < 3 && '998'.startsWith(digits)) return `+${digits}`;
  const parts = uzLocalDigits(v);
  if (!parts) return v;
  // Prefiks turgan katakka to'liq raqam qo'yildi («+998 » + «+998901234567») — kod ikki marta
  const local = parts.local.length >= 12 && parts.local.startsWith('998') ? parts.local.slice(3) : parts.local;
  return `${PHONE_PREFIX}${groupLocal(local.slice(0, 9))}`;
}

/**
 * Katakdagi yangi matn (oldingi qiymat bilan): faqat bo'sh joy o'chirilgan bo'lsa — undan oldingi
 * raqam ham o'chadi, aks holda niqob bo'sh joyni qaytarib qo'yadi va Backspace «qotib» qoladi
 * («+998 » → «+998» → «+99» → … → bo'sh).
 */
export function nextPhoneInput(prev: string, raw: string): string {
  if (raw.length < prev.length && countDigits(raw) === countDigits(prev)) {
    let i = 0;
    while (i < raw.length && raw[i] === prev[i]) i++;
    let j = i - 1;
    while (j >= 0 && !isDigit(raw[j])) j--;
    // Raqamlar oldidagi «+» o'chirildi — niqob uni baribir qaytaradi, qiymat o'zgarmaydi
    // (yolg'iz «+» esa oddiy o'chadi)
    if (j < 0) return countDigits(raw) > 0 ? prev : formatUzPhoneInput(raw);
    raw = raw.slice(0, j) + raw.slice(j + 1);
  }
  return formatUzPhoneInput(raw);
}

/** Faqat prefiks qolgan (yoki bo'sh) — raqam kiritilmagan */
export function isBarePhone(v: string): boolean {
  const s = v.replace(/\s/g, '');
  return s === '' || s === '+' || s === '+998' || s === '+99' || s === '+9';
}

/** To'liq O'zbekiston raqamining 9 ta mahalliy raqami; aks holda '' */
export function uzPhone9(v: string): string {
  const p = uzLocalDigits(v);
  return p && p.local.length === 9 ? p.local : '';
}

/** Server uchun (oldingi format saqlanadi): «+998901234567»; to'liq bo'lmasa — '' */
export const uzPhoneE164 = (v: string) => {
  const l = uzPhone9(v);
  return l ? `+998${l}` : '';
};
