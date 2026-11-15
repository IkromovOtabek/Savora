import { useMemo, useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney } from '@/lib/format';
import { qtyWithUnit } from '@/lib/qty';
import { useDict, tr } from '@/lib/i18n';
import { FlowTotalCard, type FlowTotals } from '@/components/FlowTotalCard';
import {
  Screen, useLayout, NavBar, LargeTitle, SegmentedControl, SearchField, Cell, listCellStyle, Loading, ErrorState, InlineError, EmptyState,
} from '@/components/ui';

interface FlowLine {
  id: string; productId: string; name: string; branchName: string;
  qty: number; unit?: string | null; cost: number; revenue: number; profit: number;
}
interface Data { branches: number; totals: FlowTotals; stock: FlowLine[]; sold: FlowLine[]; stockCount: number; soldCount: number }

/** Barcha kirim-chiqim — barcha filiallar bo'yicha ombordagi va sotilgan mahsulotlar (web «Barcha filiallar batafsil») */
export default function KirimChiqimAll() {
  const { c } = useTheme();
  const L = useLayout();
  const d = useDict();
  const k = d.kirimChiqim;
  const res = useResource<Data>('/api/mobile/kirim-chiqim/flow');
  const [tab, setTab] = useState<'sold' | 'stock'>('sold');
  const [q, setQ] = useState('');

  const data = res.data;
  const lines = useMemo(() => {
    const all = data ? (tab === 'sold' ? data.sold : data.stock) : [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((l) =>
      l.name.toLowerCase().includes(term) || l.productId.toLowerCase().includes(term) || l.branchName.toLowerCase().includes(term));
  }, [data, tab, q]);

  if (!data) {
    return (
      <Screen header={<NavBar />}>
        <LargeTitle title={k.allDetail} />
        {res.loading ? <Loading /> : <ErrorState message={res.error} onRetry={res.retry} />}
      </Screen>
    );
  }

  const header = (
    <View style={{ gap: 14, paddingBottom: 14 }}>
      <LargeTitle title={k.allDetail} subtitle={k.allDetailSub} />
      {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
      <FlowTotalCard totals={data.totals} title={k.totalAll} />
      <SegmentedControl
        options={[
          { key: 'sold', label: `${k.sold} · ${data.soldCount}` },
          { key: 'stock', label: `${k.inStock} · ${data.stockCount}` },
        ]}
        value={tab}
        onChange={setTab}
      />
      <SearchField value={q} onChangeText={setQ} placeholder={k.searchPh} />
    </View>
  );

  return (
    <Screen scroll={false} header={<NavBar />}>
      <FlatList
        data={lines}
        keyExtractor={(l) => `${tab}-${l.id}`}
        contentContainerStyle={[L.content, { paddingTop: 4, paddingBottom: L.bottom }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.refresh} tintColor={c.tint} colors={[c.tint]} />}
        ListEmptyComponent={
          <EmptyState
            icon={tab === 'sold' ? 'cart-outline' : 'cube-outline'}
            title={q.trim() ? d.common.notFound : tab === 'sold' ? k.noSold : k.noStock}
          />
        }
        initialNumToRender={20}
        windowSize={11}
        renderItem={({ item, index }) => (
          <Cell
            sep={index > 0}
            style={listCellStyle(c, index, lines.length)}
            icon={tab === 'sold' ? 'arrow-up' : 'arrow-down'}
            iconColor={tab === 'sold' ? c.sq.o : c.sq.b}
            title={item.name}
            subtitle={[
              [item.productId, item.branchName, qtyWithUnit(item.qty, item.unit, d.productFields.units)].join(' · '),
              tr(k.lineMeta, { cost: fmtMoney(item.cost), profit: fmtMoney(item.profit) }),
            ].join('\n')}
            subtitleLines={2}
            value={fmtMoney(tab === 'sold' ? item.revenue : item.cost)}
            valueColor={tab === 'sold' ? c.ok : undefined}
            valueStrong
          />
        )}
      />
    </Screen>
  );
}
