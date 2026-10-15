import { NextResponse } from 'next/server';
import { getApiTenantContext, getCurrentUser } from '@/lib/auth';
import { resolveOrgFeatures } from '@/lib/features';
import { saveFile } from '@/lib/storage';
import { detectImageType } from '@/lib/security';

const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function POST(req: Request) {
  // Sessiya + tokenVersion (parol o'zgarsa/bloklansa eski cookie ishlamaydi)
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: 'Kirish talab qilinadi.' }, { status: 401 });
  }

  // To'lov cheki yuklash mediaUpload moduliga bog'liq emas (har do'kon to'lay olishi kerak)
  const purpose = new URL(req.url).searchParams.get('purpose');

  let folder = 'super';
  if (current.role !== 'super_admin') {
    // Do'kon holati: to'xtatilgan — yo'q; muddati tugagan — faqat to'lov cheki
    const ctx = await getApiTenantContext({ allowExpired: purpose === 'receipt' });
    if (!ctx) {
      return NextResponse.json({ error: 'Ruxsat yo\'q.' }, { status: 403 });
    }
    const dbName = ctx.user.dbName!;
    if (purpose !== 'receipt' && !resolveOrgFeatures(ctx.org).mediaUpload) {
      return NextResponse.json({ error: 'Rasm yuklash moduli o\'chirilgan.' }, { status: 403 });
    }
    folder = purpose === 'receipt'
      ? `receipts/${dbName.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : dbName.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Rasm tanlanmadi.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Maksimal hajm 5 MB.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Turi mijoz yuborgan Content-Type'dan emas, fayl mazmunidan (magic bytes) aniqlanadi
  const detected = detectImageType(buffer);
  if (!detected) {
    return NextResponse.json({ error: 'Faqat JPG, PNG yoki WEBP rasm.' }, { status: 400 });
  }

  const saved = await saveFile({ buffer, contentType: detected }, folder, EXT[detected]);

  return NextResponse.json({ url: saved.url, key: saved.key });
}
