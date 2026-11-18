'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import type { PublicMenuItem } from '@/lib/restaurant/public';
import ItemSheet from './ItemSheet';
import MenuSections, { useMenuFormat } from './MenuSections';
import Sheet from './Sheet';

/**
 * Umumiy mijoz sahifasi (/m/<slug>) menyusi — faqat ko'rish: kategoriya tablari, taom kartalari va taom oynasi
 * (rasm, narx, variantlar narxi bilan). Savat va buyurtma yo'q — oynada «stoldagi QR» eslatmasi.
 */
export default function StoreMenu({ items, categories }: { items: PublicMenuItem[]; categories: string[] }) {
  const d = useDict();
  const q = d.restaurant.qrMenu;
  const { money, unitSuffix } = useMenuFormat();
  const [openItem, setOpenItem] = useState<PublicMenuItem | null>(null);

  return (
    <>
      <MenuSections items={items} categories={categories} mode="view" onOpen={setOpenItem} />
      <Sheet open={!!openItem} onClose={() => setOpenItem(null)} labelledBy={openItem ? `qm-item-title-${openItem.id}` : 'qm-org-name'}>
        {openItem ? (
          <ItemSheet
            key={openItem.id}
            item={openItem}
            money={money}
            priceSuffix={unitSuffix(openItem.unit)}
            onClose={() => setOpenItem(null)}
            viewNote={(
              <>
                <span className="qm-view-note-ic" aria-hidden><Icon name="qr" size={18} /></span>
                <span>{q.scanToOrder}</span>
              </>
            )}
          />
        ) : null}
      </Sheet>
    </>
  );
}
