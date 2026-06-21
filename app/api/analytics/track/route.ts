import { NextResponse } from 'next/server';
import { trackSiteVisit, type TrackPayload } from '@/lib/visitAnalytics';
import { hitRateLimit } from '@/lib/rateLimit';

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const rl = hitRateLimit(`analytics:${ip}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: Partial<TrackPayload>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const visitorId = String(body.visitorId || '').trim();
  const sessionId = String(body.sessionId || '').trim();
  const event = body.event;

  if (!visitorId || !sessionId || !event) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const allowed = ['init', 'heartbeat', 'page', 'api', 'modal_show', 'modal_dismiss'];
  if (!allowed.includes(event)) {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  }

  try {
    await trackSiteVisit({
      visitorId,
      sessionId,
      event,
      path: body.path ? String(body.path).slice(0, 500) : undefined,
      referrer: body.referrer ? String(body.referrer).slice(0, 500) : undefined,
      activeSeconds: typeof body.activeSeconds === 'number' ? Math.min(body.activeSeconds, 86_400) : undefined,
      apiPath: body.apiPath ? String(body.apiPath).slice(0, 300) : undefined,
      apiMethod: body.apiMethod ? String(body.apiMethod).slice(0, 12) : undefined,
      utmSource: body.utmSource ? String(body.utmSource).slice(0, 100) : undefined,
      utmMedium: body.utmMedium ? String(body.utmMedium).slice(0, 100) : undefined,
      utmCampaign: body.utmCampaign ? String(body.utmCampaign).slice(0, 100) : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Track failed' }, { status: 500 });
  }
}
