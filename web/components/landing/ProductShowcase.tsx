'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useI18n } from '@/lib/i18n/client';
import { tr, MONTHS_SHORT } from '@/lib/i18n/fmt';

type TabKey = 'ombor' | 'sotuv' | 'kassa' | 'monitoring';
const TAB_KEYS: TabKey[] = ['ombor', 'sotuv', 'kassa', 'monitoring'];

/** Brauzer "chrome" ramkasi — skrinshot ko'rinishi uchun */
function Frame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="shot">
      <div className="shot-bar">
        <span className="shot-dot" style={{ background: '#ef4444' }} />
        <span className="shot-dot" style={{ background: '#f59e0b' }} />
        <span className="shot-dot" style={{ background: '#22c55e' }} />
        <span className="shot-url">{url}</span>
      </div>
      <div className="shot-body">{children}</div>
    </div>
  );
}

type StockStatus = 'available' | 'sold' | 'transfer';
const STATUS_CLS: Record<StockStatus, string> = { available: 'shot-badge--ok', sold: 'shot-badge--mute', transfer: 'shot-badge--info' };

type PayType = 'cash' | 'nasiya' | 'credit';
const PAY_CLS: Record<PayType, string> = { cash: 'shot-badge--ok', nasiya: 'shot-badge--info', credit: 'shot-badge--warn' };

const INVENTORY: { name: string; imei: string; price: string; status: StockStatus }[] = [
  { name: 'iPhone 15 Pro 256GB', imei: '353914...8821', price: '14 200 000', status: 'available' },
  { name: 'Samsung S24 Ultra 512GB', imei: '356712...4490', price: '13 850 000', status: 'available' },
  { name: 'Xiaomi 14 256GB', imei: '861234...7732', price: '7 400 000', status: 'sold' },
  { name: 'iPhone 14 128GB', imei: '359201...1108', price: '9 900 000', status: 'transfer' },
  { name: 'Redmi Note 13 Pro', imei: '867455...0021', price: '3 250 000', status: 'available' },
];

const SALES: { client: string; product: string; sum: string; type: PayType }[] = [
  { client: 'Akmal Yusupov', product: 'iPhone 15 Pro 256GB', sum: '14 200 000', type: 'cash' },
  { client: 'Dilnoza Karimova', product: 'Samsung S24 Ultra', sum: '13 850 000', type: 'nasiya' },
  { client: 'Sardor Aliyev', product: 'Redmi Note 13 Pro', sum: '3 250 000', type: 'credit' },
  { client: 'Nigora Tosheva', product: 'AirPods Pro 2', sum: '2 100 000', type: 'cash' },
];

/** Kassa kartalari — nomi lug'atdan (key) yoki brend nomi (fixed) */
const KASSA: { key?: 'kassaCash' | 'kassaCredit'; fixed?: string; balance: string; delta: string; up: boolean }[] = [
  { key: 'kassaCash', balance: '42 380 000', delta: '+5.2%', up: true },
  { fixed: 'Uzcard / Humo', balance: '18 640 000', delta: '+12.1%', up: true },
  { key: 'kassaCredit', balance: '7 920 000', delta: '−2.4%', up: false },
  { fixed: 'Anor / BNPL', balance: '3 450 000', delta: '+8.0%', up: true },
];

/** Oylik foyda ustunlari — oy nomi MONTHS_SHORT[locale][m] */
const BARS = [
  { m: 0, h: 48 }, { m: 1, h: 62 }, { m: 2, h: 55 }, { m: 3, h: 78 },
  { m: 4, h: 70 }, { m: 5, h: 92 }, { m: 6, h: 84 },
];

export default function ProductShowcase() {
  const { locale, d } = useI18n();
  const S = d.landing.showcase;
  const [tab, setTab] = useState<TabKey>('ombor');
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <section className="section" id="demo">
      <div className="container">
        <div className="head">
          <span className="eyebrow">{S.eyebrow}</span>
          <h2>{S.title}</h2>
          <p>{S.lead}</p>
        </div>

        <div className="shot-tabs">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              className={`shot-tab${tab === key ? ' shot-tab--active' : ''}`}
              onClick={() => setTab(key)}
              type="button"
            >
              {S.tabs[key]}
            </button>
          ))}
        </div>

        {tab === 'ombor' && (
          <Frame url="dokon1.savora.uz/app/inventory">
            <div className="shot-toolbar">
              <div className="shot-title">{S.stockTitle}</div>
              <div className="shot-search" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="search" size={14} /> {S.stockSearch}</div>
            </div>
            <table className="shot-table">
              <thead><tr><th>{S.colProduct}</th><th>IMEI</th><th>{S.colPrice}</th><th>{S.colStatus}</th></tr></thead>
              <tbody>
                {INVENTORY.map((r) => (
                  <tr key={r.imei}>
                    <td className="shot-strong">{r.name}</td>
                    <td className="shot-mono">{r.imei}</td>
                    <td className="shot-strong">{r.price}</td>
                    <td><span className={`shot-badge ${STATUS_CLS[r.status]}`}>{S.status[r.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Frame>
        )}

        {tab === 'sotuv' && (
          <Frame url="dokon1.savora.uz/app/sales">
            <div className="shot-toolbar">
              <div className="shot-title">{S.salesTitle}</div>
              <div className="shot-pill">{S.salesTotal}</div>
            </div>
            <table className="shot-table">
              <thead><tr><th>{S.colCustomer}</th><th>{S.colProduct}</th><th>{S.colSum}</th><th>{S.colPayment}</th></tr></thead>
              <tbody>
                {SALES.map((r) => (
                  <tr key={r.client}>
                    <td className="shot-strong">{r.client}</td>
                    <td>{r.product}</td>
                    <td className="shot-strong">{r.sum}</td>
                    <td><span className={`shot-badge ${PAY_CLS[r.type]}`}>{S.payTypes[r.type]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Frame>
        )}

        {tab === 'kassa' && (
          <Frame url="dokon1.savora.uz/app/kassa">
            <div className="shot-toolbar">
              <div className="shot-title">{S.kassaTitle}</div>
              <div className="shot-pill">{S.kassaTotal}</div>
            </div>
            <div className="shot-cards">
              {KASSA.map((k) => {
                const name = k.key ? S[k.key] : k.fixed;
                return (
                  <div key={name} className="shot-card">
                    <div className="shot-card-lbl">{name}</div>
                    <div className="shot-card-val">{k.balance}</div>
                    <div className={`shot-card-delta${k.up ? '' : ' is-down'}`}>{tr(S.monthly, { delta: k.delta })}</div>
                  </div>
                );
              })}
            </div>
          </Frame>
        )}

        {tab === 'monitoring' && (
          <Frame url="dokon1.savora.uz/app/monitoring">
            <div className="shot-toolbar">
              <div className="shot-title">{S.monTitle}</div>
              <div className="shot-pill shot-pill--ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{S.monProfit} <Icon name="trendingUp" size={13} /></div>
            </div>
            <div className="shot-kpis">
              <div className="shot-kpi"><div className="shot-kpi-l">{S.income}</div><div className="shot-kpi-v">218 400 000</div></div>
              <div className="shot-kpi"><div className="shot-kpi-l">{S.expense}</div><div className="shot-kpi-v">164 900 000</div></div>
              <div className="shot-kpi"><div className="shot-kpi-l">{S.netProfit}</div><div className="shot-kpi-v shot-kpi-v--ok">53 500 000</div></div>
            </div>
            <div className="shot-chart">
              {BARS.map((b) => (
                <div key={b.m} className="shot-chart-col">
                  <div className="shot-chart-bar" style={{ height: `${b.h}%` }} />
                  <span className="shot-chart-m">{cap(MONTHS_SHORT[locale][b.m])}</span>
                </div>
              ))}
            </div>
          </Frame>
        )}
      </div>
    </section>
  );
}
