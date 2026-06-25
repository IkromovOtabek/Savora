import type { Connection } from 'mongoose';
import { getBaseConnection } from './db';
import { getTenantModels } from './tenantDb';
import { TENANT_COLLECTIONS } from './featureKeys';

/**
 * Har bir biznes uchun alohida MongoDB database yaratadi/tayyorlaydi.
 * DB nomi: biznes_<slug> (masalan: biznes_dokon1)
 * Collectionlar: users, branches, products, customers, sales
 */
export async function ensureTenantDatabase(dbName: string): Promise<Connection> {
  if (!dbName) throw new Error('dbName majburiy');

  const base = await getBaseConnection();
  const conn = base.useDb(dbName, { useCache: false });

  // Modellarni ro'yxatdan o'tkazish (collectionlar yaratiladi)
  await getTenantModels(dbName);

  const db = conn.db;
  if (!db) throw new Error('Tenant DB ulanmadi');

  const existing = await db.listCollections().toArray();
  const names = new Set(existing.map((c) => c.name));

  for (const col of TENANT_COLLECTIONS) {
    if (!names.has(col)) {
      await db.createCollection(col);
    }
  }

  return conn;
}

/** Eski tenant_* nomini biznes_* ga migratsiya (ixtiyoriy) */
export function normalizeTenantDbName(stored: string, slug: string): string {
  if (stored.startsWith('biznes_')) return stored;
  if (stored.startsWith('tenant_')) return stored.replace(/^tenant_/, 'biznes_');
  return `biznes_${slug}`;
}
