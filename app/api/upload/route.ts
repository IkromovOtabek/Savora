import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMasterModels } from '@/lib/masterDb';
import { resolveOrgFeatures } from '@/lib/features';
import { saveFile } from '@/lib/storage';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'Kirish talab qilinadi.' }, { status: 401 });
  }

  // To'lov cheki yuklash mediaUpload moduliga bog'liq emas (har do'kon to'lay olishi kerak)
  const purpose = new URL(req.url).searchParams.get('purpose');

  let folder = 'super';
  if (session.user.role !== 'super_admin') {
    if (!session.user.dbName) {
      return NextResponse.json({ error: 'Ruxsat yo\'q.' }, { status: 403 });
    }
    if (purpose !== 'receipt') {
      const { Organization } = await getMasterModels();
      const org = await Organization.findOne({ dbName: session.user.dbName }).lean();
      if (!org || !resolveOrgFeatures(org).mediaUpload) {
        return NextResponse.json({ error: 'Rasm yuklash moduli o\'chirilgan.' }, { status: 403 });
      }
    }
    folder = purpose === 'receipt'
      ? `receipts/${session.user.dbName.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : session.user.dbName.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Rasm tanlanmadi.' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Faqat JPG, PNG, WEBP yoki GIF.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Maksimal hajm 5 MB.' }, { status: 400 });
  }

  const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveFile({ buffer, contentType: file.type }, folder, ext);

  return NextResponse.json({ url: saved.url, key: saved.key });
}
