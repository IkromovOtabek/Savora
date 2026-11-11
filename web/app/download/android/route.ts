import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { androidSource, parseRange, type LocalApk } from '@/lib/mobileApp';

/**
 * Barqaror havola: https://savora.uz/download/android
 * Serverdagi APK'ni beradi (MOBILE_DOWNLOADS_DIR/savora.apk), bo'lmasa MOBILE_ANDROID_URL ga
 * yo'naltiradi, u ham bo'lmasa — landing «#ilova» bo'limiga.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APK_MIME = 'application/vnd.android.package-archive';

function apkHeaders(apk: LocalApk): Record<string, string> {
  return {
    'Content-Type': APK_MIME,
    'Content-Disposition': 'attachment; filename="Savora.apk"',
    'Accept-Ranges': 'bytes',
    'Last-Modified': apk.mtime.toUTCString(),
    // Yangi versiya joylansa darrov berilsin
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
}

function serve(req: Request, withBody: boolean): Response {
  const src = androidSource();
  // Nisbiy Location: nginx ortida req.url 127.0.0.1 bo'lishi mumkin
  if (!src) return new Response(null, { status: 302, headers: { Location: '/#ilova' } });
  if (src.kind === 'url') return NextResponse.redirect(src.url, 302);

  const { apk } = src;
  const headers = apkHeaders(apk);
  const range = parseRange(req.headers.get('range'), apk.size);

  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${apk.size}` } });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? apk.size - 1;
  const status = range ? 206 : 200;
  const resHeaders: Record<string, string> = { ...headers, 'Content-Length': String(end - start + 1) };
  if (range) resHeaders['Content-Range'] = `bytes ${start}-${end}/${apk.size}`;

  if (!withBody) return new Response(null, { status, headers: resHeaders });
  const body = Readable.toWeb(createReadStream(apk.path, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers: resHeaders });
}

export function GET(req: Request) {
  return serve(req, true);
}

export function HEAD(req: Request) {
  return serve(req, false);
}
