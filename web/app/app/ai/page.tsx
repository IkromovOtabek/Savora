import { Suspense } from 'react';
import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { getOrCreateTodayReport, toReportView, usedToday, fallbackReasonLabel } from '@/lib/ai/report';
import { AI_DAILY_LIMIT, AI_HEALTH_LABELS, AI_ROLE_LABELS, type AiHealth, type AiPriority, type AiSnapshot } from '@/lib/ai/types';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import Tilt from '@/components/ui/Tilt';
import { AiRerunButton, AiTaskButton } from '@/components/tenant/TaskUi';
import '@/components/tenant/styles/ai.css';

export const metadata = { title: 'AI yordamchi — Savora' };
// Tahlil 30 soniyagacha davom etishi mumkin
export const maxDuration = 60;

const PRIORITY_TONE: Record<AiPriority, string> = { yuqori: 'bad', 'o\'rta': 'warn', past: 'mut' };
const PRIORITY_LABEL: Record<AiPriority, string> = { yuqori: 'Yuqori', 'o\'rta': 'O\'rta', past: 'Past' };
const HEALTH_TONE: Record<AiHealth, string> = { yaxshi: 'ok', 'o\'rta': 'warn', xavfli: 'bad' };

export default function AiPage() {
  return (
    <div className="ai-page">
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">AI yordamchi</h1>
          <p className="t-page-sub">Oxirgi 30 kun bo&apos;yicha tahlil, tavsiyalar va topshiriqlar</p>
        </div>
      </div>
      <Suspense fallback={<AiSkeleton />}>
        <AiReportSection />
      </Suspense>
    </div>
  );
}

async function AiReportSection() {
  const models = await getTenantSession();
  const { user, org, features } = models;
  const perms = await loadUserPermissions(user);
  const { report, limited } = await getOrCreateTodayReport(models, user, { businessType: org.businessType });
  const used = await usedToday(models.conn);

  if (!report) {
    return (
      <div className="t-card ux-empty">
        <span className="ux-empty-ic" aria-hidden="true"><Icon name="sparkles" size={26} /></span>
        <b>Tahlil hozircha mavjud emas</b>
        <p>{limited ? `Bugungi tahlil limiti tugadi (${AI_DAILY_LIMIT} ta). Ertaga qayta urinib ko'ring.` : 'Keyinroq qayta urinib ko\'ring.'}</p>
      </div>
    );
  }

  const view = toReportView(report);
  const snap = report.snapshot as AiSnapshot;
  const r = view.result;
  const canAddTasks = features.tasks && perms.has('tasks.manage');
  const isAi = view.source === 'ai';
  const note = isAi ? null : fallbackReasonLabel(view.fallbackReason);
  const wow = snap?.week?.changePct ?? null;

  return (
    <>
      <div className="ai-top">
        <Tilt stack className={`ai-hero ai-hero--${HEALTH_TONE[r.health]}`} as="section" max={4}>
          <div className="ai-hero-row">
            <span className="ai-hero-ic" aria-hidden="true"><Icon name="sparkles" size={18} /></span>
            <span className="ai-hero-l">Biznes holati</span>
            <span className={`ai-badge ai-badge--${isAi ? 'ai' : 'rules'}`}>{isAi ? 'AI' : 'Qoidalar asosida'}</span>
          </div>
          <div className="ai-hero-health ux-z">
            <span className={`ai-dot ai-dot--${HEALTH_TONE[r.health]}`} aria-hidden="true" />
            {AI_HEALTH_LABELS[r.health]}
          </div>
          <p className="ai-hero-sum">{r.summary}</p>
          <div className="ai-hero-foot">
            <span className="ai-hero-meta">Yangilandi: {fmtDateTime(view.createdAt)} · bugun {used}/{AI_DAILY_LIMIT}</span>
            <AiRerunButton disabled={used >= AI_DAILY_LIMIT} />
          </div>
          {note && <p className="ai-hero-note">{note}</p>}
          {limited && <p className="ai-hero-note">Bugungi limit tugadi — oxirgi tahlil ko&apos;rsatilmoqda.</p>}
        </Tilt>

        {snap?.revenue && (
          <div className="ai-kpis ux-strip">
            <Kpi icon="cart" label="30 kunlik savdo" value={fmtMoney(snap.revenue.total)} unit="so'm" sub={`${snap.revenue.salesCount} ta sotuv`} />
            <Kpi icon="wallet" tone="green" label="O'rtacha chek" value={fmtMoney(snap.revenue.avgCheck)} unit="so'm" sub="bitta sotuv" />
            <Kpi
              icon="chart"
              tone={wow !== null && wow < 0 ? 'red' : 'gold'}
              label="Hafta"
              value={wow === null ? '—' : `${wow > 0 ? '+' : ''}${wow}`}
              unit={wow === null ? '' : '%'}
              sub="oldingi haftaga nisbatan"
            />
            <Kpi
              icon="clock"
              tone={snap.nasiya.overdue.share > 0.15 ? 'red' : 'gray'}
              label="Muddati o'tgan"
              value={String(Math.round(snap.nasiya.overdue.share * 100))}
              unit="%"
              sub={`${fmtMoney(snap.nasiya.overdue.amount)} so'm`}
            />
          </div>
        )}
      </div>

      {r.insights.length > 0 && (
        <section aria-labelledby="ai-ins-h">
          <div className="t-group-head"><h2 id="ai-ins-h">Kuzatuvlar</h2></div>
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
          <div className="t-group-head"><h2 id="ai-rec-h">Tavsiyalar</h2></div>
          {r.recommendations.length === 0 ? (
            <div className="t-card ux-empty"><b>Hozircha tavsiya yo&apos;q</b><p>Ko&apos;rsatkichlar me&apos;yorda.</p></div>
          ) : (
            <ol className="ai-recs t-card">
              {r.recommendations.map((rec, i) => (
                <li key={i} className="ai-rec">
                  <div className="ai-rec-h">
                    <b>{rec.title}</b>
                    <span className={`ai-pill ai-pill--${PRIORITY_TONE[rec.priority]}`}>{PRIORITY_LABEL[rec.priority]}</span>
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
            <h2 id="ai-task-h">Taklif etilgan topshiriqlar</h2>
            {features.tasks && <Link href="/app/tasks" className="t-link">Topshiriqlar</Link>}
          </div>
          {r.tasks.length === 0 ? (
            <div className="t-card ux-empty"><b>Topshiriq taklif qilinmadi</b></div>
          ) : (
            <ul className="ai-tasks t-card">
              {r.tasks.map((t, i) => {
                const added = view.addedTasks[String(i)];
                return (
                  <li key={i} className="ai-task">
                    <div className="ai-task-main">
                      <b>{t.title}</b>
                      {t.detail && <p>{t.detail}</p>}
                      <small>{AI_ROLE_LABELS[t.role]} · {t.dueInDays === 0 ? 'bugun' : `${t.dueInDays} kun ichida`}</small>
                    </div>
                    {canAddTasks && (added ? (
                      <Link href="/app/tasks" className="btn btn-ghost btn-sm btn-with-icon"><Icon name="check" size={14} /> Qo&apos;shilgan</Link>
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
        <Icon name="lock" size={14} /> Tahlil uchun faqat umumiy ko&apos;rsatkichlar (summa, son, mahsulot va filial nomlari) ishlatiladi —
        mijoz ismi, telefoni va IMEI tashqariga yuborilmaydi.
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

function AiSkeleton() {
  return (
    <div className="ai-skel" role="status" aria-live="polite">
      <div className="ai-skel-hero t-skel-block" />
      <p className="ai-skel-t"><Icon name="sparkles" size={16} className="ai-spin" /> Ko&apos;rsatkichlar tahlil qilinmoqda… (30 soniyagacha)</p>
      <div className="ai-skel-row">
        <div className="t-skel-block" /><div className="t-skel-block" /><div className="t-skel-block" />
      </div>
    </div>
  );
}
