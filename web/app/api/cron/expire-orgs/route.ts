import { NextRequest } from 'next/server';
import { handleCronRequest } from '@/lib/cronRuns';
import { expireOverdueOrganizations } from '@/lib/organizations';

/** Obuna muddati tugagan do'konlarni expired qiladi. CRON_SECRET header talab qilinadi. */
export async function GET(req: NextRequest) {
  return handleCronRequest(req, 'expire-orgs', async () => {
    const expired = await expireOverdueOrganizations();
    return { expired };
  });
}
