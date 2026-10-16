import { IProductHistory } from '@/lib/models/tenant/Product';
import Icon, { IconName } from '@/components/icons/Icon';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

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

export default async function ProductHistory({ history }: { history: IProductHistory[] }) {
  const d = await getDict();
  const t = d.stock.history;
  const items = [...(history ?? [])].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <section className="st-section" aria-labelledby="st-hist-title">
      <div className="st-ghead">
        <span id="st-hist-title">{t.title}</span>
        <strong>{tr(t.count, { n: items.length })}</strong>
      </div>
      <div className="st-group">
        {items.length === 0 ? (
          <div className="st-empty">
            <span className="st-empty-ic"><Icon name="history" size={24} /></span>
            <p>{t.empty}</p>
          </div>
        ) : (
          <ol className="st-hist-list">
            {items.map((h, i) => (
              <li key={i} className={`st-hist-item st-hist-item--${h.action}`}>
                <span className="st-hist-dot" aria-hidden="true"><Icon name={ACTION_ICON[h.action] ?? 'clock'} size={14} /></span>
                <div className="st-hist-body">
                  <div className="st-hist-label">{d.stock.actionLabels[h.action] ?? h.action}</div>
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
