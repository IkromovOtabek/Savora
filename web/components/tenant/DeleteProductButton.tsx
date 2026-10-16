'use client';

import { useTransition } from 'react';
import { deleteProductAction } from '@/app/actions/products';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

export default function DeleteProductButton({ productId, productName }: { productId: string; productName: string }) {
  const [pending, start] = useTransition();
  const d = useDict();
  const t = d.stock.deleteBox;

  return (
    <section className="st-section" aria-labelledby="st-danger-title">
      <div className="st-ghead"><span id="st-danger-title">{t.title}</span></div>
      <div className="st-group st-danger">
        <div>
          <h3>{t.heading}</h3>
          <p>{tr(t.hint, { name: productName })}</p>
        </div>
        <button
          type="button"
          className="btn btn-danger btn-with-icon"
          disabled={pending}
          onClick={() => {
            if (!confirm(tr(t.confirm, { name: productName }))) return;
            const fd = new FormData();
            fd.set('productId', productId);
            start(() => deleteProductAction(fd));
          }}
        >
          <Icon name="trash" size={17} />
          {pending ? d.common.deleting : d.common.delete}
        </button>
      </div>
    </section>
  );
}
