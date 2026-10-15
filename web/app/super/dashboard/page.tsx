import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { isOrganizationActive, isTrialActive, daysUntilExpiry } from '@/lib/models/master/Organization';
import { resolveOrgPlan, PLAN_PRESETS } from '@/lib/plans';
import { getOrgDisplayStatus } from '@/lib/organizations';
import Icon from '@/components/icons/Icon';
import { Avatar, Chevron, HeroStat, Kpi, OrgStatusPill, PageTitle, Pill, Sq } from '@/components/super/ui';

export const metadata = { title: 'Asosiy panel — Super Admin' };

function fmtSum(n: number) {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n));
}
function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function SuperDashboardHome() {
  await requireSuperAdmin();
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
    .reduce((s, o) => s + (resolveOrgPlan(o).monthlyPayment || 0), 0);
  const newThisMonth = orgs.filter((o) => o.createdAt && new Date(o.createdAt) >= monthStart).length;
  const expiringSoon = active
    .map((o) => ({ org: o, days: daysUntilExpiry(o) }))
    .filter((x) => x.days >= 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days);

  // Tariflar bo'yicha taqsimot
  const byTier: Record<string, number> = {};
  for (const o of orgs) byTier[o.plan?.tier ?? 'free'] = (byTier[o.plan?.tier ?? 'free'] ?? 0) + 1;

  // --- 7 kunlik tashrif grafigi ---
  const days: { key: string; label: string; visits: number; signups: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days.push({ key: dayKey(d), label: `${d.getDate()}/${d.getMonth() + 1}`, visits: 0, signups: 0 });
  }
  const dayMap = new Map(days.map((d) => [d.key, d]));
  for (const v of weekVisits) {
    const k = dayKey(new Date(v.startedAt));
    const row = dayMap.get(k);
    if (row) { row.visits++; if (v.signedUp) row.signups++; }
  }
  const maxVisits = Math.max(1, ...days.map((d) => d.visits));

  return (
    <>
      <PageTitle title="Asosiy panel" sub="Platformaning bugungi holati" />

      {/* Asosiy ob'ekt — MRR (3D) + eng muhim 3 ko'rsatkich */}
      <div className="sa-hero-row">
        <HeroStat
          label="MRR"
          value={fmtSum(mrr)}
          unit="so'm"
          icon="wallet"
          sub="Oylik takroriy daromad"
          items={[
            { label: 'Faol do\'konlar', value: active.length },
            { label: 'Jami', value: total },
            { label: 'Hozir onlayn', value: onlineCount },
          ]}
        />
        <div className="ux-strip sa-strip-3">
          <Kpi label="Yangi (shu oy)" value={`+${newThisMonth}`} icon="building" tone="b" deltaTone={newThisMonth > 0 ? 'ok' : undefined} delta={`${recentVisitsSignup} ta saytdan ro'yxat`} />
          <Kpi
            label="Kutilayotgan to'lov"
            value={pendingPayments}
            icon="clipboard"
            tone="a"
            delta={pendingPayments > 0 ? <Link href="/super/payments" className="sa-link" style={{ color: 'var(--brand)' }}>Ko&apos;rib chiqish</Link> : 'Hammasi ko\'rilgan'}
          />
          <Kpi label="7 kunda tugaydi" value={expiringSoon.length} icon="bell" tone="r" deltaTone={expiringSoon.length > 0 ? 'warn' : undefined} delta={`Sinovda: ${trialCount}`} />
        </div>
      </div>

      {/* Ikkilamchi ko'rsatkichlar — telefonda bitta gorizontal lenta */}
      <div className="ux-strip sa-strip-3 sa-strip-mini">
        <div className="sa-card sa-mini"><span>Muddati tugagan</span><b>{expiredCount}</b></div>
        <div className="sa-card sa-mini"><span>Bugun tashrif</span><b>{todayVisits}</b></div>
        <div className="sa-card sa-mini"><span>Oylik ro&apos;yxatdan</span><b>{recentVisitsSignup}</b></div>
      </div>

      <div className="sa-two">
        {/* Tashrif grafigi (7 kun) */}
        <section className="sa-card">
          <div className="sa-card-h">
            <h2>Tashriflar · 7 kun</h2>
            <Link href="/super/visitors">Batafsil</Link>
          </div>
          {weekVisits.length === 0 ? (
            <div className="ux-empty">
              <span className="ux-empty-ic"><Icon name="chart" size={24} /></span>
              <b>Tashrif hali yo&apos;q</b>
              <p>Saytga kirganlar shu yerda kunlar bo&apos;yicha ko&apos;rinadi.</p>
            </div>
          ) : (
          <div className="sa-bars sa-bars--3d" role="img" aria-label="Oxirgi 7 kunlik tashriflar grafigi">
            {days.map((d) => (
              <div key={d.key} className="sa-bar" title={`${d.label}: ${d.visits} tashrif, ${d.signups} ro'yxat`}>
                <span className="sa-bar-v">{d.visits}</span>
                <div className="sa-bar-track">
                  <div className="sa-bar-fill" style={{ height: `${Math.round((d.visits / maxVisits) * 100)}%` }} />
                </div>
                <span className="sa-bar-l">{d.label}</span>
              </div>
            ))}
          </div>
          )}
        </section>

        {/* Tariflar taqsimoti */}
        <section className="sa-card">
          <div className="sa-card-h"><h2>Tariflar bo&apos;yicha</h2></div>
          <div className="sa-dist">
            {(['free', 'starter', 'pro', 'business', 'custom'] as const).map((t) => {
              const c = byTier[t] ?? 0;
              const pct = total ? Math.round((c / total) * 100) : 0;
              const label = PLAN_PRESETS[t]?.label ?? t;
              if (c === 0) return null;
              return (
                <div key={t} className="sa-dist-row">
                  <div><span>{label}</span><span>{c} · {pct}%</span></div>
                  <div className="sa-prog"><i style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
            {total === 0 && <p className="sa-empty" style={{ padding: 8 }}>Ma&apos;lumot yo&apos;q</p>}
          </div>
        </section>
      </div>

      <div className="sa-two">
        {/* So'nggi bizneslar */}
        <section className="sa-section">
          <div className="sa-ghead">So&apos;nggi do&apos;konlar <Link href="/super">Hammasi</Link></div>
          <div className="sa-group">
            {orgs.length === 0 && <div className="sa-empty">Hozircha do&apos;kon yo&apos;q.</div>}
            {orgs.slice(0, 6).map((org) => {
              const st = getOrgDisplayStatus(org);
              return (
                <Link key={String(org._id)} href={`/super/organizations/${org._id}`} className="sa-cell sa-cell--av">
                  <Avatar name={org.name} />
                  <span className="sa-cell-t">
                    <b>{org.name}</b>
                    <small>
                      {PLAN_PRESETS[org.plan?.tier as keyof typeof PLAN_PRESETS]?.label ?? org.plan?.tier}
                      {' · '}
                      {org.createdAt ? new Date(org.createdAt).toLocaleDateString('uz-UZ') : '—'}
                    </small>
                  </span>
                  <OrgStatusPill status={st} />
                  <Chevron />
                </Link>
              );
            })}
          </div>
        </section>

        <div className="sa-stack">
          {/* Tez orada tugaydi */}
          {expiringSoon.length > 0 && (
            <section className="sa-section">
              <div className="sa-ghead">Tez orada tugaydi · 7 kun</div>
              <div className="sa-group">
                {expiringSoon.slice(0, 8).map(({ org, days: d }) => (
                  <Link key={String(org._id)} href={`/super/organizations/${org._id}`} className="sa-cell">
                    <span className="sa-cell-t">
                      <b>{org.name}</b>
                      <small>{org.slug} · {PLAN_PRESETS[org.plan?.tier as keyof typeof PLAN_PRESETS]?.label ?? org.plan?.tier}</small>
                    </span>
                    <Pill tone={d <= 2 ? 'bad' : 'warn'}>{d === 0 ? 'Bugun' : `${d} kun`}</Pill>
                    <Chevron />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Tezkor amallar */}
          <section className="sa-section">
            <div className="sa-ghead">Tezkor amallar</div>
            <div className="sa-group">
              <Link href="/super/organizations/new" className="sa-cell sa-cell--ic">
                <Sq icon="plus" tone="b" />
                <span className="sa-cell-t"><b>Yangi do&apos;kon</b></span>
                <Chevron />
              </Link>
              <Link href="/super/payments" className="sa-cell sa-cell--ic">
                <Sq icon="wallet" tone="a" />
                <span className="sa-cell-t"><b>To&apos;lovlar</b></span>
                {pendingPayments > 0 && <span className="sa-cell-v">{pendingPayments}</span>}
                <Chevron />
              </Link>
              <Link href="/super/visitors" className="sa-cell sa-cell--ic">
                <Sq icon="chart" tone="c" />
                <span className="sa-cell-t"><b>Tashriflar</b></span>
                <Chevron />
              </Link>
              <Link href="/super/plans" className="sa-cell sa-cell--ic">
                <Sq icon="plans" tone="v" />
                <span className="sa-cell-t"><b>Tariflar</b></span>
                <Chevron />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
