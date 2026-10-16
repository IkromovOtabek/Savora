'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { HELP_GROUPS, type HelpArticle, type HelpGroup } from './articles';

/** Qidiruv uchun normallashtirish: kichik harf, apostrof turlari bir xil */
function norm(s: string): string {
  return s.toLowerCase().replace(/[‘’ʻʼ`ʻʼ]/g, "'");
}

function haystack(a: HelpArticle): string {
  return norm(
    [a.title, a.summary, a.keywords ?? '', ...(a.steps ?? []), ...(a.paras ?? []), a.tip ?? '', ...(a.table?.rows.flat() ?? [])].join(' ')
  );
}

export default function HelpCenter({ articles }: { articles: HelpArticle[] }) {
  const d = useDict();
  const H = d.landing.help;
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<HelpGroup | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // #anchor bilan kelinganda tegishli maqolani ochamiz
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id && articles.some((a) => a.id === id)) {
      setOpenId(id);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    }
  }, [articles]);

  const index = useMemo(() => articles.map((a) => ({ a, h: haystack(a) })), [articles]);

  const terms = norm(q).split(/\s+/).filter(Boolean);
  const found = index
    .filter(({ a, h }) => (!group || a.group === group) && terms.every((t) => h.includes(t)))
    .map(({ a }) => a);

  const groups = HELP_GROUPS.filter((g) => found.some((a) => a.group === g));
  const searching = terms.length > 0;

  return (
    <>
      <div className="hc-search" role="search">
        <label className="hc-field">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={H.searchPh}
            aria-label={H.searchAria}
          />
        </label>
        <div className="hc-chips" role="group" aria-label={H.groupsAria}>
          <button type="button" className="hc-chip" aria-pressed={group === null} onClick={() => setGroup(null)}>{H.allGroups}</button>
          {HELP_GROUPS.map((g) => (
            <button key={g} type="button" className="hc-chip" aria-pressed={group === g} onClick={() => setGroup(group === g ? null : g)}>
              {H.groups[g]}
            </button>
          ))}
        </div>
        {(searching || group) && <span className="hc-count" aria-live="polite">{tr(H.found, { n: found.length })}</span>}
      </div>

      {found.length === 0 && (
        <div className="hc-list hc-empty">
          {H.empty}
        </div>
      )}

      {groups.map((g) => (
        <section key={g} className="hc-group" aria-label={H.groups[g]}>
          <h2>{H.groups[g]}</h2>
          <div className="hc-list">
            {found.filter((a) => a.group === g).map((a) => (
              <details
                key={a.id}
                id={a.id}
                className="hc-item"
                open={searching || openId === a.id}
                onToggle={(e) => {
                  const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                  if (isOpen) setOpenId(a.id);
                  else if (openId === a.id) setOpenId(null);
                }}
              >
                <summary>
                  <span>
                    {a.title}
                    <small>{a.summary}</small>
                  </span>
                  <Icon name="chevron" size={14} />
                </summary>
                <div className="hc-body">
                  {a.paras?.map((p) => <p key={p}>{p}</p>)}
                  {a.steps && (
                    <ol>
                      {a.steps.map((s) => <li key={s}>{s}</li>)}
                    </ol>
                  )}
                  {a.table && (
                    <table>
                      <thead><tr>{a.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                      <tbody>{a.table.rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
                    </table>
                  )}
                  {a.tip && <p className="hc-tip">{a.tip}</p>}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
