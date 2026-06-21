import { headers } from 'next/headers';
import { getMasterModels } from '@/lib/masterDb';
import type { IVisitEvent } from '@/lib/models/master/SiteVisit';

const MAX_EVENTS = 80;

export function getClientIp(h: Headers): string {
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || '';
  return h.get('x-real-ip') || '';
}

export function parseReferrerHost(referrer?: string): string {
  if (!referrer?.trim()) return 'To\'g\'ridan-to\'g\'ri';
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return referrer.slice(0, 80);
  }
}

export function parseDeviceLabel(userAgent?: string): string {
  if (!userAgent) return 'Noma\'lum';
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('mac os')) return 'Mac';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('linux')) return 'Linux';
  return 'Brauzer';
}

function pushEvent(events: IVisitEvent[], event: IVisitEvent): IVisitEvent[] {
  const next = [...events, event];
  if (next.length <= MAX_EVENTS) return next;
  return next.slice(next.length - MAX_EVENTS);
}

export type TrackPayload = {
  visitorId: string;
  sessionId: string;
  event: 'init' | 'heartbeat' | 'page' | 'api' | 'modal_show' | 'modal_dismiss';
  path?: string;
  referrer?: string;
  activeSeconds?: number;
  apiPath?: string;
  apiMethod?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

export async function trackSiteVisit(payload: TrackPayload) {
  const { SiteVisit } = await getMasterModels();
  const h = await headers();
  const now = new Date();
  const ip = getClientIp(h);
  const userAgent = h.get('user-agent') || undefined;

  if (payload.event === 'init') {
    const landing = payload.path || '/';
    const existing = await SiteVisit.findOne({ sessionId: payload.sessionId }).lean();
    if (existing) {
      await SiteVisit.updateOne({ sessionId: payload.sessionId }, { $set: { lastSeenAt: now } });
      return;
    }

    await SiteVisit.create({
      visitorId: payload.visitorId,
      sessionId: payload.sessionId,
      ip,
      userAgent,
      referrer: payload.referrer || '',
      referrerHost: parseReferrerHost(payload.referrer),
      landingPage: landing,
      currentPage: landing,
      utmSource: payload.utmSource,
      utmMedium: payload.utmMedium,
      utmCampaign: payload.utmCampaign,
      startedAt: now,
      lastSeenAt: now,
      activeSeconds: 0,
      events: [{ type: 'page', path: landing, at: now }],
    });
    return;
  }

  const visit = await SiteVisit.findOne({ sessionId: payload.sessionId });
  if (!visit) {
    await trackSiteVisit({
      ...payload,
      event: 'init',
      path: payload.path || '/',
      referrer: payload.referrer,
    });
    return;
  }

  const update: Record<string, unknown> = { lastSeenAt: now };

  if (typeof payload.activeSeconds === 'number' && payload.activeSeconds >= 0) {
    update.activeSeconds = Math.max(visit.activeSeconds, payload.activeSeconds);
    if (payload.activeSeconds >= 45) update.signupPromptEligible = true;
  }

  if (payload.path) update.currentPage = payload.path;

  if (payload.event === 'modal_show') {
    update.signupModalShown = true;
    update.signupPromptEligible = true;
  }
  if (payload.event === 'modal_dismiss') update.signupModalDismissed = true;

  const eventEntry: IVisitEvent | null =
    payload.event === 'page' && payload.path
      ? { type: 'page', path: payload.path, at: now }
      : payload.event === 'api' && payload.apiPath
        ? { type: 'api', path: payload.apiPath, method: payload.apiMethod, at: now }
        : payload.event === 'modal_show'
          ? { type: 'modal_show', path: payload.path || visit.currentPage || '/', at: now }
          : payload.event === 'modal_dismiss'
            ? { type: 'modal_dismiss', path: payload.path || visit.currentPage || '/', at: now }
            : null;

  if (eventEntry) {
    update.events = pushEvent(visit.events, eventEntry);
  }

  await SiteVisit.updateOne({ sessionId: payload.sessionId }, { $set: update });
}

export async function markVisitSignedUp(input: {
  visitorId?: string;
  sessionId?: string;
  organizationId: string;
  organizationSlug: string;
}) {
  if (!input.visitorId && !input.sessionId) return;

  const { SiteVisit } = await getMasterModels();
  const now = new Date();
  const filter = input.sessionId
    ? { sessionId: input.sessionId }
    : { visitorId: input.visitorId };

  await SiteVisit.updateMany(filter, {
    $set: {
      signedUp: true,
      signedUpAt: now,
      organizationId: input.organizationId,
      organizationSlug: input.organizationSlug,
    },
  });
}
