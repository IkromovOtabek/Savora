import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { Screen, NavBar, LargeTitle, SearchField, Group, Cell, Loading, ErrorState, EmptyState } from '@/components/ui';
import { useDict, tr } from '@/lib/i18n';
import { qtyWithUnit } from '@/lib/qty';
import { putChoice } from '@/lib/catalog';

interface Row { id: string; name: string; unit: string | null; available: number }

/**
 * To'plam tarkibiga tovar tanlash: yangi mahsulot tushadigan omborning sotuvdagi sanaladigan tovarlari
 * (server: GET /api/mobile/products?bundle=1). Allaqachon qo'shilganlari (?skip=id,id) ko'rsatilmaydi.
 */
export default function BundlePick() {
  const router = useRouter();
  const { skip } = useLocalSearchParams<{ skip?: string }>();
  const d = useDict();
  const k = d.bundle;
  const skipIds = new Set((skip ?? '').split(',').filter(Boolean));
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const r = await api<{ items: Row[] }>(`/api/mobile/products?bundle=1&q=${encodeURIComponent(q.trim())}`);
        if (alive) { setItems(r.items); setError(null); }
      } catch (e) {
        if (alive) setError(errMsg(e));
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [q]);

  const shown = (items ?? []).filter((x) => !skipIds.has(x.id));

  return (
    <Screen header={<NavBar />}>
      <LargeTitle title={k.pickTitle} />
      <SearchField value={q} onChangeText={setQ} autoFocus />
      {items === null && !error ? <Loading /> : error && !items ? <ErrorState message={error} /> : shown.length === 0 ? (
        <EmptyState icon="cube-outline" title={k.pickEmpty} />
      ) : (
        <Group>
          {shown.map((p) => (
            <Cell
              key={p.id}
              icon="cube"
              title={p.name}
              subtitle={tr(k.left, { n: qtyWithUnit(p.available, p.unit, d.productFields.units) })}
              chevron
              onPress={() => {
                putChoice('bundleItem', { id: p.id, name: p.name, unit: p.unit, available: p.available });
                router.back();
              }}
            />
          ))}
        </Group>
      )}
    </Screen>
  );
}
