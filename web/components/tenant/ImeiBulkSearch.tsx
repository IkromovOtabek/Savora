'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { bulkImeiLookup } from '@/app/actions/transfer';
import { checkImeiBlacklistAction } from '@/app/actions/imeiBlacklist';
import Icon from '@/components/icons/Icon';
import CameraScanButton from '@/components/ui/CameraScanButton';
import type { BlacklistHit } from '@/lib/imeiBlacklist';
import { PRODUCT_STATUS_LABELS, ProductStatus } from '@/lib/models/tenant/Product';
import { fmtMoney } from '@/lib/format';

export default function ImeiBulkSearch() {
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
            <h2 id="st-imei-title">Ko&apos;p IMEI qidiruv</h2>
            <p>Har qatorga bittadan yoki vergul / probel bilan. Skaner bilan ham qo&apos;shish mumkin.</p>
          </div>
        </div>
        <label htmlFor="imeis" className="sr-only">IMEI ro&apos;yxati (har qator, vergul yoki probel bilan)</label>
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
            <b>{entered}</b> ta IMEI
            {odd > 0 && <span className="st-imei-odd"> · {odd} tasi 15 raqam emas</span>}
          </span>
          <div className="st-imei-tools">
            <CameraScanButton onScan={onScan} label="Skaner" />
            {text && (
              <button type="button" className="btn btn-plain btn-sm" onClick={clear}>Tozalash</button>
            )}
          </div>
          <button type="button" className="btn btn-primary btn-with-icon st-imei-go" onClick={search} disabled={pending || !text.trim()}>
            <Icon name="search" size={18} />
            {pending ? 'Qidirilmoqda...' : entered > 0 ? `${entered} ta IMEI ni qidirish` : 'Qidirish'}
          </button>
        </div>
      </section>

      {result && (
        <div className="st-imei-summary" aria-live="polite">
          <span className="st-pill st-pill--in_stock">{result.found.length} topildi</span>
          <span className={`st-pill ${result.missing.length > 0 ? 'st-pill--transferred' : ''}`}>{result.missing.length} topilmadi</span>
          <span className={`st-pill ${blacklist.length > 0 ? 'st-pill--sold' : ''}`}>{blacklist.length} qora ro&apos;yxatda</span>
        </div>
      )}

      {blacklist.length > 0 && (
        <section className="st-section" aria-labelledby="st-bl-alert">
          <div className="st-ghead">
            <span id="st-bl-alert" style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="alert" size={15} /> Qora ro&apos;yxat ogohlantirishi
            </span>
            <strong>{blacklist.length} ta</strong>
          </div>
          <div className="st-cards" role="alert">
            {blacklist.map((b) => (
              <div key={b.imei} className="st-card st-card--danger">
                <div className="st-card-top">
                  <code className="st-mono">{b.imei}</code>
                  <span className="st-pill st-pill--sold">{b.reasonLabel}</span>
                </div>
                <div className="st-card-kv">
                  <span><em>Do&apos;kon:</em>{b.orgName}</span>
                  <span><em>Mijoz:</em>{b.customerName || '—'}{b.customerPhone ? ` · ${b.customerPhone}` : ''}</span>
                  {b.note && <span><em>Izoh:</em>{b.note}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {result && result.found.length > 0 && (
        <section className="st-section" aria-labelledby="st-found-title">
          <div className="st-ghead"><span id="st-found-title">Topilgan mahsulotlar</span><strong>{result.found.length} ta</strong></div>
          <div className="st-cards">
            {result.found.map((p) => (
              <Link key={p.id} href={`/app/products/${p.id}`} className={`st-card${blacklisted.has(p.imei) ? ' st-card--danger' : ''}`}>
                <div className="st-card-top">
                  <span className="st-card-name">{p.name}</span>
                  <span className={`st-pill st-pill--${p.status}`}>{PRODUCT_STATUS_LABELS[p.status as ProductStatus] ?? p.status}</span>
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
          <div className="st-ghead"><span id="st-missing-title">Omborda topilmadi</span><strong>{result.missing.length} ta</strong></div>
          <div className="st-group st-missing">
            {result.missing.map((m) => <code key={m}>{m}</code>)}
          </div>
        </section>
      )}

      {result && result.found.length === 0 && result.missing.length === 0 && (
        <div className="st-group st-section">
          <div className="ux-empty">
            <span className="ux-empty-ic"><Icon name="search" size={24} /></span>
            <b>Natija yo&apos;q</b>
            <p>IMEI larni tekshirib, qayta urinib ko&apos;ring.</p>
          </div>
        </div>
      )}
    </>
  );
}
