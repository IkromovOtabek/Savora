import { NextRequest, NextResponse } from 'next/server';
import { getMasterModels } from '@/lib/masterDb';

/** Obuna muddati tugagan do'konlarni expired qiladi. CRON_SECRET header talab qilinadi. */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '') ?? req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
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
