import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { isOrganizationActive, isTrialActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { resolveOrgPlan, parsePlanTier } from '@/lib/plans';
import { getOrgDisplayStatus } from '@/lib/organizations';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import Icon, { type IconName } from '@/components/icons/Icon';
import { Avatar, Chevron, HeroStat, Kpi, OrgStatusPill, PageTitle, Pill, Sq } from '@/components/super/ui';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.superPanel.dashboard.metaTitle };
}

function fmtSum(n: number) {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n));
}
function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function SuperDashboardHome() {
  await requireSuperAdmin();
  const d = await getDict();
  const s = d.superPanel;
  const t = s.dashboard;
  const { Organization, PaymentRequest, SiteVisit } = await getMasterModels();

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000); weekAgo.setHours(0, 0, 0, 0);
  const onlineCutoff = new Date(Date.now() - 5 * 60 * 1000);

  const [orgs, pendingPayments, todayVisits, weekVisits, onlineCount, recentVisitsSignup] = await Promise.all([
    Organization.find().sort({ createdAt: -1 }).lean(),
    PaymentRequest.countDocuments({ status: 'pending' }),
    SiteVisit.countDocuments({ startedAt: { $gte: todayStart } }),
    SiteVisit.find({ startedAt: { $gte: weekAgo } }).select('startedAt signedUp').lean(),
    SiteVisit.countDocuments({ lastSeenAt: { $gte: onlineCutoff } }),
    SiteVisit.countDocuments({ signedUp: true, signedUpAt: { $gte: monthStart } }),
  ]);

  // --- Biznes statistikasi ---
  const total = orgs.length;
  const active = orgs.filter((o) => isOrganizationActive(o));
  const trialCount = orgs.filter((o) => isTrialActive(o)).length;
  const expiredCount = orgs.filter((o) => o.status === 'expired' || !isOrganizationActive(o)).length;
  const mrr = active.filter((o) => !o.plan?.isTrial && o.plan?.tier !== 'free')
    .reduce((sum, o) => sum + (resolveOrgPlan(o).monthlyPayment || 0), 0);
  const newThisMonth = orgs.filter((o) => o.createdAt && new Date(o.createdAt) >= monthStart).length;
  const expiringSoon = active
    .map((o) => ({ org: o, days: daysUntilExpiry(o) }))
    .filter((x) => x.days >= 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days);

  // Tariflar bo'yicha taqsimot
  const byTier: Record<string, number> = {};
  for (const o of orgs) byTier[o.plan?.tier ?? 'free'] = (byTier[o.plan?.tier ?? 'free'] ?? 0) + 1;
  const tierLabel = (tier?: string) => d.catalog.planTiers[parsePlanTier(tier ?? 'free')];

  // --- 7 kunlik tashrif grafigi ---
  const days: { key: string; label: string; visits: number; signups: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days.push({ key: dayKey(dt), label: `${dt.getDate()}/${dt.getMonth() + 1}`, visits: 0, signups: 0 });
  }
  const dayMap = new Map(days.map((x) => [x.key, x]));
  for (const v of weekVisits) {
    const k = dayKey(new Date(v.startedAt));
    const row = dayMap.get(k);
    if (row) { row.visits++; if (v.signedUp) row.signups++; }
  }
  const maxVisits = Math.max(1, ...days.map((x) => x.visits));

  return (
    <>
      <PageTitle title={t.title} sub={t.sub} />

      {/* Asosiy ob'ekt — MRR + darhol e'tibor talab qiladigan holatlar */}
      <div className="sa-hero-row">
        <HeroStat
          label={s.mrr}
          value={fmtSum(mrr)}
          unit={d.common.sum}
          icon="wallet"
          sub={s.mrrSub}
          items={[
            { label: s.activeStores, value: active.length },
            { label: d.common.total, value: total },
            { label: t.onlineNow, value: onlineCount },
          ]}
        />
        <section className="sa-card sa-attn" aria-labelledby="sa-attn-h">
          <div className="sa-card-h"><h2 id="sa-attn-h">{t.attention}</h2></div>
          <div className="sa-attn-list">
            <AttnRow href="/super/payments" icon="clipboard" tone="a" label={t.pendingPayments} hint={pendingPayments > 0 ? t.pendingHintSome : t.pendingHintNone} n={pendingPayments} bad={pendingPayments > 0} />
            <AttnRow href={expiringSoon.length > 0 ? '#sa-expiring' : '/super'} icon="bell" tone="r" label={s.orgs.expires7} hint={t.expires7Hint} n={expiringSoon.length} bad={expiringSoon.length > 0} />
            <AttnRow href="/super?f=expired" icon="alert" tone="r" label={s.orgs.expired} hint={t.expiredHint} n={expiredCount} bad={expiredCount > 0} />
            <AttnRow href="/super?f=trial" icon="clock" tone="b" label={t.inTrial} hint={t.inTrialHint} n={trialCount} />
          </div>
        </section>
      </div>

      {/* Ikkilamchi ko'rsatkichlar — telefonda bitta gorizontal lenta */}
      <div className="ux-strip sa-strip-3">
        <Kpi label={t.newThisMonth} value={`+${newThisMonth}`} icon="building" tone="b" deltaTone={newThisMonth > 0 ? 'ok' : undefined} delta={tr(t.fromSite, { n: recentVisitsSignup })} />
        <Kpi label={t.todayVisits} value={todayVisits} icon="globe" tone="c" delta={t.siteVisitors} />
        <Kpi label={t.monthlySignups} value={recentVisitsSignup} icon="signup" tone="v" delta={t.selfSignup} />
      </div>

      <div className="sa-two">
        {/* Tashrif grafigi (7 kun) */}
        <section className="sa-card">
          <div className="sa-card-h">
            <h2>{t.visits7}</h2>
            <Link href="/super/visitors">{d.common.details}</Link>
          </div>
          {weekVisits.length === 0 ? (
            <div className="ux-empty">
              <span className="ux-empty-ic"><Icon name="chart" size={24} /></span>
              <b>{t.noVisitsTitle}</b>
              <p>{t.noVisitsText}</p>
            </div>
          ) : (
          <div className="sa-bars" role="img" aria-label={t.chartAria}>
            {days.map((x) => (
              <div key={x.key} className="sa-bar" title={tr(t.barTitle, { d: x.label, v: x.visits, s: x.signups })}>
                <span className="sa-bar-v">{x.visits}</span>
                <div className="sa-bar-track">
                  <div className="sa-bar-fill" style={{ height: `${Math.round((x.visits / maxVisits) * 100)}%` }} />
                </div>
                <span className="sa-bar-l">{x.label}</span>
              </div>
            ))}
          </div>
          )}
        </section>

        {/* Tariflar taqsimoti */}
        <section className="sa-card">
          <div className="sa-card-h"><h2>{t.byPlan}</h2></div>
          <div className="sa-dist">
            {(['free', 'starter', 'pro', 'business', 'custom'] as const).map((tier) => {
              const c = byTier[tier] ?? 0;
              const pct = total ? Math.round((c / total) * 100) : 0;
              if (c === 0) return null;
              return (
                <div key={tier} className="sa-dist-row">
                  <div><span>{d.catalog.planTiers[tier]}</span><span>{c} · {pct}%</span></div>
                  <div className="sa-prog"><i style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
            {total === 0 && <p className="sa-empty" style={{ padding: 8 }}>{d.common.noData}</p>}
          </div>
        </section>
      </div>

      <div className="sa-two">
        {/* So'nggi bizneslar */}
        <section className="sa-section">
          <div className="sa-ghead">{t.recentStores} <Link href="/super">{t.allStores}</Link></div>
          <div className="sa-group">
            {orgs.length === 0 && <div className="sa-empty">{t.noStores}</div>}
            {orgs.slice(0, 6).map((org) => {
              const st = getOrgDisplayStatus(org);
              return (
                <Link key={String(org._id)} href={`/super/organizations/${org._id}`} className="sa-cell sa-cell--av">
                  <Avatar name={org.name} />
                  <span className="sa-cell-t">
                    <b>{org.name}</b>
                    <small>
                      {tierLabel(org.plan?.tier)}
                      {' · '}
                      {org.createdAt ? new Date(org.createdAt).toLocaleDateString('uz-UZ') : '—'}
                    </small>
                  </span>
                  <OrgStatusPill status={{ key: st.key, label: s.status[st.key] }} />
                  <Chevron />
                </Link>
              );
            })}
          </div>
        </section>

        <div className="sa-stack">
          {/* Tez orada tugaydi */}
          {expiringSoon.length > 0 && (
            <section className="sa-section" id="sa-expiring">
              <div className="sa-ghead">{s.expiringSoon7}</div>
              <div className="sa-group">
                {expiringSoon.slice(0, 8).map(({ org, days: n }) => (
                  <Link key={String(org._id)} href={`/super/organizations/${org._id}`} className="sa-cell">
                    <span className="sa-cell-t">
                      <b>{org.name}</b>
                      <small>{org.slug} · {tierLabel(org.plan?.tier)}</small>
                    </span>
                    <Pill tone={n <= 2 ? 'bad' : 'warn'}>{n === 0 ? d.common.today : tr(d.common.nDays, { n })}</Pill>
                    <Chevron />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Tezkor amallar */}
          <section className="sa-section">
            <div className="sa-ghead">{t.quickActions}</div>
            <div className="sa-group">
              <Link href="/super/organizations/new" className="sa-cell sa-cell--ic">
                <Sq icon="plus" tone="b" />
                <span className="sa-cell-t"><b>{s.shell.newStore}</b></span>
                <Chevron />
              </Link>
              <Link href="/super/payments" className="sa-cell sa-cell--ic">
                <Sq icon="wallet" tone="a" />
                <span className="sa-cell-t"><b>{s.nav['/super/payments']}</b></span>
                {pendingPayments > 0 && <span className="sa-cell-v">{pendingPayments}</span>}
                <Chevron />
              </Link>
              <Link href="/super/visitors" className="sa-cell sa-cell--ic">
                <Sq icon="chart" tone="c" />
                <span className="sa-cell-t"><b>{s.nav['/super/visitors']}</b></span>
                <Chevron />
              </Link>
              <Link href="/super/plans" className="sa-cell sa-cell--ic">
                <Sq icon="plans" tone="v" />
                <span className="sa-cell-t"><b>{s.nav['/super/plans']}</b></span>
                <Chevron />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/** «Diqqat talab qiladi» qatori: ikonka, nom, izoh va son (noldan katta bo'lsa ajralib turadi) */
function AttnRow({ href, icon, tone, label, hint, n, bad }: {
  href: string; icon: IconName; tone: 'a' | 'b' | 'r' | 'c' | 'v'; label: string; hint: string; n: number; bad?: boolean;
}) {
  return (
    <Link href={href} className={`sa-attn-row${bad ? ' is-bad' : ''}`}>
      <Sq icon={icon} tone={tone} />
      <span className="sa-cell-t"><b>{label}</b><small>{hint}</small></span>
      <span className="sa-attn-n">{n}</span>
      <Chevron />
    </Link>
  );
}
