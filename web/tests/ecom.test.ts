import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import {
  buildEcomGroups, buyerPhoneKey, ecomAvailableQty, ecomGroupKey, ecomImagesOf, isEcomGroupKey, resolveEcomListed,
  type EcomSourceProduct,
} from '@/lib/ecom/group';
import { normalizeCart } from '@/lib/ecom/orders';
import { isSampleItemCode } from '@/lib/onboardingSamples';

const img = (n: number) => `/api/uploads/biznes_test/${'a'.repeat(8)}-${n}.jpg`;

function p(over: Partial<EcomSourceProduct> = {}): EcomSourceProduct {
  return {
    _id: new Types.ObjectId(),
    name: 'Choynak',
    salePrice: 50000,
    status: 'in_stock',
    trackQuantity: true,
    quantity: 10,
    soldQuantity: 0,
    kind: 'goods',
    updatedAt: new Date('2026-11-01'),
    ...over,
  } as EcomSourceProduct;
}

describe('e-commerce qoidalari (lib/ecom/group)', () => {
  it('sotish narxi yo\'q tovar chiqmaydi (avtomatik rejimda ham)', () => {
    const [g] = buildEcomGroups([p({ salePrice: 0 })], true);
    expect(g.state).toBe('noPrice');
    expect(g.sellIds).toEqual([]);
  });

  it('avtomatik rejim: narxi bor tovar chiqadi; o\'chiq rejimda — faqat belgilangani', () => {
    expect(buildEcomGroups([p()], true)[0].state).toBe('live');
    expect(buildEcomGroups([p()], false)[0].state).toBe('hidden');
    expect(buildEcomGroups([p({ ecomListed: true })], false)[0].state).toBe('live');
    expect(buildEcomGroups([p({ ecomListed: false })], true)[0].state).toBe('hidden');
  });

  it('resolveEcomListed: aniq tanlov sozlamadan ustun', () => {
    expect(resolveEcomListed(undefined, true)).toBe(true);
    expect(resolveEcomListed(undefined, false)).toBe(false);
    expect(resolveEcomListed(false, true)).toBe(false);
    expect(resolveEcomListed(true, false)).toBe(true);
  });

  it('xizmat, to\'plam, tizim qatori, stop-list va sotilgan tovar guruhga kirmaydi', () => {
    const gs = buildEcomGroups([
      p({ name: 'Ta\'mir', kind: 'service' }),
      p({ name: 'To\'plam', kind: 'bundle' }),
      p({ name: 'Xizmat haqi', systemKey: 'serviceCharge' }),
      p({ name: 'Osh', stopListed: true }),
      p({ name: 'Eski', status: 'sold' }),
    ], true);
    expect(gs).toEqual([]);
  });

  it('bir xil tovarlar (nom/tur/rang) bitta kartochka: qoldiq yig\'iladi, eng past narx, «…dan»', () => {
    const a = p({ name: 'iPhone 15', variantName: '128GB', trackQuantity: false, quantity: 1, salePrice: 11_000_000 });
    const b = p({ name: ' iphone  15 ', variantName: '128gb', trackQuantity: false, quantity: 1, salePrice: 10_500_000 });
    const other = p({ name: 'iPhone 15', variantName: '256GB', trackQuantity: false, quantity: 1, salePrice: 13_000_000 });
    const gs = buildEcomGroups([a, b, other], true);
    expect(gs).toHaveLength(2);
    const g128 = gs.find((g) => g.variantName?.toLowerCase() === '128gb')!;
    expect(g128.qty).toBe(2);
    expect(g128.price).toBe(10_500_000);
    expect(g128.maxPrice).toBe(11_000_000);
    expect(g128.sellIds).toHaveLength(2);
  });

  it('qoldiq: sanaladigan tovarda quantity − soldQuantity, tugaganda 0', () => {
    expect(ecomAvailableQty(p({ quantity: 10, soldQuantity: 3 }))).toBe(7);
    expect(ecomAvailableQty(p({ quantity: 2, soldQuantity: 2 }))).toBe(0);
    expect(ecomAvailableQty(p({ salePrice: 0 }))).toBe(0);
    const [g] = buildEcomGroups([p({ quantity: 2, soldQuantity: 2 })], true);
    expect(g.state).toBe('hidden');
  });

  it('guruh tanlovi: eng yangi aniq belgilangan hujjat', () => {
    const old = p({ ecomListed: true, updatedAt: new Date('2026-10-01') });
    const fresh = p({ ecomListed: false, updatedAt: new Date('2026-11-10') });
    const plain = p({ updatedAt: new Date('2026-11-15') });
    const [g] = buildEcomGroups([old, fresh, plain], true);
    expect(g.explicit).toBe(false);
    expect(g.state).toBe('hidden');
  });

  it('rasmlar: faqat o\'z storage URL\'lari, ≤6, bo\'lmasa asosiy rasm', () => {
    expect(ecomImagesOf({ ecomImages: [img(1), 'https://evil.example/x.jpg', 'javascript:alert(1)', img(1)] })).toEqual([img(1)]);
    expect(ecomImagesOf({ ecomImages: [1, 2, 3, 4, 5, 6, 7, 8].map(img) })).toHaveLength(6);
    expect(ecomImagesOf({ photoUrl: img(9) })).toEqual([img(9)]);
    expect(ecomImagesOf({})).toEqual([]);
  });

  it('vakil: rasmi bor hujjat tavsif/rasm manbai', () => {
    const plain = p({ updatedAt: new Date('2026-11-15') });
    const rich = p({ ecomImages: [img(1)], ecomDescription: 'Zo\'r choynak', updatedAt: new Date('2026-10-01') });
    const [g] = buildEcomGroups([plain, rich], true);
    expect(g.images).toEqual([img(1)]);
    expect(g.description).toBe('Zo\'r choynak');
  });

  it('eski narx faqat narx yagona va undan katta bo\'lsa', () => {
    expect(buildEcomGroups([p({ oldPrice: 60000 })], true)[0].oldPrice).toBe(60000);
    expect(buildEcomGroups([p({ oldPrice: 40000 })], true)[0].oldPrice).toBeUndefined();
  });

  it('namuna tovar (NAMUNA-…) avtomatik chiqmaydi: panelda yashirin, egasi «ko\'rsatish» desa — chiqadi', () => {
    const sample = p({ name: 'Batareyka AA', itemCode: 'NAMUNA-GEN-BATAREYKA', salePrice: 5000, quantity: 24 });
    const [g] = buildEcomGroups([sample], true);
    expect(g.state).toBe('hidden');
    expect(g.listed).toBe(false);
    expect(g.explicit).toBeUndefined();
    // Panelda narx va qoldiq ko'rinadi (egasi nimani ko'rsatishini bilsin); katalogga faqat «live» yoziladi
    expect(g.price).toBe(5000);
    expect(g.qty).toBe(24);

    const shown = buildEcomGroups([{ ...sample, ecomListed: true }], true)[0];
    expect(shown.state).toBe('live');
    expect(shown.sellIds).toEqual([String(sample._id)]);
    expect(buildEcomGroups([{ ...sample, ecomListed: true }], false)[0].state).toBe('live');
  });

  it('haqiqiy tovar namuna bilan bir guruhda: faqat haqiqiysi sotiladi; haqiqiysi tugasa — yashirin', () => {
    const sample = p({ name: 'Non', itemCode: 'NAMUNA-OZQ-NON', salePrice: 4000, quantity: 50 });
    const real = p({ name: 'Non', salePrice: 4500, quantity: 7 });
    const [g] = buildEcomGroups([sample, real], true);
    expect(g.state).toBe('live');
    expect(g.sellIds).toEqual([String(real._id)]);
    expect(g.qty).toBe(7);
    expect(g.price).toBe(4500);
    expect(g.allIds).toHaveLength(2);

    const [empty] = buildEcomGroups([sample, { ...real, soldQuantity: 7 }], true);
    expect(empty.state).toBe('hidden');
    expect(empty.sellIds).toEqual([]);
    // Egasi guruhni aniq ko'rsatsa — namuna nusxa ham sotiladi
    const [all] = buildEcomGroups([{ ...sample, ecomListed: true }, { ...real, ecomListed: true }], true);
    expect(all.sellIds).toHaveLength(2);
  });

  it('isSampleItemCode: faqat NAMUNA- prefiksi', () => {
    expect(isSampleItemCode('NAMUNA-GEN-GUGURT')).toBe(true);
    expect(isSampleItemCode('namuna-gen-gugurt')).toBe(true);
    expect(isSampleItemCode('GEN-GUGURT')).toBe(false);
    expect(isSampleItemCode(undefined)).toBe(false);
    expect(isSampleItemCode(null)).toBe(false);
  });

  it('guruh kaliti barqaror va tekshiriladi', () => {
    const k = ecomGroupKey({ name: 'Choynak', variantName: undefined, color: 'oq' });
    expect(k).toBe(ecomGroupKey({ name: '  choynak ', color: 'OQ' } as never));
    expect(isEcomGroupKey(k)).toBe(true);
    expect(isEcomGroupKey('../x')).toBe(false);
  });
});

describe('xaridor telefoni va savat', () => {
  it('buyerPhoneKey: faqat to\'liq O\'zbekiston raqami', () => {
    expect(buyerPhoneKey('+998 90 123 45 67')).toBe('+998901234567');
    expect(buyerPhoneKey('901234567')).toBe('+998901234567');
    expect(buyerPhoneKey('998901234567')).toBe('+998901234567');
    expect(buyerPhoneKey('+7 999 123 45 67')).toBeNull();
    expect(buyerPhoneKey('12345')).toBeNull();
    expect(buyerPhoneKey('+998 01 234 56 78')).toBeNull();
  });

  it('normalizeCart: yaroqsizlar tashlanadi, takrorlar qo\'shiladi', () => {
    const id = new Types.ObjectId().toString();
    const lines = normalizeCart([
      { listingId: id, qty: 1, price: 100 },
      { listingId: id, qty: 2 },
      { listingId: 'bad', qty: 1 },
      { listingId: new Types.ObjectId().toString(), qty: -1 },
      null,
    ]);
    expect(lines).toEqual([{ listingId: id, qty: 3, price: 100 }]);
    expect(normalizeCart('x')).toEqual([]);
  });
});
