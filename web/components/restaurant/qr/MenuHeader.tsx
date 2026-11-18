import type { ReactNode } from 'react';
import LangSwitch from '@/components/LangSwitch';
import type { PublicBrand } from '@/lib/restaurant/public';
import BrandLogo from './BrandLogo';

/**
 * Mijoz menyusi sarlavhasi — stol sahifasi (QrMenuApp) va umumiy mijoz sahifasi (/m/<slug>) uchun bitta.
 * Hook yo'q: server komponentda ham, client'da ham ishlaydi. Matnlar chaqiruvchidan keladi.
 */

/** Muqova (yo'q bo'lsa — brend rangidagi tekis fon) + til almashtirgich */
export function MenuHero({ coverUrl }: { coverUrl: string | null }) {
  return (
    <header className={`qm-hero${coverUrl ? '' : ' qm-hero--plain'}`}>
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- tashqi (R2/CDN) rasm
        <img className="qm-hero-img" src={coverUrl} alt="" fetchPriority="high" decoding="async" />
      ) : null}
      <div className="qm-lang"><LangSwitch compact /></div>
    </header>
  );
}

/** Logo va nom kartasi; `children` — nom ostidagi qator (stol raqami yoki ish vaqti) */
export function MenuHead({ name, brand, children }: { name: string; brand: PublicBrand; children?: ReactNode }) {
  return (
    <section className="qm-head" aria-labelledby="qm-org-name">
      <BrandLogo url={brand.logoUrl} name={name} />
      <div className="qm-head-text">
        <h1 id="qm-org-name">{name}</h1>
        {children}
      </div>
    </section>
  );
}

/** Xizmat haqi e'loni (Raqobat qo'mitasi talabi: oldindan e'lon qilinadi) */
export function ServiceNote({ badge, text }: { badge: string; text: string }) {
  return (
    <p className="qm-service" role="note">
      <span className="qm-service-badge">{badge}</span>
      <span>{text}</span>
    </p>
  );
}
