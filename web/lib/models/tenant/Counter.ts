import { Schema } from 'mongoose';

/**
 * Atomik ketma-ketlik hisoblagichi (har tenant bazasida alohida).
 * _id — kalit, masalan `sale:S20261015` yoki `transfer:T20261015`.
 * `findOneAndUpdate({ _id }, { $inc: { seq: 1 } })` bilan raqam olinadi — parallel
 * so'rovlarda ham takrorlanmaydi (countDocuments + 1 dan farqli).
 */
export interface ICounter {
  _id: string;
  seq: number;
}

export const counterSchema = new Schema<ICounter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'counters', versionKey: false }
);
