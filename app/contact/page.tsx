import Link from 'next/link';
import BackLink from '@/components/ui/BackLink';

export default function ContactPage() {
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand"><span className="brand-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 20 L12 6" stroke="var(--ink-1)" /><path d="M12 6 L18 20" stroke="var(--brand)" /></svg></span>Savora</Link>
          <BackLink href="/" className="btn btn-ghost btn-sm">Bosh sahifa</BackLink>
        </div>
      </header>
      <main className="container" style={{ padding: '48px 24px', maxWidth: 520 }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 850, marginBottom: 24 }}>Bog&apos;lanish</h1>
        <p style={{ color: 'var(--ink-2)', marginBottom: 24 }}>Savora jamoasi bilan bog&apos;lanish:</p>
        <ul style={{ color: 'var(--ink-2)', lineHeight: 2 }}>
          <li>Telegram: @savdopro</li>
          <li>Email: support@savdopro.uz</li>
          <li>Telefon: +998 90 000 00 00</li>
        </ul>
        <Link href="/register" className="btn btn-primary" style={{ marginTop: 24 }}>7 kun bepul sinov</Link>
      </main>
    </>
  );
}
