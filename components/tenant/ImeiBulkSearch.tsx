'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { bulkImeiLookup } from '@/app/actions/transfer';
import { checkImeiBlacklistAction } from '@/app/actions/imeiBlacklist';
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

  return (
    <>
      <div className="panel panel--wide">
        <div className="panel-head"><h2>Ko&apos;p IMEI qidiruv</h2></div>
        <div className="form-grid">
          <div className="auth-field">
            <label htmlFor="imeis">IMEI ro&apos;yxati (har qator, vergul yoki probel bilan)</label>
            <textarea id="imeis" rows={8} className="text-area imei-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="353456789012345&#10;353456789012346" />
          </div>
          <button type="button" className="btn btn-primary" onClick={search} disabled={pending || !text.trim()}>
            {pending ? 'Qidirilmoqda...' : 'Qidirish'}
          </button>
        </div>
      </div>

      {blacklist.length > 0 && (
        <div className="panel imei-blacklist-alert" style={{ marginTop: 20 }}>
          <div className="panel-head"><h2>⚠️ Qora ro&apos;yxat ogohlantirishi ({blacklist.length})</h2></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>IMEI</th><th>Sabab</th><th>Do&apos;kon</th><th>Mijoz</th><th>Izoh</th></tr></thead>
              <tbody>
                {blacklist.map((b) => (
                  <tr key={b.imei} className="row-overdue">
                    <td><code className="imei-code">{b.imei}</code></td>
                    <td><span className="badge-status badge-status--expired">{b.reasonLabel}</span></td>
                    <td>{b.orgName}</td>
                    <td>{b.customerName || '—'}{b.customerPhone ? ` · ${b.customerPhone}` : ''}</td>
                    <td>{b.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-head">
            <h2>Natija: {result.found.length} topildi, {result.missing.length} topilmadi</h2>
          </div>
          {result.missing.length > 0 && (
            <div className="auth-alert auth-alert--warn" style={{ margin: '16px 24px' }}>
              Topilmadi: {result.missing.join(', ')}
            </div>
          )}
          {result.found.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>IMEI</th><th>Mahsulot</th><th>Filial</th><th>Holat</th><th>Narx</th><th></th></tr></thead>
                <tbody>
                  {result.found.map((p) => (
                    <tr key={p.id}>
                      <td><code className="imei-code">{p.imei}</code></td>
                      <td><Link href={`/app/products/${p.id}`} className="cell-link">{p.name}</Link></td>
                      <td>{p.branch}</td>
                      <td>{PRODUCT_STATUS_LABELS[p.status as ProductStatus]}</td>
                      <td>{fmtMoney(p.salePrice)}</td>
                      <td><Link href={`/app/products/${p.id}`} className="btn btn-ghost btn-sm">Ochish</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
