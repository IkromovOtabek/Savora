import { Schema, type Model } from 'mongoose';

/**
 * Soft-delete — o'chirish o'rniga `deletedAt` belgisi (audit va tiklash uchun ma'lumot saqlanadi).
 *
 * Plagin ulangan modelda o'chirilgan hujjatlar AVTOMATIK yashiriladi:
 *   find / findOne / findById / exists / countDocuments / update* / delete* / distinct / aggregate.
 * O'chirilganlarni ham ko'rish (tiklash, audit): `.setOptions({ withDeleted: true })`
 * yoki aggregate uchun `Model.aggregate(p).option({ withDeleted: true })`.
 *
 * Eslatma: `{ deletedAt: null }` maydoni umuman yo'q eski hujjatlarga ham mos keladi — migratsiya shart emas.
 */
const FILTERED_QUERIES = [
  'find',
  'findOne',
  'countDocuments',
  'distinct',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
] as const;

export interface SoftDeleteFields {
  deletedAt?: Date | null;
  deletedBy?: string;
  /** Unikal maydonlarning o'chirishdan oldingi qiymati (masalan imei) — tiklash uchun */
  deletedValues?: Record<string, unknown>;
}

export function softDeletePlugin(schema: Schema): void {
  schema.add({
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, trim: true },
    deletedValues: { type: Schema.Types.Mixed },
  } as never);

  for (const op of FILTERED_QUERIES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.pre(op as any, function (this: any) {
      if (this.getOptions?.().withDeleted) return;
      const filter = this.getFilter?.() ?? {};
      if (Object.prototype.hasOwnProperty.call(filter, 'deletedAt')) return;
      this.where({ deletedAt: null });
    });
  }

  schema.pre('aggregate', function () {
    if ((this.options as { withDeleted?: boolean } | undefined)?.withDeleted) return;
    const pipeline = this.pipeline();
    // $geoNear / $search birinchi bosqich bo'lishi shart — ular ishlatilmaydi, lekin buzmaylik
    const first = pipeline[0] as unknown as Record<string, unknown> | undefined;
    if (first && ('$geoNear' in first || '$search' in first)) return;
    pipeline.unshift({ $match: { deletedAt: null } });
  });
}

/**
 * Bitta hujjatni soft-delete qiladi. `uniqueFields` — unikal indeksli maydonlar (imei, productId):
 * ular `~DEL~<vaqt>` qo'shimchasi bilan o'zgartiriladi (shu IMEI bilan qayta qo'shish mumkin bo'lsin),
 * asl qiymatlar `deletedValues` da saqlanadi.
 * @returns o'chirishdan OLDINGI hujjat yoki null (topilmadi / allaqachon o'chirilgan)
 */
export async function softDeleteOne<T>(
  model: Model<T>,
  filter: Record<string, unknown>,
  by: string,
  uniqueFields: string[] = [],
): Promise<(T & SoftDeleteFields & { _id: unknown }) | null> {
  const suffix = `~DEL~${Date.now()}`;
  const set: Record<string, unknown> = { deletedAt: '$$NOW', deletedBy: by };
  if (uniqueFields.length) {
    set.deletedValues = Object.fromEntries(uniqueFields.map((f) => [f, `$${f}`]));
    for (const f of uniqueFields) {
      set[f] = { $cond: [{ $ifNull: [`$${f}`, false] }, { $concat: [`$${f}`, suffix] }, `$${f}`] };
    }
  }
  // Pipeline update: bitta $set bosqichida `$imei` eski qiymatni bildiradi — deletedValues to'g'ri yoziladi
  return model
    .findOneAndUpdate({ ...filter, deletedAt: null }, [{ $set: set }], { new: false })
    .lean<T & SoftDeleteFields & { _id: unknown }>();
}
