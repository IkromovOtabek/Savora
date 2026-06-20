import { describe, it, expect } from 'vitest';
import { normalizeSlug, validateSlug, tenantDbName } from '@/lib/slug';

describe('slug — do\'kon manzili', () => {
  it('normalizeSlug katta harf/bo\'shliqni tozalaydi', () => {
    expect(normalizeSlug('  Smart Phone  ')).toBe('smart-phone');
    expect(normalizeSlug('DOKON__1')).toBe('dokon-1');
    expect(normalizeSlug('---abc---')).toBe('abc');
  });

  it('validateSlug qoidalari', () => {
    expect(validateSlug('dokon1')).toBeNull();
    expect(validateSlug('ab')).toBeTruthy(); // juda qisqa
    expect(validateSlug('admin')).toBeTruthy(); // band/reserved
    expect(validateSlug('t')).toBeTruthy(); // reserved
    expect(validateSlug('Bad_Slug!')).toBeTruthy(); // noto\'g\'ri belgilar (normalizatsiyasiz)
  });

  it('tenantDbName prefiks beradi', () => {
    expect(tenantDbName('dokon1')).toBe('biznes_dokon1');
  });
});
