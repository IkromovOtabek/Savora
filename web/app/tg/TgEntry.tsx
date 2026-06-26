'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/icons/Icon';

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
      <div className="tg-login-bg">
        <div style={{ textAlign: 'center' }}>
          <style>{'@keyframes tgspin{to{transform:rotate(360deg)}}'}</style>
          <div style={{ width: 40, height: 40, margin: '0 auto', border: '3px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'tgspin .7s linear infinite' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="tg-login-bg">
      <form className="tg-login-card" onSubmit={onSubmit}>
        <div className="tg-login-icon"><Icon name="store" size={30} /></div>
        <div className="tg-login-title">Savora</div>
        <div className="tg-login-sub">Tizimga kirish</div>

        {error && <div className="tg-login-err">{error}</div>}

        <label className="tg-login-label" htmlFor="tg-slug">Do&apos;kon manzili</label>
        <div className="tg-login-iw">
          <span className="tg-ic"><Icon name="building" size={17} /></span>
          <input id="tg-slug" className="tg-login-input" value={slug} onChange={(e) => setSlug(e.target.value)}
            placeholder="masalan: diamed" autoCapitalize="none" autoCorrect="off" />
        </div>

        <label className="tg-login-label" htmlFor="tg-user">Login</label>
        <div className="tg-login-iw">
          <span className="tg-ic"><Icon name="user" size={17} /></span>
          <input id="tg-user" className="tg-login-input" value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="Foydalanuvchi nomi yoki tel" autoCapitalize="none" autoCorrect="off" />
        </div>

        <label className="tg-login-label" htmlFor="tg-pass">Parol</label>
        <div className="tg-login-iw">
          <span className="tg-ic"><Icon name="shield" size={17} /></span>
          <input id="tg-pass" className="tg-login-input" type={showPass ? 'text' : 'password'}
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          <button type="button" className="tg-eye" onClick={() => setShowPass((v) => !v)} aria-label="Parolni ko'rsatish">
            <Icon name={showPass ? 'eyeOff' : 'eye'} size={18} />
          </button>
        </div>

        <button type="submit" className="tg-login-btn" disabled={busy}>
          {busy ? 'Kirilmoqda…' : 'Kirish →'}
        </button>

        <div className="tg-login-divider">Xavfsiz ulanish</div>

        <button type="button" className="tg-login-tg" onClick={onTelegram} disabled={tgBusy}>
          <Icon name="send" size={17} />
          {tgBusy ? 'Tekshirilmoqda…' : 'Telegram orqali kirish'}
        </button>

        <div className="tg-login-foot">
          Yangi foydalanuvchimisiz?<br />
          <b>Ro&apos;yxatdan o&apos;tish uchun murojaat qiling</b>
        </div>
        <div className="tg-login-meta">
          <span><Icon name="shield" size={12} /> End-to-end shifrlangan</span>
          <span><Icon name="phone" size={12} /> Savora</span>
        </div>
      </form>
    </div>
  );
}
