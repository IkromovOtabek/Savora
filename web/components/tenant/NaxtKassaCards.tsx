'use client';

import { useState } from 'react';
import Link from 'next/link';
import { amtTone, fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import { useDict } from '@/lib/i18n/client';
import { plural, tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

export interface KassaCard {
  id: string;
  name: string;
  naxtSotuv: number;
  /** Kredit kassada bankdan olingan pul — naqd kassaga qo'shiladi */
  bankOlgan?: number;
  adminOlgan: number;
  qolgan: number;
}

/** Ko'rinish filtri: jami qoldiq yoki uning naqd / kredit qismi */
type KassaView = 'all' | 'cash' | 'credit';
const VIEWS: KassaView[] = ['all', 'cash', 'credit'];

/** Ulush foizi (0–100), nolga bo'linmaydi */
function pct(part: number, whole: number) {
  return whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0;
}

/** Ishorali summa: nol bo'lsa ishorasiz "0" ("−0" / "+0" chiqmaydi) */
function signed(v: number, sign: '+' | '−') {
  return v === 0 ? '0' : `${sign}${fmtMoney(v)}`;
}

/**
 * Qoldiq tarkibi: kredit — Kredit kassada bankdan olingan pul, naqd — qolgani (naqd sotuv − admin olgan).
 * naqd + kredit = qoldiq. Foizlar musbat qismlar bo'yicha, yaxlitlangani yig'indida 100.
 */
function mix(c: KassaCard) {
  const credit = c.bankOlgan ?? 0;
  const cash = c.qolgan - credit;
  const pos = Math.max(0, cash) + Math.max(0, credit);
  const cashPct = pos > 0 ? Math.round((Math.max(0, cash) / pos) * 100) : 0;
  return { cash, credit, cashPct, creditPct: pos > 0 ? 100 - cashPct : 0 };
}

function viewValue(c: KassaCard, v: KassaView) {
  const m = mix(c);
  return v === 'cash' ? m.cash : v === 'credit' ? m.credit : c.qolgan;
}

function useViewLabel(v: KassaView) {
  const k = useDict().sales.kassa;
  return v === 'cash' ? k.cashPart : v === 'credit' ? k.creditPart : k.balance;
}

/** Naqd | kredit chizig'i */
function MixBar({ c, label }: { c: KassaCard; label?: string }) {
  const m = mix(c);
  return (
    <div className="fn-split" {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <i className="fn-split-in" style={{ width: `${m.cashPct}%` }} />
      <i className="fn-split-gold" style={{ width: `${m.creditPct}%` }} />
    </div>
  );
}

function BranchPass({ c, view, hasCredit }: { c: KassaCard; view: KassaView; hasCredit: boolean }) {
  const d = useDict();
  const k = d.sales.kassa;
  const label = useViewLabel(view);
  const bank = c.bankOlgan ?? 0;
  const m = mix(c);
  const value = viewValue(c, view);
  return (
    <Link href={`/app/kassa/${c.id}`} className="fn-pass" aria-label={tr(k.passAria, { name: c.name })}>
      <div className="fn-pass-head">
        <span className="fn-avatar" aria-hidden="true">{c.name.trim().charAt(0).toUpperCase() || '?'}</span>
        <span className="fn-pass-name">{c.name}</span>
        <Icon name="chevron" size={16} className="fn-pass-chev fn-r" />
      </div>
      <div>
        <div className="fn-pass-label">{label}</div>
        <div className={`fn-pass-value fn-num ${amtTone(value)}`}>{fmtMoney(value)}<span className="fn-cur">{d.common.sum}</span></div>
      </div>
      {hasCredit ? (
        <MixBar c={c} />
      ) : (
        <div className="fn-split" aria-hidden="true">
          <i className="fn-split-in" style={{ width: `${pct(c.naxtSotuv + bank - c.adminOlgan, c.naxtSotuv + bank)}%` }} />
          <i className="fn-split-out" style={{ width: `${pct(c.adminOlgan, c.naxtSotuv + bank)}%` }} />
        </div>
      )}
      <div className="fn-pass-rows">
        <div className={`fn-pass-row${view === 'credit' ? ' fn-dim' : ''}`}>
          <span>
            {hasCredit && <i className="fn-dot fn-dot--cash" aria-hidden="true" />}
            {k.cashSales}
            {hasCredit && <small className="fn-pct">{m.cashPct}%</small>}
          </span>
          <strong className={c.naxtSotuv ? 'fn-in' : undefined}>{signed(c.naxtSotuv, '+')}</strong>
        </div>
        {hasCredit && (
          <div className={`fn-pass-row${view === 'cash' ? ' fn-dim' : ''}`}>
            <span>
              <i className="fn-dot fn-dot--credit" aria-hidden="true" />
              {k.creditPart}
              <small className="fn-pct">{m.creditPct}%</small>
            </span>
            <strong className={bank ? 'fn-in' : undefined}>{signed(bank, '+')}</strong>
          </div>
        )}
        <div className={`fn-pass-row${view === 'credit' ? ' fn-dim' : ''}`}>
          <span>{k.adminTook}</span>
          <strong className={c.adminOlgan ? 'fn-out' : undefined}>{signed(c.adminOlgan, '−')}</strong>
        </div>
      </div>
    </Link>
  );
}

export default function NaxtKassaCards({
  total,
  cards,
  hasCredit = false,
  creditHref,
}: {
  total: KassaCard;
  cards: KassaCard[];
  /** Kredit (bank) puli bor yoki Kredit kassa yoqiq — Jami / Naqd / Kredit filtri chiqadi */
  hasCredit?: boolean;
  /** Kredit ko'rinishida hamyondagi havola (Kredit kassa faqat egasiga) */
  creditHref?: string;
}) {
  const d = useDict();
  const k = d.sales.kassa;
  const [view, setView] = useState<KassaView>('all');
  const v: KassaView = hasCredit ? view : 'all';
  const label = useViewLabel(v);
  const m = mix(total);
  const value = viewValue(total, v);
  const viewText: Record<KassaView, string> = { all: k.viewAll, cash: k.viewCash, credit: k.viewCredit };

  return (
    <div className="fn-kassa">
      {hasCredit && (
        <div className="fn-seg" role="tablist" aria-label={k.viewAria}>
          {VIEWS.map((x) => (
            <button
              key={x} type="button" role="tab" id={`kassa-tab-${x}`} aria-controls="kassa-wallet"
              aria-selected={v === x} className="fn-seg-btn" onClick={() => setView(x)}
            >
              {viewText[x]}
            </button>
          ))}
        </div>
      )}

      <div className="fn-wallet" id="kassa-wallet" {...(hasCredit ? { role: 'tabpanel', 'aria-labelledby': `kassa-tab-${v}` } : {})}>
        {/* Hamyon — sahifaning asosiy ob'ekti (3D to'plam) */}
        <Tilt stack as="section" className="fn-hero" style={{ minWidth: 0 }}>
          <div className="fn-hero-top">
            <span className="fn-hero-label">{total.name}</span>
            <span className="fn-emv" aria-hidden="true" />
          </div>
          <div>
            <div className="fn-hero-stat-l">{label}</div>
            <div className={`fn-hero-value fn-num ux-z ${amtTone(value)}`}>{fmtMoney(value)}<span className="fn-cur">{d.common.sum}</span></div>
          </div>
          {hasCredit && (
            <div className="fn-kmix">
              <MixBar c={total} label={tr(k.mixAria, { cash: fmtMoney(m.cash), credit: fmtMoney(m.credit) })} />
              <div className="fn-kmix-legend">
                <span className={`fn-kmix-item${v === 'credit' ? ' fn-dim' : ''}`}>
                  <i className="fn-dot fn-dot--cash" aria-hidden="true" />
                  {k.viewCash} <b className="fn-num">{fmtMoney(m.cash)}</b> <small>{m.cashPct}%</small>
                </span>
                <span className={`fn-kmix-item${v === 'cash' ? ' fn-dim' : ''}`}>
                  <i className="fn-dot fn-dot--credit" aria-hidden="true" />
                  {k.viewCredit} <b className="fn-num">{fmtMoney(m.credit)}</b> <small>{m.creditPct}%</small>
                </span>
              </div>
            </div>
          )}
          <div className="fn-hero-grid">
            <div className={`fn-hero-stat${v === 'credit' ? ' fn-dim' : ''}`}>
              <span className="fn-hero-stat-l">{k.cashSales}</span>
              <span className={`fn-hero-stat-v fn-num ${amtTone(total.naxtSotuv)}`}>{signed(total.naxtSotuv, '+')}</span>
            </div>
            {/* Filtr bor bo'lsa bank puli tarkib qatorida ko'rinadi */}
            {!hasCredit && (total.bankOlgan ?? 0) > 0 && (
              <div className="fn-hero-stat">
                <span className="fn-hero-stat-l">{d.crm.money.fromBank}</span>
                <span className={`fn-hero-stat-v fn-num ${amtTone(total.bankOlgan ?? 0)}`}>{signed(total.bankOlgan ?? 0, '+')}</span>
              </div>
            )}
            <div className={`fn-hero-stat${v === 'credit' ? ' fn-dim' : ''}`}>
              <span className="fn-hero-stat-l">{k.adminTook}</span>
              <span className={`fn-hero-stat-v fn-num ${amtTone(-total.adminOlgan)}`}>{signed(total.adminOlgan, '−')}</span>
            </div>
          </div>
          {v === 'credit' && creditHref ? (
            <Link href={creditHref} className="fn-hero-link">
              {d.sales.creditKassa.title} <Icon name="chevron" size={14} className="fn-r" />
            </Link>
          ) : (
            <Link href="/app/sales?type=cash" className="fn-hero-link">
              {k.cashSalesLink} <Icon name="chevron" size={14} className="fn-r" />
            </Link>
          )}
        </Tilt>

        <div className="fn-wallet-side">
          {cards.length > 0 && (
            <h2 className="fn-section-title"><span>{d.common.branches}</span><span>{tr(plural(cards.length, d.sales.nBranches), { n: cards.length })}</span></h2>
          )}

          {cards.length === 0 ? (
            <div className="fn-panel">
              <div className="ux-empty">
                <span className="ux-empty-ic"><Icon name="store" size={26} /></span>
                <b>{d.sales.noActiveBranch}</b>
                <p>{k.noBranchHint}</p>
              </div>
            </div>
          ) : (
            <div className="fn-grid">
              {cards.map((c) => <BranchPass key={c.id} c={c} view={v} hasCredit={hasCredit} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
