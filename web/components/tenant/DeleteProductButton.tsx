'use client';

import { useTransition } from 'react';
import { deleteProductAction } from '@/app/actions/products';

export default function DeleteProductButton({ productId, productName }: { productId: string; productName: string }) {
  const [pending, start] = useTransition();

  return (
    <div className="panel" style={{ padding: 20 }}>
      <h3 style={{ fontSize: '.95rem', fontWeight: 800, marginBottom: 8 }}>Xavfli zona</h3>
      <p style={{ color: 'var(--ink-2)', fontSize: '.88rem', marginBottom: 12 }}>
        &quot;{productName}&quot; mahsulotini butunlay o&apos;chirish.
      </p>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pending}
        style={{ color: '#b91c1c', borderColor: '#fecaca' }}
        onClick={() => {
          if (!confirm(`"${productName}" o'chirilsinmi?`)) return;
          const fd = new FormData();
          fd.set('productId', productId);
          start(() => deleteProductAction(fd));
        }}
      >
        {pending ? 'O\'chirilmoqda...' : 'Mahsulotni o\'chirish'}
      </button>
    </div>
  );
}
