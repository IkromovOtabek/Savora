import Link from 'next/link';
import { requireOrgUser } from '@/lib/auth';
import { TENANT_MODULES } from '@/lib/features';
import type { FeatureKey } from '@/lib/features';
import { isPermissionKey, PERMISSIONS } from '@/lib/permissions';
import AuthShell from '@/components/auth/AuthShell';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.auth.locked.metaTitle };
}

export default async function LockedPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; p?: string }>;
}) {
  await requireOrgUser();
  const sp = await searchParams;
  const d = await getDict();
  const t = d.auth.locked;

  // Huquq yo'q (modul ochiq, lekin xodimga ruxsat berilmagan)
  if (isPermissionKey(sp.p)) {
    const perm = d.catalog.permissions[sp.p] ?? PERMISSIONS[sp.p];
    return (
      <AuthShell
        inline
        icon="lock"
        iconTone="warn"
        title={t.noPermissionTitle}
        subtitle={tr(t.noPermissionSub, { label: perm.label, description: perm.description })}
      >
        <p className="au-help">{t.noPermissionHelp}</p>
        <div className="au-actions au-actions--center" style={{ marginTop: 18 }}>
          <Link href="/app" className="au-btn au-btn--filled au-btn--block">{d.common.home}</Link>
        </div>
      </AuthShell>
    );
  }

  const key = sp.m as FeatureKey | undefined;
  const mod = key && TENANT_MODULES[key] ? (d.catalog.features[key] ?? TENANT_MODULES[key]) : null;
  const label = mod?.label ?? t.thisModule;

  return (
    <AuthShell
      inline
      icon="shield"
      iconTone="brand"
      title={tr(t.moduleTitle, { label })}
      subtitle={
        <>
          {tr(t.moduleSub, { label })}
          {mod?.description ? ` (${mod.description})` : ''}
        </>
      }
    >
      <p className="au-help">{t.moduleHelp}</p>
      <div className="au-form" style={{ marginTop: 18, gap: 8 }}>
        <Link href="/app/profile" className="au-btn au-btn--filled au-btn--block">{t.cabinet}</Link>
        <Link href="/app" className="au-btn au-btn--plain au-btn--block">{d.common.home}</Link>
      </div>
    </AuthShell>
  );
}
