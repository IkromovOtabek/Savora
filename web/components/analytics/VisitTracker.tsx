'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import SignupPromptModal from '@/components/analytics/SignupPromptModal';

const VISITOR_KEY = 'sv_vid';
const SESSION_KEY = 'sv_sid';
const MODAL_DISMISS_KEY = 'sv_modal_dismiss';
const PROMPT_SECONDS = 45;
const HEARTBEAT_MS = 15_000;

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = newId();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = newId();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function isPublicMarketingPath(path: string): boolean {
  if (path.startsWith('/app') || path.startsWith('/super') || path.startsWith('/t/')) return false;
  if (path === '/login' || path === '/register' || path === '/forgot') return false;
  return true;
}

function readUtm(): { utmSource?: string; utmMedium?: string; utmCampaign?: string } {
  if (typeof window === 'undefined') return {};
  const sp = new URLSearchParams(window.location.search);
  return {
    utmSource: sp.get('utm_source') || undefined,
    utmMedium: sp.get('utm_medium') || undefined,
    utmCampaign: sp.get('utm_campaign') || undefined,
  };
}

async function sendTrack(body: Record<string, unknown>) {
  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    /* analytics — silent fail */
  }
}

export default function VisitTracker() {
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);
  const activeSecRef = useRef(0);
  const modalShownRef = useRef(false);
  const initSentRef = useRef(false);
  const visitorIdRef = useRef('');
  const sessionIdRef = useRef('');
  const fetchPatchedRef = useRef(false);

  const track = useCallback((payload: Record<string, unknown>) => {
    if (!visitorIdRef.current || !sessionIdRef.current) return;
    void sendTrack({
      visitorId: visitorIdRef.current,
      sessionId: sessionIdRef.current,
      ...payload,
    });
  }, []);

  const showModal = useCallback(() => {
    if (modalShownRef.current) return;
    if (sessionStorage.getItem(MODAL_DISMISS_KEY) === '1') return;
    modalShownRef.current = true;
    setModalOpen(true);
    track({ event: 'modal_show', path: pathname, activeSeconds: activeSecRef.current });
  }, [pathname, track]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    sessionStorage.setItem(MODAL_DISMISS_KEY, '1');
    track({ event: 'modal_dismiss', path: pathname, activeSeconds: activeSecRef.current });
  }, [pathname, track]);

  useEffect(() => {
    if (!isPublicMarketingPath(pathname)) return;

    visitorIdRef.current = getVisitorId();
    sessionIdRef.current = getSessionId();

    if (!initSentRef.current) {
      initSentRef.current = true;
      track({
        event: 'init',
        path: pathname,
        referrer: document.referrer || '',
        activeSeconds: 0,
        ...readUtm(),
      });
    } else {
      track({ event: 'page', path: pathname, activeSeconds: activeSecRef.current });
    }

    if (!fetchPatchedRef.current) {
      fetchPatchedRef.current = true;
      const origFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await origFetch(input, init);
        try {
          const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
          const url = new URL(raw, window.location.origin);
          if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/analytics/')) {
            track({
              event: 'api',
              apiPath: url.pathname,
              apiMethod: (init?.method || 'GET').toUpperCase(),
              path: window.location.pathname,
              activeSeconds: activeSecRef.current,
            });
          }
        } catch {
          /* ignore */
        }
        return res;
      };
    }
  }, [pathname, track]);

  useEffect(() => {
    if (!isPublicMarketingPath(pathname)) return;

    const tick = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      activeSecRef.current += 1;
      if (activeSecRef.current >= PROMPT_SECONDS && !modalShownRef.current) {
        showModal();
      }
    }, 1000);

    const heartbeat = window.setInterval(() => {
      track({ event: 'heartbeat', path: pathname, activeSeconds: activeSecRef.current });
    }, HEARTBEAT_MS);

    return () => {
      window.clearInterval(tick);
      window.clearInterval(heartbeat);
    };
  }, [pathname, showModal, track]);

  if (!isPublicMarketingPath(pathname)) return null;

  return <SignupPromptModal open={modalOpen} onClose={closeModal} />;
}
