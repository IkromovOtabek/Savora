import { NextRequest, NextResponse } from 'next/server';
import { cronSecretOk } from '@/lib/security';
import { getMasterModels } from '@/lib/masterDb';

/** Obuna muddati tugagan do'konlarni expired qiladi. CRON_SECRET header talab qilinadi. */
export async function GET(req: NextRequest) {
  // Faqat `Authorization: Bearer` (timing-safe); ?secret= faqat dev'da
  const ok = cronSecretOk(
    req.headers.get('authorization'),
    req.nextUrl.searchParams.get('secret'),
    process.env.CRON_SECRET,
    process.env.NODE_ENV === 'production',
  );
  if (!ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { Organization } = await getMasterModels();
  const now = new Date();
  const result = await Organization.updateMany(
    { status: 'active', expiresAt: { $lt: now } },
    { $set: { status: 'expired', updatedAt: now } },
  );

  return NextResponse.json({ ok: true, expired: result.modifiedCount });
}
