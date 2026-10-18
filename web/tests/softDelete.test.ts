/**
 * Soft-delete plagini — haqiqiy MongoDB bilan (MONGO_TEST_URI berilsa), aks holda o'tkazib yuboriladi.
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27019 npx vitest run tests/softDelete.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose, { Schema } from 'mongoose';
import { softDeletePlugin, softDeleteOne, type SoftDeleteFields } from '@/lib/softDelete';

const URI = process.env.MONGO_TEST_URI;

describe.skipIf(!URI)('softDelete (MongoDB)', () => {
  let conn: mongoose.Connection;
  type ItemDoc = { name: string; imei: string; code?: string; qty: number } & SoftDeleteFields;
  let Item: mongoose.Model<ItemDoc>;

  beforeAll(async () => {
    conn = await mongoose.createConnection(`${URI}/savora_softdelete_test_${Date.now()}`).asPromise();
    const schema = new Schema<ItemDoc>({ name: String, imei: { type: String, unique: true }, code: { type: String, unique: true, sparse: true }, qty: Number });
    softDeletePlugin(schema);
    Item = conn.model('Item', schema);
    await Item.init();
  });
  afterAll(async () => {
    await conn?.dropDatabase();
    await conn?.close();
  });

  it("o'chirilgan hujjat so'rovlardan yashiriladi, withDeleted bilan ko'rinadi", async () => {
    const a = await Item.create({ name: 'A', imei: 'IMEI1', code: 'C1', qty: 2 });
    await Item.create({ name: 'B', imei: 'IMEI2', qty: 3 });

    const before = await softDeleteOne(Item, { _id: a._id }, 'ali', ['imei', 'code']);
    expect(before?.imei).toBe('IMEI1');

    expect(await Item.countDocuments()).toBe(1);
    expect(await Item.findById(a._id)).toBeNull();
    expect(await Item.exists({ imei: 'IMEI1' })).toBeNull();
    const agg = await Item.aggregate([{ $group: { _id: null, q: { $sum: '$qty' } } }]);
    expect(agg[0].q).toBe(3);

    const raw = await Item.findById(a._id).setOptions({ withDeleted: true }).lean();
    expect(raw?.deletedBy).toBe('ali');
    expect(raw?.deletedAt).toBeInstanceOf(Date);
    expect(raw?.deletedValues).toEqual({ imei: 'IMEI1', code: 'C1' });
    expect(raw?.imei).toMatch(/^IMEI1~DEL~\d+$/);

    // Shu IMEI bilan qayta qo'shish mumkin (unikal indeks bo'shatilgan)
    await expect(Item.create({ name: 'A2', imei: 'IMEI1', code: 'C1', qty: 1 })).resolves.toBeTruthy();
    // Ikkinchi marta o'chirish — null (allaqachon o'chirilgan)
    expect(await softDeleteOne(Item, { _id: a._id }, 'ali')).toBeNull();
  });

  it("unikal maydon bo'lmasa ham ishlaydi", async () => {
    const c = await Item.create({ name: 'C', imei: 'IMEI3', qty: 1 });
    const before = await softDeleteOne(Item, { _id: c._id }, 'vali', ['imei', 'code']);
    expect(before?.name).toBe('C');
    const raw = await Item.findById(c._id).setOptions({ withDeleted: true }).lean();
    expect(raw?.code).toBeUndefined();
  });
});
