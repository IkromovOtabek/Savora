import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { decodeText, detectFileKind, readCsv, readSpreadsheet, readXlsx, XlsxReadError } from '@/lib/xlsxRead';
import {
  autoMapColumns,
  buildRawRows,
  detectHeaderRow,
  duplicateKey,
  isImeiPending,
  guessField,
  importFieldsFor,
  parseImportDate,
  parseImportRow,
  parseMoney,
  parseUnit,
  parseWarranty,
  parseExtraFieldsJson,
  type ImportContext,
} from '@/lib/productImport';

/** Test uchun minimal ZIP yozuvchi (CRC tekshirilmaydi — o'quvchi markaziy katalogga ishonadi) */
function makeZip(files: Record<string, string>, deflate = true): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameB = enc.encode(name);
    const raw = enc.encode(content);
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = deflate ? 8 : 0;
    const local = new Uint8Array(30 + nameB.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameB.length, true);
    local.set(nameB, 30);
    local.set(data, 30 + nameB.length);
    const central = new Uint8Array(46 + nameB.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameB, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, eocd]) { out.set(part, p); p += part.length; }
  return out;
}

const WORKBOOK = `<?xml version="1.0"?><workbook xmlns="x" xmlns:r="r"><sheets>
  <sheet name="Ombor" sheetId="1" r:id="rId1"/><sheet name="Bo'sh" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const RELS = `<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="ws" Target="/xl/worksheets/sheet2.xml"/></Relationships>`;
const SHARED = `<sst><si><t>Nomi</t></si><si><t>Narx (so'm)</t></si><si><r><t>Coca</t></r><r><t xml:space="preserve">-Cola &amp; Co</t></r><rPh><t>X</t></rPh></si></sst>`;
const SHEET1 = `<worksheet><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
  <row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="inlineStr"><is><t>ichki</t></is></c><c r="C3"><v>12500.4</v></c><c r="D3" t="b"><v>1</v></c></row>
  <row r="4"><c r="A4"><v>4780012345678</v></c><c r="C4" t="e"><v>#N/A</v></c></row>
  <row r="5"/>
</sheetData></worksheet>`;
const SHEET2 = `<x:worksheet><x:sheetData><x:row><x:c t="str"><x:v>bir</x:v></x:c><x:c><x:v>2</x:v></x:c></x:row></x:sheetData></x:worksheet>`;

function workbookZip(deflate = true) {
  return makeZip({
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': RELS,
    'xl/sharedStrings.xml': SHARED,
    'xl/worksheets/sheet1.xml': SHEET1,
    'xl/worksheets/sheet2.xml': SHEET2,
  }, deflate);
}

describe('xlsxRead', () => {
  it('xlsx: varaqlar, umumiy/ichki satrlar, sonlar, bo\'sh qatorlar', async () => {
    const sheets = await readXlsx(workbookZip());
    expect(sheets.map((s) => s.name)).toEqual(['Ombor', "Bo'sh"]);
    expect(sheets[0].rows).toEqual([
      ['Nomi', null, "Narx (so'm)"],
      [],
      ['Coca-Cola & Co', 'ichki', 12500.4, 'TRUE'],
      [4780012345678],
    ]);
    // Prefiksli (x:) XML va r atributisiz kataklar
    expect(sheets[1].rows).toEqual([['bir', 2]]);
  });

  it('siqilmagan (stored) ZIP ham o\'qiladi', async () => {
    const sheets = await readXlsx(workbookZip(false));
    expect(sheets[0].rows[2][0]).toBe('Coca-Cola & Co');
  });

  it('fayl turi baytlardan aniqlanadi; eski .xls rad etiladi', async () => {
    expect(detectFileKind(workbookZip())).toBe('xlsx');
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]);
    expect(detectFileKind(xls)).toBe('xls');
    await expect(readSpreadsheet(xls)).rejects.toMatchObject({ code: 'xls' });
    await expect(readXlsx(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]))).rejects.toBeInstanceOf(XlsxReadError);
  });

  it('CSV: ajratuvchi, qo\'shtirnoq, bo\'sh qatorlar', () => {
    const rows = readCsv('Nomi;Narx;Izoh\r\n"Non; oq";1 500;"u ""katta"""\r\n\r\nSut;12000;\n');
    expect(rows).toEqual([
      ['Nomi', 'Narx', 'Izoh'],
      ['Non; oq', '1 500', 'u "katta"'],
      [],
      ['Sut', '12000'],
    ]);
    expect(readCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(readCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('matn kodlash: UTF-8 BOM va Windows-1251', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
    // «Цена» windows-1251 da
    expect(decodeText(new Uint8Array([0xd6, 0xe5, 0xed, 0xe0]))).toBe('Цена');
  });

  it('readSpreadsheet: CSV bitta varaq, nomi fayl nomidan', async () => {
    const sheets = await readSpreadsheet(new TextEncoder().encode('a,b\n1,2'), 'tovarlar.csv');
    expect(sheets).toEqual([{ name: 'tovarlar', rows: [['a', 'b'], ['1', '2']] }]);
  });
});

const GENERAL: ImportContext = { phoneShop: false, businessType: 'general' };
const GROCERY: ImportContext = { phoneShop: false, businessType: 'grocery' };
const PHONE: ImportContext = { phoneShop: true, businessType: 'phone_shop' };
const PHARMACY: ImportContext = { phoneShop: false, businessType: 'pharmacy' };

describe('ustunlarni moslash', () => {
  const all = importFieldsFor(GROCERY);

  it('turli tildagi sarlavhalar tanildi', () => {
    expect(guessField('Наименование товара', all)?.field).toBe('name');
    expect(guessField("Mahsulot nomi", all)?.field).toBe('name');
    expect(guessField('Kelish narxi', all)?.field).toBe('purchasePrice');
    expect(guessField('Sotuv narxi (so\'m)', all)?.field).toBe('salePrice');
    expect(guessField('Цена', all)?.field).toBe('salePrice');
    expect(guessField('Закупочная цена', all)?.field).toBe('purchasePrice');
    expect(guessField('Кол-во', all)?.field).toBe('quantity');
    expect(guessField('Остаток', all)?.field).toBe('quantity');
    expect(guessField('Штрих-код', all)?.field).toBe('barcode');
    expect(guessField('Ед. изм.', all)?.field).toBe('unit');
    expect(guessField('Срок годности', all)?.field).toBe('expiryDate');
    expect(guessField('Ulgurji narx', all)?.field).toBe('wholesalePrice');
    expect(guessField('Mamlakat', all)).toBeNull();
  });

  it('yo\'nalishda yo\'q maydon tanilmaydi (umumiy do\'konda birlik yo\'q)', () => {
    expect(guessField('Ед. изм.', importFieldsFor(GENERAL))).toBeNull();
    expect(importFieldsFor(GENERAL)).not.toContain('imei');
    expect(importFieldsFor(PHONE)).toContain('imei');
  });

  it('har maydon bitta ustunga, noma\'lumlari qo\'shimcha ustun', () => {
    const map = autoMapColumns(['Nomi', 'Narx', 'Narxi', 'Mamlakat', null, 'Material  turi'], all);
    expect(map).toEqual([
      { type: 'field', field: 'name' },
      { type: 'field', field: 'salePrice' },
      { type: 'extra', name: 'Narxi' },
      { type: 'extra', name: 'Mamlakat' },
      { type: 'skip' },
      { type: 'extra', name: 'Material turi' },
    ]);
  });

  it('sarlavha qatori — eng ko\'p tanilgan qator', () => {
    const rows = [['Do\'kon: Baraka'], [], ['№', 'Nomi', 'Soni', 'Narx'], [1, 'Non', 5, 3000]];
    expect(detectHeaderRow(rows, all)).toBe(2);
    expect(detectHeaderRow([['x', 'y'], ['1', '2']], all)).toBe(0);
  });

  it('qatorlar yig\'iladi: bo\'sh qatorlar tashlanadi, qo\'lda qo\'shilgan ustunlar qo\'shiladi', () => {
    const rows = [['Nomi', 'Narx', 'Mamlakat'], ['Non', 3000, 'UZ'], [], [null, null, null], ['Sut', '12 000', null]];
    const mapping = autoMapColumns(rows[0], all);
    const raw = buildRawRows(rows, 0, mapping, [
      { target: { type: 'field', field: 'category' }, value: 'Oziq-ovqat' },
      { target: { type: 'extra', name: 'Yetkazuvchi' }, value: 'Baraka' },
      { target: { type: 'extra', name: 'Bo\'sh' }, value: '  ' },
    ]);
    expect(raw).toEqual([
      { line: 2, values: { name: 'Non', salePrice: 3000, category: 'Oziq-ovqat' }, extra: [{ name: 'Mamlakat', value: 'UZ' }, { name: 'Yetkazuvchi', value: 'Baraka' }] },
      { line: 5, values: { name: 'Sut', salePrice: '12 000', category: 'Oziq-ovqat' }, extra: [{ name: 'Yetkazuvchi', value: 'Baraka' }] },
    ]);
  });
});

describe('qiymatlarni o\'qish', () => {
  it('narx', () => {
    expect(parseMoney(12500.6)).toBe(12501);
    expect(parseMoney('12 500')).toBe(12500);
    expect(parseMoney('12 500 so\'m')).toBe(12500);
    expect(parseMoney('12.500')).toBe(12500);
    expect(parseMoney('1,250,000')).toBe(1250000);
    expect(parseMoney('12 500,50')).toBe(12501);
    expect(parseMoney('1.250.000,00')).toBe(1250000);
    expect(parseMoney('12.5')).toBe(13);
    expect(parseMoney('')).toBeUndefined();
    expect(parseMoney(undefined)).toBeUndefined();
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('bepul')).toBeNull();
    expect(parseMoney(-1)).toBeNull();
  });

  it('birlik', () => {
    expect(parseUnit('шт.')).toBe('dona');
    expect(parseUnit('KG')).toBe('kg');
    expect(parseUnit('м²')).toBe('m2');
    expect(parseUnit('litr')).toBe('l');
    expect(parseUnit('')).toBeUndefined();
    expect(parseUnit('tonna')).toBeNull();
  });

  it('sana', () => {
    expect(parseImportDate(46112)).toBe('2026-03-31');
    expect(parseImportDate('31.03.2027')).toBe('2027-03-31');
    expect(parseImportDate('1/3/2027')).toBe('2027-03-01');
    expect(parseImportDate('31.03.27')).toBe('2027-03-31');
    expect(parseImportDate('2027-03-31 00:00:00')).toBe('2027-03-31');
    expect(parseImportDate('2027/3/31')).toBe('2027-03-31');
    expect(parseImportDate('31.02.2027')).toBeNull();
    expect(parseImportDate(5)).toBeNull();
  });

  it('kafolat', () => {
    expect(parseWarranty(12)).toBe(12);
    expect(parseWarranty('6 oy')).toBe(6);
    expect(parseWarranty('1 yil')).toBe(12);
    expect(parseWarranty('2 года')).toBe(24);
    expect(parseWarranty('20 yil')).toBeNull();
    expect(parseWarranty('ko\'p')).toBeNull();
  });
});

describe('qatorni tekshirish', () => {
  it('to\'g\'ri qator', () => {
    const res = parseImportRow({
      line: 2,
      values: { name: '  Non   oq ', purchasePrice: 2500, salePrice: '3 000', quantity: '1,5', unit: 'кг', barcode: 4780012345678, expiryDate: 46112 },
      extra: [{ name: ' Mamlakat ', value: 'UZ' }, { name: 'Bo\'sh', value: ' ' }, { name: 'Mamlakat', value: 'KZ' }],
    }, GROCERY);
    expect(res).toEqual({
      ok: true,
      row: {
        line: 2, name: 'Non oq', purchasePrice: 2500, salePrice: 3000, quantity: 1.5, unit: 'kg',
        barcode: '4780012345678', expiryDate: '2026-03-31', extra: [{ name: 'Mamlakat', value: 'KZ' }],
      },
    });
  });

  it('xatolar to\'planadi', () => {
    const res = parseImportRow({ line: 7, values: { salePrice: 'bepul', quantity: 0, unit: 'tonna' }, extra: [] }, GROCERY);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.line).toBe(7);
    expect(res.issues.map((i) => i.code).sort()).toEqual(['nameRequired', 'priceInvalid', 'qtyZero', 'unitInvalid']);
  });

  it('butun birlikda kasr miqdor xato', () => {
    const res = parseImportRow({ line: 2, values: { name: 'Non', quantity: 1.5 }, extra: [] }, GENERAL);
    expect(res.ok ? null : res.issues).toEqual([{ field: 'quantity', code: 'qtyInvalid' }]);
  });

  it('telefon do\'koni: IMEI ixtiyoriy (keyin kiritiladi), IMEI\'li qatorda miqdor e\'tiborsiz', () => {
    const later = parseImportRow({ line: 2, values: { name: 'iPhone' }, extra: [] }, PHONE);
    expect(later).toMatchObject({ ok: true, row: { name: 'iPhone' } });
    expect(later.ok && later.row.imei).toBeUndefined();
    expect(later.ok && isImeiPending(later.row, PHONE)).toBe(true);
    expect(later.ok && duplicateKey(later.row, PHONE)).toBeUndefined();
    expect(parseImportRow({ line: 2, values: { name: 'iPhone', imei: '123' }, extra: [] }, PHONE))
      .toMatchObject({ ok: false, issues: [{ field: 'imei', code: 'imeiInvalid' }] });
    const ok = parseImportRow({ line: 2, values: { name: 'iPhone', imei: 353456789012345, quantity: 3 }, extra: [] }, PHONE);
    expect(ok).toMatchObject({ ok: true, row: { imei: '353456789012345' } });
    expect(ok.ok && ok.row.quantity).toBeUndefined();
    expect(ok.ok && duplicateKey(ok.row, PHONE)).toBe('353456789012345');
    expect(ok.ok && isImeiPending(ok.row, PHONE)).toBe(false);
  });

  it('telefon do\'koni: IMEI\'siz qatorda takror kaliti — shtrix-kod (qayta import ikki marta qo\'shmaydi)', () => {
    const res = parseImportRow({ line: 2, values: { name: 'Chexol', barcode: 4780000000011 }, extra: [] }, PHONE);
    expect(res.ok && isImeiPending(res.row, PHONE)).toBe(true);
    expect(res.ok && duplicateKey(res.row, PHONE)).toBe('4780000000011');
  });

  it('yo\'nalishda yo\'q maydon e\'tiborsiz; majburiy maydon tekshiriladi', () => {
    const res = parseImportRow({ line: 2, values: { name: 'Non', unit: 'tonna', imei: '1' }, extra: [] }, GENERAL);
    expect(res).toMatchObject({ ok: true, row: { name: 'Non' } });
    expect(parseImportRow({ line: 2, values: { name: 'Analgin' }, extra: [] }, PHARMACY))
      .toMatchObject({ ok: false, issues: [{ field: 'expiryDate', code: 'required' }] });
  });
});

describe('formadagi qo\'shimcha ustunlar', () => {
  it('bo\'shlar tashlanadi, nom normallashadi, takror — oxirgisi', () => {
    expect(parseExtraFieldsJson(JSON.stringify([
      { name: '  Mamlakat ', value: 'UZ' },
      { name: '', value: 'x' },
      { name: 'Material', value: '  ' },
      { name: 'Mamlakat', value: 'KZ' },
    ]))).toEqual([{ name: 'Mamlakat', value: 'KZ' }]);
    expect(parseExtraFieldsJson('[]')).toEqual([]);
  });

  it('noto\'g\'ri JSON, tur yoki uzunlik — null', () => {
    expect(parseExtraFieldsJson('{')).toBeNull();
    expect(parseExtraFieldsJson('{"a":1}')).toBeNull();
    expect(parseExtraFieldsJson(JSON.stringify([{ name: 'a', value: 5 }]))).toBeNull();
    expect(parseExtraFieldsJson(JSON.stringify([{ name: 'a'.repeat(41), value: 'x' }]))).toBeNull();
    expect(parseExtraFieldsJson(JSON.stringify([{ name: 'a', value: 'x'.repeat(201) }]))).toBeNull();
    const many = Array.from({ length: 21 }, (_, i) => ({ name: `n${i}`, value: 'v' }));
    expect(parseExtraFieldsJson(JSON.stringify(many))).toBeNull();
  });
});
