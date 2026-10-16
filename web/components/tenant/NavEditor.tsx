'use client';

import { useState, useTransition, type DragEvent, type KeyboardEvent } from 'react';
import Icon from '@/components/icons/Icon';
import { NAV_ICONS, NAV_PROTECTED, type NavGroup, type NavLayout } from '@/lib/navConfig';
import { saveNavLayoutAction } from '@/app/actions/navLayout';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

type Draft = { title: string; hrefs: string[] }[];
type DragItem = { kind: 'group'; title: string } | { kind: 'link'; href: string };

/**
 * Sidebar menyusini sozlash: guruhlar va havolalarni surib (drag) yoki klaviatura
 * (tutqichda ↑/↓) bilan tartiblash, havolani yashirish. Saqlanadi — User.navLayout.
 */
export default function NavEditor({
  groups,
  hidden: initialHidden,
  onDone,
}: {
  /** Foydalanuvchiga ko'rinadigan (ruxsat etilgan) guruhlar — joriy tartibda */
  groups: NavGroup[];
  hidden: string[];
  onDone: () => void;
}) {
  const d = useDict();
  const t = d.shell.navEditor;
  const labelOf = new Map(groups.flatMap((g) => g.links.map((l) => [l.href, d.shell.nav.links[l.href] ?? l.label] as const)));
  const [draft, setDraft] = useState<Draft>(() => groups.map((g) => ({ title: g.title, hrefs: g.links.map((l) => l.href) })));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialHidden));
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  // ── Ko'chirish amallari ──
  function moveGroup(title: string, toIndex: number) {
    setDraft((d) => {
      const from = d.findIndex((g) => g.title === title);
      if (from < 0) return d;
      const next = [...d];
      const [g] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, g);
      return next;
    });
  }

  /** Havolani `toTitle` guruhidagi `toIndex` o'ringa ko'chiradi */
  function moveLink(href: string, toTitle: string, toIndex: number) {
    setDraft((d) => {
      const next = d.map((g) => ({ ...g, hrefs: g.hrefs.filter((h) => h !== href) }));
      const target = next.find((g) => g.title === toTitle);
      if (!target) return d;
      target.hrefs.splice(Math.max(0, Math.min(toIndex, target.hrefs.length)), 0, href);
      return next;
    });
  }

  function locate(href: string) {
    const gi = draft.findIndex((g) => g.hrefs.includes(href));
    return { gi, li: gi >= 0 ? draft[gi].hrefs.indexOf(href) : -1 };
  }

  // ── Sichqoncha bilan surish ──
  function onDragStart(e: DragEvent, item: DragItem) {
    setDrag(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.kind === 'group' ? item.title : item.href);
  }
  function onDragEnd() {
    setDrag(null);
    setOver(null);
  }
  function allowDrop(e: DragEvent, key: string) {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (over !== key) setOver(key);
  }
  function dropOnGroup(e: DragEvent, title: string) {
    e.preventDefault();
    if (!drag) return;
    const gi = draft.findIndex((g) => g.title === title);
    if (drag.kind === 'group') moveGroup(drag.title, gi);
    else moveLink(drag.href, title, draft[gi].hrefs.length);
    onDragEnd();
  }
  function dropOnLink(e: DragEvent, title: string, href: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!drag) return;
    const gi = draft.findIndex((g) => g.title === title);
    if (drag.kind === 'group') {
      moveGroup(drag.title, gi);
    } else if (drag.href !== href) {
      // Indeks olib tashlashdan oldin olinadi: pastga surilganda nishondan keyin, yuqoriga — oldin tushadi
      moveLink(drag.href, title, draft[gi].hrefs.indexOf(href));
    }
    onDragEnd();
  }

  // ── Klaviatura: tutqichda ↑/↓ ──
  function groupKey(e: KeyboardEvent, title: string) {
    const gi = draft.findIndex((g) => g.title === title);
    if (e.key === 'ArrowUp' && gi > 0) { e.preventDefault(); moveGroup(title, gi - 1); }
    if (e.key === 'ArrowDown' && gi < draft.length - 1) { e.preventDefault(); moveGroup(title, gi + 1); }
  }
  function linkKey(e: KeyboardEvent, href: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const { gi, li } = locate(href);
    if (e.key === 'ArrowUp') {
      if (li > 0) moveLink(href, draft[gi].title, li - 1);
      else if (gi > 0) moveLink(href, draft[gi - 1].title, draft[gi - 1].hrefs.length);
    } else if (li < draft[gi].hrefs.length - 1) moveLink(href, draft[gi].title, li + 1);
    else if (gi < draft.length - 1) moveLink(href, draft[gi + 1].title, 0);
    // Fokus ko'chgan tutqichda qolsin
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-nav-grip="${href}"]`)?.focus());
  }

  function toggleHidden(href: string) {
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  function save(layout: NavLayout | null) {
    start(async () => {
      const res = await saveNavLayoutAction(layout);
      if (res.error) {
        toast(res.error, 'error');
        return;
      }
      toast(res.success ?? d.common.saved, 'success');
      onDone();
    });
  }

  return (
    <div className="t-nav t-nav--edit" aria-label={t.title}>
      <p className="t-nav-edit-hint">{t.hint}</p>
      {draft.map((g) => (
        <div
          key={g.title}
          className={`t-nav-group t-nav-egroup${over === `g:${g.title}` ? ' is-over' : ''}${drag?.kind === 'group' && drag.title === g.title ? ' is-dragging' : ''}`}
          onDragOver={(e) => allowDrop(e, `g:${g.title}`)}
          onDrop={(e) => dropOnGroup(e, g.title)}
        >
          <div className="t-nav-ehead" draggable onDragStart={(e) => onDragStart(e, { kind: 'group', title: g.title })} onDragEnd={onDragEnd}>
            <button type="button" className="t-nav-grip" aria-label={tr(t.moveGroup, { title: d.shell.nav.groups[g.title] ?? g.title })} onKeyDown={(e) => groupKey(e, g.title)}>
              <Icon name="menu" size={14} />
            </button>
            <h5 className="t-nav-group-title">{d.shell.nav.groups[g.title] ?? g.title}</h5>
          </div>
          <ul className="t-nav-list">
            {g.hrefs.map((href) => {
              const off = hidden.has(href);
              return (
                <li
                  key={href}
                  className={`t-nav-erow${off ? ' is-off' : ''}${over === `l:${href}` ? ' is-over' : ''}${drag?.kind === 'link' && drag.href === href ? ' is-dragging' : ''}`}
                  draggable
                  onDragStart={(e) => { e.stopPropagation(); onDragStart(e, { kind: 'link', href }); }}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => { e.stopPropagation(); allowDrop(e, `l:${href}`); }}
                  onDrop={(e) => dropOnLink(e, g.title, href)}
                >
                  <button type="button" className="t-nav-grip" data-nav-grip={href} aria-label={tr(t.moveLink, { label: labelOf.get(href) ?? href })} onKeyDown={(e) => linkKey(e, href)}>
                    <Icon name="menu" size={14} />
                  </button>
                  <Icon name={NAV_ICONS[href] ?? 'home'} size={16} className="t-nav-icon" />
                  <span className="t-nav-label">{labelOf.get(href)}</span>
                  {!NAV_PROTECTED.has(href) && (
                    <button
                      type="button"
                      className="t-nav-eye"
                      aria-pressed={!off}
                      aria-label={tr(off ? t.showLink : t.hideLink, { label: labelOf.get(href) ?? href })}
                      title={off ? t.show : t.hide}
                      onClick={() => toggleHidden(href)}
                    >
                      <Icon name={off ? 'eyeOff' : 'eye'} size={15} />
                    </button>
                  )}
                </li>
              );
            })}
            {g.hrefs.length === 0 && <li className="t-nav-edrop">{t.dropHere}</li>}
          </ul>
        </div>
      ))}
      <div className="t-nav-eactions">
        <button type="button" className="t-btn t-btn--filled" disabled={isPending} onClick={() => save({ groups: draft, hidden: [...hidden] })}>
          {isPending ? d.common.saving : d.common.save}
        </button>
        <button type="button" className="t-btn t-btn--gray" disabled={isPending} onClick={onDone}>{d.common.cancel}</button>
        <button type="button" className="t-nav-reset" disabled={isPending} onClick={() => save(null)}>{t.resetDefault}</button>
      </div>
    </div>
  );
}
