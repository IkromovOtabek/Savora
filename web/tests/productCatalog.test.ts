import { describe, it, expect } from 'vitest';
import { topCategoryChips, categoryHeight, categoryLevel, categoryMoveError, categorySubtreeIds, flattenCategories, normalizeCatalogName } from '@/lib/productCatalog';

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

describe('turkum daraxti yordamchilari', () => {
  const items = [
    { id: 'a', name: 'Ichimliklar', parentId: null },
    { id: 'b', name: 'Gazli', parentId: 'a' },
    { id: 'c', name: 'Kola', parentId: 'b' },
    { id: 'd', name: 'Kiyim', parentId: null },
  ];

  it('categorySubtreeIds — o\'zi va barcha avlodlari', () => {
    expect([...categorySubtreeIds(items, 'a')].sort()).toEqual(['a', 'b', 'c']);
    expect([...categorySubtreeIds(items, 'd')]).toEqual(['d']);
  });

  it('categoryLevel / categoryHeight', () => {
    expect(categoryLevel(items, 'c')).toBe(3);
    expect(categoryLevel(items, 'yoq')).toBeNull();
    expect(categoryHeight(items, 'a')).toBe(3);
    expect(categoryHeight(items, 'c')).toBe(1);
  });

  it('categoryMoveError — halqa va chuqurlik', () => {
    expect(categoryMoveError(items, 'a', 'c', 4)).toBe('cycle');
    expect(categoryMoveError(items, 'a', 'a', 4)).toBe('cycle');
    expect(categoryMoveError(items, 'a', 'd', 4)).toBeNull(); // d(1) + 3 = 4
    expect(categoryMoveError(items, 'a', 'd', 3)).toBe('tooDeep');
    expect(categoryMoveError(items, 'c', null, 4)).toBeNull();
  });
});

describe('topCategoryChips — kassa chiplari', () => {
  const items = [
    { id: 'a', name: 'Ichimliklar', parentId: null },
    { id: 'b', name: 'Gazli', parentId: 'a' },
    { id: 'd', name: 'Kiyim', parentId: null },
  ];
  it('faqat ichida (yoki ichki turkumida) mahsulot bor yuqori turkumlar', () => {
    const chips = topCategoryChips(items, new Set(['b']));
    expect(chips.map((c) => c.id)).toEqual(['a']);
    expect([...chips[0].ids].sort()).toEqual(['a', 'b']);
  });
  it('mahsulotlarda turkum bo\'lmasa — chip yo\'q', () => {
    expect(topCategoryChips(items, new Set())).toEqual([]);
  });
});
