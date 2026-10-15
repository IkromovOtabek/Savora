import { IProductHistory, PRODUCT_ACTION_LABELS } from '@/lib/models/tenant/Product';
import Icon, { IconName } from '@/components/icons/Icon';

const ACTION_ICON: Record<string, IconName> = {
  created: 'box',
  sold: 'cart',
  transferred: 'repeat',
  returned: 'repeat',
  edited: 'edit',
  restocked: 'box',
};

function fmtDateTime(d: Date | string) {
  return new Date(d).toLocaleString('uz-UZ', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ProductHistory({ history }: { history: IProductHistory[] }) {
  const items = [...(history ?? [])].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <section className="st-section" aria-labelledby="st-hist-title">
      <div className="st-ghead">
        <span id="st-hist-title">Amallar tarixi</span>
        <strong>{items.length} ta amal</strong>
      </div>
      <div className="st-group">
        {items.length === 0 ? (
          <div className="st-empty">
            <span className="st-empty-ic"><Icon name="history" size={24} /></span>
            <p>Hali amal yo&apos;q.</p>
          </div>
        ) : (
          <ol className="st-hist-list">
            {items.map((h, i) => (
              <li key={i} className={`st-hist-item st-hist-item--${h.action}`}>
                <span className="st-hist-dot" aria-hidden="true"><Icon name={ACTION_ICON[h.action] ?? 'clock'} size={14} /></span>
                <div className="st-hist-body">
                  <div className="st-hist-label">{PRODUCT_ACTION_LABELS[h.action] ?? h.action}</div>
                  {h.detail ? <div className="st-hist-detail">{h.detail}</div> : null}
                  <div className="st-hist-meta">
                    <time dateTime={new Date(h.at).toISOString()}>{fmtDateTime(h.at)}</time>
                    {h.by ? ` · ${h.by}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
