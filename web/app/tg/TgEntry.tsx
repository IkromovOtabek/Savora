'use client';

import { useEffect, useState } from 'react';

interface TgWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  colorScheme?: 'light' | 'dark';
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

function getInitData(): Promise<string> {
  return new Promise((resolve) => {
    let tries = 0;
    const tick = () => {
      const wa = window.Telegram?.WebApp;
      if (wa) {
        try { wa.ready(); wa.expand(); } catch { /* ignore */ }
        resolve(wa.initData || '');
        return;
      }
      if (tries++ < 20) setTimeout(tick, 150);
      else resolve('');
    };
    tick();
  });
}

export default function TgEntry() {
  const [phase, setPhase] = useState<'loading' | 'login'>('loading');
  const [initData, setInitData] = useState('');
  const [slug, setSlug] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Avto-kirish (Telegram bog'langan bo'lsa)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getInitData();
      if (cancelled) return;
      setInitData(data);
      if (data) {
        try {
          const res = await fetch('/api/tg/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: data }),
          });
          const j = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (j.ok && j.next) { window.location.replace(j.next); return; }
        } catch { /* login formaga o'tamiz */ }
      }
      if (!cancelled) setPhase('login');
    })();
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug || !username || !password) { setError("Barcha maydonlarni to'ldiring."); return; }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/tg/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, slug, username, password }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.ok && j.next) { window.location.replace(j.next); return; }
      setError(j.error || 'Kirishda xatolik.');
    } catch {
      setError('Tarmoq xatosi.');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'loading') {
    return (
      <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <style>{'@keyframes tgspin{to{transform:rotate(360deg)}}'}</style>
          <div style={{ width: 36, height: 36, margin: '0 auto 16px', border: '3px solid var(--border)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'tgspin .7s linear infinite' }} />
          <p style={{ color: 'var(--ink-2)' }}>Kirilmoqda…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap" style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form className="auth-card" onSubmit={onSubmit} style={{ width: '100%', maxWidth: 380 }}>
        <h1 className="auth-title" style={{ textAlign: 'center' }}>Savora&apos;ga kirish</h1>
        <p className="dash-sub" style={{ textAlign: 'center', marginBottom: 18 }}>
          Do&apos;kon ma&apos;lumotlaringiz bilan kiring — Telegram avtomatik bog&apos;lanadi.
        </p>

        {error && <div className="auth-alert auth-alert--error" style={{ marginTop: 0, marginBottom: 14 }}>{error}</div>}

        <div className="auth-field">
          <label htmlFor="tg-slug">Do&apos;kon manzili</label>
          <input id="tg-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="masalan: diamed" autoCapitalize="none" autoCorrect="off" />
        </div>
        <div className="auth-field">
          <label htmlFor="tg-user">Login</label>
          <input id="tg-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="login" autoCapitalize="none" autoCorrect="off" />
        </div>
        <div className="auth-field">
          <label htmlFor="tg-pass">Parol</label>
          <input id="tg-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="parol" />
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%', marginTop: 8 }}>
          {busy ? 'Kirilmoqda…' : 'Kirish'}
        </button>
      </form>
    </div>
  );
}
