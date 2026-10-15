import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import MoreMenu from '@/components/ui/MoreMenu';
import { loadUserPermissions } from '@/lib/permissionGuard';
import ImeiBulkSearch from '@/components/tenant/ImeiBulkSearch';
import ImeiBlacklistManager, { OwnBlacklistRow } from '@/components/tenant/ImeiBlacklistManager';
import { getTenantSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';
import { BLACKLIST_REASON_LABELS } from '@/lib/models/master/ImeiBlacklist';

export const metadata = { title: 'IMEI qidiruv — Savora' };

export default async function ImeiPage() {
  const { user, org, features } = await getTenantSession();
  const isAdmin = user.role === 'admin';
  const perms = await loadUserPermissions(user);
  const canExport = !!features.export && perms.has('export.data');

  let rows: OwnBlacklistRow[] = [];
  if (isAdmin) {
    try {
      const { ImeiBlacklist } = await getMasterModels();
      const docs = await ImeiBlacklist.find({ organizationId: org._id, resolved: false })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      rows = docs.map((d) => ({
        id: String(d._id),
        imei: d.imei,
        reasonLabel: BLACKLIST_REASON_LABELS[d.reason],
        customerName: d.customerName,
        customerPhone: d.customerPhone,
        note: d.note,
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
      }));
    } catch {
      rows = [];
    }
  }

  return (
    <>
      <div className="t-page-head st-head">
        <div>
          <h1 className="t-page-title">IMEI qidiruv</h1>
          <p className="t-page-sub">Bir nechta IMEI ni tekshiring — qora ro&apos;yxat ogohlantirishi bilan</p>
        </div>
        {/* Ikkinchi darajali amal — ⋯ ichida; eksport huquqi/moduli bo'lmasa ko'rsatilmaydi (API baribir 403 qaytaradi) */}
        <div className="t-page-actions">
          <MoreMenu label="Boshqa amallar">
            <Link href="/app/products"><Icon name="box" size={18} /> Omborga o&apos;tish</Link>
            {canExport && (
              <a href="/api/export/products"><Icon name="download" size={18} /> Ombor CSV yuklab olish</a>
            )}
          </MoreMenu>
        </div>
      </div>
      <ImeiBulkSearch />
      {isAdmin && <ImeiBlacklistManager rows={rows} />}
    </>
  );
}
