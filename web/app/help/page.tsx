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
          <section><h2 style={{ color: 'var(--ink-1)', marginBottom: 8 }}>Boshlash</h2><p>1. <Link href="/register" className="cell-link">Ro&apos;yxatdan o&apos;ting</Link> — 7 kun bepul. 2. Do&apos;kon manzili (slug) tanlang. 3. Mahsulot va xodimlarni qo&apos;shing. 4. Do&apos;koningiz manzilidan kiring.</p></section>
          <section><h2 style={{ color: 'var(--ink-1)', marginBottom: 8 }}>Manzillar</h2><p>Asosiy: savora.uz · Kirish: savora.uz/login · Do&apos;kon: savora.uz/t/&lt;do&apos;kon&gt;/login</p></section>
          <section><h2 style={{ color: 'var(--ink-1)', marginBottom: 8 }}>Savollar</h2><p><Link href="/contact" className="cell-link">Bog&apos;lanish</Link> sahifasidan yozing.</p></section>
        </div>
      </main>
    </>
  );
}
