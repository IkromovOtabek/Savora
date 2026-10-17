import { Suspense } from 'react';
import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { getOrCreateTodayReport, toReportView, usedToday } from '@/lib/ai/report';
import { AI_DAILY_LIMIT, type AiHealth, type AiPriority, type AiSnapshot } from '@/lib/ai/types';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { getDict, type Dict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import { AiRerunButton, AiTaskButton } from '@/components/tenant/TaskUi';
import '@/components/tenant/styles/ai.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.crm.ai.metaTitle };
}
// Tahlil 30 soniyagacha davom etishi mumkin
export const maxDuration = 60;

const PRIORITY_TONE: Record<AiPriority, string> = { yuqori: 'bad', 'o\'rta': 'warn', past: 'mut' };
const HEALTH_TONE: Record<AiHealth, string> = { yaxshi: 'ok', 'o\'rta': 'warn', xavfli: 'bad' };

/** Qoidalar/AI sababi → lug'atdagi izoh (noma'lum sabab — umumiy) */
function fallbackNote(d: Dict, reason?: string): string | null {
  if (!reason) return null;
  const f = d.crm.ai.fallback;
  return reason in f ? f[reason as keyof typeof f] : f.other;
}

export default async function AiPage() {
  const d = await getDict();
  return (
    <div className="ai-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{d.crm.ai.title}</h1>
          <p className="t-page-sub">{d.crm.ai.sub}</p>
        </div>
      </div>
      <Suspense fallback={<AiSkeleton text={d.crm.ai.analyzing} />}>
        <AiReportSection />
      </Suspense>
    </div>
  );
}

async function AiReportSection() {
  const models = await getTenantSession();
  const { user, org, features } = models;
  const d = await getDict();
  const A = d.crm.ai;
  const perms = await loadUserPermissions(user);
  const { report, limited } = await getOrCreateTodayReport(models, user, { businessType: org.businessType });
  const used = await usedToday(models.conn);

  if (!report) {
    return (
      <div className="t-card ux-empty">
        <span className="ux-empty-ic" aria-hidden="true"><Icon name="sparkles" size={26} /></span>
        <b>{A.unavailableTitle}</b>
        <p>{limited ? tr(A.limitReached, { n: AI_DAILY_LIMIT }) : A.tryLater}</p>
      </div>
    );
  }

  const view = toReportView(report);
  const snap = report.snapshot as AiSnapshot;
  const r = view.result;
  const canAddTasks = features.tasks && perms.has('tasks.manage');
  const isAi = view.source === 'ai';
  const note = isAi ? null : fallbackNote(d, view.fallbackReason);
  const wow = snap?.week?.changePct ?? null;

  return (
    <>
      <div className="ai-top">
        <Tilt stack className={`ai-hero ai-hero--${HEALTH_TONE[r.health]}`} as="section" max={4}>
          <div className="ai-hero-row">
            <span className="ai-hero-ic" aria-hidden="true"><Icon name="sparkles" size={18} /></span>
            <span className="ai-hero-l">{A.businessState}</span>
            <span className={`ai-badge ai-badge--${isAi ? 'ai' : 'rules'}`}>{isAi ? 'AI' : A.rulesBased}</span>
          </div>
          <div className="ai-hero-health ux-z">
            <span className={`ai-dot ai-dot--${HEALTH_TONE[r.health]}`} aria-hidden="true" />
            {A.health[r.health]}
          </div>
          <p className="ai-hero-sum">{r.summary}</p>
          <div className="ai-hero-foot">
            <span className="ai-hero-meta">{tr(A.updatedAt, { date: fmtDateTime(view.createdAt), used, limit: AI_DAILY_LIMIT })}</span>
            <AiRerunButton disabled={used >= AI_DAILY_LIMIT} />
          </div>
          {note && <p className="ai-hero-note">{note}</p>}
          {limited && <p className="ai-hero-note">{A.limitNote}</p>}
        </Tilt>

        {snap?.revenue && (
          <div className="ai-kpis ux-strip">
            <Kpi icon="cart" label={A.kpiSales} value={fmtMoney(snap.revenue.total)} unit={d.common.sum} sub={tr(A.kpiSalesSub, { n: snap.revenue.salesCount })} />
            <Kpi icon="wallet" tone="green" label={A.kpiAvgCheck} value={fmtMoney(snap.revenue.avgCheck)} unit={d.common.sum} sub={A.kpiAvgCheckSub} />
            <Kpi
              icon="chart"
              tone={wow !== null && wow < 0 ? 'red' : 'gold'}
              label={A.kpiWeek}
              value={wow === null ? '—' : `${wow > 0 ? '+' : ''}${wow}`}
              unit={wow === null ? '' : '%'}
              sub={A.kpiWeekSub}
            />
            <Kpi
              icon="clock"
              tone={snap.nasiya.overdue.share > 0.15 ? 'red' : 'gray'}
              label={A.kpiOverdue}
              value={String(Math.round(snap.nasiya.overdue.share * 100))}
              unit="%"
              sub={`${fmtMoney(snap.nasiya.overdue.amount)} ${d.common.sum}`}
            />
          </div>
        )}
      </div>

      {r.insights.length > 0 && (
        <section aria-labelledby="ai-ins-h">
          <div className="t-group-head"><h2 id="ai-ins-h">{A.insights}</h2></div>
          <div className="ai-insights">
            {r.insights.map((it, i) => (
              <article key={i} className="ai-insight t-card">
                <span className="ai-insight-t">{it.title}</span>
                {it.metric && <span className="ai-insight-m t-num">{it.metric}</span>}
                <p>{it.detail}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="ai-cols">
        <section aria-labelledby="ai-rec-h">
          <div className="t-group-head"><h2 id="ai-rec-h">{A.recommendations}</h2></div>
          {r.recommendations.length === 0 ? (
            <div className="t-card ux-empty"><b>{A.noRecTitle}</b><p>{A.noRecText}</p></div>
          ) : (
            <ol className="ai-recs t-card">
              {r.recommendations.map((rec, i) => (
                <li key={i} className="ai-rec">
                  <div className="ai-rec-h">
                    <b>{rec.title}</b>
                    <span className={`ai-pill ai-pill--${PRIORITY_TONE[rec.priority]}`}>{d.crm.tasks.priority[rec.priority]}</span>
                  </div>
                  <p>{rec.detail}</p>
                  {rec.impact && <small className="ai-rec-impact"><Icon name="chart" size={13} /> {rec.impact}</small>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="ai-task-h">
          <div className="t-group-head">
            <h2 id="ai-task-h">{A.suggestedTasks}</h2>
            {features.tasks && <Link href="/app/tasks" className="t-link">{d.crm.tasks.title}</Link>}
          </div>
          {r.tasks.length === 0 ? (
            <div className="t-card ux-empty"><b>{A.noTasks}</b></div>
          ) : (
            <ul className="ai-tasks t-card">
              {r.tasks.map((t, i) => {
                const added = view.addedTasks[String(i)];
                return (
                  <li key={i} className="ai-task">
                    <div className="ai-task-main">
                      <b>{t.title}</b>
                      {t.detail && <p>{t.detail}</p>}
                      <small>{d.crm.tasks.roles[t.role]} · {t.dueInDays === 0 ? A.dueToday : tr(A.dueInDays, { n: t.dueInDays })}</small>
                    </div>
                    {canAddTasks && (added ? (
                      <Link href="/app/tasks" className="btn btn-ghost btn-sm btn-with-icon"><Icon name="check" size={14} /> {A.added}</Link>
                    ) : (
                      <AiTaskButton reportId={view.id} index={i} />
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <p className="ai-privacy">
        <Icon name="lock" size={14} /> {A.privacy}
      </p>
    </>
  );
}

function Kpi({ icon, label, value, unit, sub, tone }: {
  icon: 'cart' | 'wallet' | 'chart' | 'clock';
  label: string; value: string; unit: string; sub: string; tone?: 'gold' | 'green' | 'red' | 'gray';
}) {
  return (
    <div className="ux-stat ai-kpi">
      <span className={`ux-clay${tone ? ` ux-clay--${tone}` : ''}`} aria-hidden="true"><Icon name={icon} size={20} /></span>
      <span className="ai-kpi-t">
        <span className="ux-stat-l">{label}</span>
        <span className="ux-stat-v">{value}{unit && <small>{unit}</small>}</span>
        <span className="ux-stat-s">{sub}</span>
      </span>
    </div>
  );
}

function AiSkeleton({ text }: { text: string }) {
  return (
    <div className="ai-skel" role="status" aria-live="polite">
      <div className="ai-skel-hero t-skel-block" />
      <p className="ai-skel-t"><Icon name="sparkles" size={16} className="ai-spin" /> {text}</p>
      <div className="ai-skel-row">
        <div className="t-skel-block" /><div className="t-skel-block" /><div className="t-skel-block" />
      </div>
    </div>
  );
}
