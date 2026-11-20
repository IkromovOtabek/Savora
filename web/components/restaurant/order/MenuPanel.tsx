'use client';

import { useMemo, useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import SegmentSwitch from '@/components/ui/SegmentSwitch';
import { fmtMoney } from '@/lib/format';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtQty } from '@/lib/qty';
import { codeMatches } from '@/lib/scanCode';
import type { MenuItemView } from '@/lib/restaurant/queries';
import type { MenuSection } from '@/lib/restaurant/types';

export interface MenuData {
  branchId: string;
  categories: string[];
  items: MenuItemView[];
}

/** Kam qolgan taom ogohlantirishi (qoldiq ≤ shu) */
const LOW_LEFT = 5;

/** Taomni tanlab bo'lmaydi: stop-list yoki omborda tugagan */
export function dishOff(i: MenuItemView): 'stop' | 'out' | null {
  if (i.stopListed) return 'stop';
  if (i.available !== null && i.available <= 0) return 'out';
  return null;
}

/**
 * Ofitsant menyusi: bo'limlar (Taomlar / Bar — bar bandi bo'lsa), qidiruv, kategoriya chiplari, rasmli kartochkalar.
 * Qidiruv butun menyu bo'yicha (bo'lim va kategoriyasiz) — nom yoki barkod: skaner kodi + Enter darhol qo'shadi.
 * Stop-list va tugagan taom — o'chiq (belgi bilan, bosilmaydi). Modifikatorli taom — dialog orqali, oddiysi — darhol savatga.
 */
export default function MenuPanel({ menu, onPick, cartQty }: {
  menu: MenuData;
  onPick: (item: MenuItemView) => void;
  /** Savatdagi miqdor (productId → qty) — kartochkada nishon */
  cartQty: Map<string, number>;
}) {
  const d = useDict();
  const k = d.restaurant.order;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const hasBar = menu.items.some((i) => i.section === 'bar');
  const [section, setSection] = useState<MenuSection>('kitchen');
  const searchRef = useRef<HTMLInputElement>(null);
  const t = d.menu.sections;

  const inSection = useMemo(() => (hasBar ? menu.items.filter((i) => i.section === section) : menu.items), [menu.items, hasBar, section]);
  const categories = useMemo(
    () => (hasBar ? menu.categories.filter((c) => inSection.some((i) => i.category === c)) : menu.categories),
    [menu.categories, inSection, hasBar],
  );
  /** Skanerlangan barkodga aynan mos band (klaviatura tartibi adashgan bo'lsa ham) */
  const scanHit = useMemo(
    () => (q.trim() ? menu.items.find((i) => i.barcode && codeMatches([i.barcode], q)) ?? null : null),
    [menu.items, q],
  );

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) return scanHit ? [scanHit] : menu.items.filter((i) => i.name.toLowerCase().includes(s));
    return inSection.filter((i) => !cat || i.category === cat);
  }, [menu.items, inSection, q, cat, scanHit]);

  function pickSection(next: MenuSection) {
    setSection(next);
    setCat('');
  }

  return (
    <section className="rt-menu" aria-label={k.menu}>
      <div className="rt-menu-tools">
        <label className="rt-search">
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && q) { e.preventDefault(); setQ(''); }
              if (e.key === 'Enter' && items.length === 1 && !dishOff(items[0])) { e.preventDefault(); onPick(items[0]); setQ(''); }
              // Skaner: barkod topildi-yu, taom tanlab bo'lmaydi (stop-list/tugagan) — maydon tozalansin, keyingi skan uchun
              else if (e.key === 'Enter' && scanHit) { e.preventDefault(); setQ(''); }
            }}
            placeholder={k.searchPh}
            aria-label={k.searchPh}
            autoComplete="off"
          />
        </label>
        {hasBar && (
          <SegmentSwitch
            className="seg-sw--sm rt-sections"
            label={t.label}
            value={section}
            onChange={pickSection}
            options={[{ value: 'kitchen', label: t.kitchen }, { value: 'bar', label: t.bar }]}
          />
        )}
        {categories.length > 0 && (
          <div className="rt-cats" role="group" aria-label={k.categories}>
            <button type="button" className="rt-cat" aria-pressed={!cat} onClick={() => setCat('')}>{k.allCategories}</button>
            {categories.map((name) => (
              <button key={name} type="button" className="rt-cat" aria-pressed={cat === name} onClick={() => setCat(cat === name ? '' : name)}>
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {menu.items.length === 0 ? (
        <p className="rt-muted rt-none">{k.menuEmpty}</p>
      ) : items.length === 0 ? (
        <p className="rt-muted rt-none">{k.noResults}</p>
      ) : (
        <ul className="rt-dishes">
          {items.map((i) => {
            const off = dishOff(i);
            const inCart = cartQty.get(i.id) ?? 0;
            const low = !off && i.available !== null && i.available <= LOW_LEFT;
            return (
              <li key={i.id}>
                <button
                  type="button"
                  className="rt-dish"
                  data-off={off ?? undefined}
                  aria-disabled={off ? true : undefined}
                  onClick={() => { if (!off) onPick(i); }}
                  aria-label={`${i.name}, ${fmtMoney(i.price)} ${d.common.sum}${off ? `, ${off === 'stop' ? k.stopListed : k.outOfStock}` : ''}`}
                >
                  <span className="rt-dish-img" aria-hidden="true">
                    {i.photoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={i.photoUrl} alt="" loading="lazy" />
                      : <span>{i.name.trim().charAt(0).toUpperCase()}</span>}
                    {inCart > 0 && <b className="rt-dish-badge">{fmtQty(inCart)}</b>}
                  </span>
                  <span className="rt-dish-body">
                    <b>{i.name}</b>
                    <span className="rt-dish-price">{fmtMoney(i.price)} <small>{d.common.sum}</small></span>
                    <span className="rt-dish-tags">
                      {off === 'stop' && <span className="rt-tag rt-tag--stop">{k.stopListed}</span>}
                      {off === 'out' && <span className="rt-tag rt-tag--stop">{k.outOfStock}</span>}
                      {low && <span className="rt-tag rt-tag--low">{tr(k.leftN, { n: fmtQty(i.available ?? 0) })}</span>}
                      {!off && i.modifierGroups.length > 0 && <span className="rt-tag">{k.hasOptions}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
