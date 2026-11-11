import { NextResponse } from 'next/server';
import { iosUrl } from '@/lib/mobileApp';

/**
 * Barqaror havola: https://savora.uz/download/ios → MOBILE_IOS_URL (TestFlight / App Store).
 * Havola o'zgarsa saytdagi tugma va tarqatilgan QR/havolalar o'zgarmaydi.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const url = iosUrl();
  // Nisbiy Location: nginx ortida req.url 127.0.0.1 bo'lishi mumkin
  return url ? NextResponse.redirect(url, 302) : new Response(null, { status: 302, headers: { Location: '/#ilova' } });
}
