'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createFilialAction, updateFilialAction, deleteFilialAction } from '@/app/actions/filials';
import { toast } from '@/lib/toast';
import { fmtDateTime } from '@/lib/format';
import Icon from '@/components/icons/Icon';

interface Row {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  active: boolean;
  createdAt: string;
  isSelf: boolean;
  branchId?: string;
  phone?: string;
  address?: string;
}

type ActResult = { error?: string; success?: string } | null;

export default function FilialManager({
  rows,
  maxFilial,
  activeBranchCount,
}: {
  rows: Row[];
  maxFilial: number;
  activeBranchCount: number;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<null | { type: 'create' } | { type: 'edit'; row: Row }>(null);
  const [busy, setBusy] = useState(false);

  const canAdd = activeBranchCount < maxFilial;

  async function run(action: (fd: FormData) => Promise<ActResult>, form: HTMLFormElement) {
    setBusy(true);
    const res = await action(new FormData(form));
    setBusy(false);
    if (res?.error) { toast(res.error, 'error'); return; }
    toast(res?.success ?? 'Saqlandi.', 'success');
    setModal(null);
    router.refresh();
  }

  async function remove(row: Row) {
    if (!row.branchId) return;
    if (!confirm(`"${row.name}" filialini o'chirasizmi?`)) return;
    setBusy(true);
    const fd = new FormData();
    fd.set('branchId', row.branchId);
    const res = await deleteFilialAction(null, fd);
    setBusy(false);
    if (res?.error) { toast(res.error, 'error'); return; }
    toast(res?.success ?? 'O\'chirildi.', 'success');
    router.refresh();
  }

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h2>Barcha foydalanuvchilar</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="count-chip">{rows.length} ta</span>
            <button
              className="btn btn-primary btn-sm btn-with-icon"
              onClick={() => setModal({ type: 'create' })}
              disabled={!canAdd}
              title={canAdd ? '' : 'Tarif limiti to\'ldi'}
            >
              <Icon name="plus" size={16} /> Yangi
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table users-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>№</th>
                <th>Login</th>
                <th>Parol</th>
                <th>Rol</th>
                <th>Yaratilgan</th>
                <th style={{ textAlign: 'right' }}>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={r.active ? '' : 'u-row--off'}>
                  <td className="u-num">{i + 1}</td>
                  <td>
                    <div className="u-login">
                      <span className={`u-avatar${r.role === 'admin' ? ' u-avatar--admin' : ''}`}>
                        {r.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="u-name">{r.name}</span>
                      {r.isSelf && <span className="u-self">Siz</span>}
                    </div>
                  </td>
                  <td className="u-pass">••••••</td>
                  <td>
                    <span className={`u-role ${r.role === 'admin' ? 'u-role--admin' : 'u-role--user'}`}>
                      {r.role === 'admin' ? 'Admin' : 'Filial'}
                    </span>
                  </td>
                  <td className="u-date">{fmtDateTime(r.createdAt)}</td>
                  <td>
                    <div className="u-actions">
                      <button
                        className="u-icon-btn"
                        title="Tahrirlash"
                        disabled={r.role === 'admin' || !r.branchId}
                        onClick={() => setModal({ type: 'edit', row: r })}
                      >
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        className="u-icon-btn u-icon-btn--danger"
                        title="O'chirish"
                        disabled={r.role === 'admin' || r.isSelf || !r.branchId}
                        onClick={() => remove(r)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!canAdd && (
          <p className="field-hint" style={{ padding: '0 24px 16px' }}>
            Tarif bo&apos;yicha filial limiti to&apos;ldi ({activeBranchCount}/{maxFilial}). Ko&apos;proq filial uchun tarifni yangilang.
          </p>
        )}
      </div>

      {/* ===== Modal: yangi filial ===== */}
      {modal?.type === 'create' && (
        <div className="u-modal-overlay" onClick={() => !busy && setModal(null)}>
          <div className="u-modal" onClick={(e) => e.stopPropagation()}>
            <div className="u-modal-head">
              <h3>Yangi filial</h3>
              <button className="u-icon-btn" onClick={() => setModal(null)} disabled={busy}><Icon name="close" size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); run((fd) => createFilialAction(null, fd), e.currentTarget); }}>
              <div className="form-row">
                <div className="auth-field"><label>Filial nomi *</label><input name="name" required disabled={busy} placeholder="Masalan: Chilonzor" /></div>
                <div className="auth-field"><label>Telefon</label><input name="phone" disabled={busy} placeholder="+998..." /></div>
              </div>
              <div className="auth-field"><label>Manzil</label><input name="address" disabled={busy} /></div>
              <div className="form-row">
                <div className="auth-field"><label>Login *</label><input name="username" required disabled={busy} placeholder="chilonzor" autoComplete="off" /></div>
                <div className="auth-field"><label>Parol *</label><input name="password" type="text" required disabled={busy} placeholder="kamida 6 belgi" autoComplete="off" /></div>
              </div>
              <div className="u-modal-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)} disabled={busy}>Bekor</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saqlanmoqda...' : 'Yaratish'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal: filialни tahrirlash ===== */}
      {modal?.type === 'edit' && (
        <div className="u-modal-overlay" onClick={() => !busy && setModal(null)}>
          <div className="u-modal" onClick={(e) => e.stopPropagation()}>
            <div className="u-modal-head">
              <h3>Filialni tahrirlash</h3>
              <button className="u-icon-btn" onClick={() => setModal(null)} disabled={busy}><Icon name="close" size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); run((fd) => updateFilialAction(null, fd), e.currentTarget); }}>
              <input type="hidden" name="branchId" value={modal.row.branchId} />
              <div className="form-row">
                <div className="auth-field"><label>Filial nomi *</label><input name="name" required defaultValue={modal.row.name} disabled={busy} /></div>
                <div className="auth-field"><label>Telefon</label><input name="phone" defaultValue={modal.row.phone} disabled={busy} /></div>
              </div>
              <div className="auth-field"><label>Manzil</label><input name="address" defaultValue={modal.row.address} disabled={busy} /></div>
              <div className="auth-field"><label>Yangi parol (ixtiyoriy)</label><input name="newPassword" type="text" disabled={busy} placeholder="o'zgartirmaslik uchun bo'sh qoldiring" autoComplete="off" /></div>
              <label className="qty-toggle"><input type="checkbox" name="active" defaultChecked={modal.row.active} disabled={busy} /> Faol</label>
              <div className="u-modal-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)} disabled={busy}>Bekor</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saqlanmoqda...' : 'Saqlash'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
