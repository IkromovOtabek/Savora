import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMxik, isMxikCode, mxikLevels, normalizeMxikQuery, parseMxikInput, toMxikItem } from '@/lib/mxik';
import { clearMxikCache, searchMxikCatalog } from '@/lib/mxikCatalog';
import { autoMapColumns, importFieldsFor, parseImportRow } from '@/lib/productImport';

const CODE = '00901001001048019';
// tasnif.soliq.uz /elasticsearch/search javobidagi yozuv (2026-11-18 holati, qisqartirilgan)
const RAW = {
  mxikCode: CODE,
  name: 'Майдаланган (кукунсимон) кофе: Maccoffee, pho 3in1 24г',
  internationalCode: '8886300800029',
  label: '0',
  groupName: 'КОФЕ, ЧОЙ ВА ЗИРАВОРЛАР',
  unitsName: 'шт. (банка) 24 грамм',
};

describe('MXIK formati', () => {
  it('17 raqam', () => {
    expect(isMxikCode(CODE)).toBe(true);
    expect(isMxikCode('12345678')).toBe(false);
    expect(isMxikCode('0090100100104801A')).toBe(false);
  });
  it('forma qiymati: bo\'sh, to\'g\'ri, noto\'g\'ri', () => {
    expect(parseMxikInput('')).toBe('');
    expect(parseMxikInput('  ')).toBe('');
    expect(parseMxikInput('009 01 001 001 048 019')).toBe(CODE);
    expect(parseMxikInput('009-01-001-001-048-019')).toBe(CODE);
    expect(parseMxikInput('10202001')).toBeNull();
    expect(parseMxikInput('abc')).toBeNull();
  });
  it('darajalar va ko\'rinish', () => {
    expect(mxikLevels(CODE)).toEqual({ group: '009', class: '00901', position: '00901001', subPosition: '00901001001', brand: '00901001001048' });
    expect(formatMxik(CODE)).toBe('009 01 001 001 048 019');
  });
  it('qidiruv so\'rovi', () => {
    expect(normalizeMxikQuery(' kofe  3in1 ')).toBe('kofe 3in1');
    expect(normalizeMxikQuery('k')).toBeNull();
    expect(normalizeMxikQuery('x'.repeat(81))).toBeNull();
  });
});

describe('Excel importidagi MXIK ustuni', () => {
  const ctx = { phoneShop: false, businessType: 'general' };
  it('matn, son (boshidagi 0 yo\'qolgan) va noto\'g\'ri qiymat', () => {
    expect(parseImportRow({ line: 2, values: { name: 'Kofe', ikpu: '009 01 001 001 048 019' }, extra: [] }, ctx)).toMatchObject({ ok: true, row: { ikpu: CODE } });
    expect(parseImportRow({ line: 2, values: { name: 'Kofe', ikpu: 901001001048019 }, extra: [] }, ctx)).toMatchObject({ ok: true, row: { ikpu: CODE } });
    expect(parseImportRow({ line: 2, values: { name: 'Kofe', ikpu: '10202001' }, extra: [] }, ctx))
      .toMatchObject({ ok: false, issues: [{ field: 'ikpu', code: 'ikpuInvalid' }] });
  });
  it('sarlavha o\'zi taniladi', () => {
    expect(autoMapColumns(['Nomi', 'MXIK kodi', 'ИКПУ'], importFieldsFor(ctx))).toEqual([
      { type: 'field', field: 'name' }, { type: 'field', field: 'ikpu' }, { type: 'extra', name: 'ИКПУ' },
    ]);
  });
});

describe('toMxikItem', () => {
  it('katalog yozuvi', () => {
    expect(toMxikItem(RAW)).toEqual({
      code: CODE, name: RAW.name, unit: 'шт. (банка) 24 грамм', barcode: '8886300800029', marked: false, group: 'КОФЕ, ЧОЙ ВА ЗИРАВОРЛАР',
    });
    expect(toMxikItem({ ...RAW, label: '1' })?.marked).toBe(true);
  });
  it('noto\'g\'ri yozuvlar tashlanadi', () => {
    expect(toMxikItem(null)).toBeNull();
    expect(toMxikItem({ ...RAW, mxikCode: '123' })).toBeNull();
    expect(toMxikItem({ ...RAW, name: '' })).toBeNull();
    expect(toMxikItem({ ...RAW, internationalCode: '<script>' })?.barcode).toBeNull();
  });
});

describe('searchMxikCatalog (tashqi so\'rov — soxta fetch)', () => {
  afterEach(() => clearMxikCache());

  const ok = (data: unknown[]) => vi.fn(async () => new Response(JSON.stringify({ success: true, data }), { status: 200 })) as unknown as typeof fetch;

  it('natija + kesh (ikkinchi so\'rov tashqariga chiqmaydi)', async () => {
    const f = ok([RAW, RAW, { mxikCode: 'bad' }]);
    const r1 = await searchMxikCatalog('kofe', 'uz', f);
    expect(r1).toMatchObject({ ok: true, cached: false });
    expect(r1.ok && r1.items.map((i) => i.code)).toEqual([CODE]);
    const r2 = await searchMxikCatalog(' KOFE ', 'uz', f);
    expect(r2).toMatchObject({ ok: true, cached: true });
    expect(f).toHaveBeenCalledTimes(1);
    // So'rovda faqat qidiruv matni va til
    const url = new URL(String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]));
    expect(url.origin).toBe('https://tasnif.soliq.uz');
    expect([...url.searchParams.keys()].sort()).toEqual(['lang', 'page', 'search', 'size']);
    expect(url.searchParams.get('search')).toBe('kofe');
  });

  it('xato javob, success:false va tarmoq xatosi — unavailable (keshlanmaydi)', async () => {
    const bad = vi.fn(async () => new Response('err', { status: 503 })) as unknown as typeof fetch;
    expect(await searchMxikCatalog('kofe', 'ru', bad)).toEqual({ ok: false, reason: 'unavailable' });
    const fail = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })) as unknown as typeof fetch;
    expect(await searchMxikCatalog('kofe', 'ru', fail)).toEqual({ ok: false, reason: 'unavailable' });
    const boom = vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(await searchMxikCatalog('kofe', 'ru', boom)).toEqual({ ok: false, reason: 'unavailable' });
    expect(boom).toHaveBeenCalledTimes(1);
  });

  it('qisqa so\'rov tashqariga yuborilmaydi', async () => {
    const f = ok([RAW]);
    expect(await searchMxikCatalog('k', 'uz', f)).toEqual({ ok: false, reason: 'badQuery' });
    expect(f).not.toHaveBeenCalled();
  });
});
