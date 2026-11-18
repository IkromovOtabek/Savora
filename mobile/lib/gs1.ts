/**
 * GS1 kodini o'qish (DataMatrix / GS1-128 / QR) — markirovka kodi («Asl belgisi»):
 * (01) GTIN, (21) seriya, (17) yaroqlilik, (10) partiya, (91)/(92)/(93) tekshiruv kodlari.
 *
 * Skanerlar bir xil kodni turlicha beradi — hammasi bitta kanonik ko'rinishga keltiriladi:
 *  - ajratgich FNC1/GS: haqiqiy \x1d, «<GS>», «{GS}», «[GS]», «␝», «^]» yoki umuman yo'q (USB skaner tashlab yuboradi);
 *  - boshida simbologiya belgisi: «]d2» (DataMatrix), «]C1» (GS1-128), «]Q3» (QR) yoki \x1d;
 *  - qavsli ko'rinish: «(01)04780069000130(21)ABC(93)XyZ1»;
 *  - rus klaviatura tartibida yozilgan USB skaner matni («ЙЦУК» → «QWER»).
 * GS yo'q bo'lsa o'zgaruvchan maydon (seriya) chegarasi marka formatlaridan taxmin qilinadi (`guessed: true`).
 *
 * web/lib/gs1.ts va mobile/lib/gs1.ts — BIR XIL fayl (tests/gs1.test.ts solishtiradi). DB/React importi yo'q.
 */

export const GS = '\u001d';

type AiSpec = { fixed: number } | { max: number };

/** 2 xonali AI'lar (eng ko'p uchraydiganlari) */
const AI2: Record<string, AiSpec> = {
  '00': { fixed: 18 }, '01': { fixed: 14 }, '02': { fixed: 14 },
  '10': { max: 20 }, '11': { fixed: 6 }, '12': { fixed: 6 }, '13': { fixed: 6 }, '15': { fixed: 6 }, '16': { fixed: 6 }, '17': { fixed: 6 },
  '20': { fixed: 2 }, '21': { max: 20 }, '22': { max: 20 }, '30': { max: 8 }, '37': { max: 8 },
  '90': { max: 30 }, '91': { max: 90 }, '92': { max: 90 }, '93': { max: 90 }, '94': { max: 90 },
  '95': { max: 90 }, '96': { max: 90 }, '97': { max: 90 }, '98': { max: 90 }, '99': { max: 90 },
};
const AI3: Record<string, AiSpec> = {
  '235': { max: 28 }, '240': { max: 30 }, '241': { max: 30 }, '242': { max: 6 }, '243': { max: 20 },
  '250': { max: 30 }, '251': { max: 30 }, '253': { max: 30 }, '254': { max: 20 }, '255': { max: 25 },
  '400': { max: 30 }, '401': { max: 30 }, '402': { fixed: 17 }, '403': { max: 30 },
  '410': { fixed: 13 }, '411': { fixed: 13 }, '412': { fixed: 13 }, '413': { fixed: 13 },
  '414': { fixed: 13 }, '415': { fixed: 13 }, '416': { fixed: 13 }, '417': { fixed: 13 },
  '420': { max: 20 }, '421': { max: 12 }, '422': { fixed: 3 }, '423': { max: 15 }, '424': { fixed: 3 },
  '425': { max: 15 }, '426': { fixed: 3 }, '427': { max: 3 },
};
const AI4: Record<string, AiSpec> = {
  '7003': { fixed: 10 }, '7004': { max: 4 }, '8005': { fixed: 6 }, '8008': { max: 12 },
};

function aiAt(s: string, i: number): { ai: string; spec: AiSpec } | null {
  const two = s.slice(i, i + 2);
  if (!/^\d{2}$/.test(two)) return null;
  if (AI2[two]) return { ai: two, spec: AI2[two] };
  const three = s.slice(i, i + 3);
  if (/^\d{3}$/.test(three) && AI3[three]) return { ai: three, spec: AI3[three] };
  const four = s.slice(i, i + 4);
  if (!/^\d{4}$/.test(four)) return null;
  // 310n–369n — o'lchov (6 raqam), 390n–394n — summa (o'zgaruvchan)
  if (/^3[1-6]\d\d$/.test(four)) return { ai: four, spec: { fixed: 6 } };
  if (/^39[0-4]\d$/.test(four)) return { ai: four, spec: { max: 15 } };
  return AI4[four] ? { ai: four, spec: AI4[four] } : null;
}

/**
 * GS'siz kelgan o'zgaruvchan maydon oxiridagi ma'lum «dum»lar (markirovka formatlari), tartib muhim:
 *  - (91) 4 belgi + (92) 44/88 belgi — dori, maishiy texnika va h.k.;
 *  - (92) 44/88 belgi — (91) dan keyin GS tushib qolganda;
 *  - (93) 4 belgi — suv, ichimlik, pivo, sut.
 */
const TAILS = [
  /^([\s\S]+?)(91[\s\S]{4}92[\s\S]{44})$/,
  /^([\s\S]+?)(91[\s\S]{4}92[\s\S]{88})$/,
  /^([\s\S]+?)(92[\s\S]{44})$/,
  /^([\s\S]+?)(92[\s\S]{88})$/,
  /^([\s\S]+?)(93[\s\S]{4})$/,
];

/** Rus klaviatura tartibi → lotin (USB skaner tizim tili ruscha bo'lganda «01046…21АБВ» yozadi) */
const RU_LAYOUT: Record<string, string> = {
  й: 'q', ц: 'w', у: 'e', к: 'r', е: 't', н: 'y', г: 'u', ш: 'i', щ: 'o', з: 'p', х: '[', ъ: ']',
  ф: 'a', ы: 's', в: 'd', а: 'f', п: 'g', р: 'h', о: 'j', л: 'k', д: 'l', ж: ';', э: "'",
  я: 'z', ч: 'x', с: 'c', м: 'v', и: 'b', т: 'n', ь: 'm', б: ',', ю: '.', ё: '`',
  Й: 'Q', Ц: 'W', У: 'E', К: 'R', Е: 'T', Н: 'Y', Г: 'U', Ш: 'I', Щ: 'O', З: 'P', Х: '{', Ъ: '}',
  Ф: 'A', Ы: 'S', В: 'D', А: 'F', П: 'G', Р: 'H', О: 'J', Л: 'K', Д: 'L', Ж: ':', Э: '"',
  Я: 'Z', Ч: 'X', С: 'C', М: 'V', И: 'B', Т: 'N', Ь: 'M', Б: '<', Ю: '>', Ё: '~',
  '.': '/', ',': '?', '"': '@', '№': '#', ';': '$', ':': '^', '?': '&',
};

export function fixKeyboardLayout(s: string): string {
  if (!/[Ѐ-ӿ]/.test(s)) return s;
  return Array.from(s, (ch) => RU_LAYOUT[ch] ?? ch).join('');
}

/** GTIN nazorat raqami (oxirgi raqam) — 8/12/13/14 xonali */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Skaner matnini tozalash: chekka bo'shliqlar, simbologiya belgisi, GS ko'rinishlari, klaviatura tartibi */
export function cleanScan(raw: string): string {
  let s = String(raw ?? '').replace(/[\r\n\t]/g, '').trim();
  s = s.replace(/<GS>|\{GS\}|\[GS\]|\\x1d|\\u001d|\{FNC1\}|␝|\^\]/gi, GS);
  s = s.replace(/^\][A-Za-z][0-9]/, '');
  s = fixKeyboardLayout(s);
  return s.replace(/^\u001d+/, '').replace(/\u001d+$/, '');
}

export interface Gs1Element { ai: string; value: string }

export interface Gs1Code {
  /** 14 xonali GTIN (01) */
  gtin: string;
  /** (21) seriya raqami */
  serial?: string;
  /** (17) yaroqlilik muddati — YYYY-MM-DD */
  expiry?: string;
  /** (10) partiya */
  batch?: string;
  elements: Gs1Element[];
  /** Kanonik ko'rinish: AI + qiymat, o'zgaruvchan maydondan keyin GS (\x1d) — saqlash va keyinchalik fiskal uzatish uchun */
  normalized: string;
  /** Takror sotuvni aniqlash kaliti: 01<GTIN>21<seriya>; seriya bo'lmasa — null (markirovka kodi emas) */
  key: string | null;
  /** GS ajratgichi yo'q edi — seriya chegarasi taxmin qilindi */
  guessed: boolean;
  /** gs1 — AI'li kod; short — AI'siz qisqa format (sigaret qutisi: GTIN 14 + seriya 7 + 8 belgi) */
  format: 'gs1' | 'short';
}

/** «(01)…(21)…» ko'rinishini GS'li element qatoriga aylantiradi; mos kelmasa null */
function fromBracketed(s: string): string | null {
  if (!/^\(\d{2,4}\)/.test(s)) return null;
  const parts: { ai: string; value: string }[] = [];
  const re = /\((\d{2,4})\)/g;
  let m: RegExpExecArray | null;
  let last: { ai: string; start: number } | null = null;
  while ((m = re.exec(s))) {
    // Faqat ma'lum AI qavsda — qiymat ichidagi «(…)» qiymatning o'zi
    if (!aiAt(m[1], 0) || aiAt(m[1], 0)!.ai !== m[1]) continue;
    if (last) parts.push({ ai: last.ai, value: s.slice(last.start, m.index) });
    last = { ai: m[1], start: m.index + m[0].length };
  }
  if (last) parts.push({ ai: last.ai, value: s.slice(last.start) });
  return parts.map((p) => p.ai + p.value.trim()).join(GS);
}

/** YYMMDD → YYYY-MM-DD (GS1 qoidasi: asr joriy yilga nisbatan; DD=00 — oy oxiri) */
export function gs1Date(v: string, now: Date = new Date()): string | null {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(v);
  if (!m) return null;
  const yy = Number(m[1]);
  const month = Number(m[2]);
  let day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  const cur = now.getFullYear();
  const diff = yy - (cur % 100);
  let century = Math.floor(cur / 100);
  if (diff >= 51) century -= 1;
  else if (diff <= -50) century += 1;
  const year = century * 100 + yy;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day === 0) day = last;
  if (day > last) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Skaner matnini GS1 kodi sifatida o'qiydi. Kod emas (oddiy EAN, ichki kod) yoki GTIN nazorat raqami
 * noto'g'ri bo'lsa — null.
 */
export function parseGs1(raw: string, now: Date = new Date()): Gs1Code | null {
  const cleaned = cleanScan(raw);
  if (!cleaned) return null;
  // Qavsli ko'rinishda qavs atrofidagi bo'shliqlar olib tashlanadi: «(01) 0478… (21) ABC»
  const s = (cleaned.startsWith('(') ? fromBracketed(cleaned.replace(/\s*([()])\s*/g, '$1')) : null) ?? cleaned;
  return parseElements(s, now) ?? parseShort(s);
}

function parseElements(input: string, now: Date): Gs1Code | null {
  if (!input.startsWith('01')) return null;
  let s = input;
  const elements: Gs1Element[] = [];
  let guessed = false;
  let pos = 0;
  while (pos < s.length) {
    const hit = aiAt(s, pos);
    if (!hit) break;
    const start = pos + hit.ai.length;
    let value: string;
    if ('fixed' in hit.spec) {
      value = s.slice(start, start + hit.spec.fixed);
      if (value.length < hit.spec.fixed) return elements.length ? finish(elements, guessed, now) : null;
      pos = start + hit.spec.fixed;
      if (s[pos] === GS) pos++;
    } else {
      const gs = s.indexOf(GS, start);
      if (gs >= 0) {
        value = s.slice(start, gs);
        pos = gs + 1;
      } else {
        const rest = s.slice(start);
        const max = hit.spec.max;
        const tail = rest.length > 6 ? TAILS.map((re) => re.exec(rest)).find((m) => m && m[1].length <= max) : null;
        if (tail) {
          // GS yo'q — dum oldiga ajratgich qo'yib davom etamiz (kanonik ko'rinish GS'li kod bilan bir xil bo'ladi)
          guessed = true;
          s = s.slice(0, start) + tail[1] + GS + tail[2];
          value = tail[1];
          pos = start + tail[1].length + 1;
        } else {
          value = rest.slice(0, hit.spec.max);
          if (rest.length > hit.spec.max) guessed = true;
          pos = start + value.length;
        }
      }
    }
    if (!value) return null;
    elements.push({ ai: hit.ai, value });
  }
  return finish(elements, guessed, now);
}

function finish(elements: Gs1Element[], guessed: boolean, now: Date): Gs1Code | null {
  const get = (ai: string) => elements.find((e) => e.ai === ai)?.value;
  const gtin = get('01');
  if (!gtin || !isValidGtin(gtin)) return null;
  const serial = get('21');
  const expiryRaw = get('17');
  const normalized = elements
    .map((e, i) => {
      const spec = aiAt(e.ai, 0)?.spec;
      const variable = !!spec && !('fixed' in spec) || ['402', '7003', '8005', '422', '424', '426'].includes(e.ai);
      return e.ai + e.value + (variable && i < elements.length - 1 ? GS : '');
    })
    .join('');
  return {
    gtin,
    serial,
    expiry: expiryRaw ? gs1Date(expiryRaw, now) ?? undefined : undefined,
    batch: get('10'),
    elements,
    normalized,
    key: serial ? `01${gtin}21${serial}` : null,
    guessed,
    format: 'gs1',
  };
}

/** AI'siz qisqa format (sigaret qutisi): GTIN 14 + seriya 7 + 8 belgi tekshiruv (jami 29) */
function parseShort(s: string): Gs1Code | null {
  const m = /^(\d{14})([\x21-\x7E]{7})([\x21-\x7E]{8})$/.exec(s);
  if (!m || !isValidGtin(m[1])) return null;
  return {
    gtin: m[1],
    serial: m[2],
    elements: [{ ai: '01', value: m[1] }, { ai: '21', value: m[2] }],
    normalized: s,
    key: `01${m[1]}21${m[2]}`,
    guessed: false,
    format: 'short',
  };
}

/** Markirovka kodi (GTIN + seriya) — oddiy GS1 shtrix-kod emas */
export function isMarkingCode(c: Gs1Code | null): c is Gs1Code & { serial: string; key: string } {
  return !!c && !!c.serial && !!c.key;
}

/**
 * GTIN bo'yicha omborda qidiriladigan shtrix-kod ko'rinishlari: 14 xonali, EAN-13 (boshida 0),
 * UPC-A (00), EAN-8 (000000).
 */
export function gtinBarcodes(gtin: string): string[] {
  const out = [gtin];
  if (gtin.startsWith('0')) out.push(gtin.slice(1));
  if (gtin.startsWith('00')) out.push(gtin.slice(2));
  if (gtin.startsWith('000000')) out.push(gtin.slice(6));
  return out;
}

/** Mahsulot formasidagi shtrix-kod maydoni uchun: EAN-13 (GTIN boshida 0 bo'lsa), aks holda GTIN-14 */
export function gtinToBarcode(gtin: string): string {
  return gtin.startsWith('0') ? gtin.slice(1) : gtin;
}

/** Skanerlangan matn: GS1 kod bo'lsa — mahsulot shtrix-kodi (EAN), aks holda o'zi */
export function scanToBarcode(raw: string): string {
  const c = parseGs1(raw);
  return c ? gtinToBarcode(c.gtin) : String(raw ?? '').trim();
}

/** Mahalliy sana YYYY-MM-DD (muddatni bugungi kun bilan solishtirish uchun) */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Muddati o'tganmi: muddat kuni oxirigacha yaroqli */
export function isExpiredOn(expiry: string | undefined, today: string = localDateKey()): boolean {
  return !!expiry && expiry < today;
}

/** Chek va ro'yxat uchun qisqa ko'rinish: seriya (kriptodum ko'rsatilmaydi) */
export function markingLabel(code: string): string {
  const c = parseGs1(code);
  if (c?.serial) return c.serial;
  const s = cleanScan(code);
  return s.length > 16 ? `…${s.slice(-12)}` : s;
}
