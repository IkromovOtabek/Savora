import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { fmtMoney, fmtDate } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

/* Bosh sahifa — rolga qarab ko'rsatiladigan panellar (server komponentlar, faqat ko'rsatish). */

type Row = { key: string; label: string; value: number; sub?: string; href?: string };

/** Gorizontal ulushli ro'yxat: har qatorda nom, qiymat va eng kattasiga nisbatan chiziq */
function BarList({ rows, unit }: { rows: Row[]; unit?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="t-bars">
      {rows.map((r) => {
        const body = (
          <>
            <span className="t-bars-top">
              <span className="t-bars-l">{r.label}</span>
              <span className="t-bars-v t-num">{fmtMoney(r.value)}{unit && <small> {unit}</small>}</span>
            </span>
            <span className="t-bars-track" aria-hidden="true">
              <span className="t-bars-fill" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
            </span>
            {r.sub && <span className="t-bars-sub">{r.sub}</span>}
          </>
        );
        return <li key={r.key}>{r.href ? <Link href={r.href} className="t-bars-row">{body}</Link> : <div className="t-bars-row">{body}</div>}</li>;
      })}
    </ul>
  );
}

function Panel({ id, title, meta, href, linkLabel, children }: {
  id: string; title: string; meta?: string; href?: string; linkLabel: string; children: React.ReactNode;
}) {
  return (
    <section className="t-card t-panel" aria-labelledby={id}>
      <div className="t-card-head">
        <h2 id={id}>{title}</h2>
        {meta && <span className="t-card-meta">{meta}</span>}
        {href && <Link href={href} className="t-link t-panel-link">{linkLabel}</Link>}
      </div>
      {children}
    </section>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return <p className="t-panel-empty">{text}</p>;
}

export async function BranchPanel({ rows }: { rows: { id: string; name: string; today: number; week: number; count: number }[] }) {
  const d = await getDict();
  const t = d.shell.panels;
  return (
    <Panel id="t-p-branch" title={t.branchTitle} meta={t.branchMeta} linkLabel={d.shell.dash.all}>
      {rows.length === 0 ? <PanelEmpty text={t.branchEmpty} /> : (
        <BarList unit={d.common.sum} rows={rows.map((r) => ({ key: r.id, label: r.name, value: r.week, sub: tr(t.branchSub, { today: fmtMoney(r.today), n: r.count }) }))} />
      )}
    </Panel>
  );
}

export async function TopProductsPanel({ rows }: { rows: { name: string; qty: number; revenue: number }[] }) {
  const d = await getDict();
  const t = d.shell.panels;
  return (
    <Panel id="t-p-top" title={t.topTitle} meta={t.topMeta} href="/app/monitoring" linkLabel={d.catalog.features.monitoring.label}>
      {rows.length === 0 ? <PanelEmpty text={t.topEmpty} /> : (
        <BarList unit={d.common.sum} rows={rows.map((r) => ({ key: r.name, label: r.name, value: r.revenue, sub: tr(t.nUnits, { n: r.qty }) }))} />
      )}
    </Panel>
  );
}

export async function StaffPanel({ rows }: { rows: { name: string; count: number; total: number }[] }) {
  const d = await getDict();
  const t = d.shell.panels;
  return (
    <Panel id="t-p-staff" title={t.staffTitle} href="/app/audit" linkLabel={d.catalog.features.audit.label}>
      {rows.length === 0 ? <PanelEmpty text={t.staffEmpty} /> : (
        <ul className="t-people">
          {rows.map((r, i) => (
            <li key={r.name} className="t-people-row">
              <span className={`t-avatar${i === 0 ? ' t-avatar--lead' : ''}`} aria-hidden="true">{r.name.slice(0, 1).toUpperCase()}</span>
              <span className="t-people-t"><b>{r.name}</b><small>{tr(d.shell.dash.nSales, { n: r.count })}</small></span>
              <span className="t-people-v t-num">{fmtMoney(r.total)}<small> {d.common.sum}</small></span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export async function LowStockPanel({ rows }: { rows: { id: string; name: string; left: number }[] }) {
  const d = await getDict();
  const t = d.shell.panels;
  return (
    <Panel id="t-p-low" title={t.lowTitle} href="/app/products" linkLabel={d.catalog.features.products.label}>
      {rows.length === 0 ? <PanelEmpty text={t.lowEmpty} /> : (
        <ul className="t-low">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/app/products/${r.id}`} className="t-low-row">
                <Icon name="box" size={16} className="t-low-ic" />
                <span className="t-low-n">{r.name}</span>
                <span className={`t-pill ${r.left <= 0 ? 't-pill--bad' : 't-pill--warn'}`}>{r.left <= 0 ? t.outOfStock : tr(t.nLeft, { n: r.left })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const PRIORITY_TONE: Record<string, string> = { yuqori: 't-pill--bad', "o'rta": 't-pill--warn', past: 't-pill--ok' };

export async function MyTasksPanel({ rows }: { rows: { id: string; title: string; priority: string; dueDate?: Date; overdue: boolean }[] }) {
  const d = await getDict();
  const t = d.shell.panels;
  return (
    <Panel id="t-p-tasks" title={t.tasksTitle} href="/app/tasks" linkLabel={d.shell.dash.all}>
      {rows.length === 0 ? <PanelEmpty text={t.tasksEmpty} /> : (
        <ul className="t-low">
          {rows.map((t) => (
            <li key={t.id}>
              <Link href="/app/tasks" className="t-low-row">
                <Icon name={t.overdue ? 'alert' : 'check'} size={16} className={`t-low-ic${t.overdue ? ' is-bad' : ''}`} />
                <span className="t-low-n">
                  {t.title}
                  {t.dueDate && <small className={t.overdue ? 'is-bad' : undefined}>{t.overdue ? t.overdueAt : t.dueAt}{fmtDate(t.dueDate)}</small>}
                </span>
                <span className={`t-pill ${PRIORITY_TONE[t.priority] ?? ''}`}>{d.shell.taskPriorities[t.priority] ?? t.priority}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
