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
    <div className="panel" style={{ maxWidth: 640, marginTop: 16 }}>
      <div className="panel-head">
        <h2>Amallar tarixi</h2>
        <span className="panel-sub">{items.length} ta amal</span>
      </div>
      {items.length === 0 ? (
        <div className="panel-empty"><p>Hali amal yo&apos;q.</p></div>
      ) : (
        <ul className="phist">
          {items.map((h, i) => (
            <li key={i} className={`phist-item phist-item--${h.action}`}>
              <span className="phist-dot"><Icon name={ACTION_ICON[h.action] ?? 'clock'} size={14} /></span>
              <div className="phist-body">
                <div className="phist-label">
                  {PRODUCT_ACTION_LABELS[h.action] ?? h.action}
                  {h.detail ? <span className="phist-detail"> · {h.detail}</span> : null}
                </div>
                <div className="phist-meta">
                  {fmtDateTime(h.at)}{h.by ? ` · ${h.by}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
