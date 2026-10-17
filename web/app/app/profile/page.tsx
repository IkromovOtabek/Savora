import { getTenantSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';
import { resolveOrgPlan } from '@/lib/plans';
import { daysUntilExpiry, isTrialActive } from '@/lib/models/master/Organization';
import { fmtDate, fmtMoney } from '@/lib/format';
import ProfileForms from '@/components/tenant/ProfileForms';
import TelegramConnect from '@/components/tenant/TelegramConnect';
import TelegramAppLink from '@/components/tenant/TelegramAppLink';
import PaymentSubmit from '@/components/tenant/PaymentSubmit';
import ExpiryBanner from '@/components/ExpiryBanner';
import LogoutButton from '@/components/LogoutButton';
import Icon, { type IconName } from '@/components/icons/Icon';
import { getTelegramLinkStatus } from '@/app/actions/telegramLink';
import LangSwitch from '@/components/LangSwitch';
import { getDict, type Dict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/admin.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.shell.profile.metaTitle };
}

/** Qolgan kunlar halqasi (30 kunlik shkala) */
function DaysRing({ days, d }: { days: number; d: Dict }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, days);
  const pct = Math.min(1, shown / 30);
  const tone = shown <= 3 ? ' ad-ring--over' : shown <= 7 ? ' ad-ring--warn' : '';
  return (
    <div className={`ad-ring${tone}`} role="img" aria-label={tr(d.shell.profile.daysLeft, { n: shown })}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="ad-ring-track" cx="32" cy="32" r={r} fill="none" strokeWidth="6" />
        <circle
          className="ad-ring-val"
          cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="ad-ring-c" aria-hidden="true">
        <b>{shown}</b>
        <small>{d.common.day}</small>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

export default async function ProfilePage() {
  const { user, org, User } = await getTenantSession();
  const d = await getDict();
  const t = d.shell.profile;
  const dbUser = await User.findById(user.id).lean();

  const isAdmin = user.role === 'admin';
  const { linked: tgLinked } = await getTelegramLinkStatus();

  // To'lov bo'limi (faqat admin): rekvizitlar + o'z so'rovlari
  let payAccount = { paymentCardNumber: '', paymentCardHolder: '', paymentNote: '' };
  let ownRequests: {
    id: string; amount: number; months: number;
    status: 'pending' | 'approved' | 'rejected'; reviewNote?: string; createdAt: string;
  }[] = [];
  const plan = resolveOrgPlan(org);
  const monthlyPrice = plan.monthlyPayment || 0;

  if (isAdmin) {
    const { PlatformSettings, PaymentRequest } = await getMasterModels();
    const [settings, reqs] = await Promise.all([
      PlatformSettings.findOne({ key: 'default' }).lean(),
      PaymentRequest.find({ organizationId: org._id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    payAccount = {
      paymentCardNumber: settings?.paymentCardNumber ?? '',
      paymentCardHolder: settings?.paymentCardHolder ?? '',
      paymentNote: settings?.paymentNote ?? '',
    };
    ownRequests = reqs.map((r) => ({
      id: String(r._id),
      amount: r.amount,
      months: r.months,
      status: r.status,
      reviewNote: r.reviewNote,
      createdAt: (r.createdAt ?? new Date()).toString(),
    }));
  }

  const displayName = dbUser?.fullName || user.username;
  const days = daysUntilExpiry(org);
  const trial = isTrialActive(org);

  const jump: { href: string; label: string; icon: IconName; tone: string }[] = [
    { href: '#hisob', label: t.account, icon: 'user', tone: '' },
    { href: '#xavfsizlik', label: t.security, icon: 'lock', tone: ' ad-sq--muted' },
    ...(isAdmin ? [{ href: '#obuna-tolovi', label: t.subscription, icon: 'wallet' as IconName, tone: ' ad-sq--gold' }] : []),
    { href: '#telegram', label: t.telegram, icon: 'send', tone: ' ad-sq--tg' },
    { href: '#sozlamalar', label: d.common.settings, icon: 'settings', tone: ' ad-sq--muted' },
  ];

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{t.subtitle}</p>
        </div>
      </div>

      {/* Obuna/sinov bildirishnomalari faqat shu yerda (Kabinet) ko'rsatiladi */}
      <ExpiryBanner org={org} showPayButton={isAdmin} />

      <div className="ad-settings">
        <aside className="ad-settings-aside">
          <div className="ad-group ad-account" id="plan">
            <div className="ad-account-id">
              <span className={`ad-avatar ad-avatar--lg${isAdmin ? ' ad-avatar--admin' : ''}`} aria-hidden="true">
                {initials(displayName)}
              </span>
              <div>
                <h2 className="ad-account-name">{displayName}</h2>
                <span className="ad-account-sub">@{user.username} · {isAdmin ? d.catalog.roles.admin : d.common.branch}</span>
                <span className="ad-account-sub">{org.name}</span>
              </div>
            </div>
            <div className="ad-account-plan">
              <DaysRing days={days} d={d} />
              <div>
                <b>
                  {tr(t.planLabel, { plan: d.catalog.planTiers[plan.tier] ?? plan.label })}
                  {trial && <span className="ad-pill ad-pill--brand">{t.trial}</span>}
                </b>
                <small>{tr(t.expiresAt, { date: fmtDate(org.expiresAt) })}</small>
                {monthlyPrice > 0 && <small className="ad-num">{fmtMoney(monthlyPrice)} {d.common.sum} {t.perMonth}</small>}
              </div>
            </div>
          </div>

          <nav className="ad-group ad-jump" aria-label={t.sections}>
            {jump.map((j) => (
              <a key={j.href} href={j.href} className="ad-cell">
                <span className={`ad-sq${j.tone}`} aria-hidden="true"><Icon name={j.icon} size={16} /></span>
                <span className="ad-cell-t"><b>{j.label}</b></span>
                <Icon name="chevron" size={14} className="ad-chev" />
              </a>
            ))}
          </nav>
        </aside>

        <div className="ad-settings-main">
          {/* Telefon/planshet: bo'limlarga tez o'tish (kompyuterda chap menyu bor) */}
          <nav className="ad-jump-m ux-scrollx" aria-label={t.sections}>
            {jump.map((j) => (
              <a key={j.href} href={j.href} className="ad-chip">
                <Icon name={j.icon} size={15} /> {j.label}
              </a>
            ))}
          </nav>

          <ProfileForms
            username={user.username}
            fullName={dbUser?.fullName ?? ''}
            mustChangePassword={Boolean(dbUser?.mustChangePassword)}
          />

          {isAdmin && (
            <section aria-labelledby="sec-obuna">
              <div className="ad-sec-head"><h2 id="sec-obuna">{t.subscription}</h2></div>
              <div className="ad-pay">
                <PaymentSubmit account={payAccount} monthlyPrice={monthlyPrice} requests={ownRequests} />
              </div>
            </section>
          )}

          <section id="telegram" aria-labelledby="sec-telegram">
            <div className="ad-sec-head"><h2 id="sec-telegram">{t.telegram}</h2></div>
            <div className="ad-group">
              <TelegramAppLink linked={tgLinked} />
              {isAdmin && <TelegramConnect orgId={org._id} connected={!!org.telegramChatId} />}
            </div>
            <p className="ad-sec-foot">{t.telegramFoot}</p>
          </section>

          <section id="sozlamalar" aria-labelledby="sec-sozlamalar">
            <div className="ad-sec-head"><h2 id="sec-sozlamalar">{d.common.settings}</h2></div>
            <div className="ad-group">
              <div className="ad-cell">
                <span className="ad-sq ad-sq--muted" aria-hidden="true"><Icon name="settings" size={16} /></span>
                <span className="ad-cell-t">
                  <b>{t.uiLanguage}</b>
                  <small>{t.uiLanguageSub}</small>
                </span>
                <span className="ad-cell-a"><LangSwitch /></span>
              </div>
            </div>
          </section>

          <section aria-labelledby="sec-session">
            <div className="ad-sec-head"><h2 id="sec-session">{t.session}</h2></div>
            <div className="ad-group ad-danger-zone">
              <div className="ad-cell">
                <span className="ad-sq ad-sq--danger" aria-hidden="true"><Icon name="logout" size={16} /></span>
                <span className="ad-cell-t">
                  <b>{t.logoutTitle}</b>
                  <small>{t.logoutSub}</small>
                </span>
                <span className="ad-cell-a"><LogoutButton className="btn-danger btn-sm" /></span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
