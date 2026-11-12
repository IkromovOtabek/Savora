/**
 * Excel (.xlsx) va CSV faylini jadval qatorlariga o'qish — tashqi kutubxonasiz.
 *
 * .xlsx — bu ZIP ichidagi XML fayllar: ZIP markaziy katalogi o'qiladi, kerakli fayllar
 * `DecompressionStream('deflate-raw')` bilan ochiladi (brauzer va Node 21+ da bor), XML esa
 * oddiy regex bilan tahlil qilinadi (faqat varaq nomlari, umumiy satrlar va kataklar kerak).
 * Fayl foydalanuvchi brauzerida o'qiladi — serverga faqat tayyor qatorlar (JSON) boradi.
 *
 * Eski .xls (BIFF) qo'llab-quvvatlanmaydi — `XlsxReadError('xls')`.
 */

export type Cell = string | number | null;
export interface SheetData {
  name: string;
  rows: Cell[][];
}

export type XlsxErrorCode = 'xls' | 'corrupt' | 'tooBig' | 'empty' | 'unsupported';

export class XlsxReadError extends Error {
  constructor(public code: XlsxErrorCode) {
    super(`xlsx: ${code}`);
    this.name = 'XlsxReadError';
  }
}

export interface ReadLimits {
  /** Har varaqdan ko'pi bilan shuncha qator (sarlavha bilan) */
  maxRows?: number;
  /** Ko'pi bilan shuncha ustun */
  maxCols?: number;
}

const DEFAULT_MAX_ROWS = 5001;
const DEFAULT_MAX_COLS = 60;
/** ZIP ichidagi bitta XML faylning ochilgan hajmi chegarasi (zip-bomba himoyasi) */
const MAX_ENTRY_BYTES = 80 * 1024 * 1024;

export type FileKind = 'xlsx' | 'xls' | 'csv';

/** Fayl turini birinchi baytlardan aniqlash (kengaytmaga ishonilmaydi) */
export function detectFileKind(bytes: Uint8Array): FileKind {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'xlsx';
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'xls';
  return 'csv';
}

// ───────────────────────── ZIP ─────────────────────────

interface ZipEntry {
  method: number;
  compSize: number;
  size: number;
  offset: number;
}

function u16(b: Uint8Array, o: number) {
  return b[o] | (b[o + 1] << 8);
}
function u32(b: Uint8Array, o: number) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

function listZip(b: Uint8Array): Map<string, ZipEntry> {
  // End of central directory — oxiridan qidiriladi (izoh 64 KB gacha bo'lishi mumkin)
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new XlsxReadError('corrupt');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  if (p === 0xffffffff) throw new XlsxReadError('unsupported'); // ZIP64
  const decoder = new TextDecoder();
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw new XlsxReadError('corrupt');
    const method = u16(b, p + 10);
    const compSize = u32(b, p + 20);
    const size = u32(b, p + 24);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    const offset = u32(b, p + 42);
    const name = decoder.decode(b.subarray(p + 46, p + 46 + nameLen));
    out.set(name.replace(/^\/+/, ''), { method, compSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export type InflateRaw = (data: Uint8Array) => Promise<Uint8Array>;

const defaultInflate: InflateRaw = async (data) => {
  if (typeof DecompressionStream === 'undefined') throw new XlsxReadError('unsupported');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

async function readEntry(b: Uint8Array, e: ZipEntry, inflate: InflateRaw): Promise<Uint8Array> {
  if (e.size > MAX_ENTRY_BYTES) throw new XlsxReadError('tooBig');
  const p = e.offset;
  if (p + 30 > b.length || u32(b, p) !== 0x04034b50) throw new XlsxReadError('corrupt');
  const start = p + 30 + u16(b, p + 26) + u16(b, p + 28);
  const data = b.subarray(start, start + e.compSize);
  if (data.length !== e.compSize) throw new XlsxReadError('corrupt');
  if (e.method === 0) return data;
  if (e.method !== 8) throw new XlsxReadError('unsupported');
  const out = await inflate(data);
  if (out.length > MAX_ENTRY_BYTES) throw new XlsxReadError('tooBig');
  return out;
}

// ───────────────────────── XML ─────────────────────────

/** XML belgilari va OOXML `_x000D_` ekranlari */
export function decodeXml(s: string): string {
  return s
    .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) => {
      switch (e) {
        case 'lt': return '<';
        case 'gt': return '>';
        case 'amp': return '&';
        case 'quot': return '"';
        case 'apos': return "'";
        default: {
          const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
        }
      }
    })
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[m[1]] = decodeXml(m[2] ?? m[3] ?? '');
  }
  return out;
}

/** Element ichidagi barcha <t> matnlari (rich text bo'laklari), fonetik <rPh> tashlanadi */
function textOf(xml: string): string {
  const clean = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
  let out = '';
  for (const m of clean.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)) out += m[1];
  return decodeXml(out);
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)) out.push(textOf(m[1] ?? ''));
  return out;
}

/** "AB12" → ustun indeksi 27 (0 dan) */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function cellValue(a: Record<string, string>, inner: string, shared: string[]): Cell {
  const t = a.t ?? 'n';
  if (t === 'inlineStr') {
    const is = /<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(inner);
    return is ? textOf(is[1]) : null;
  }
  const vm = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
  if (!vm) return null;
  const v = decodeXml(vm[1]);
  switch (t) {
    case 's': return shared[Number(v)] ?? null;
    case 'str':
    case 'd': return v;
    case 'b': return v === '1' ? 'TRUE' : 'FALSE';
    case 'e': return null;
    default: {
      const n = Number(v);
      return v.trim() !== '' && Number.isFinite(n) ? n : v;
    }
  }
}

export function parseSheetXml(xml: string, shared: string[], limits: ReadLimits = {}): Cell[][] {
  const maxRows = limits.maxRows ?? DEFAULT_MAX_ROWS;
  const maxCols = limits.maxCols ?? DEFAULT_MAX_COLS;
  const rows: Cell[][] = [];
  const data = /<(?:\w+:)?sheetData\b[^>]*>([\s\S]*?)<\/(?:\w+:)?sheetData>/.exec(xml)?.[1] ?? '';
  let rowNo = -1;
  for (const rm of data.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const ra = attrs(rm[1]);
    rowNo = ra.r ? Number(ra.r) - 1 : rowNo + 1;
    if (!Number.isInteger(rowNo) || rowNo < 0) continue;
    if (rowNo >= maxRows) break;
    const cells: Cell[] = [];
    let col = -1;
    for (const cm of (rm[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ca = attrs(cm[1]);
      col = ca.r ? colIndex(ca.r) : col + 1;
      if (col < 0 || col >= maxCols) continue;
      const v = cellValue(ca, cm[2] ?? '', shared);
      if (v === null || v === '') continue;
      while (cells.length < col) cells.push(null);
      cells[col] = v;
    }
    while (rows.length < rowNo) rows.push([]);
    rows[rowNo] = cells;
  }
  while (rows.length && rows[rows.length - 1].every((c) => c === null || c === '')) rows.pop();
  return rows;
}

/** Varaq yo'li: workbook.xml.rels dagi Target ("worksheets/sheet1.xml" yoki "/xl/worksheets/sheet1.xml") */
function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ['xl'];
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

export async function readXlsx(
  input: ArrayBuffer | Uint8Array,
  limits: ReadLimits = {},
  inflate: InflateRaw = defaultInflate,
): Promise<SheetData[]> {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (detectFileKind(b) === 'xls') throw new XlsxReadError('xls');
  const zip = listZip(b);
  const decoder = new TextDecoder();
  const text = async (path: string) => {
    const e = zip.get(path);
    return e ? decoder.decode(await readEntry(b, e, inflate)) : null;
  };

  const workbook = await text('xl/workbook.xml');
  if (workbook === null) throw new XlsxReadError('corrupt');
  const rels = (await text('xl/_rels/workbook.xml.rels')) ?? '';
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    if (a.Id && a.Target) relMap.set(a.Id, resolveTarget(a.Target));
  }
  const sharedXml = await text('xl/sharedStrings.xml');
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];

  const sheets: SheetData[] = [];
  let i = 0;
  for (const m of workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
    i++;
    const a = attrs(m[1]);
    const relId = Object.entries(a).find(([k]) => /(^|:)id$/.test(k))?.[1];
    const path = (relId && relMap.get(relId)) || `xl/worksheets/sheet${i}.xml`;
    const xml = await text(path);
    if (xml === null) continue;
    sheets.push({ name: a.name || `Sheet${i}`, rows: parseSheetXml(xml, shared, limits) });
  }
  if (sheets.length === 0) throw new XlsxReadError('empty');
  return sheets;
}

// ───────────────────────── CSV ─────────────────────────

/** UTF-8 (BOM bilan/siz); UTF-8 bo'lmasa — Windows-1251 (rus Excel'ining CSV'si) */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

/** Ajratuvchi: birinchi qatordagi (qo'shtirnoqdan tashqari) `;`, `,`, tab — eng ko'pi */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, 4000).split(/\r?\n/)[0] ?? '';
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : ',';
}

export function readCsv(text: string, limits: ReadLimits = {}): Cell[][] {
  const maxRows = limits.maxRows ?? DEFAULT_MAX_ROWS;
  const maxCols = limits.maxCols ?? DEFAULT_MAX_COLS;
  const delim = detectDelimiter(text);
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const pushField = () => {
    if (row.length < maxCols) row.push(field.trim() === '' ? null : field.trim());
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row.some((c) => c !== null) ? row : []);
    row = [];
  };
  while (i < text.length && rows.length < maxRows) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false;
      } else field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field.trim() === '') { quoted = true; field = ''; }
    else if (ch === delim) pushField();
    else if (ch === '\n') pushRow();
    else if (ch !== '\r') field += ch;
    i++;
  }
  if (field !== '' || row.length > 0) pushRow();
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
  return rows.map((r) => {
    let end = r.length;
    while (end > 0 && r[end - 1] === null) end--;
    return r.slice(0, end);
  });
}

/** Faylni turiga qarab o'qish. CSV — bitta varaq. */
export async function readSpreadsheet(input: ArrayBuffer | Uint8Array, fileName = '', limits: ReadLimits = {}): Promise<SheetData[]> {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length === 0) throw new XlsxReadError('empty');
  const kind = detectFileKind(b);
  if (kind === 'xls') throw new XlsxReadError('xls');
  if (kind === 'xlsx') return readXlsx(b, limits);
  const rows = readCsv(decodeText(b), limits);
  if (rows.length === 0) throw new XlsxReadError('empty');
  return [{ name: fileName.replace(/\.[^.]+$/, '') || 'CSV', rows }];
}
