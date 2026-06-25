import Link from 'next/link';
import BackLink from '@/components/ui/BackLink';

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link href="/" className="brand">
            <span className="brand-logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 20 L12 6" stroke="var(--ink-1)" /><path d="M12 6 L18 20" stroke="var(--brand)" /></svg></span>
            Savora
          </Link>
          <BackLink href="/" className="btn btn-ghost btn-sm">Bosh sahifa</BackLink>
        </div>
      </header>
      <main className="container" style={{ padding: '48px 24px', maxWidth: 720 }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 850, marginBottom: 24 }}>{title}</h1>
        <div style={{ color: 'var(--ink-2)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
      </main>
    </>
  );
}

export default function PrivacyPage() {
  return (
    <LegalLayout title="Maxfiylik siyosati">
      <p>Savora foydalanuvchi ma&apos;lumotlarini faqat xizmat ko&apos;rsatish uchun ishlatadi. Har do&apos;kon ma&apos;lumoti alohida bazada saqlanadi.</p>
      <p>Shaxsiy ma&apos;lumotlar uchinchi shaxslarga sotilmaydi. Ma&apos;lumotlarni o&apos;chirish uchun platforma egasiga murojaat qiling.</p>
    </LegalLayout>
  );
}
