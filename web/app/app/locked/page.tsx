import Link from 'next/link';
import { requireOrgUser } from '@/lib/auth';
import { TENANT_MODULES } from '@/lib/features';
import type { FeatureKey } from '@/lib/features';
import { isPermissionKey, PERMISSIONS } from '@/lib/permissions';
import AuthShell from '@/components/auth/AuthShell';

export const metadata = { title: 'Modul mavjud emas — Savora' };

export default async function LockedPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; p?: string }>;
}) {
  await requireOrgUser();
  const sp = await searchParams;

  // Huquq yo'q (modul ochiq, lekin xodimga ruxsat berilmagan)
  if (isPermissionKey(sp.p)) {
    const perm = PERMISSIONS[sp.p];
    return (
      <AuthShell
        inline
        icon="lock"
        iconTone="warn"
        title="Huquq berilmagan"
        subtitle={<>Sizga <strong>&ldquo;{perm.label}&rdquo;</strong> huquqi berilmagan. ({perm.description})</>}
      >
        <p className="au-help">Bu bo&apos;limdan foydalanish uchun do&apos;kon egasidan huquq so&apos;rang.</p>
        <div className="au-actions au-actions--center" style={{ marginTop: 18 }}>
          <Link href="/app" className="au-btn au-btn--filled au-btn--block">Bosh sahifa</Link>
        </div>
      </AuthShell>
    );
  }

  const key = sp.m as FeatureKey | undefined;
  const mod = key && TENANT_MODULES[key] ? TENANT_MODULES[key] : null;
  const label = mod?.label ?? 'Bu';

  return (
    <AuthShell
      inline
      icon="shield"
      iconTone="brand"
      title={`${label} moduli mavjud emas`}
      subtitle={
        <>
          Tarifingizda <strong>&ldquo;{label}&rdquo;</strong> moduli yoqilmagan.
          {mod?.description ? ` (${mod.description})` : ''}
        </>
      }
    >
      <p className="au-help">
        Bu bo&apos;limdan foydalanish uchun tarifingizni yangilang — Kabinet bo&apos;limidan to&apos;lov
        yuboring yoki platforma egasiga murojaat qiling.
      </p>
      <div className="au-form" style={{ marginTop: 18, gap: 8 }}>
        <Link href="/app/profile" className="au-btn au-btn--filled au-btn--block">Kabinet (tarif va to&apos;lov)</Link>
        <Link href="/app" className="au-btn au-btn--plain au-btn--block">Bosh sahifa</Link>
      </div>
    </AuthShell>
  );
}
