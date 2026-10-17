import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { isBranchScoped } from '@/lib/branchScope';
import { fmtDate, fmtDateTime } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.stock.transferred.metaTitle };
}

export default async function TransferredPage() {
  const d = await getDict();
  const s = d.stock.transferred;
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
          <h1 className="t-page-title">{s.title}</h1>
          <p className="t-page-sub">{d.common.today}: <strong>{tr(d.common.nPcs, { n: todayCount })}</strong> · {s.totalGiven} <strong>{totalQty} {d.stock.unit}</strong></p>
        </div>
        {/* Bo'sh holatda bir xil tugma ro'yxat o'rnida bor; mobilda "Ombor" tab bar'da */}
        {transfers.length > 0 && (
          <div className="t-page-actions ux-hide-mobile">
            <Link href="/app/products" className="btn btn-ghost btn-with-icon">
              <Icon name="box" size={16} />
              {s.goToStock}
            </Link>
          </div>
        )}
      </div>

      <section className="ux-strip sl-strip sl-tr-stats" aria-label={s.summaryLabel}>
        <Tilt className="sl-stat sl-stat--hero" max={5}>
          <span className="sl-stat-l"><Icon name="repeat" size={16} />{d.common.today}</span>
          <span className="sl-stat-v ux-z">{todayCount} <small>{d.common.pcs}</small></span>
        </Tilt>
        <div className="sl-stat">
          <span className="sl-stat-l"><span className="ux-clay ux-clay--green sl-clay" aria-hidden><Icon name="box" size={16} /></span>{s.units}</span>
          <span className="sl-stat-v">{totalQty}</span>
        </div>
        <div className="sl-stat">
          <span className="sl-stat-l"><span className="ux-clay ux-clay--gold sl-clay" aria-hidden><Icon name="store" size={16} /></span>{d.common.branches}</span>
          <span className="sl-stat-v">{branchCount}</span>
        </div>
      </section>

      <div className="sl-card sl-list-card">
        {transfers.length === 0 ? (
          <div className="ux-empty sl-empty">
            <div className="ux-empty-ic"><Icon name="repeat" size={28} /></div>
            <b>{s.emptyTitle}</b>
            <p>{s.emptyHint}</p>
            <Link href="/app/products" className="btn btn-primary">{s.goToStock}</Link>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.day}>
              <h2 className="sl-day">{g.day === todayKey ? d.common.today : g.day} · {tr(d.common.nPcs, { n: g.items.length })}</h2>
              <ul className="sl-list">
                {g.items.map((t) => (
                  <li key={String(t._id)} className="sl-row sl-tr">
                    <span className="sl-av" aria-hidden><Icon name="box" size={18} /></span>
                    <div className="sl-row-main">
                      <Link href={`/app/products/${t.productId}`} className="sl-row-title">{t.productSnapshot.name}</Link>
                      {/* Asosiy 2-qator: yo'nalish · vaqt. Raqam, IMEI, xodim — faqat keng ekranda */}
                      <div className="sl-row-meta">
                        <span className="sl-tr-route">
                          <span>{t.fromBranchName ?? '—'}</span>
                          <Icon name="arrowRight" size={14} />
                          <b>{t.toBranchName}</b>
                        </span>
                        <span>{fmtDateTime(t.createdAt!).split(', ')[1]}</span>
                        <span className="sl-row-x">{t.transferNo}</span>
                        {t.productSnapshot.imei && <code className="sl-row-x">{t.productSnapshot.imei}</code>}
                        <span className="sl-row-x">{t.transferredBy}</span>
                      </div>
                    </div>
                    <div className="sl-tr-qty">
                      <strong>{t.quantity}</strong>
                      <span>{d.stock.unit}</span>
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
