'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useI18n } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import type { PublicMenuItem } from '@/lib/restaurant/public';

/**
 * Mijoz menyusi ro'yxati — kategoriya tablari (yopishqoq, aylantirilganda faol tab) va taom kartalari.
 * Stol sahifasi (QrMenuApp, `order` — «+» va savatdagi soni) va umumiy mijoz sahifasi (StoreMenu, `view` —
 * faqat ko'rish) bir xil komponentni ishlatadi.
 */

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Narx («45 000 so'm») va o'lchov birligi qo'shimchasi (« / kg») — ikkala sahifada bir xil */
export function useMenuFormat() {
  const { d } = useI18n();
  const q = d.restaurant.qrMenu;
  const money = useCallback((n: number) => `${fmtMoney(n)} ${d.common.sum}`, [d.common.sum]);
  const unitSuffix = useCallback((u: string | null) => {
    if (!u || u === 'dona') return '';
    const label = (d.stock.fields.units as Record<string, string>)[u] ?? u;
    return ` ${tr(q.perUnit, { unit: label })}`;
  }, [d.stock.fields.units, q.perUnit]);
  return { money, unitSuffix };
}

interface Section { id: string; name: string; items: PublicMenuItem[] }

export default function MenuSections({
  items,
  categories,
  onOpen,
  qtyByProduct,
  mode = 'order',
}: {
  items: PublicMenuItem[];
  categories: string[];
  onOpen: (item: PublicMenuItem) => void;
  /** Savatdagi soni (faqat `order`) */
  qtyByProduct?: ReadonlyMap<string, number>;
  /** `order` — stol sahifasi (savatga qo'shish); `view` — mijoz sahifasi (faqat ko'rish) */
  mode?: 'order' | 'view';
}) {
  const { d } = useI18n();
  const q = d.restaurant.qrMenu;
  const { money, unitSuffix } = useMenuFormat();
  const [active, setActive] = useState('');
  const navRef = useRef<HTMLElement>(null);

  const sections = useMemo<Section[]>(() => {
    const by = new Map<string, PublicMenuItem[]>();
    for (const it of items) {
      const k = it.category ?? '';
      const list = by.get(k);
      if (list) list.push(it);
      else by.set(k, [it]);
    }
    const out: Section[] = categories.filter((c) => by.has(c)).map((c, i) => ({ id: `qm-cat-${i}`, name: c, items: by.get(c)! }));
    const rest = by.get('');
    if (rest) out.push({ id: 'qm-cat-other', name: out.length ? q.otherCategory : q.title, items: rest });
    return out;
  }, [items, categories, q.otherCategory, q.title]);

  /* ── Kategoriya tablari: bosilsa — bo'limga, aylantirilsa — faol tab ── */
  useEffect(() => {
    if (sections.length < 2) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const edge = (navRef.current?.getBoundingClientRect().bottom ?? 0) + 16;
        let cur = sections[0].id;
        for (const s of sections) {
          const el = document.getElementById(s.id);
          if (el && el.getBoundingClientRect().top <= edge) cur = s.id;
        }
        setActive(cur);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [sections]);

  useEffect(() => {
    const nav = navRef.current?.querySelector<HTMLElement>('.qm-tabs-scroll');
    const tab = nav?.querySelector<HTMLElement>(`[data-sec="${active}"]`);
    if (nav && tab) nav.scrollTo({ left: tab.offsetLeft - nav.clientWidth / 2 + tab.offsetWidth / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [active]);

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const navH = navRef.current?.offsetHeight ?? 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - navH - 4, behavior: reducedMotion() ? 'auto' : 'smooth' });
    setActive(id);
  }

  return (
    <>
      {sections.length > 1 ? (
        <nav ref={navRef} className="qm-tabs" aria-label={q.categoriesAria}>
          <div className="qm-tabs-scroll">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className="qm-tab"
                data-sec={s.id}
                aria-current={active === s.id ? 'true' : undefined}
                onClick={() => jumpTo(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </nav>
      ) : null}

      <main className="qm-wrap qm-menu">
        {!sections.length ? (
          <div className="qm-empty">
            <Icon name="utensils" size={28} />
            <p className="qm-empty-title">{q.empty}</p>
          </div>
        ) : sections.map((s) => (
          <section key={s.id} id={s.id} className="qm-section" aria-labelledby={`${s.id}-h`}>
            <h2 id={`${s.id}-h`}>{s.name}</h2>
            <div className="qm-items">
              {s.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  view={mode === 'view'}
                  qty={qtyByProduct?.get(item.id) ?? 0}
                  price={`${money(item.price)}${unitSuffix(item.unit)}`}
                  optionsLabel={q.hasOptions}
                  inCartLabel={q.inCart}
                  onOpen={() => onOpen(item)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}

function ItemCard({
  item,
  view,
  qty,
  price,
  optionsLabel,
  inCartLabel,
  onOpen,
}: {
  item: PublicMenuItem;
  view: boolean;
  qty: number;
  price: string;
  optionsLabel: string;
  inCartLabel: string;
  onOpen: () => void;
}) {
  const [photoOk, setPhotoOk] = useState(!!item.photoUrl);
  const photo = photoOk && item.photoUrl;
  return (
    <button
      type="button"
      className={`qm-item${photo ? '' : ' qm-item--nophoto'}${view ? ' qm-item--view' : ''}`}
      onClick={onOpen}
      aria-haspopup="dialog"
    >
      <span className="qm-item-body">
        <span className="qm-item-name">{item.name}</span>
        {item.modifierGroups.length ? <span className="qm-item-meta">{optionsLabel}</span> : null}
        <span className="qm-item-price tnum">{price}</span>
      </span>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- tashqi (R2/CDN) rasm, lazy
        <img className="qm-item-photo" src={item.photoUrl!} alt="" width={96} height={96} loading="lazy" decoding="async" onError={() => setPhotoOk(false)} />
      ) : null}
      {!view && qty > 0 ? (
        <span className="qm-item-qty">
          <span aria-hidden>{qty}</span>
          <span className="sr-only">{tr(inCartLabel, { n: qty })}</span>
        </span>
      ) : null}
      {view ? null : <span className="qm-item-add" aria-hidden><Icon name="plus" size={18} strokeWidth={2.5} /></span>}
    </button>
  );
}
