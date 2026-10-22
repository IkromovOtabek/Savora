import { API_URL, ApiError, getToken } from './api';
import { getDict } from './i18n';

/**
 * «Yangi tovar» formasi uchun yordamchilar: tanlov ekranlari natijasi, kod yaratish, rasm yuklash.
 */

export interface NamedItem { id: string; name: string }
export interface CategoryItem { id: string; name: string; parentId: string | null }
export interface CategoryChoice extends NamedItem { path: string }

/** Tanlov ekranlari natijasi — chaqirgan ekran focus'da oladi (pick.ts kabi) */
interface Choices {
  unit: string;
  brand: NamedItem | null;
  supplier: NamedItem | null;
  category: CategoryChoice | null;
  barcode: string;
  /** To'plam tarkibiga tanlangan tovar (bundle-pick ekranidan) */
  bundleItem: BundleChoice;
}

/** To'plamga qo'shiladigan tovar: shu omborning sanaladigan tovari */
export interface BundleChoice { id: string; name: string; unit: string | null; available: number }

const pending: Partial<Choices> = {};

export function putChoice<K extends keyof Choices>(key: K, value: Choices[K]) { pending[key] = value; }
export function takeChoice<K extends keyof Choices>(key: K): Choices[K] | undefined {
  if (!(key in pending)) return undefined;
  const v = pending[key] as Choices[K];
  delete pending[key];
  return v;
}

/** Formadagi asosiy birliklar (tanlov ekrani) */
export const FORM_UNITS = ['dona', 'kg', 'm', 'l'] as const;

/** Do'kon ichki shtrix-kodi: EAN-13, "2" bilan boshlanadi (ichki foydalanish diapazoni) */
export function generateBarcode(): string {
  let body = '2';
  for (let i = 0; i < 11; i++) body += Math.floor(Math.random() * 10);
  const sum = body.split('').reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return body + ((10 - (sum % 10)) % 10);
}

/** Artikul: ART-XXXXXX (takrorlansa server 409 qaytaradi) */
export function generateArticle(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `ART-${s}`;
}

/** Tekis ro'yxatdan daraxt tartibi: [{ item, depth, path }] (ota → bolalar) */
export function flattenCategories(items: CategoryItem[]): { item: CategoryItem; depth: number; path: string }[] {
  const byParent = new Map<string | null, CategoryItem[]>();
  for (const it of items) {
    const k = it.parentId && items.some((x) => x.id === it.parentId) ? it.parentId : null;
    byParent.set(k, [...(byParent.get(k) ?? []), it]);
  }
  const out: { item: CategoryItem; depth: number; path: string }[] = [];
  const walk = (parent: string | null, depth: number, prefix: string) => {
    for (const it of byParent.get(parent) ?? []) {
      const path = prefix ? `${prefix} / ${it.name}` : it.name;
      out.push({ item: it, depth, path });
      if (depth < 8) walk(it.id, depth + 1, path);
    }
  };
  walk(null, 0, '');
  return out;
}

/** Serverdagi nisbiy rasm manzilini to'liq URL'ga aylantiradi */
export function fileUri(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${API_URL}${url.startsWith('/uploads/') ? `/api${url}` : url}`;
}

/** Mahsulot rasmini yuklash (multipart) → server URL */
export async function uploadPhoto(uri: string, mimeType?: string | null): Promise<string> {
  const token = await getToken();
  const type = mimeType || 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const form = new FormData();
  // React Native FormData fayl ko'rinishi: { uri, name, type }
  form.append('file', { uri, name: `photo.${ext}`, type } as unknown as Blob);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/mobile/upload`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(getDict().api.offline, 0);
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new ApiError(data.error || getDict().productForm.photoError, res.status);
  return data.url;
}
