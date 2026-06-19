'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon, { IconBadge } from '@/components/icons/Icon';
import { normalizeSlug } from '@/lib/slug';
import { LOCALHOST_LINKS } from '@/lib/urls';

export default function LoginPortal() {
  const router = useRouter();
  const [slug, setSlug] = useState('');

  function goTenantLogin(e: React.FormEvent) {
    e.preventDefault();
    const s = normalizeSlug(slug);
    if (!s) return;
    router.push(`/t/${s}/login`);
  }

  return (
    <section className="section section--soft" id="kirish">
      <div className="container">
        <div className="head">
          <span className="eyebrow">Kirish va ro&apos;yxatdan o&apos;tish</span>
          <h2>Tizimga qanday kirasiz?</h2>
          <p>Rolingizga mos tugmani tanlang — bir necha soniyada panelga o&apos;tasiz.</p>
        </div>

        <div className="portal-grid">
          <div className="portal-card portal-card--super">
            <IconBadge name="shield" bg="linear-gradient(135deg,#6366f1,#8b5cf6)" />
            <h3>Super Admin</h3>
            <p>Platforma egasi — barcha bizneslar, tariflar va modullar boshqaruvi.</p>
            <Link href={LOCALHOST_LINKS.superLogin} className="btn btn-primary portal-btn">
              <Icon name="login" size={18} />
              Super Admin kirish
            </Link>
          </div>

          <div className="portal-card portal-card--tenant">
            <IconBadge name="store" bg="linear-gradient(135deg,#10b981,#059669)" />
            <h3>Do&apos;kon egasi / Admin / Xodim</h3>
            <p>Biznesingiz manzilini (slug) kiriting — login sahifasiga o&apos;tasiz.</p>
            <form onSubmit={goTenantLogin} className="portal-form">
              <div className="portal-slug">
                <span className="portal-slug-prefix">/t/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="dokon1"
                  aria-label="Do'kon slug"
                />
                <span className="portal-slug-suffix">/login</span>
              </div>
              <button type="submit" className="btn btn-primary portal-btn">
                <Icon name="login" size={18} />
                Do&apos;konga kirish
              </button>
            </form>
            <p className="portal-hint">Masalan: <code>dokon1</code> → http://localhost:3000/t/dokon1/login</p>
          </div>

          <div className="portal-card portal-card--signup">
            <IconBadge name="signup" bg="linear-gradient(135deg,#f59e0b,#ef4444)" />
            <h3>Sign Up — yangi biznes</h3>
            <p>Hali hisobingiz yo&apos;qmi? 7 kun bepul — do&apos;koningizni 5 daqiqada oching.</p>
            <Link href={LOCALHOST_LINKS.register} className="btn btn-primary portal-btn">
              <Icon name="signup" size={18} />
              Ro&apos;yxatdan o&apos;tish
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
