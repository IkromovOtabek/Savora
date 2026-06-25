import { FEATURE_KEYS, resolveOrgFeatures, TENANT_MODULES, isImeiEnabled } from '@/lib/features';
import { moduleLink, tenantLoginUrl } from '@/lib/urls';
import { IOrganization } from '@/lib/models/master/Organization';

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
    <div className="links-list" style={{ padding: '0 24px 24px' }}>
      {links.map((item) => (
        <div key={item.label} className={`links-item${item.enabled ? '' : ' links-item--off'}`}>
          <div className="links-item-head">
            <strong>{item.label}</strong>
            {!item.enabled && <span className="badge-status badge-status--expired">O&apos;chirilgan</span>}
          </div>
          <p className="links-item-desc">{item.desc}</p>
          <code className="links-item-url">
            <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
          </code>
        </div>
      ))}
    </div>
  );
}
