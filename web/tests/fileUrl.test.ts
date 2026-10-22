import { describe, it, expect } from 'vitest';
import { isOwnUploadUrl, isTenantUploadUrl, ownUploadKeyFromUrl, resolvePublicFileUrl, localUploadKeyFromUrl } from '@/lib/fileUrl';

const BASE = 'https://cdn.savora.uz';

describe('isOwnUploadUrl — faqat o\'z storage URL\'lari', () => {
  it('nisbiy /api/uploads/<key> qabul qilinadi', () => {
    expect(isOwnUploadUrl('/api/uploads/shop_1/3f2a9c0e-1b2c-4d5e-8f90-abcdef123456.jpg', '')).toBe(true);
    expect(isOwnUploadUrl('/api/uploads/receipts/shop_1/a1b2c3.png', '')).toBe(true);
    expect(ownUploadKeyFromUrl('/api/uploads/receipts/shop_1/a1b2c3.png', '')).toBe('receipts/shop_1/a1b2c3.png');
  });

  it('eski /uploads/<key> shakli ham o\'zimizniki', () => {
    expect(isOwnUploadUrl('/uploads/shop_1/a1b2c3.webp', '')).toBe(true);
    expect(ownUploadKeyFromUrl('/uploads/shop_1/a1b2c3.webp', '')).toBe('shop_1/a1b2c3.webp');
  });

  it('R2 ommaviy bazasi bilan boshlanuvchi URL qabul qilinadi', () => {
    expect(isOwnUploadUrl(`${BASE}/shop_1/a1b2c3.jpg`, BASE)).toBe(true);
    expect(isOwnUploadUrl(`${BASE}/shop_1/a1b2c3.jpg`, `${BASE}/`)).toBe(false); // baza trailing slash bilan uzatilsa ham mos kelmasa — rad
    expect(ownUploadKeyFromUrl(`${BASE}/receipts/shop_1/a1b2c3.jpg`, BASE)).toBe('receipts/shop_1/a1b2c3.jpg');
  });

  it('baza yo\'q bo\'lsa tashqi https URL rad etiladi', () => {
    expect(isOwnUploadUrl(`${BASE}/shop_1/a1b2c3.jpg`, '')).toBe(false);
  });

  it('sxemalar va tashqi hostlar rad etiladi', () => {
    expect(isOwnUploadUrl('javascript:alert(1)', BASE)).toBe(false);
    expect(isOwnUploadUrl('data:image/png;base64,AAAA', BASE)).toBe(false);
    expect(isOwnUploadUrl('https://evil.example/api/uploads/x/y.jpg', BASE)).toBe(false);
    expect(isOwnUploadUrl('//evil.example/api/uploads/x/y.jpg', BASE)).toBe(false);
    expect(isOwnUploadUrl('https://cdn.savora.uz.evil.example/x/y.jpg', BASE)).toBe(false);
    expect(isOwnUploadUrl('http://cdn.savora.uz/x/y.jpg', BASE)).toBe(false);
  });

  it('path traversal va bo\'sh segmentlar rad etiladi', () => {
    expect(isOwnUploadUrl('/api/uploads/../../etc/passwd', '')).toBe(false);
    expect(isOwnUploadUrl('/api/uploads/shop/..%2Fx.jpg', '')).toBe(false);
    expect(isOwnUploadUrl('/api/uploads//evil.example/x.jpg', '')).toBe(false);
    expect(isOwnUploadUrl('/api/uploads/', '')).toBe(false);
    expect(isOwnUploadUrl('/api/uploads/x.jpg', '')).toBe(false); // papkasiz
    expect(isOwnUploadUrl('/api/uploads/shop/x', '')).toBe(false); // kengaytmasiz
    expect(isOwnUploadUrl('/api/uploads/shop/x.jpg?x=1', '')).toBe(false);
    expect(isOwnUploadUrl('/api/uploads/shop/x.jpg#frag', '')).toBe(false);
    expect(isOwnUploadUrl('/api/uploads/shop/x y.jpg', '')).toBe(false);
    expect(isOwnUploadUrl('/api/uploads/shop/"onerror=alert(1).jpg', '')).toBe(false);
  });

  it('bo\'sh va noto\'g\'ri turdagi qiymat', () => {
    expect(isOwnUploadUrl('', BASE)).toBe(false);
    expect(isOwnUploadUrl('   ', BASE)).toBe(false);
    expect(isOwnUploadUrl(undefined as unknown as string, BASE)).toBe(false);
  });
});

describe('resolvePublicFileUrl / localUploadKeyFromUrl', () => {
  it('/uploads → /api/uploads', () => {
    expect(resolvePublicFileUrl('/uploads/a/b.jpg')).toBe('/api/uploads/a/b.jpg');
    expect(localUploadKeyFromUrl('/uploads/a/b.jpg')).toBe('a/b.jpg');
    expect(localUploadKeyFromUrl('/api/uploads/../b.jpg')).toBeNull();
  });
});

describe('isTenantUploadUrl — faqat shu do\'kon papkasi', () => {
  it('o\'z papkasidagi rasm qabul qilinadi', () => {
    expect(isTenantUploadUrl('/api/uploads/biznes_demo/a1b2c3.jpg', 'biznes_demo', '')).toBe(true);
    expect(isTenantUploadUrl(`${BASE}/biznes_demo/a1b2c3.webp`, 'biznes_demo', BASE)).toBe(true);
  });
  it('boshqa do\'kon, chek papkasi va tashqi URL rad etiladi', () => {
    expect(isTenantUploadUrl('/api/uploads/biznes_other/a1b2c3.jpg', 'biznes_demo', '')).toBe(false);
    expect(isTenantUploadUrl('/api/uploads/receipts/biznes_demo/a.png', 'biznes_demo', '')).toBe(false);
    expect(isTenantUploadUrl('/api/uploads/biznes_demo_x/a.png', 'biznes_demo', '')).toBe(false);
    expect(isTenantUploadUrl('https://evil.example/biznes_demo/a.jpg', 'biznes_demo', BASE)).toBe(false);
  });
});
