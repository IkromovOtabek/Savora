import { describe, expect, it } from 'vitest';
import { DEFAULT_SHOP_SETTINGS, mergeShopSettings } from '@/lib/shopSettings';

describe('mergeShopSettings', () => {
  it('hujjat yo\'q bo\'lsa — standartlar', () => {
    expect(mergeShopSettings(null)).toMatchObject(DEFAULT_SHOP_SETTINGS);
  });

  it('saqlangan qiymat standart ustiga yoziladi, null/undefined e\'tiborsiz', () => {
    const s = mergeShopSettings({
      receipt: { paperWidth: 58, showSeller: false, showCustomer: true, footer: 'Rahmat', headerNote: undefined },
      currency: { rateMode: 'manual', manualRate: 12800 },
    } as never);
    expect(s.receipt).toEqual({ paperWidth: 58, showSeller: false, showCustomer: true, footer: 'Rahmat' });
    expect(s.currency).toEqual({ rateMode: 'manual', manualRate: 12800 });
    expect(s.notify).toEqual(DEFAULT_SHOP_SETTINGS.notify);
  });
});
