import { FEATURE_KEYS, resolveOrgFeatures, TENANT_MODULES, isImeiEnabled } from '@/lib/features';
import { moduleLink, tenantLoginUrl } from '@/lib/urls';
import { IOrganization } from '@/lib/models/master/Organization';
import { Pill } from './ui';

interface Props {
  org: Pick<IOrganization, 'slug' | 'name' | 'plan' | 'features' | 'businessType'>;
}

export default function OrgLinksPanel({ org }: Props) {
  const features = resolveOrgFeatures(org);
  const phoneShop = isImeiEnabled(org);

  const links: { label: string; url: string; desc: string; enabled: boolean }[] = [
    {
      label: 'Biznes egasi kirishi',
      url: tenantLoginUrl(org.slug),
      desc: 'Login va parol bilan tizimga kirish',
      enabled: true,
    },
    {
      label: 'Boshqaruv paneli',
      url: moduleLink(org.slug, '/app'),
      desc: 'Asosiy dashboard',
      enabled: true,
    },
    ...FEATURE_KEYS.map((key) => ({
      label: TENANT_MODULES[key].label,
      url: moduleLink(org.slug, TENANT_MODULES[key].route),
      desc: TENANT_MODULES[key].description,
      enabled: features[key],
    })),
  ];

  if (phoneShop) {
    links.push({
      label: 'IMEI qidiruv',
      url: moduleLink(org.slug, '/app/imei'),
      desc: 'Telefon do\'kon — ko\'p IMEI qidiruv',
      enabled: true,
    });
  }

  return (
    <div className="sa-section">
      <div className="sa-group" style={{ background: 'var(--bg-soft)' }}>
        {links.map((item) => (
          <div key={item.label} className={`sa-cell${item.enabled ? '' : ' sa-cell--off'}`}>
            <span className="sa-cell-t">
              <b>{item.label}</b>
              <small className="sa-wrap">{item.desc}</small>
              <a href={item.url} target="_blank" rel="noreferrer" className="sa-link-url">{item.url}</a>
            </span>
            {!item.enabled && <Pill tone="bad">O&apos;chiq</Pill>}
          </div>
        ))}
      </div>
      <div className="sa-gfoot">Havolalarni mijozga bering. O&apos;chiq modullar havolasi ishlamaydi.</div>
    </div>
  );
}
