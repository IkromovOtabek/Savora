import Icon from '@/components/icons/Icon';
import ImeiBulkSearch from '@/components/tenant/ImeiBulkSearch';
import ImeiBlacklistManager, { OwnBlacklistRow } from '@/components/tenant/ImeiBlacklistManager';
import { getTenantSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';
import { BLACKLIST_REASON_LABELS } from '@/lib/models/master/ImeiBlacklist';

export const metadata = { title: 'IMEI qidiruv — Savora' };

export default async function ImeiPage() {
  const { user, org } = await getTenantSession();
  const isAdmin = user.role === 'admin';

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
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">IMEI qidiruv</h1>
          <p className="t-page-sub">Bir nechta IMEI ni tekshiring — qora ro&apos;yxat ogohlantirishi bilan</p>
        </div>
        <div className="t-page-actions">
          <a href="/api/export/products" className="btn btn-ghost btn-with-icon">
            <Icon name="download" size={18} /> Ombor CSV
          </a>
        </div>
      </div>
      <ImeiBulkSearch />
      {isAdmin && <ImeiBlacklistManager rows={rows} />}
    </>
  );
}
