import { productionCtxFromSession } from '@/lib/production/session';
import { productionMeta } from '@/lib/production/catalog';
import { getOrder } from '@/lib/production/orders';
import { getDict } from '@/lib/i18n/server';
import BackLink from '@/components/ui/BackLink';
import OrderEditor from '@/components/production/orders/OrderEditor';

export async function generateMetadata() {
  return { title: (await getDict()).production.common.order };
}

/** Ishlab chiqarish akti: reja vs haqiqiy sarf, ish haqi, tannarx, holat tugmalari (`order.can` bo'yicha) */
export default async function ProductionOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await productionCtxFromSession();
  const t = ctx.d.production.orders;
  const [res, meta] = await Promise.all([getOrder(ctx, id), productionMeta(ctx)]);

  return (
    <>
      <BackLink href="/app/production">{t.back}</BackLink>
      {!res.ok ? (
        <p className="t-note t-note--warn" role="alert">{res.error}</p>
      ) : (
        // rev o'zgarsa (saqlash, holat) — tahrir holati serverdagi yangi ma'lumotdan qayta quriladi
        <OrderEditor
          key={`${res.data.order.id}:${res.data.order.rev}`}
          order={res.data.order}
          canReceive={meta.ok && meta.data.features.purchasing && meta.data.can.receive}
          canPurchase={meta.ok && meta.data.features.purchasing && meta.data.can.managePo}
        />
      )}
    </>
  );
}
