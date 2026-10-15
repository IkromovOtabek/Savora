import { FEATURE_KEYS, resolveOrgFeatures, TENANT_MODULES, isImeiEnabled } from '@/lib/features';
import { moduleLink, tenantLoginUrl } from '@/lib/urls';
import { IOrganization } from '@/lib/models/master/Organization';
import { Pill } from './ui';
import CopyButton from './CopyButton';

/** Ko'rsatish uchun qisqa yo'l: to'liq URL nusxalanadi, ekranda faqat yo'l */
function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || '/';
  } catch {
    return url;
  }
}

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

  const base = (() => { try { return new URL(links[0].url).host; } catch { return ''; } })();

  return (
    <div className="sa-section">
      <div className="sa-group sa-links">
        {links.map((item) => (
          <div key={item.label} className={`sa-link-row${item.enabled ? '' : ' sa-cell--off'}`}>
            <span className="sa-link-t">
              <b>
                {item.label}
                {!item.enabled && <Pill tone="bad">O&apos;chiq</Pill>}
              </b>
              <a href={item.url} target="_blank" rel="noreferrer" className="sa-link-path" title={item.desc}>
                {shortPath(item.url)}
              </a>
            </span>
            <CopyButton text={item.url} label={item.label} />
          </div>
        ))}
      </div>
      <div className="sa-gfoot">
        {base && <>Manzil: <code className="sa-code">{base}</code> · </>}
        «Nusxa» to&apos;liq havolani oladi. O&apos;chiq modullar havolasi ishlamaydi.
      </div>
    </div>
  );
}
