import { getMasterModels } from './masterDb';
import { getBaseConnection } from './db';
import { clearTenantModelCache } from './tenantDb';
import { releaseUsernamesForOrg } from './userDirectory';
import { deleteFolder } from './storage';

/** Tenant bazasi nomi faqat shu shaklda bo'lsa o'chiriladi (master yoki boshqa baza tasodifan o'chmasin) */
const TENANT_DB_RE = /^biznes_[a-z0-9][a-z0-9_-]{1,60}$/;

export function isDeletableTenantDb(dbName: string): boolean {
  const master = process.env.MASTER_DB_NAME || 'savdopro_master';
  return TENANT_DB_RE.test(dbName) && dbName !== master;
}

/**
 * Tenant bazasini o'chiradi. `dropDatabase` huquqi bo'lmasa (prod'da readWrite rol) —
 * har bir kolleksiyani alohida o'chiradi (bo'sh baza MongoDB'da o'z-o'zidan yo'qoladi).
 */
async function dropTenantDatabase(dbName: string): Promise<void> {
  const base = await getBaseConnection();
  const conn = base.useDb(dbName, { useCache: false });
  try {
    await conn.dropDatabase();
  } catch {
    const db = conn.db;
    if (!db) throw new Error("Do'kon bazasiga ulanib bo'lmadi.");
    const cols = await db.listCollections({}, { nameOnly: true }).toArray();
    for (const c of cols) {
      if (c.name.startsWith('system.')) continue;
      await db.dropCollection(c.name);
    }
  }
}

export interface DeletedOrgInfo {
  name: string;
  slug: string;
  dbName: string;
}

/**
 * Do'konni BUTUNLAY o'chiradi (qaytarib bo'lmaydi — faqat kunlik zaxiradan):
 *   1) darhol to'xtatiladi va barcha loginlari global registrdan olinadi (kirish yopiladi);
 *   2) Telegram bog'lanishlari va do'kon sharhlari o'chadi;
 *   3) tenant bazasi (sotuv, ombor, mijoz, xodim...) va yuklangan fayllar o'chadi;
 *   4) oxirida master yozuv o'chadi (oraliqda xato bo'lsa — yozuv «to'xtatilgan» bo'lib qoladi, qayta urinish mumkin).
 * To'lov so'rovlari (platforma daromadi hisobi), xavfsizlik jurnali, umumiy shtrix-kod va IMEI
 * qora ro'yxati saqlanadi — ular platformaga tegishli yoki boshqa do'konlar ham foydalanadi.
 */
export async function deleteOrganizationPermanently(orgId: string): Promise<DeletedOrgInfo> {
  const { Organization, TelegramAccount, Review } = await getMasterModels();
  const org = await Organization.findById(orgId).select('name slug dbName').lean().catch(() => null);
  if (!org) throw new Error("Do'kon topilmadi.");
  if (!isDeletableTenantDb(org.dbName)) throw new Error(`«${org.dbName}» bazasini o'chirish taqiqlangan.`);

  await Organization.updateOne({ _id: org._id }, { $set: { status: 'suspended' } });
  await releaseUsernamesForOrg(String(org._id));
  await TelegramAccount.deleteMany({ organizationId: org._id });
  await Review.deleteMany({ organizationId: org._id });

  await dropTenantDatabase(org.dbName);
  clearTenantModelCache();
  await deleteFolder(org.dbName);

  await Organization.deleteOne({ _id: org._id });
  return { name: org.name, slug: org.slug, dbName: org.dbName };
}
