import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { isBranchScoped } from '@/lib/branchScope';
import { fmtDate, fmtDateTime } from '@/lib/format';
import Icon from '@/components/icons/Icon';

export const metadata = { title: 'Filialga berildi — Savora' };

export default async function TransferredPage() {
  const { user, Transfer } = await getTenantSession();

  // Filial login — faqat o'z filialiga berilganlar
  const tFilter = isBranchScoped(user) ? { toBranchId: user.branchId } : {};
  const transfers = await Transfer.find(tFilter).sort({ createdAt: -1 }).limit(200).lean();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = transfers.filter((t) => new Date(t.createdAt!) >= todayStart).length;
  const totalQty = transfers.reduce((s, t) => s + (t.quantity ?? 0), 0);
  const branchCount = new Set(transfers.map((t) => t.toBranchName)).size;

  // Kun bo'yicha guruhlash (ro'yxat allaqachon sana bo'yicha tartiblangan)
  const todayKey = fmtDate(new Date());
  const groups: { day: string; items: typeof transfers }[] = [];
  for (const t of transfers) {
    const day = fmtDate(t.createdAt!);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(t);
    else groups.push({ day, items: [t] });
  }

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">Filialga berildi</h1>
          <p className="t-page-sub">Bugun: <strong>{todayCount} ta</strong> · Jami berilgan: <strong>{totalQty} dona</strong></p>
        </div>
        <div className="t-page-actions">
          <Link href="/app/products" className="btn btn-ghost btn-with-icon">
            <Icon name="box" size={16} />
            Omborga o&apos;tish
          </Link>
        </div>
      </div>

      <section className="sl-stats sl-tr-stats" aria-label="Xulosa">
        <div className="sl-stat sl-stat--hero">
          <span className="sl-stat-l"><Icon name="repeat" size={16} />Bugun</span>
          <span className="sl-stat-v">{todayCount} <small>ta</small></span>
        </div>
        <div className="sl-stat">
          <span className="sl-stat-l"><Icon name="box" size={16} />Jami dona</span>
          <span className="sl-stat-v">{totalQty}</span>
        </div>
        <div className="sl-stat">
          <span className="sl-stat-l"><Icon name="store" size={16} />Filiallar</span>
          <span className="sl-stat-v">{branchCount}</span>
        </div>
      </section>

      <div className="sl-card sl-list-card">
        {transfers.length === 0 ? (
          <div className="sl-empty">
            <div className="sl-empty-ic"><Icon name="repeat" size={30} /></div>
            <h3>Hali filialga berilgan mahsulot yo&apos;q</h3>
            <p>Ombordagi mahsulot sahifasidan uni boshqa filialga ko&apos;chirishingiz mumkin.</p>
            <Link href="/app/products" className="btn btn-primary">Omborga o&apos;tish</Link>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.day}>
              <h2 className="sl-day">{g.day === todayKey ? 'Bugun' : g.day} · {g.items.length} ta</h2>
              <ul className="sl-list">
                {g.items.map((t) => (
                  <li key={String(t._id)} className="sl-row sl-tr">
                    <span className="sl-av" aria-hidden><Icon name="box" size={18} /></span>
                    <div className="sl-row-main">
                      <Link href={`/app/products/${t.productId}`} className="sl-row-title">{t.productSnapshot.name}</Link>
                      <div className="sl-row-sub">
                        <span>{t.transferNo}</span>
                        {t.productSnapshot.imei && <code>{t.productSnapshot.imei}</code>}
                      </div>
                      <div className="sl-row-meta">
                        <span className="sl-tr-route">
                          <span>{t.fromBranchName ?? '—'}</span>
                          <Icon name="arrowRight" size={14} />
                          <b>{t.toBranchName}</b>
                        </span>
                        <span>{t.transferredBy}</span>
                        <span>{fmtDateTime(t.createdAt!).split(', ')[1]}</span>
                      </div>
                    </div>
                    <div className="sl-tr-qty">
                      <strong>{t.quantity}</strong>
                      <span>dona</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  );
}
