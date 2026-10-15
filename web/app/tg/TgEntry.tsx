'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/icons/Icon';
import AuthShell, { AuthAlert } from '@/components/auth/AuthShell';

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
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);
  const [error, setError] = useState('');

  async function tryTelegram(data: string): Promise<boolean> {
    if (!data) return false;
    try {
      const res = await fetch('/api/tg/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: data }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.ok && j.next) { window.location.replace(j.next); return true; }
    } catch { /* ignore */ }
    return false;
  }

  // Avto-kirish (Telegram bog'langan bo'lsa)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getInitData();
      if (cancelled) return;
      setInitData(data);
      const ok = await tryTelegram(data);
      if (!cancelled && !ok) setPhase('login');
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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

  async function onTelegram() {
    setTgBusy(true);
    setError('');
    const ok = await tryTelegram(initData);
    if (!ok) {
      setError('Telegram hisobi bog\'lanmagan — quyida login/parol bilan kiring.');
      setTgBusy(false);
    }
  }

  if (phase === 'loading') {
    return (
      <main className="au-wrap" aria-busy="true">
        <div className="au-spinner" role="status" aria-label="Yuklanmoqda" />
      </main>
    );
  }

  return (
    <AuthShell title="Tizimga kirish" subtitle="Savora — Telegram orqali">
      <form className="au-form" onSubmit={onSubmit}>
        {error && <AuthAlert tone="error">{error}</AuthAlert>}

        <div className="au-group">
          <div className="au-row">
            <label htmlFor="tg-slug">Do&apos;kon manzili</label>
            <input id="tg-slug" value={slug} onChange={(e) => setSlug(e.target.value)}
              placeholder="masalan: diamed" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </div>
          <div className="au-row">
            <label htmlFor="tg-user">Login</label>
            <input id="tg-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
              placeholder="Foydalanuvchi nomi yoki telefon" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </div>
          <div className="au-row">
            <label htmlFor="tg-pass">Parol</label>
            <div className="au-pwd">
              <input id="tg-pass" type={showPass ? 'text' : 'password'} autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Parolingiz" />
              <button type="button" className="au-pwd-toggle" onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Parolni yashirish' : "Parolni ko'rsatish"} aria-pressed={showPass}>
                <Icon name={showPass ? 'eyeOff' : 'eye'} size={19} />
              </button>
            </div>
          </div>
        </div>

        <button type="submit" className="au-btn au-btn--filled au-btn--block" disabled={busy}>
          {busy ? 'Kirilmoqda…' : 'Kirish'}
        </button>

        <div className="au-divider">yoki</div>

        <button type="button" className="au-btn au-btn--tinted au-btn--block" onClick={onTelegram} disabled={tgBusy}>
          <Icon name="send" size={18} />
          {tgBusy ? 'Tekshirilmoqda…' : 'Telegram orqali kirish'}
        </button>
      </form>

      <p className="au-foot">Yangi foydalanuvchimisiz? Ro&apos;yxatdan o&apos;tish uchun murojaat qiling.</p>
      <div className="au-meta">
        <span><Icon name="shield" size={12} /> Xavfsiz ulanish</span>
        <span><Icon name="phone" size={12} /> Savora</span>
      </div>
    </AuthShell>
  );
}
