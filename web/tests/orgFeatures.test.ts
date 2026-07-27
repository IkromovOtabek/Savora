import { describe, it, expect } from 'vitest';
import { organizationSchema } from '@/lib/models/master/Organization';
import { parseFeaturesFromForm } from '@/lib/featuresForm';
import { FEATURE_KEYS } from '@/lib/featureKeys';

describe('Modul (feature) sxema butunligi', () => {
  // ASOSIY QO'RIQCHI: Mongoose `features` sxemasi HAR BIR FEATURE_KEY'ni qamrashi shart.
  // Aks holda strict rejim yoqilgan modulni jimgina o'chirib tashlaydi
  // (ilgari `daftar` shu sabab saqlanmagan edi).
  it('har bir FEATURE_KEY uchun Boolean sxema yo\'li mavjud', () => {
    for (const key of FEATURE_KEYS) {
      const path = organizationSchema.path(`features.${key}`);
      expect(path, `features.${key} sxemada yo'q`).toBeDefined();
      expect(path.instance, `features.${key} Boolean bo'lishi kerak`).toBe('Boolean');
    }
  });

  it('sxemada FEATURE_KEYS ga kirmagan begona feature yo\'q', () => {
    const featuresType = organizationSchema.path('features') as unknown as {
      schema?: { paths: Record<string, unknown> };
    };
    // Nested obyekt yo'llari to'g'ridan-to'g'ri `features.<key>` ko'rinishida bo'ladi
    const declared = Object.keys((organizationSchema as unknown as { paths: Record<string, unknown> }).paths)
      .filter((p) => p.startsWith('features.'))
      .map((p) => p.slice('features.'.length));
    void featuresType;
    for (const key of declared) {
      expect(FEATURE_KEYS as readonly string[], `sxemadagi '${key}' FEATURE_KEYS da yo'q`).toContain(key);
    }
  });
});

describe('parseFeaturesFromForm', () => {
  it('belgilangan checkbox true, belgilanmagani false', () => {
    const fd = new FormData();
    fd.set('feature_daftar', 'on');
    fd.set('feature_sales', 'on');
    // qolganlari yuborilmaydi (belgilanmagan checkbox)

    const parsed = parseFeaturesFromForm(fd);
    expect(parsed.daftar).toBe(true);
    expect(parsed.sales).toBe(true);
    expect(parsed.kassa).toBe(false);
    // Natija har doim TO'LIQ — hamma kalit boolean bo'ladi
    for (const key of FEATURE_KEYS) {
      expect(typeof parsed[key]).toBe('boolean');
    }
  });
});
