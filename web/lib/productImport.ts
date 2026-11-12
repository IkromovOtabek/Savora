/**
 * Excel/CSV'dan mahsulot importi — ustunlarni moslash va qatorlarni tekshirish.
 * Client (oldindan ko'rish) va server action (haqiqiy tekshiruv) bir xil funksiyalarni ishlatadi;
 * bu fayl DB/mongoose import qilmaydi.
 */
import { PRODUCT_UNITS, productFieldsFor, type ProductFieldKey, type ProductUnit } from './businessTypes';
import { parseQty } from './qty';
import { PRODUCT_FIELD_MAX_LEN, WARRANTY_MAX_MONTHS, parseExpiryDate } from './productFields';
import { normalizeCatalogName } from './productCatalog';
import type { Cell } from './xlsxRead';

export const IMPORT_FIELDS = [
  'name',
  'barcode',
  'imei',
  'purchasePrice',
  'salePrice',
  'wholesalePrice',
  'quantity',
  'category',
  'brand',
  'unit',
  'color',
  'size',
  'warrantyMonths',
  'batchNumber',
  'expiryDate',
  'oemCode',
  'notes',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Bitta server chaqiruvidagi qatorlar */
export const IMPORT_BATCH_SIZE = 200;
/** Bitta fayldan ko'pi bilan shuncha mahsulot */
export const IMPORT_MAX_ROWS = 5000;
/** Qo'shimcha ustunlar: mahsulotda ko'pi bilan, nom va qiymat uzunligi */
export const EXTRA_FIELDS_MAX = 20;
export const EXTRA_NAME_MAX = 40;
export const EXTRA_VALUE_MAX = 200;

const NAME_MAX = 200;
const BARCODE_MAX = 64;
const NOTES_MAX = 1000;
const CATALOG_NAME_MAX = 60; // BRAND_NAME_MAX, CATEGORY_NAME_MAX (modellar bilan bir xil)

export type DuplicateMode = 'skip' | 'restock';

export interface ImportContext {
  /** Telefon do'koni: IMEI ustuni bor; IMEI'siz qator ham qo'shiladi (imeiPending — keyin kiritiladi) */
  phoneShop: boolean;
  businessType?: string;
}

const TYPE_FIELD_KEYS = new Set<string>(['category', 'unit', 'size', 'color', 'warrantyMonths', 'batchNumber', 'expiryDate', 'oemCode']);

/** Shu do'kon uchun moslash ro'yxatidagi maydonlar (yo'nalishga xos maydonlar faqat o'z yo'nalishida) */
export function importFieldsFor(ctx: ImportContext): ImportField[] {
  const typeFields = new Set<string>(productFieldsFor(ctx.businessType).map((s) => s.key));
  return IMPORT_FIELDS.filter((f) => {
    if (f === 'imei') return ctx.phoneShop;
    if (f === 'color' || f === 'category') return true;
    if (TYPE_FIELD_KEYS.has(f)) return typeFields.has(f);
    return true;
  });
}

/** Yo'nalish bo'yicha majburiy maydonlar (masalan, dorixonada yaroqlilik muddati) */
function requiredFields(ctx: ImportContext): Set<ProductFieldKey> {
  return new Set(productFieldsFor(ctx.businessType).filter((s) => s.required).map((s) => s.key));
}

// ───────────────────────── Sarlavhalarni tanish ─────────────────────────

/** Sarlavha → solishtirish kaliti: kichik harf, qavs ichi va tutuq belgilari olib tashlanadi */
export function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/ё/g, 'е')
    .replace(/[ʻʼ'`‘’]/g, '')
    .replace(/[^a-zа-яўқғҳ0-9]+/g, '');
}

/** Turli nomlar (o'zbek lotin/kirill, rus, ingliz) — normalizeHeader ko'rinishida */
const SYNONYMS: Record<ImportField, string[]> = {
  name: [
    'nomi', 'nom', 'nomlanishi', 'mahsulot', 'mahsulotnomi', 'maxsulot', 'maxsulotnomi', 'tovar', 'tovarnomi',
    'номи', 'маҳсулот', 'маҳсулотноми', 'товарноми',
    'наименование', 'наименованиетовара', 'название', 'названиетовара', 'товар', 'номенклатура', 'продукт',
    'name', 'productname', 'product', 'item', 'itemname', 'title',
  ],
  barcode: [
    'shtrixkod', 'shtrixkodi', 'shtrix', 'shtrihkod', 'barkod', 'штрихкод', 'штрихкоды', 'штрихкоди', 'штрих',
    'barcode', 'ean', 'ean13', 'upc', 'gtin',
  ],
  imei: ['imei', 'imei1', 'imeikod', 'имей', 'имеи'],
  purchasePrice: [
    'kelishnarxi', 'kelishnarx', 'kelish', 'tannarx', 'tannarxi', 'olishnarxi', 'xaridnarxi', 'sotibolishnarxi', 'kirimnarxi',
    'келишнархи', 'таннарх', 'таннархи',
    'закупочнаяцена', 'ценазакупки', 'закупка', 'закуп', 'себестоимость', 'входящаяцена', 'приходнаяцена',
    'cost', 'costprice', 'purchaseprice', 'buyprice',
  ],
  salePrice: [
    'sotuvnarxi', 'sotuvnarx', 'sotishnarxi', 'narx', 'narxi', 'chakananarx', 'chakananarxi', 'sotuv',
    'сотувнархи', 'нарх', 'нархи',
    'цена', 'ценапродажи', 'розничнаяцена', 'розница', 'ценарозничная', 'продажа',
    'price', 'saleprice', 'retailprice', 'sellprice', 'sellingprice',
  ],
  wholesalePrice: ['ulgurjinarx', 'ulgurjinarxi', 'ulgurji', 'optom', 'optomnarx', 'улгуржи', 'оптоваяцена', 'ценаоптовая', 'опт', 'wholesale', 'wholesaleprice'],
  quantity: [
    'soni', 'son', 'miqdori', 'miqdor', 'qoldiq', 'qoldigi', 'omborda', 'сони', 'миқдори', 'қолдиқ',
    'количество', 'колво', 'кол', 'остаток', 'остатки', 'наличие',
    'qty', 'quantity', 'count', 'stock', 'onhand',
  ],
  category: ['kategoriya', 'turkum', 'toifa', 'guruh', 'категория', 'туркум', 'группа', 'раздел', 'category', 'group'],
  brand: ['brend', 'brand', 'marka', 'ishlabchiqaruvchi', 'бренд', 'марка', 'производитель', 'manufacturer', 'vendor'],
  unit: ['birlik', 'olchovbirligi', 'olchov', 'ўлчовбирлиги', 'бирлик', 'едизм', 'единицаизмерения', 'единица', 'unit', 'uom'],
  color: ['rang', 'rangi', 'ранг', 'ранги', 'цвет', 'color', 'colour'],
  size: ['olcham', 'olchami', 'razmer', 'ўлчам', 'размер', 'size'],
  warrantyMonths: ['kafolat', 'kafolatoy', 'kafolatmuddati', 'garantiya', 'кафолат', 'гарантия', 'гарантиямес', 'warranty'],
  batchNumber: ['seriya', 'seriyaraqami', 'partiya', 'серия', 'партия', 'номерпартии', 'batch', 'lot', 'batchnumber'],
  expiryDate: [
    'yaroqlilikmuddati', 'yaroqlilik', 'muddati', 'yaroqlimuddat', 'яроқлиликмуддати',
    'срокгодности', 'годендо', 'срок', 'expiry', 'expirydate', 'bestbefore', 'exp',
  ],
  oemCode: ['oem', 'oemkod', 'oemcode', 'oemnomer', 'оем', 'оемкод'],
  notes: ['izoh', 'izohlar', 'tavsif', 'изоҳ', 'примечание', 'комментарий', 'описание', 'note', 'notes', 'comment', 'description'],
};

/** Sarlavha qaysi maydonga mos: 3 — aynan, 2 — boshlanishi, 1 — ichida (≥5 harfli sinonim) */
export function guessField(header: unknown, allowed: readonly ImportField[]): { field: ImportField; score: number } | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  let best: { field: ImportField; score: number; len: number } | null = null;
  for (const field of allowed) {
    for (const syn of SYNONYMS[field]) {
      let score = 0;
      if (h === syn) score = 3;
      else if (syn.length >= 3 && h.startsWith(syn)) score = 2;
      else if (syn.length >= 5 && h.includes(syn)) score = 1;
      if (!score) continue;
      // Teng ballda — uzunroq (aniqroq) sinonim yutadi: «kelishnarxi» > «narx»
      if (!best || score > best.score || (score === best.score && syn.length > best.len)) {
        best = { field, score, len: syn.length };
      }
    }
  }
  return best && { field: best.field, score: best.score };
}

export type ColumnTarget =
  | { type: 'skip' }
  | { type: 'field'; field: ImportField }
  | { type: 'extra'; name: string };

/** Qo'shimcha ustun nomi: chetlari kesiladi, bo'shliqlar bittaga, uzunligi chegaralanadi */
export function normalizeExtraName(raw: unknown): string {
  return normalizeCatalogName(raw).slice(0, EXTRA_NAME_MAX);
}

/** Tartib raqami ustunlari («№», «№ п/п», «T/r», «#») — mahsulot ma'lumoti emas */
const ROW_NUMBER_HEADERS = new Set(['', 'n', 'no', 'nn', 'пп', 'нпп', 'npp', 'tr', 'тр']);

/**
 * Har ustun uchun avtomatik moslash. Har maydon bitta ustunga — eng yuqori balli yutadi;
 * tanilmagan (va sarlavhasi bor) ustunlar — qo'shimcha ustun; sarlavhasiz va tartib raqami
 * ustunlari — o'tkaziladi.
 */
export function autoMapColumns(headers: readonly Cell[], allowed: readonly ImportField[]): ColumnTarget[] {
  const guesses = headers.map((h) => guessField(h, allowed));
  const taken = new Map<ImportField, number>();
  guesses.forEach((g, i) => {
    if (!g) return;
    const prev = taken.get(g.field);
    if (prev === undefined || g.score > guesses[prev]!.score) taken.set(g.field, i);
  });
  const owner = new Map([...taken].map(([f, i]) => [i, f]));
  return headers.map((h, i) => {
    const f = owner.get(i);
    if (f) return { type: 'field', field: f };
    const name = normalizeExtraName(h);
    return name && !ROW_NUMBER_HEADERS.has(normalizeHeader(h)) ? { type: 'extra', name } : { type: 'skip' };
  });
}

/** Sarlavha qatori: dastlabki 15 qatordan eng ko'p maydon tanilgani; topilmasa — birinchi to'ldirilgan qator */
export function detectHeaderRow(rows: readonly Cell[][], allowed: readonly ImportField[]): number {
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const fields = new Set<ImportField>();
    for (const c of rows[i] ?? []) {
      if (typeof c !== 'string') continue;
      const g = guessField(c, allowed);
      if (g) fields.add(g.field);
    }
    if (fields.size > bestScore) { best = i; bestScore = fields.size; }
  }
  if (best >= 0) return best;
  const first = rows.findIndex((r) => r.filter((c) => c !== null && c !== '').length >= 2);
  return first >= 0 ? first : 0;
}

// ───────────────────────── Qatorlarni yig'ish ─────────────────────────

/** Qo'lda qo'shilgan ustun: barcha qatorlarga bir xil qiymat */
export interface ConstColumn {
  target: Exclude<ColumnTarget, { type: 'skip' }>;
  value: string;
}

/** Serverga yuboriladigan xom qator (Excel'dagi qiymatlar, son bo'lsa — son) */
export interface RawImportRow {
  /** Excel'dagi qator raqami (1 dan) */
  line: number;
  values: Partial<Record<ImportField, string | number>>;
  extra: { name: string; value: string | number }[];
}

function isEmpty(c: Cell | undefined): boolean {
  return c === null || c === undefined || (typeof c === 'string' && c.trim() === '');
}

export function buildRawRows(
  rows: readonly Cell[][],
  headerRow: number,
  mapping: readonly ColumnTarget[],
  constants: readonly ConstColumn[] = [],
): RawImportRow[] {
  const out: RawImportRow[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const cells = rows[r] ?? [];
    const raw: RawImportRow = { line: r + 1, values: {}, extra: [] };
    let filled = false;
    mapping.forEach((t, i) => {
      const c = cells[i];
      if (t.type === 'skip' || isEmpty(c)) return;
      filled = true;
      if (t.type === 'field') {
        // Bir maydonga ikki ustun moslangan bo'lsa — birinchi to'ldirilgani
        if (raw.values[t.field] === undefined) raw.values[t.field] = c as string | number;
      } else if (t.name) {
        raw.extra.push({ name: t.name, value: c as string | number });
      }
    });
    if (!filled) continue;
    for (const k of constants) {
      const v = k.value.trim();
      if (!v) continue;
      if (k.target.type === 'field') {
        if (raw.values[k.target.field] === undefined) raw.values[k.target.field] = v;
      } else if (k.target.name && !raw.extra.some((e) => e.name === (k.target as { name: string }).name)) {
        raw.extra.push({ name: k.target.name, value: v });
      }
    }
    out.push(raw);
  }
  return out;
}

// ───────────────────────── Qiymatlarni o'qish ─────────────────────────

/** Narx: «12 500», «12,500.00», «12.500», «12500 so'm», Excel soni. Butun so'mga yaxlitlanadi. */
export function parseMoney(v: string | number | undefined): number | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v < 1e15 ? Math.round(v) : null;
  let s = v.replace(/[\s  ]/g, '').toLowerCase();
  s = s.replace(/(so[ʻʼ'`‘’]?m|сўм|сум|uzs|sum)\.?$/u, '');
  if (s === '' || s === '-') return undefined;
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    const thou = dec === ',' ? '.' : ',';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    // «12.500» / «1,250,000» — minglik ajratuvchi; aks holda kasr
    const thousands = new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(s);
    s = thousands ? s.split(sep).join('') : s.replace(sep, '.');
  }
  const n = Number(s);
  return Number.isFinite(n) && n < 1e15 ? Math.round(n) : null;
}

const UNIT_SYNONYMS: Record<string, ProductUnit> = {
  dona: 'dona', ta: 'dona', дона: 'dona', шт: 'dona', штук: 'dona', штука: 'dona', штуки: 'dona', pcs: 'dona', pc: 'dona', ед: 'dona',
  kg: 'kg', кг: 'kg', kilogramm: 'kg', kilogram: 'kg', килограмм: 'kg',
  g: 'g', gr: 'g', gramm: 'g', gram: 'g', г: 'g', гр: 'g', грамм: 'g',
  m: 'm', metr: 'm', meter: 'm', м: 'm', метр: 'm',
  m2: 'm2', 'm²': 'm2', кв: 'm2', квм: 'm2', м2: 'm2', 'м²': 'm2', sqm: 'm2',
  l: 'l', litr: 'l', liter: 'l', lt: 'l', л: 'l', литр: 'l',
  qop: 'qop', қоп: 'qop', мешок: 'qop', bag: 'qop',
  quti: 'quti', қути: 'quti', коробка: 'quti', кор: 'quti', box: 'quti', ящик: 'quti',
  paket: 'paket', пакет: 'paket', упак: 'paket', упаковка: 'paket', пачка: 'paket', pack: 'paket',
};

export function parseUnit(v: string | number | undefined): ProductUnit | null | undefined {
  if (v === undefined) return undefined;
  const s = String(v).toLowerCase().replace(/[\s.]/g, '');
  if (!s) return undefined;
  if ((PRODUCT_UNITS as readonly string[]).includes(s)) return s as ProductUnit;
  return UNIT_SYNONYMS[s] ?? null;
}

/** Yaroqlilik muddati → "YYYY-MM-DD". Excel sanasi (son), «31.03.2027», «31/03/2027», «2027-03-31», «31.03.27» */
export function parseImportDate(v: string | number | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') {
    // Excel seriya raqami: 1 = 1900-01-01 (1900-yil kabisa xatosi bilan — shuning uchun 1899-12-30 dan)
    if (!(v >= 20000 && v <= 80000)) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  let s = v.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(s)) s = s.slice(0, 10);
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    s = `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${y}`;
  } else if ((m = /^(\d{4})[./](\d{1,2})[./](\d{1,2})$/.exec(s))) {
    s = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  const d = parseExpiryDate(s);
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Kafolat (oy): «12», «12 oy», «1 yil», «2 года» */
export function parseWarranty(v: string | number | undefined): number | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= WARRANTY_MAX_MONTHS ? v : null;
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  const m = /^(\d{1,3})\s*([a-zа-яўқғҳ.]*)$/u.exec(s);
  if (!m) return null;
  let n = Number(m[1]);
  if (/^(yil|йил|год|года|лет|year|years|г\.?)$/.test(m[2])) n *= 12;
  else if (m[2] && !/^(oy|ой|мес|месяц|месяца|месяцев|мес\.|month|months|m)$/.test(m[2])) return null;
  return n <= WARRANTY_MAX_MONTHS ? n : null;
}

/** Kod (shtrix/IMEI): Excel soni bo'lsa ham butun raqamlar; bo'shliqlarsiz */
export function parseCode(v: string | number | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = typeof v === 'number' ? (Number.isInteger(v) ? BigInt(v).toString() : String(v)) : v;
  const out = s.replace(/[\s ]/g, '');
  return out || undefined;
}

function text(v: string | number | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = normalizeCatalogName(typeof v === 'number' ? String(v) : v);
  return s || undefined;
}

// ───────────────────────── Qatorni tekshirish ─────────────────────────

export type ImportErrorCode =
  | 'nameRequired'
  | 'tooLong'
  | 'priceInvalid'
  | 'qtyInvalid'
  | 'qtyZero'
  | 'imeiInvalid'
  | 'unitInvalid'
  | 'warrantyInvalid'
  | 'dateInvalid'
  | 'required';

export interface ImportIssue {
  field?: ImportField | 'extra';
  code: ImportErrorCode;
}

export interface ParsedImportRow {
  line: number;
  name: string;
  barcode?: string;
  imei?: string;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice?: number;
  /** Berilgan bo'lsa — sanaladigan tovar (trackQuantity); yo'q — yagona dona */
  quantity?: number;
  category?: string;
  brand?: string;
  unit?: ProductUnit;
  color?: string;
  size?: string;
  warrantyMonths?: number;
  batchNumber?: string;
  /** YYYY-MM-DD */
  expiryDate?: string;
  oemCode?: string;
  notes?: string;
  extra: { name: string; value: string }[];
}

export type ParseRowResult =
  | { ok: true; row: ParsedImportRow }
  | { ok: false; line: number; name?: string; issues: ImportIssue[] };

export function parseImportRow(raw: RawImportRow, ctx: ImportContext): ParseRowResult {
  const allowed = new Set<ImportField>(importFieldsFor(ctx));
  const v = (f: ImportField) => (allowed.has(f) ? raw.values[f] : undefined);
  const issues: ImportIssue[] = [];
  const bad = (field: ImportIssue['field'], code: ImportErrorCode) => issues.push({ field, code });

  const name = text(v('name'));
  if (!name) bad('name', 'nameRequired');
  else if (name.length > NAME_MAX) bad('name', 'tooLong');

  const row: ParsedImportRow = { line: raw.line, name: name ?? '', purchasePrice: 0, salePrice: 0, extra: [] };

  const barcode = parseCode(v('barcode'));
  if (barcode && barcode.length > BARCODE_MAX) bad('barcode', 'tooLong');
  else if (barcode) row.barcode = barcode;

  // Telefon do'koni: IMEI bo'lsa — tekshiriladi; bo'lmasa tovar IMEI'siz qo'shiladi (keyin kiritiladi)
  const imei = parseCode(v('imei'))?.toUpperCase();
  if (ctx.phoneShop && imei) {
    if (imei.length < 10 || imei.length > 20) bad('imei', 'imeiInvalid');
    else row.imei = imei;
  }

  for (const f of ['purchasePrice', 'salePrice', 'wholesalePrice'] as const) {
    const p = parseMoney(v(f));
    if (p === null) bad(f, 'priceInvalid');
    else if (p !== undefined) row[f] = p;
  }

  const unit = parseUnit(v('unit'));
  if (unit === null) bad('unit', 'unitInvalid');
  else if (unit) row.unit = unit;

  // IMEI'li tovar — doim bitta dona; aks holda «Soni» ustuni bo'lsa sanaladigan tovar
  const qtyRaw = v('quantity');
  if (!row.imei && qtyRaw !== undefined) {
    const n = typeof qtyRaw === 'number' ? qtyRaw : Number(String(qtyRaw).replace(/[\s ]/g, '').replace(',', '.'));
    const q = parseQty(qtyRaw, row.unit);
    if (n === 0) bad('quantity', 'qtyZero');
    else if (q === null) bad('quantity', 'qtyInvalid');
    else row.quantity = q;
  }

  for (const f of ['category', 'brand', 'color', 'size', 'batchNumber', 'oemCode'] as const) {
    let s = text(v(f));
    if (!s) continue;
    if (f === 'batchNumber' || f === 'oemCode') s = s.toUpperCase();
    const max = f === 'category' || f === 'brand' ? CATALOG_NAME_MAX : PRODUCT_FIELD_MAX_LEN[f] ?? 60;
    if (s.length > max) bad(f, 'tooLong');
    else row[f] = s;
  }

  const w = parseWarranty(v('warrantyMonths'));
  if (w === null) bad('warrantyMonths', 'warrantyInvalid');
  else if (w !== undefined) row.warrantyMonths = w;

  const exp = parseImportDate(v('expiryDate'));
  if (exp === null) bad('expiryDate', 'dateInvalid');
  else if (exp) row.expiryDate = exp;

  const notes = typeof v('notes') === 'number' ? String(v('notes')) : (v('notes') as string | undefined)?.trim();
  if (notes && notes.length > NOTES_MAX) bad('notes', 'tooLong');
  else if (notes) row.notes = notes;

  for (const key of requiredFields(ctx)) {
    if (allowed.has(key as ImportField) && row[key as keyof ParsedImportRow] === undefined && !issues.some((i) => i.field === key)) {
      bad(key as ImportField, 'required');
    }
  }

  // Qo'shimcha ustunlar: bo'shlari tashlanadi, bir xil nom — oxirgisi, ko'pi bilan EXTRA_FIELDS_MAX
  const extra = new Map<string, string>();
  for (const e of raw.extra) {
    const n = normalizeExtraName(e.name);
    const val = (typeof e.value === 'number' ? String(e.value) : String(e.value ?? '')).trim();
    if (!n || !val) continue;
    if (val.length > EXTRA_VALUE_MAX) { bad('extra', 'tooLong'); continue; }
    extra.set(n, val);
  }
  row.extra = [...extra].slice(0, EXTRA_FIELDS_MAX).map(([n, val]) => ({ name: n, value: val }));

  if (issues.length) return { ok: false, line: raw.line, name, issues };
  return { ok: true, row };
}

/** Takrorni aniqlash kaliti: telefon do'konida IMEI, boshqalarda shtrix-kod (yo'q bo'lsa — takror emas) */
export function duplicateKey(row: ParsedImportRow, ctx: ImportContext): string | undefined {
  const code = ctx.phoneShop ? row.imei : row.barcode;
  return code ? code.replace(/\s/g, '').toUpperCase() : undefined;
}

/** Telefon do'konida IMEI'siz qator — tovar «IMEI kiritilmagan» (imeiPending) bo'lib qo'shiladi */
export function isImeiPending(row: ParsedImportRow, ctx: ImportContext): boolean {
  return ctx.phoneShop && !row.imei;
}

/**
 * Mahsulot formasidagi qo'shimcha ustunlar (hidden input `extraFields` — JSON [{name, value}]).
 * Bo'sh nom/qiymatli qatorlar tashlanadi, bir xil nom — oxirgisi. Noto'g'ri bo'lsa null.
 */
export function parseExtraFieldsJson(raw: unknown): { name: string; value: string }[] | null {
  let arr: unknown;
  try {
    arr = JSON.parse(String(raw ?? '[]'));
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || arr.length > EXTRA_FIELDS_MAX * 2) return null;
  const out = new Map<string, string>();
  for (const item of arr) {
    if (!item || typeof item !== 'object') return null;
    const { name, value } = item as { name?: unknown; value?: unknown };
    if (typeof name !== 'string' || typeof value !== 'string') return null;
    const n = normalizeCatalogName(name);
    const v = value.trim();
    if (!n || !v) continue;
    if (n.length > EXTRA_NAME_MAX || v.length > EXTRA_VALUE_MAX) return null;
    out.set(n, v);
  }
  if (out.size > EXTRA_FIELDS_MAX) return null;
  return [...out].map(([name, value]) => ({ name, value }));
}
