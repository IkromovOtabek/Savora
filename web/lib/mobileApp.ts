import { statSync } from 'fs';
import path from 'path';

/**
 * Mobil ilovani yuklab olish manbalari (landing «#ilova», /download/*).
 *
 * Android: serverdagi `MOBILE_DOWNLOADS_DIR/savora.apk` (asosiy — EAS havolalari ~14 kunda
 * o'chadi, shuning uchun APK o'zimizda saqlanadi), bo'lmasa `MOBILE_ANDROID_URL` (masalan Play).
 * iOS: `MOBILE_IOS_URL` (TestFlight public link yoki App Store).
 * Hammasi so'rov vaqtida o'qiladi — fayl almashtirilsa qayta build kerak emas.
 */

export const APK_FILE_NAME = 'savora.apk';
export const ANDROID_DOWNLOAD_PATH = '/download/android';
export const IOS_DOWNLOAD_PATH = '/download/ios';

export interface LocalApk {
  path: string;
  size: number;
  mtime: Date;
}

/** Faqat to'liq https havola (env'dagi xato/bo'sh qiymat tugmani ochmasin) */
export function httpsUrl(value: string | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '';
  try {
    return new URL(v).protocol === 'https:' ? v : '';
  } catch {
    return '';
  }
}

/**
 * Saytga qo'yib bo'ladigan havola: https va EAS artefakti emas
 * (`expo.dev/artifacts/...` ~14 kunda 404 bo'ladi — env'da qolib ketsa tugma buzilmasin).
 */
export function stableUrl(value: string | undefined): string {
  const url = httpsUrl(value);
  if (!url) return '';
  const u = new URL(url);
  const isEasArtifact = /(^|\.)expo\.dev$/.test(u.hostname) && u.pathname.startsWith('/artifacts/');
  return isEasArtifact ? '' : url;
}

/** Serverdagi APK fayli (bo'lmasa yoki bo'sh bo'lsa — null) */
export function localApk(dir: string | undefined = process.env.MOBILE_DOWNLOADS_DIR): LocalApk | null {
  if (!dir?.trim()) return null;
  const file = path.join(path.resolve(dir.trim()), APK_FILE_NAME);
  try {
    const st = statSync(file);
    return st.isFile() && st.size > 0 ? { path: file, size: st.size, mtime: st.mtime } : null;
  } catch {
    return null;
  }
}

/** Android tugmasi qayerga olib boradi: lokal fayl → tashqi havola → yo'q */
export function androidSource(): { kind: 'file'; apk: LocalApk } | { kind: 'url'; url: string } | null {
  const apk = localApk();
  if (apk) return { kind: 'file', apk };
  const url = stableUrl(process.env.MOBILE_ANDROID_URL);
  return url ? { kind: 'url', url } : null;
}

export function iosUrl(): string {
  return stableUrl(process.env.MOBILE_IOS_URL);
}

/** Landing tugmalari: barqaror ichki yo'l yoki '' («Tez kunda») */
export function mobileDownloadLinks(): { android: string; ios: string } {
  return {
    android: androidSource() ? ANDROID_DOWNLOAD_PATH : '',
    ios: iosUrl() ? IOS_DOWNLOAD_PATH : '',
  };
}

/**
 * `Range: bytes=a-b` (bitta oraliq) — Android yuklab olish menejeri uzilgan yuklamani davom ettiradi.
 * Noto'g'ri/qo'llab-quvvatlanmaydigan sarlavha → null (butun fayl), oraliq tashqarida → 'invalid' (416).
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    // bytes=-N — oxirgi N bayt
    const n = Number(m[2]);
    if (n <= 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}
