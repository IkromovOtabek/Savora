import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import MoreMenu from '@/components/ui/MoreMenu';
import { loadUserPermissions } from '@/lib/permissionGuard';
import ImeiBulkSearch from '@/components/tenant/ImeiBulkSearch';
import ImeiBlacklistManager, { OwnBlacklistRow } from '@/components/tenant/ImeiBlacklistManager';
import { getTenantSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.stock.imei.metaTitle };
}

export default async function ImeiPage() {
  const d = await getDict();
  const t = d.stock.imei;
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
      // Sabab nomi client tomonda tilga qarab chiqadi (d.stock.blacklistReasons)
      rows = docs.map((doc) => ({
        id: String(doc._id),
        imei: doc.imei,
        reason: doc.reason,
        customerName: doc.customerName,
        customerPhone: doc.customerPhone,
        note: doc.note,
        createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : '',
      }));
    } catch {
      rows = [];
    }
  }

  return (
    <>
      <div className="t-page-head st-head">
        <div>
          <h1 className="t-page-title">{t.title}</h1>
          <p className="t-page-sub">{t.subtitle}</p>
        </div>
        {/* Ikkinchi darajali amal — ⋯ ichida; eksport huquqi/moduli bo'lmasa ko'rsatilmaydi (API baribir 403 qaytaradi) */}
        <div className="t-page-actions">
          <MoreMenu label={d.stock.detail.moreLabel}>
            <Link href="/app/products"><Icon name="box" size={18} /> {d.stock.inventory.goToStock}</Link>
            {canExport && (
              <a href="/api/export/products"><Icon name="download" size={18} /> {t.exportCsv}</a>
            )}
          </MoreMenu>
        </div>
      </div>
      <ImeiBulkSearch />
      {isAdmin && <ImeiBlacklistManager rows={rows} />}
    </>
  );
}
