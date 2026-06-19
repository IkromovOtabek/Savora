import { randomUUID } from 'crypto';
import { mkdir, writeFile, unlink } from 'fs/promises';
import path from 'path';

/**
 * Fayl saqlash qatlami.
 *
 * Cloudflare R2 (S3-mos) sozlangan bo'lsa — bulutga yuklaydi (redeploy'da yo'qolmaydi,
 * bir nechta server bo'lsa ham ishlaydi). Aks holda — lokal `public/uploads` ga (dev).
 *
 * R2 sozlash (.env):
 *   R2_ACCOUNT_ID=...
 *   R2_ACCESS_KEY_ID=...
 *   R2_SECRET_ACCESS_KEY=...
 *   R2_BUCKET=savora-uploads
 *   R2_PUBLIC_URL=https://cdn.savora.uz   # bucket'ning public/CDN manzili
 */

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

export function isRemoteStorageEnabled(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_URL);
}

// S3 client'ni faqat kerak bo'lganda (R2 yoqilgan bo'lsa) lazy yuklaymiz.
let _s3: import('@aws-sdk/client-s3').S3Client | null = null;
async function getS3() {
  if (_s3) return _s3;
  const { S3Client } = await import('@aws-sdk/client-s3');
  _s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  });
  return _s3;
}

export interface SavedFile {
  /** Brauzerда ko'rsatiladigan to'liq URL (R2) yoki nisbiy yo'l (lokal) */
  url: string;
  /** Keyin o'chirish uchun ichki kalit (R2 key yoki lokal yo'l) */
  key: string;
}

/**
 * Faylni saqlaydi. `folder` — tenant izolatsiyasi uchun (masalan dbName).
 */
export async function saveFile(
  file: { buffer: Buffer; contentType: string },
  folder: string,
  ext: string
): Promise<SavedFile> {
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${randomUUID()}.${ext}`;
  const key = `${safeFolder}/${filename}`;

  if (isRemoteStorageEnabled()) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = await getS3();
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
    return { url: `${R2_PUBLIC_URL}/${key}`, key };
  }

  // Lokal fallback
  const dir = path.join(process.cwd(), 'public', 'uploads', safeFolder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), file.buffer);
  return { url: `/uploads/${key}`, key: `local:${key}` };
}

/**
 * Faylni o'chiradi. URL yoki saqlangan key qabul qiladi.
 */
export async function deleteFile(urlOrKey: string): Promise<void> {
  if (!urlOrKey) return;

  // R2 URL bo'lsa — key'ni ajratib olamiz
  if (isRemoteStorageEnabled() && R2_PUBLIC_URL && urlOrKey.startsWith(R2_PUBLIC_URL)) {
    const key = urlOrKey.slice(R2_PUBLIC_URL.length + 1);
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = await getS3();
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })).catch(() => {});
    return;
  }

  // Lokal fayl
  const rel = urlOrKey.startsWith('local:')
    ? urlOrKey.slice('local:'.length)
    : urlOrKey.startsWith('/uploads/')
      ? urlOrKey.slice('/uploads/'.length)
      : null;
  if (rel) {
    await unlink(path.join(process.cwd(), 'public', 'uploads', rel)).catch(() => {});
  }
}
