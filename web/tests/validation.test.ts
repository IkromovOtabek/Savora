import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { formToObject, parseInput, zId, zOptId, zText, zReqText, zMoney, zInt, zOptInt, zOneOf, zDate, zOptDate, zCheckbox } from '@/lib/validation';

const ID = '6ad462d4cffd04e007ce8bbf';

describe('validation helpers', () => {
  it('formToObject: birinchi qiymat, fayl tashlanadi', () => {
    const fd = new FormData();
    fd.append('a', '1'); fd.append('a', '2'); fd.append('f', new Blob(['x']));
    expect(formToObject(fd)).toEqual({ a: '1' });
  });

  it('zId / zOptId', () => {
    expect(parseInput(zId('bad'), ID)).toEqual({ ok: true, data: ID });
    expect(parseInput(zId('bad'), 'abc')).toEqual({ ok: false, error: 'bad' });
    expect(parseInput(zId('bad'), { $gt: '' })).toEqual({ ok: false, error: 'bad' });
    expect(parseInput(zOptId('bad'), '')).toEqual({ ok: true, data: undefined });
  });

  it('zMoney', () => {
    expect(parseInput(zMoney('m'), '1 200 000')).toEqual({ ok: true, data: 1_200_000 });
    expect(parseInput(zMoney('m'), 5000)).toEqual({ ok: true, data: 5000 });
    expect(parseInput(zMoney('m'), '')).toEqual({ ok: false, error: 'm' });
    expect(parseInput(zMoney('m'), '-5')).toEqual({ ok: false, error: 'm' });
    expect(parseInput(zMoney('m'), '1.5')).toEqual({ ok: false, error: 'm' });
    expect(parseInput(zMoney('m', { min: 1 }), '0')).toEqual({ ok: false, error: 'm' });
    expect(parseInput(zMoney('m', { optional: true }), '')).toEqual({ ok: true, data: 0 });
    expect(parseInput(zMoney('m'), '1e20')).toEqual({ ok: false, error: 'm' });
  });

  it('zText / zReqText', () => {
    expect(parseInput(zText(5, 'long'), '  ab  ')).toEqual({ ok: true, data: 'ab' });
    expect(parseInput(zText(5, 'long'), 'abcdef')).toEqual({ ok: false, error: 'long' });
    expect(parseInput(zText(5), undefined)).toEqual({ ok: true, data: '' });
    expect(parseInput(zReqText(5, 'req'), ' ')).toEqual({ ok: false, error: 'req' });
  });

  it('zInt / zOneOf / zDate / zCheckbox', () => {
    expect(parseInput(zInt('q', 1, 10), '3')).toEqual({ ok: true, data: 3 });
    expect(parseInput(zInt('q', 1, 10), '11')).toEqual({ ok: false, error: 'q' });
    expect(parseInput(zOptInt('q', 1, 10), '')).toEqual({ ok: true, data: undefined });
    expect(parseInput(zOneOf(['a', 'b'] as const, 't'), 'b')).toEqual({ ok: true, data: 'b' });
    expect(parseInput(zOneOf(['a', 'b'] as const, 't'), 'c')).toEqual({ ok: false, error: 't' });
    expect(parseInput(zDate('d'), 'nope')).toEqual({ ok: false, error: 'd' });
    expect(parseInput(zOptDate('d'), '')).toEqual({ ok: true, data: undefined });
    expect(parseInput(zCheckbox(), 'on')).toEqual({ ok: true, data: true });
  });

  it("obyektda yo'q kalitlar ham transform'dan o'tadi (zod 4 nonoptional tuzog'i)", () => {
    const s = z.object({ a: zText(5), b: zOptInt('q', 1, 9), c: zMoney('m', { optional: true }), d: zOptDate('d'), e: zOptId('i') });
    expect(parseInput(s, {})).toEqual({ ok: true, data: { a: '', b: undefined, c: 0, d: undefined, e: undefined } });
    expect(parseInput(z.object({ r: zReqText(5, 'req') }), {})).toEqual({ ok: false, error: 'req' });
  });

  it("obyekt: birinchi xato xabari; noma'lum tur xatosi — fallback", () => {
    const s = z.object({ a: zReqText(3, 'aReq'), b: zMoney('bBad') });
    expect(parseInput(s, { a: '', b: 'x' })).toEqual({ ok: false, error: 'aReq' });
    expect(parseInput(z.array(z.string()), 'x', 'fb')).toEqual({ ok: false, error: 'fb' });
  });
});
