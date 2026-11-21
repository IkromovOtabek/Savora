import { Types } from 'mongoose';
import { getMasterModels } from '../masterDb';
import { getTenantModels } from '../tenantDb';
import { getShopSettings } from '../shopSettings';
import { isOrganizationActive } from '../models/master/Organization';
import type { IMarketListing } from '../models/master/MarketListing';
import { resolvePublicFileUrl } from '../fileUrl';
import { searchPattern } from '../security';
import { ensureCatalogFresh } from './sync';

/**
 * Ochiq katalog (xaridor tomoni) — faqat master MarketListing'dan o'qiydi. Ichki maydonlar (dbName, productIds)
 * javobga HECH QACHON chiqmaydi. Har o'qishda katalog eskirgan bo'lsa fonda yangilanadi.
 */

export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_SORTS = ['new', 'cheap', 'expensive'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export interface ListingCard {
  id: string;
  name: string;
  price: number;
  priceFrom: boolean;
  oldPrice?: number;
  image?: string;
  shopName: string;
  shopSlug: string;
  qty: number;
  unit?: string;
  fractional: boolean;
  category?: string;
}

export interface ListingDetail extends ListingCard {
  description?: string;
  images: string[];
  brand?: string;
}

type ListingDoc = IMarketListing & { _id: Types.ObjectId };
const CARD_FIELDS = '_id name price priceFrom oldPrice images shopName shopSlug qty unit fractional category';

export function toCard(l: Pick<ListingDoc, '_id' | 'name' | 'price' | 'priceFrom' | 'oldPrice' | 'images' | 'shopName' | 'shopSlug' | 'qty' | 'unit' | 'fractional' | 'category'>): ListingCard {
  return {
    id: String(l._id), name: l.name, price: l.price, priceFrom: !!l.priceFrom, oldPrice: l.oldPrice || undefined,
    image: l.images?.[0] ? resolvePublicFileUrl(l.images[0]) : undefined,
    shopName: l.shopName, shopSlug: l.shopSlug, qty: l.qty, unit: l.unit || undefined, fractional: !!l.fractional,
    category: l.category || undefined,
  };
}

export function parseSort(v: unknown): CatalogSort {
  return (CATALOG_SORTS as readonly string[]).includes(String(v)) ? (v as CatalogSort) : 'new';
}

export async function searchListings(opts: {
  q?: string; category?: string; shop?: string; sort?: CatalogSort; page?: number; limit?: number;
}): Promise<{ items: ListingCard[]; total: number; page: number; pages: number }> {
  ensureCatalogFresh();
  const { MarketListing } = await getMasterModels();
  const filter: Record<string, unknown> = { qty: { $gt: 0 } };
  const q = searchPattern(opts.q, 60);
  if (q) filter.$or = [{ name: { $regex: q, $options: 'i' } }, { brand: { $regex: q, $options: 'i' } }, { category: { $regex: q, $options: 'i' } }];
  if (opts.category) filter.category = String(opts.category).slice(0, 80);
  if (opts.shop) filter.shopSlug = String(opts.shop).slice(0, 80).toLowerCase();
  const limit = Math.min(Math.max(opts.limit ?? CATALOG_PAGE_SIZE, 1), 60);
  const page = Math.min(Math.max(Math.floor(opts.page ?? 1), 1), 200);
  const sort: Record<string, 1 | -1> = opts.sort === 'cheap' ? { price: 1, _id: 1 } : opts.sort === 'expensive' ? { price: -1, _id: 1 } : { createdAt: -1, _id: 1 };
  const [list, total] = await Promise.all([
    MarketListing.find(filter).select(CARD_FIELDS).sort(sort).skip((page - 1) * limit).limit(limit).lean<ListingDoc[]>(),
    MarketListing.countDocuments(filter),
  ]);
  return { items: list.map(toCard), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Eng ko'p tovarli turkumlar (filtr tugmalari) */
export async function topCategories(shop?: string, limit = 16): Promise<{ name: string; count: number }[]> {
  const { MarketListing } = await getMasterModels();
  const match: Record<string, unknown> = { qty: { $gt: 0 }, category: { $nin: [null, ''] } };
  if (shop) match.shopSlug = String(shop).slice(0, 80).toLowerCase();
  const rows = await MarketListing.aggregate<{ _id: string; count: number }>([
    { $match: match },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({ name: r._id, count: r.count }));
}

export async function getListing(id: string): Promise<ListingDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  ensureCatalogFresh();
  const { MarketListing } = await getMasterModels();
  const l = await MarketListing.findOne({ _id: id, qty: { $gt: 0 } }).lean<ListingDoc>();
  if (!l) return null;
  return { ...toCard(l), description: l.description || undefined, images: (l.images ?? []).map(resolvePublicFileUrl), brand: l.brand || undefined };
}

/** Savatni yangilash: joriy narx/qoldiq; sotuvdan olinganlar ro'yxatda bo'lmaydi */
export async function cartListings(ids: unknown): Promise<ListingCard[]> {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter((id) => Types.ObjectId.isValid(id)).slice(0, 100);
  if (list.length === 0) return [];
  ensureCatalogFresh();
  const { MarketListing } = await getMasterModels();
  const rows = await MarketListing.find({ _id: { $in: list }, qty: { $gt: 0 } }).select(CARD_FIELDS).lean<ListingDoc[]>();
  return rows.map(toCard);
}

export interface ShopInfo { slug: string; name: string; note?: string; count: number }

/** Do'kon sahifasi: nom, xarid shartlari, tovarlar soni. Faol bo'lmagan do'kon — null */
export async function shopInfo(slug: string): Promise<ShopInfo | null> {
  const s = String(slug ?? '').trim().toLowerCase().slice(0, 80);
  if (!s) return null;
  const { Organization, MarketListing } = await getMasterModels();
  const org = await Organization.findOne({ slug: s }).select('name slug dbName status expiresAt').lean();
  if (!org || !isOrganizationActive(org)) return null;
  const [count, settings] = await Promise.all([
    MarketListing.countDocuments({ orgId: org._id, qty: { $gt: 0 } }),
    getTenantModels(org.dbName).then((m) => getShopSettings(m.ShopSettings)).catch(() => null),
  ]);
  return { slug: org.slug, name: org.name, note: settings?.ecom?.note || undefined, count };
}
