import { describe, it, expect } from 'vitest';
import { branchFilter, branchAggMatch, isBranchScoped, MATCH_NOTHING } from '@/lib/branchScope';

const BRANCH = '507f1f77bcf86cd799439011';

describe('branchScope — filial izolatsiyasi (xavfsizlik-kritik)', () => {
  it('admin uchun filtr bo\'sh (barcha filiallar)', () => {
    expect(branchFilter({ role: 'admin', branchId: undefined })).toEqual({});
    expect(branchFilter({ role: 'admin', branchId: BRANCH })).toEqual({});
  });

  it('filial-login faqat o\'z filialini ko\'radi', () => {
    expect(branchFilter({ role: 'user', branchId: BRANCH })).toEqual({ branchId: BRANCH });
  });

  it('branchId yo\'q user — hech narsaga mos kelmaydi (fail-closed)', () => {
    expect(branchFilter({ role: 'user', branchId: undefined })).toEqual(MATCH_NOTHING);
    expect(branchFilter({ role: 'user', branchId: '' })).toEqual({ _id: { $in: [] } });
    // `{ _id: id, ...branchFilter(user) }` — _id bosib o'tiladi, natija bo'sh
    expect({ _id: 'abc', ...branchFilter({ role: 'user', branchId: undefined }) }).toEqual({ _id: { $in: [] } });
  });

  it('isBranchScoped faqat branchId\'li user uchun true', () => {
    expect(isBranchScoped({ role: 'user', branchId: BRANCH })).toBe(true);
    expect(isBranchScoped({ role: 'user', branchId: undefined })).toBe(false);
    expect(isBranchScoped({ role: 'admin', branchId: BRANCH })).toBe(false);
  });

  it('branchAggMatch ObjectId qaytaradi (aggregate uchun)', () => {
    const m = branchAggMatch({ role: 'user', branchId: BRANCH });
    expect('branchId' in m).toBe(true);
    expect(String((m as { branchId: unknown }).branchId)).toBe(BRANCH);
    expect(branchAggMatch({ role: 'admin', branchId: BRANCH })).toEqual({});
  });

  it('branchAggMatch noto\'g\'ri/yo\'q ObjectId\'da hech narsaga mos kelmaydi (fail-closed)', () => {
    expect(branchAggMatch({ role: 'user', branchId: 'not-an-id' })).toEqual(MATCH_NOTHING);
    expect(branchAggMatch({ role: 'user', branchId: undefined })).toEqual(MATCH_NOTHING);
  });
});
