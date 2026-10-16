'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { bulkImeiLookup } from '@/app/actions/transfer';
import { checkImeiBlacklistAction } from '@/app/actions/imeiBlacklist';
import Icon from '@/components/icons/Icon';
import CameraScanButton from '@/components/ui/CameraScanButton';
import type { BlacklistHit } from '@/lib/imeiBlacklist';
import type { ProductStatus } from '@/lib/models/tenant/Product';
import { fmtMoney } from '@/lib/format';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

export default function ImeiBulkSearch() {
  const d = useDict();
  const t = d.stock.bulk;
  const [text, setText] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof bulkImeiLookup>> | null>(null);
  const [blacklist, setBlacklist] = useState<BlacklistHit[]>([]);
  const [pending, start] = useTransition();

  function search() {
    const imeis = text.split(/[\n,;\s]+/).filter(Boolean);
    start(async () => {
      const [r, bl] = await Promise.all([
        bulkImeiLookup(imeis),
        checkImeiBlacklistAction(imeis),
      ]);
      setResult(r);
      setBlacklist(bl);
    });
  }

  const tokens = text.split(/[\n,;\s]+/).filter(Boolean);
  const entered = tokens.length;
  // Standart IMEI — 15 raqam; boshqalari ham qidiriladi, faqat ogohlantirish sifatida sanaladi
  const odd = tokens.filter((t) => !/^\d{15}$/.test(t)).length;
  const blacklisted = new Set(blacklist.map((b) => b.imei));

  // Skaner — kodni ro'yxat oxiriga yangi qatorda qo'shadi (takrorlanmasin)
  function onScan(code: string) {
    const c = code.trim();
    if (!c) return;
    setText((prev) => {
      const list = prev.split(/[\n,;\s]+/).filter(Boolean);
      if (list.includes(c)) return prev;
      return [...list, c].join('\n');
    });
  }

  function clear() {
    setText('');
    setResult(null);
    setBlacklist([]);
  }

  return (
    <>
      <section className="st-imei-hero" aria-labelledby="st-imei-title">
        <div className="st-imei-hero-head">
          <span className="ux-clay" aria-hidden="true"><Icon name="search" size={20} /></span>
          <div>
            <h2 id="st-imei-title">{t.title}</h2>
            <p>{t.hint}</p>
          </div>
        </div>
        <label htmlFor="imeis" className="sr-only">{t.srLabel}</label>
        <textarea
          id="imeis"
          rows={5}
          className="st-imei-ta"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/⌘ + Enter — darhol qidirish
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim() && !pending) {
              e.preventDefault();
              search();
            }
          }}
          placeholder={'353456789012345\n353456789012346'}
          spellCheck={false}
          autoComplete="off"
          inputMode="numeric"
        />
        <div className="st-imei-bar">
          <span className="st-imei-count" aria-live="polite">
            {tr(t.count, { n: entered })}
            {odd > 0 && <span className="st-imei-odd"> · {tr(t.odd, { n: odd })}</span>}
          </span>
          <div className="st-imei-tools">
            <CameraScanButton onScan={onScan} label={d.stock.search.scanner} />
            {text && (
              <button type="button" className="btn btn-plain btn-sm" onClick={clear}>{d.common.reset}</button>
            )}
          </div>
          <button type="button" className="btn btn-primary btn-with-icon st-imei-go" onClick={search} disabled={pending || !text.trim()}>
            <Icon name="search" size={18} />
            {pending ? t.searching : entered > 0 ? tr(t.searchN, { n: entered }) : d.common.search}
          </button>
        </div>
      </section>

      {result && (
        <div className="st-imei-summary" aria-live="polite">
          <span className="st-pill st-pill--in_stock">{tr(t.found, { n: result.found.length })}</span>
          <span className={`st-pill ${result.missing.length > 0 ? 'st-pill--transferred' : ''}`}>{tr(t.missing, { n: result.missing.length })}</span>
          <span className={`st-pill ${blacklist.length > 0 ? 'st-pill--sold' : ''}`}>{tr(t.blacklisted, { n: blacklist.length })}</span>
        </div>
      )}

      {blacklist.length > 0 && (
        <section className="st-section" aria-labelledby="st-bl-alert">
          <div className="st-ghead">
            <span id="st-bl-alert" style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="alert" size={15} /> {t.alertTitle}
            </span>
            <strong>{tr(d.common.nPcs, { n: blacklist.length })}</strong>
          </div>
          <div className="st-cards" role="alert">
            {blacklist.map((b) => (
              <div key={b.imei} className="st-card st-card--danger">
                <div className="st-card-top">
                  <code className="st-mono">{b.imei}</code>
                  <span className="st-pill st-pill--sold">{d.stock.blacklistReasons[b.reason]}</span>
                </div>
                <div className="st-card-kv">
                  <span><em>{t.shop}</em>{b.orgName}</span>
                  <span><em>{t.customer}</em>{b.customerName || '—'}{b.customerPhone ? ` · ${b.customerPhone}` : ''}</span>
                  {b.note && <span><em>{t.note}</em>{b.note}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {result && result.found.length > 0 && (
        <section className="st-section" aria-labelledby="st-found-title">
          <div className="st-ghead"><span id="st-found-title">{t.foundTitle}</span><strong>{tr(d.common.nPcs, { n: result.found.length })}</strong></div>
          <div className="st-cards">
            {result.found.map((p) => (
              <Link key={p.id} href={`/app/products/${p.id}`} className={`st-card${blacklisted.has(p.imei) ? ' st-card--danger' : ''}`}>
                <div className="st-card-top">
                  <span className="st-card-name">{p.name}</span>
                  <span className={`st-pill st-pill--${p.status}`}>{d.stock.status[p.status as ProductStatus] ?? p.status}</span>
                </div>
                <code className="st-mono">{p.imei}</code>
                <div className="st-card-foot">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="building" size={14} /> {p.branch}</span>
                  <b>{fmtMoney(p.salePrice)}</b>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {result && result.missing.length > 0 && (
        <section className="st-section" aria-labelledby="st-missing-title">
          <div className="st-ghead"><span id="st-missing-title">{t.missingTitle}</span><strong>{tr(d.common.nPcs, { n: result.missing.length })}</strong></div>
          <div className="st-group st-missing">
            {result.missing.map((m) => <code key={m}>{m}</code>)}
          </div>
        </section>
      )}

      {result && result.found.length === 0 && result.missing.length === 0 && (
        <div className="st-group st-section">
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="search" size={24} /></span>
            <b>{t.noResult}</b>
            <p>{t.noResultHint}</p>
          </div>
        </div>
      )}
    </>
  );
}
