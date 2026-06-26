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

type Phase = 'loading' | 'needLink' | 'error' | 'noTelegram';

export default function TgEntry() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function run(attempt = 0) {
      const wa = window.Telegram?.WebApp;
      if (!wa) {
        if (attempt < 20) { setTimeout(() => run(attempt + 1), 150); return; }
        if (!cancelled) setPhase('noTelegram');
        return;
      }
      try { wa.ready(); wa.expand(); } catch { /* ignore */ }

      const initData = wa.initData || '';
      if (!initData) {
        if (!cancelled) setPhase('noTelegram');
        return;
      }

      try {
        const res = await fetch('/api/tg/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.ok && data.next) {
          window.location.replace(data.next);
          return;
        }
        if (data.needLink) {
          setPhase('needLink');
          return;
        }
        setMessage(data.error || 'Kirishda xatolik.');
        setPhase('error');
      } catch {
        if (!cancelled) { setMessage('Tarmoq xatosi.'); setPhase('error'); }
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ maxWidth: 360 }}>
        {phase === 'loading' && (
          <>
            <style>{'@keyframes tgspin{to{transform:rotate(360deg)}}'}</style>
            <div style={{ width: 36, height: 36, margin: '0 auto 16px', border: '3px solid var(--border)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'tgspin .7s linear infinite' }} />
            <p style={{ color: 'var(--ink-2)' }}>Telegram orqali kirilmoqda…</p>
          </>
        )}
        {phase === 'needLink' && (
          <>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 8 }}>Hisob bog&apos;lanmagan</h2>
            <p style={{ color: 'var(--ink-2)', marginBottom: 16 }}>
              Avval Savora paneliga kirib, <b>Kabinet → Telegramni ulash</b> tugmasidan o&apos;z Telegram hisobingizni bog&apos;lang. So&apos;ng bu yerga qaytib oching.
            </p>
            <a href="/login" className="btn btn-primary">Panelga kirish</a>
          </>
        )}
        {phase === 'noTelegram' && (
          <>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 8 }}>Telegram ichida oching</h2>
            <p style={{ color: 'var(--ink-2)', marginBottom: 16 }}>
              Bu sahifa Telegram botidagi <b>“Savora’ni ochish”</b> tugmasi orqali ochilishi kerak.
            </p>
            <a href="/login" className="btn btn-ghost">Brauzerda kirish</a>
          </>
        )}
        {phase === 'error' && (
          <>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 8 }}>Xatolik</h2>
            <p style={{ color: 'var(--ink-2)', marginBottom: 16 }}>{message}</p>
            <a href="/login" className="btn btn-ghost">Panelga kirish</a>
          </>
        )}
      </div>
    </div>
  );
}
