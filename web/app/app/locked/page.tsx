import Link from 'next/link';
import { requireOrgUser } from '@/lib/auth';
import { TENANT_MODULES } from '@/lib/features';
import type { FeatureKey } from '@/lib/features';
import Icon from '@/components/icons/Icon';
import { isPermissionKey, PERMISSIONS } from '@/lib/permissions';

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
      <div className="locked-wrap">
        <div className="locked-card">
          <div className="locked-icon"><Icon name="lock" size={32} /></div>
          <h1>Huquq berilmagan</h1>
          <p>
            Sizga <strong>&ldquo;{perm.label}&rdquo;</strong> huquqi berilmagan. ({perm.description})
          </p>
          <p className="locked-sub">Bu bo&apos;limdan foydalanish uchun do&apos;kon egasidan huquq so&apos;rang.</p>
          <div className="locked-actions">
            <Link href="/app" className="btn btn-primary">Bosh sahifa</Link>
          </div>
        </div>
      </div>
    );
  }

  const key = sp.m as FeatureKey | undefined;
  const mod = key && TENANT_MODULES[key] ? TENANT_MODULES[key] : null;
  const label = mod?.label ?? 'Bu';

  return (
    <div className="locked-wrap">
      <div className="locked-card">
        <div className="locked-icon"><Icon name="shield" size={32} /></div>
        <h1>{label} moduli mavjud emas</h1>
        <p>
          Siz tarif bo&apos;yicha <strong>&ldquo;{label}&rdquo;</strong> moduliga a&apos;zo bo&apos;lmagansiz.
          {mod?.description ? ` (${mod.description})` : ''}
        </p>
        <p className="locked-sub">
          Bu bo&apos;limdan foydalanish uchun tarifingizni yangilang — Kabinet bo&apos;limidan to&apos;lov
          yuboring yoki platforma egasiga murojaat qiling.
        </p>
        <div className="locked-actions">
          <Link href="/app/profile" className="btn btn-primary">Kabinet (tarif/to&apos;lov)</Link>
          <Link href="/app" className="btn btn-ghost">Bosh sahifa</Link>
        </div>
      </div>
    </div>
  );
}
