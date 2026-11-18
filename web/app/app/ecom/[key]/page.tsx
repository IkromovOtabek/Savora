import { notFound } from 'next/navigation';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { findEcomGroup } from '@/lib/ecom/manage';
import { ecomDisplayName } from '@/lib/ecom/group';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtQty } from '@/lib/qty';
import BackLink from '@/components/ui/BackLink';
import EcomItemForm from '@/components/tenant/ecom/EcomItemForm';

export async function generateMetadata() {
  return { title: (await getDict()).ecom.edit.metaTitle };
}

/** Tovarning e-commerce ma'lumotlari (guruh kaliti bo'yicha — barcha nusxalarga qo'llanadi) */
export default async function EcomItemPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { Product, ShopSettings } = await getTenantAdminSession();
  const found = await findEcomGroup({ Product, ShopSettings }, key);
  if (!found) notFound();
  const { group: g, autoPublish } = found;
  const d = await getDict();
  const k = d.ecom.edit;
  const units = d.stock.fields.units as Record<string, string>;
  const unit = g.unit ? units[g.unit] ?? g.unit : '';

  return (
    <div className="ec-page">
      <BackLink href="/app/ecom">{k.back}</BackLink>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{ecomDisplayName(g)}</h1>
        </div>
      </div>
      <EcomItemForm
        initial={{
          key: g.key,
          name: g.name,
          displayName: ecomDisplayName(g),
          price: g.price,
          maxPrice: g.maxPrice,
          oldPrice: g.oldPrice,
          description: g.description,
          images: g.images,
          listed: g.explicit === true ? 'show' : g.explicit === false ? 'hide' : 'auto',
          autoPublish,
          live: g.state === 'live',
          stockText: tr(k.stock, { qty: `${fmtQty(g.qty)}${unit ? ` ${unit}` : ''}`, n: g.allIds.length }),
        }}
      />
    </div>
  );
}
