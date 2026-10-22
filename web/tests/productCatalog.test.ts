import { describe, it, expect } from 'vitest';
import { flattenCategories, normalizeCatalogName } from '@/lib/productCatalog';

describe('flattenCategories — turkumlar daraxt tartibida', () => {
  it('ota → bolalar tartibi, chuqurlik va to\'liq yo\'l', () => {
    const out = flattenCategories([
      { id: 'a', name: 'Ichimliklar', parentId: null },
      { id: 'b', name: 'Gazli', parentId: 'a' },
      { id: 'c', name: 'Kola', parentId: 'b' },
      { id: 'd', name: 'Kiyim', parentId: null },
    ]);
    expect(out.map((o) => [o.id, o.depth, o.path])).toEqual([
      ['a', 0, 'Ichimliklar'],
      ['b', 1, 'Ichimliklar / Gazli'],
      ['c', 2, 'Ichimliklar / Gazli / Kola'],
      ['d', 0, 'Kiyim'],
    ]);
  });

  it('otasi topilmagan turkum yuqori darajada ko\'rinadi', () => {
    const out = flattenCategories([{ id: 'x', name: 'Yetim', parentId: 'yoq' }]);
    expect(out).toEqual([{ id: 'x', name: 'Yetim', depth: 0, path: 'Yetim' }]);
  });
});

describe('normalizeCatalogName', () => {
  it('chetlarni kesadi, ichki bo\'shliqlarni bittaga', () => {
    expect(normalizeCatalogName('  Coca   Cola ')).toBe('Coca Cola');
    expect(normalizeCatalogName(null)).toBe('');
  });
});
