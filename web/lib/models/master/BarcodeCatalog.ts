import { Schema, Types } from 'mongoose';

/**
 * Umumiy shtrix-kod lug'ati — do'konlar kiritgan mahsulot nomlari (faqat kod + nom).
 * Master bazada: bir do'kon qo'shgan tovarni boshqa do'kon skanerlasa, nom o'zi yoziladi.
 * Har do'kon har kod uchun bitta yozuv (ovoz); ko'pchilik bergan nom tanlanadi.
 * Narx, miqdor, do'kon nomi — saqlanmaydi va boshqalarga ko'rsatilmaydi.
 */
export interface IBarcodeCatalog {
  code: string;
  name: string;
  /** Solishtirish kaliti: kichik harf, bitta probel — "Pepsi  1.5L" va "pepsi 1.5l" bitta ovoz */
  nameKey: string;
  organizationId: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export const barcodeCatalogSchema = new Schema<IBarcodeCatalog>(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    nameKey: { type: String, required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  },
  { timestamps: true, collection: 'barcode_catalog' }
);

barcodeCatalogSchema.index({ code: 1, organizationId: 1 }, { unique: true });
barcodeCatalogSchema.index({ code: 1, updatedAt: -1 });
