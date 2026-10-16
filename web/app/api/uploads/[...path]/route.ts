import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { localUploadKeyFromUrl, mimeFromUploadKey } from '@/lib/storage';
import { getSession } from '@/lib/session';
import { getApiTenantContext } from '@/lib/auth';

/**
 * To'lov cheki (`receipts/<dbName>/...`) ni kim ko'ra oladi: super admin yoki
 * cheki o'ziniki bo'lgan do'kon sessiyasi (muddati tugagan do'kon ham — to'lash uchun).
 * Papka nomi app/api/upload bilan bir xil sanitizatsiya orqali solishtiriladi.
 */
async function receiptAllowed(folder: string): Promise<boolean> {
  try {
    const sup = await getSession('super');
    if (sup.user?.role === 'super_admin') return true;
  } catch { /* super cookie yo'q */ }
  const ctx = await getApiTenantContext({ allowExpired: true });
  if (!ctx?.user.dbName) return false;
  return ctx.user.dbName.replace(/[^a-zA-Z0-9_-]/g, '_') === folder;
}

/** Lokal `public/uploads` dagi fayllarni xavfsiz xizmat qiladi (chek, mahsulot rasmlari) */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const key = segments.join('/');
  // Yashirin fayllar (.env, .htaccess va h.k.) va yuqoriga chiqish — 404
  if (!key || key.includes('..') || segments.some((s) => s.startsWith('.'))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const safeKey = localUploadKeyFromUrl(`/api/uploads/${key}`);
  if (!safeKey) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // To'lov cheklari ochiq emas — faqat super admin yoki shu do'kon
  const isReceipt = segments[0] === 'receipts';
  if (isReceipt && !(await receiptAllowed(segments[1] ?? ''))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'public', 'uploads', safeKey);

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeFromUploadKey(safeKey),
        'Cache-Control': isReceipt ? 'private, max-age=3600' : 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Fayl topilmadi' }, { status: 404 });
  }
}
