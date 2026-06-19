'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createFilialAction, updateFilialAction } from '@/app/actions/filials';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';

interface Filial {
  branchId: string;
  name: string;
  address?: string;
  phone?: string;
  active: boolean;
  username?: string;
}

interface Employee {
  id: string;
  fullName: string;
  username: string;
  active: boolean;
  branchName?: string;
}

export default function FilialManager({
  filials,
  employees,
  maxFilial,
  activeBranchCount,
}: {
  filials: Filial[];
  employees: Employee[];
  maxFilial: number;
  activeBranchCount: number;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canAdd = activeBranchCount < maxFilial;

  async function submit(action: (fd: FormData) => Promise<{ error?: string; success?: string } | null>, form: HTMLFormElement) {
    setBusy(true);
    const res = await action(new FormData(form));
    setBusy(false);
    if (res?.error) { toast(res.error, 'error'); return; }
    toast(res?.success ?? 'Saqlandi.', 'success');
    setAdding(false);
    setEditId(null);
    router.refresh();
  }

  return (
    <>
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head">
          <h2>Jamoa — Xodimlar</h2>
          <Link href="/app/users/new" className="btn btn-primary btn-sm btn-with-icon">
            <Icon name="plus" size={14} /> Xodim qo&apos;shish
          </Link>
        </div>
        <div style={{ padding: '16px 24px' }}>
          {employees.length === 0 ? (
            <p className="field-hint">Hali xodim yo&apos;q.</p>
          ) : (
            <div className="filial-list">
              {employees.map((e) => (
                <Link key={e.id} href={`/app/users/${e.id}`} className={`filial-item filial-item--link${e.active ? '' : ' filial-item--off'}`}>
                  <div className="filial-item-main">
                    <div className="filial-item-name">{e.fullName}</div>
                    <div className="filial-item-meta">
                      <span>@{e.username}</span>
                      {e.branchName && <span>{e.branchName}</span>}
                    </div>
                  </div>
                  <div className="filial-item-side">
                    <span className={`badge-status badge-status--${e.active ? 'active' : 'expired'}`}>
                      {e.active ? 'Faol' : 'Nofaol'}
                    </span>
                    <Icon name="arrowRight" size={16} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head">
          <h2>Jamoa — Filiallar</h2>
          <span className="panel-sub">Faol: {activeBranchCount} / {maxFilial}</span>
        </div>

        <div style={{ padding: '16px 24px' }}>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            Har filialga alohida login va parol beriladi. Markaziy ombor (birinchi filial) bu ro&apos;yxatda ko&apos;rsatilmaydi.
          </p>

          {canAdd && !adding && (
            <button className="btn btn-primary btn-with-icon" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> Filial qo&apos;shish
            </button>
          )}
          {!canAdd && <p className="field-hint">Tarif limiti to&apos;ldi.</p>}

          {adding && (
            <form
              className="filial-form"
              onSubmit={(e) => { e.preventDefault(); submit((fd) => createFilialAction(null, fd), e.currentTarget); }}
            >
              <div className="form-row">
                <div className="auth-field"><label>Filial nomi *</label><input name="name" required disabled={busy} placeholder="Masalan: Chilonzor" /></div>
                <div className="auth-field"><label>Telefon</label><input name="phone" disabled={busy} placeholder="+998..." /></div>
              </div>
              <div className="auth-field"><label>Manzil</label><input name="address" disabled={busy} /></div>
              <div className="form-row">
                <div className="auth-field"><label>Login *</label><input name="username" required disabled={busy} placeholder="chilonzor" autoComplete="off" /></div>
                <div className="auth-field"><label>Parol *</label><input name="password" type="text" required disabled={busy} placeholder="kamida 6 belgi" autoComplete="off" /></div>
              </div>
              <div className="filial-form-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Yaratish</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)} disabled={busy}>Bekor</button>
              </div>
            </form>
          )}

          <div className="filial-list">
            {filials.length === 0 && !adding && <p className="field-hint">Qoshimcha filial yo&apos;q. Birinchi filial markaziy ombor sifatida ishlaydi.</p>}
            {filials.map((f) => (
              <div key={f.branchId} className={`filial-item${f.active ? '' : ' filial-item--off'}`}>
                {editId === f.branchId ? (
                  <form
                    className="filial-form"
                    onSubmit={(e) => { e.preventDefault(); submit((fd) => updateFilialAction(null, fd), e.currentTarget); }}
                  >
                    <input type="hidden" name="branchId" value={f.branchId} />
                    <div className="form-row">
                      <div className="auth-field"><label>Filial nomi *</label><input name="name" required defaultValue={f.name} disabled={busy} /></div>
                      <div className="auth-field"><label>Telefon</label><input name="phone" defaultValue={f.phone ?? ''} disabled={busy} /></div>
                    </div>
                    <div className="auth-field"><label>Manzil</label><input name="address" defaultValue={f.address ?? ''} disabled={busy} /></div>
                    <div className="auth-field"><label>Yangi parol (ixtiyoriy)</label><input name="newPassword" type="text" disabled={busy} placeholder="o'zgartirmaslik uchun bo'sh qoldiring" autoComplete="off" /></div>
                    <label className="qty-toggle"><input type="checkbox" name="active" defaultChecked={f.active} disabled={busy} /> Faol</label>
                    <div className="filial-form-actions">
                      <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Saqlash</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditId(null)} disabled={busy}>Bekor</button>
                    </div>
                  </form>
                ) : (
                  <div className="filial-item-row">
                    <div className="filial-item-main">
                      <div className="filial-item-name">{f.name}</div>
                      <div className="filial-item-meta">
                        <span>Login: <code className="imei-code">{f.username ?? '—'}</code></span>
                        {f.phone && <span>{f.phone}</span>}
                        {f.address && <span>{f.address}</span>}
                      </div>
                    </div>
                    <div className="filial-item-side">
                      <span className={`badge-status badge-status--${f.active ? 'active' : 'expired'}`}>{f.active ? 'Faol' : 'Nofaol'}</span>
                      <button className="icon-btn" title="Tahrirlash" onClick={() => setEditId(f.branchId)}><Icon name="edit" size={16} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
