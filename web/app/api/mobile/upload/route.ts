import { NextResponse } from 'next/server';
import { authenticateMobile } from '@/lib/mobileAuth';
import { mobilePermissionDenied } from '@/lib/permissionGuard';
import { saveFile } from '@/lib/storage';
import { detectImageType } from '@/lib/security';
import { tenantUploadFolder } from '@/lib/fileUrl';

const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Mobil ilovadan mahsulot rasmini yuklash (Bearer token, multipart `file`).
 * Mahsulot rasmi barcha do'konlarda ochiq — «Rasm yuklash» moduliga bog'liq emas.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth;
  if (!user.dbName) return NextResponse.json({ error: 'Avtorizatsiya kerak.' }, { status: 401 });
  { const denied = await mobilePermissionDenied(user, 'product.create'); if (denied) return denied; }

  let formData: FormData;
  try { formData = await req.formData(); } catch { return NextResponse.json({ error: 'Noto\'g\'ri so\'rov.' }, { status: 400 }); }
  const file = formData.get('file');
  if (!file || !(file instanceof File)) return NextResponse.json({ error: 'Rasm tanlanmadi.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Maksimal hajm 5 MB.' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  // Turi mijoz yuborgan Content-Type'dan emas, fayl mazmunidan (magic bytes) aniqlanadi
  const detected = detectImageType(buffer);
  if (!detected) return NextResponse.json({ error: 'Faqat JPG, PNG yoki WEBP rasm.' }, { status: 400 });

  const saved = await saveFile({ buffer, contentType: detected }, tenantUploadFolder(user.dbName), EXT[detected]);
  return NextResponse.json({ url: saved.url }, { status: 201 });
}
