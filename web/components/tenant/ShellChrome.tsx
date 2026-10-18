'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { NAV_MODE_COOKIE } from '@/lib/navConfig';

/**
 * Toolbar sarlavhasi (iOS «katta sarlavha» uslubi): odatda do'kon nomi; sahifaning
 * `.t-page-title` sarlavhasi yuqoriga aylanib ketganda — o'sha sahifa nomi ko'rinadi.
 */
export function ToolbarTitle({ orgName }: { orgName: string }) {
  const pathname = usePathname();
  const [pageTitle, setPageTitle] = useState<string | null>(null);

  useEffect(() => {
    setPageTitle(null);
    if (typeof IntersectionObserver === 'undefined') return;
    let io: IntersectionObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const attach = () => {
      const h = document.querySelector<HTMLElement>('.t-main .t-page-title');
      if (!h) {
        // Sahifa (Suspense/loading) hali chizilmagan bo'lishi mumkin — qisqa qayta urinish
        if (tries++ < 20) timer = setTimeout(attach, 150);
        return;
      }
      const text = h.textContent?.trim() || null;
      io = new IntersectionObserver(
        ([e]) => setPageTitle(!e.isIntersecting && e.boundingClientRect.top < 0 ? text : null),
        { rootMargin: '-60px 0px 0px 0px' },
      );
      io.observe(h);
    };
    attach();
    return () => {
      if (timer) clearTimeout(timer);
      io?.disconnect();
    };
  }, [pathname]);

  return (
    <div className="t-toolbar-title">
      <span className={`t-tt-org${pageTitle ? ' is-out' : ''}`}>{orgName}</span>
      <span className={`t-tt-page${pageTitle ? ' is-in' : ''}`} aria-hidden="true">{pageTitle}</span>
    </div>
  );
}

/** Formalar (yangi/tahrirlash) — pastki tugmalarni FAB yopib qo'ymasin */
const FAB_HIDDEN = [/^\/app\/sales\/new/, /\/new$/, /\/edit(\/|$)/];

/**
 * Mobil «Yangi sotuv» — tab bar ustida, o'ng pastda. Desktopda ko'rinmaydi (toolbar tugmasi bor).
 * Sahifaning o'z FAB'i bo'lsa (`.ux-fab` main ichida) CSS orqali yashiriladi (tenant.css).
 */
export function SaleFab() {
  const pathname = usePathname();
  const d = useDict();
  if (FAB_HIDDEN.some((r) => r.test(pathname))) return null;
  return (
    <Link href="/app/sales/new" className="ux-fab t-shell-fab">
      <Icon name="plus" size={20} />
      <span>{d.shell.layout.newSale}</span>
    </Link>
  );
}

/**
 * Chap menyuni tor (ikonli) ⇄ keng (yozuvli) rejimga almashtiradi.
 * Holat cookie'da saqlanadi — server keyingi yuklashda to'g'ri klass bilan chizadi (miltillamaydi).
 */
export function SideModeToggle({ initialWide }: { initialWide: boolean }) {
  const d = useDict();
  const [wide, setWide] = useState(initialWide);

  function toggle() {
    const next = !wide;
    setWide(next);
    document.querySelector('.t-shell')?.classList.toggle('t-shell--rail', !next);
    document.cookie = `${NAV_MODE_COOKIE}=${next ? 'wide' : 'rail'}; path=/; max-age=31536000; samesite=lax`;
  }

  const label = wide ? d.shell.layout.collapseMenu : d.shell.layout.expandMenu;
  return (
    <button type="button" className="t-side-toggle" onClick={toggle} aria-label={label} title={label} aria-expanded={wide}>
      <Icon name="chevron" size={16} />
    </button>
  );
}
