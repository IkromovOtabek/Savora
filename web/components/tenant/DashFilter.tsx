'use client';

import { useId, useState, type ReactNode } from 'react';
import Icon from '@/components/icons/Icon';

/**
 * Bosh sahifa sarlavhasi + filtr: o'ngda faqat ikonkali toggle tugma, bosilganda filtr qismlari
 * (davr, kun, filial) sarlavha ostida animatsiya bilan ochiladi; qayta bosilsa — yopiladi.
 * Filtr qismlari server'da chiziladi va `children` bo'lib keladi (havolalar — ?p= / ?b=).
 */
export default function DashFilter({ head, active, label, children }: {
  head: ReactNode;
  /** Sukutdan farqli filtr qo'llangan — tugmada nuqta, sahifa ochilganda panel ochiq */
  active: boolean;
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(active);
  const id = useId();
  return (
    <>
      <div className="t-page-head t-dash-head">
        {head}
        <button
          type="button"
          className={`t-filter-btn${open ? ' is-open' : ''}`}
          aria-expanded={open}
          aria-controls={id}
          aria-label={label}
          title={label}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="filter" size={20} />
          {active && <span className="t-filter-dot" aria-hidden="true" />}
        </button>
      </div>
      <div id={id} className={`t-filter${open ? ' is-open' : ''}`} inert={!open}>
        <div className="t-filter-in">
          <div className="t-filter-card">{children}</div>
        </div>
      </div>
    </>
  );
}
