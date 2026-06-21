import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { localUploadKeyFromUrl, mimeFromUploadKey } from '@/lib/storage';

/** Lokal `public/uploads` dagi fayllarni xavfsiz xizmat qiladi (chek, mahsulot rasmlari) */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const key = segments.join('/');
  if (!key || key.includes('..')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const safeKey = localUploadKeyFromUrl(`/api/uploads/${key}`);
  if (!safeKey) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'public', 'uploads', safeKey);

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeFromUploadKey(safeKey),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Fayl topilmadi' }, { status: 404 });
  }
}
