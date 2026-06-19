'use client';

import { useState } from 'react';

type TabKey = 'ombor' | 'sotuv' | 'kassa' | 'monitoring';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ombor', label: 'Ombor' },
  { key: 'sotuv', label: 'Sotuv' },
  { key: 'kassa', label: 'Kassa' },
  { key: 'monitoring', label: 'Monitoring' },
];

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

function StatusBadge({ status }: { status: 'available' | 'sold' | 'transfer' }) {
  const map = {
    available: { t: 'Omborda', cls: 'shot-badge--ok' },
    sold: { t: 'Sotilgan', cls: 'shot-badge--mute' },
    transfer: { t: 'Filialga', cls: 'shot-badge--info' },
  } as const;
  return <span className={`shot-badge ${map[status].cls}`}>{map[status].t}</span>;
}

const INVENTORY = [
  { name: 'iPhone 15 Pro 256GB', imei: '353914...8821', price: '14 200 000', status: 'available' as const },
  { name: 'Samsung S24 Ultra 512GB', imei: '356712...4490', price: '13 850 000', status: 'available' as const },
  { name: 'Xiaomi 14 256GB', imei: '861234...7732', price: '7 400 000', status: 'sold' as const },
  { name: 'iPhone 14 128GB', imei: '359201...1108', price: '9 900 000', status: 'transfer' as const },
  { name: 'Redmi Note 13 Pro', imei: '867455...0021', price: '3 250 000', status: 'available' as const },
];

const SALES = [
  { client: 'Akmal Yusupov', product: 'iPhone 15 Pro 256GB', sum: '14 200 000', type: 'Naqd', typeCls: 'shot-badge--ok' },
  { client: 'Dilnoza Karimova', product: 'Samsung S24 Ultra', sum: '13 850 000', type: 'Nasiya', typeCls: 'shot-badge--info' },
  { client: 'Sardor Aliyev', product: 'Redmi Note 13 Pro', sum: '3 250 000', type: 'Kredit', typeCls: 'shot-badge--warn' },
  { client: 'Nigora Tosheva', product: 'AirPods Pro 2', sum: '2 100 000', type: 'Naqd', typeCls: 'shot-badge--ok' },
];

const KASSA = [
  { bank: 'Naqd kassa', balance: '42 380 000', delta: '+5.2%', up: true },
  { bank: 'Uzcard / Humo', balance: '18 640 000', delta: '+12.1%', up: true },
  { bank: 'Kapitalbank kredit', balance: '7 920 000', delta: '−2.4%', up: false },
  { bank: 'Anor / BNPL', balance: '3 450 000', delta: '+8.0%', up: true },
];

const BARS = [
  { m: 'Yan', h: 48 }, { m: 'Fev', h: 62 }, { m: 'Mar', h: 55 }, { m: 'Apr', h: 78 },
  { m: 'May', h: 70 }, { m: 'Iyn', h: 92 }, { m: 'Iyl', h: 84 },
];

export default function ProductShowcase() {
  const [tab, setTab] = useState<TabKey>('ombor');

  return (
    <section className="section" id="demo">
      <div className="container">
        <div className="head">
          <span className="eyebrow">Mahsulot</span>
          <h2>Bir tizimda — to&apos;liq nazorat</h2>
          <p>Ombordan kassagacha, har bir bo&apos;limni jonli ko&apos;rinishda sinab ko&apos;ring.</p>
        </div>

        <div className="shot-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`shot-tab${tab === t.key ? ' shot-tab--active' : ''}`}
              onClick={() => setTab(t.key)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'ombor' && (
          <Frame url="dokon1.savora.uz/app/inventory">
            <div className="shot-toolbar">
              <div className="shot-title">Ombor — 1 248 mahsulot</div>
              <div className="shot-search">🔎 IMEI yoki nom bo&apos;yicha qidirish…</div>
            </div>
            <table className="shot-table">
              <thead><tr><th>Mahsulot</th><th>IMEI</th><th>Narx (so&apos;m)</th><th>Holat</th></tr></thead>
              <tbody>
                {INVENTORY.map((r) => (
                  <tr key={r.imei}>
                    <td className="shot-strong">{r.name}</td>
                    <td className="shot-mono">{r.imei}</td>
                    <td className="shot-strong">{r.price}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Frame>
        )}

        {tab === 'sotuv' && (
          <Frame url="dokon1.savora.uz/app/sales">
            <div className="shot-toolbar">
              <div className="shot-title">Bugungi sotuvlar</div>
              <div className="shot-pill">Jami: 33 350 000 so&apos;m</div>
            </div>
            <table className="shot-table">
              <thead><tr><th>Mijoz</th><th>Mahsulot</th><th>Summa (so&apos;m)</th><th>To&apos;lov</th></tr></thead>
              <tbody>
                {SALES.map((r) => (
                  <tr key={r.client}>
                    <td className="shot-strong">{r.client}</td>
                    <td>{r.product}</td>
                    <td className="shot-strong">{r.sum}</td>
                    <td><span className={`shot-badge ${r.typeCls}`}>{r.type}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Frame>
        )}

        {tab === 'kassa' && (
          <Frame url="dokon1.savora.uz/app/kassa">
            <div className="shot-toolbar">
              <div className="shot-title">Kassa qoldiqlari</div>
              <div className="shot-pill">Umumiy: 72 390 000 so&apos;m</div>
            </div>
            <div className="shot-cards">
              {KASSA.map((k) => (
                <div key={k.bank} className="shot-card">
                  <div className="shot-card-lbl">{k.bank}</div>
                  <div className="shot-card-val">{k.balance}</div>
                  <div className={`shot-card-delta${k.up ? '' : ' is-down'}`}>{k.delta} oylik</div>
                </div>
              ))}
            </div>
          </Frame>
        )}

        {tab === 'monitoring' && (
          <Frame url="dokon1.savora.uz/app/monitoring">
            <div className="shot-toolbar">
              <div className="shot-title">Oylik foyda dinamikasi</div>
              <div className="shot-pill shot-pill--ok">Foyda: +24% ↑</div>
            </div>
            <div className="shot-kpis">
              <div className="shot-kpi"><div className="shot-kpi-l">Kirim</div><div className="shot-kpi-v">218 400 000</div></div>
              <div className="shot-kpi"><div className="shot-kpi-l">Chiqim</div><div className="shot-kpi-v">164 900 000</div></div>
              <div className="shot-kpi"><div className="shot-kpi-l">Sof foyda</div><div className="shot-kpi-v shot-kpi-v--ok">53 500 000</div></div>
            </div>
            <div className="shot-chart">
              {BARS.map((b) => (
                <div key={b.m} className="shot-chart-col">
                  <div className="shot-chart-bar" style={{ height: `${b.h}%` }} />
                  <span className="shot-chart-m">{b.m}</span>
                </div>
              ))}
            </div>
          </Frame>
        )}
      </div>
    </section>
  );
}
