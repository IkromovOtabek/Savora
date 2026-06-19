import Link from 'next/link';
import BackLink from '@/components/ui/BackLink';

export default function HelpPage() {
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand"><span className="brand-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 20 L12 6" stroke="var(--ink-1)" /><path d="M12 6 L18 20" stroke="var(--brand)" /></svg></span>Savora</Link>
          <BackLink href="/" className="btn btn-ghost btn-sm">Bosh sahifa</BackLink>
        </div>
      </header>
      <main className="container" style={{ padding: '48px 24px', maxWidth: 720 }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 850, marginBottom: 24 }}>Yordam</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, color: 'var(--ink-2)' }}>
          <section><h2 style={{ color: 'var(--ink-1)', marginBottom: 8 }}>Boshlash</h2><p>1. MongoDB ishga tushiring. 2. <code>npm run seed</code> 3. <code>npm run dev</code> 4. Do&apos;koningiz manzilidan kiring.</p></section>
          <section><h2 style={{ color: 'var(--ink-1)', marginBottom: 8 }}>Lokal manzillar</h2><p>Asosiy: lvh.me:3000 · Super admin: admin.lvh.me:3000 · Do&apos;kon: slug.lvh.me:3000</p></section>
          <section><h2 style={{ color: 'var(--ink-1)', marginBottom: 8 }}>Savollar</h2><p><Link href="/contact" className="cell-link">Bog&apos;lanish</Link> sahifasidan yozing.</p></section>
        </div>
      </main>
    </>
  );
}
