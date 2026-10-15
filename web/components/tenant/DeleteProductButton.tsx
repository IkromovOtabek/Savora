'use client';

import { useTransition } from 'react';
import { deleteProductAction } from '@/app/actions/products';
import Icon from '@/components/icons/Icon';

export default function DeleteProductButton({ productId, productName }: { productId: string; productName: string }) {
  const [pending, start] = useTransition();

  return (
    <section className="st-section" aria-labelledby="st-danger-title">
      <div className="st-ghead"><span id="st-danger-title">Xavfli zona</span></div>
      <div className="st-group st-danger">
        <div>
          <h3>Mahsulotni o&apos;chirish</h3>
          <p>&quot;{productName}&quot; butunlay o&apos;chiriladi. Sotuv tarixi bo&apos;lsa, o&apos;chirib bo&apos;lmaydi.</p>
        </div>
        <button
          type="button"
          className="btn btn-danger btn-with-icon"
          disabled={pending}
          onClick={() => {
            if (!confirm(`"${productName}" o'chirilsinmi?`)) return;
            const fd = new FormData();
            fd.set('productId', productId);
            start(() => deleteProductAction(fd));
          }}
        >
          <Icon name="trash" size={17} />
          {pending ? 'O\'chirilmoqda...' : 'O\'chirish'}
        </button>
      </div>
    </section>
  );
}
