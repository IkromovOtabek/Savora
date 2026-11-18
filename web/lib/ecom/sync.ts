import type { Model, Types, AnyBulkWriteOperation } from 'mongoose';
import { getMasterModels } from '../masterDb';
import { getTenantModels } from '../tenantDb';
import { getShopSettings } from '../shopSettings';
import { isOrganizationActive, type IOrganization } from '../models/master/Organization';
import type { IProduct } from '../models/tenant/Product';
import type { IMarketListing } from '../models/master/MarketListing';
import { buildEcomGroups, ecomDisplayName, isFractionalListing, type EcomGroup, type EcomSourceProduct } from './group';
import { logError } from '../logger';

/**
 * Ochiq katalogni (master MarketListing) do'kon bazasidan qayta yig'ish.
 *  - Mahsulot yozilganda — shu do'kon (models/tenant/Product.ts ilgagi → lib/ecom/dirty.ts, debounce);
 *  - sozlama o'zgarganda — darhol (app/actions/ecom.ts);
 *  - katalog o'qilganda har 10 daqiqada bir marta — barcha do'konlar fonda (muddati tugagan do'kon tovarlari
 *    olib tashlanadi, o'tkazib yuborilgan ilgaklar tiklanadi). Cron kerak emas.
 */

export const ECOM_PRODUCT_PROJECTION = {
  name: 1, variantName: 1, color: 1, salePrice: 1, oldPrice: 1, kind: 1, status: 1, trackQuantity: 1, quantity: 1,
  soldQuantity: 1, unit: 1, stopListed: 1, systemKey: 1, ecomListed: 1, ecomDescription: 1, ecomImages: 1, photoUrl: 1,
  category: 1, brand: 1, updatedAt: 1,
} as const;

/** Do'konning omborda turgan oddiy tovarlari — guruhlangan (biznes paneli va sync uchun umumiy) */
export async function loadEcomGroups(Product: Model<IProduct>, autoPublish: boolean): Promise<EcomGroup[]> {
  const products = await Product.find(
    { status: 'in_stock', kind: { $nin: ['service', 'bundle'] }, systemKey: { $exists: false } },
    ECOM_PRODUCT_PROJECTION,
  ).lean<EcomSourceProduct[]>();
  return buildEcomGroups(products, autoPublish);
}

type OrgLite = Pick<IOrganization, 'name' | 'slug' | 'dbName' | 'status' | 'expiresAt'> & { _id: Types.ObjectId };
const ORG_FIELDS = '_id name slug dbName status expiresAt';

/** Guruh → katalog yozuvi ($set qismi) */
export function listingFields(org: OrgLite, g: EcomGroup): Omit<IMarketListing, 'orgId' | 'key' | 'syncedAt' | 'productIds'> {
  return {
    dbName: org.dbName,
    shopSlug: org.slug,
    shopName: org.name,
    name: ecomDisplayName(g),
    description: g.description,
    images: g.images,
    price: g.price,
    priceFrom: g.maxPrice > g.price,
    oldPrice: g.oldPrice,
    unit: g.unit,
    category: g.category,
    brand: g.brand,
    qty: g.qty,
    fractional: isFractionalListing(g.unit),
  };
}

async function doSync(org: OrgLite): Promise<number> {
  const { MarketListing } = await getMasterModels();
  if (!isOrganizationActive(org)) {
    await MarketListing.deleteMany({ orgId: org._id });
    return 0;
  }
  const m = await getTenantModels(org.dbName);
  const settings = await getShopSettings(m.ShopSettings);
  const live = (await loadEcomGroups(m.Product, settings.ecom?.autoPublish !== false)).filter((g) => g.state === 'live');

  const now = new Date();
  const ops: AnyBulkWriteOperation<IMarketListing>[] = live.map((g) => {
    const fields = listingFields(org, g);
    const set: Record<string, unknown> = { productIds: g.sellIds };
    const unset: Record<string, ''> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) unset[k] = '';
      else set[k] = v;
    }
    return {
      updateOne: {
        filter: { orgId: org._id, key: g.key },
        // syncedAt — $max: parallel ikki jarayon (pm2 a/b) eski vaqt bilan yangisini «eskirgan» qilib qo'ymasin
        update: { $set: set, $max: { syncedAt: now }, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        upsert: true,
      },
    };
  });
  for (let i = 0; i < ops.length; i += 500) {
    await MarketListing.bulkWrite(ops.slice(i, i + 500), { ordered: false });
  }
  await MarketListing.deleteMany({ orgId: org._id, syncedAt: { $lt: now } });
  return live.length;
}

/** Bir do'kon uchun bir vaqtda bitta yig'ish; davomida yana so'ralsa — tugagach bir marta qayta */
const inflight = new Map<string, { run: Promise<void>; again: boolean }>();

export function syncOrgListings(org: OrgLite): Promise<void> {
  const id = String(org._id);
  const cur = inflight.get(id);
  if (cur) { cur.again = true; return cur.run; }
  const entry = { run: Promise.resolve(), again: false };
  inflight.set(id, entry);
  entry.run = (async () => {
    try {
      do {
        entry.again = false;
        await doSync(org);
      } while (entry.again);
    } catch (e) {
      logError('ecom.sync', e, { org: org.slug });
    } finally {
      inflight.delete(id);
    }
  })();
  return entry.run;
}

export async function syncListingsForDb(dbName: string): Promise<void> {
  try {
    const { Organization } = await getMasterModels();
    const org = await Organization.findOne({ dbName }).select(ORG_FIELDS).lean<OrgLite>();
    if (org) await syncOrgListings(org);
  } catch (e) {
    logError('ecom.syncDb', e, { dbName });
  }
}

export async function syncOrgListingsById(orgId: string): Promise<void> {
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(orgId).select(ORG_FIELDS).lean<OrgLite>();
  if (org) await syncOrgListings(org);
}

/** Barcha do'konlar (ketma-ket — bazaga yuk tushirmasdan); o'chirilgan do'konlar yozuvlari tozalanadi */
export async function syncAllListings(): Promise<void> {
  const { Organization, MarketListing } = await getMasterModels();
  const orgs = await Organization.find({}).select(ORG_FIELDS).lean<OrgLite[]>();
  await MarketListing.deleteMany({ orgId: { $nin: orgs.map((o) => o._id) } });
  for (const org of orgs) await syncOrgListings(org);
}

const FULL_SYNC_MS = 10 * 60_000;
let lastFull = 0;
let fullRunning = false;

/** Katalog o'qilganda chaqiriladi — eskirgan bo'lsa fonda to'liq yig'ish (javobni kutdirmaydi) */
export function ensureCatalogFresh(): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  if (fullRunning || Date.now() - lastFull < FULL_SYNC_MS) return;
  lastFull = Date.now();
  fullRunning = true;
  void syncAllListings()
    .catch((e) => logError('ecom.syncAll', e))
    .finally(() => { fullRunning = false; });
}
