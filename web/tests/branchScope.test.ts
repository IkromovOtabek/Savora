import { describe, it, expect } from 'vitest';
import { branchFilter, branchAggMatch, isBranchScoped } from '@/lib/branchScope';

const BRANCH = '507f1f77bcf86cd799439011';

describe('branchScope — filial izolatsiyasi (xavfsizlik-kritik)', () => {
  it('admin uchun filtr bo\'sh (barcha filiallar)', () => {
    expect(branchFilter({ role: 'admin', branchId: undefined })).toEqual({});
    expect(branchFilter({ role: 'admin', branchId: BRANCH })).toEqual({});
  });

  it('filial-login faqat o\'z filialini ko\'radi', () => {
    expect(branchFilter({ role: 'user', branchId: BRANCH })).toEqual({ branchId: BRANCH });
  });

  it('branchId yo\'q user — filtr bo\'sh (xavfsiz default)', () => {
    expect(branchFilter({ role: 'user', branchId: undefined })).toEqual({});
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

  it('branchAggMatch noto\'g\'ri ObjectId\'da bo\'sh qaytaradi', () => {
    expect(branchAggMatch({ role: 'user', branchId: 'not-an-id' })).toEqual({});
  });
});
