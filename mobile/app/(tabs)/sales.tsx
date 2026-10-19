import { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { usePaged } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney, payLabel, fmtDate } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import {
  Screen, useLayout, TopBar, SegmentedControl, Cell, AmountColumn, Pill, listCellStyle,
  Loading, EmptyState, ErrorState, InlineError, type Tone,
} from '@/components/ui';

interface Sale {
  id: string; saleNo: string; product: string; customer: string | null;
  paymentType: string; totalAmount: number; remainingAmount: number; status: string; createdAt: string;
}

const PAY_TONE: Record<string, Tone> = { cash: 'ok', debt: 'bad', installment: 'au', bank_credit: 'br' };

export default function Sales() {
  const router = useRouter();
  const { c } = useTheme();
  const L = useLayout();
  const d = useDict();
  const params = useLocalSearchParams<{ type?: string }>();
  const [type, setType] = useState<'all' | 'debt'>(params.type === 'debt' ? 'debt' : 'all');
  useEffect(() => { if (params.type === 'debt' || params.type === 'all') setType(params.type); }, [params.type]);

  const list = usePaged<Sale>(`/api/mobile/sales?type=${type}`);
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } list.reloadSilently(); }, [list.reloadSilently])); // eslint-disable-line react-hooks/exhaustive-deps

  const bar = (
    <TopBar title={d.sales.title} subtitle={list.loading ? ' ' : tr(d.common.count, { n: fmtMoney(list.total) })}>
      <SegmentedControl
        options={[{ key: 'all', label: d.sales.all }, { key: 'debt', label: d.sales.debtors }]}
        value={type}
        onChange={setType}
      />
    </TopBar>
  );

  const header = list.error && list.items.length > 0 ? (
    <View style={{ paddingBottom: 14 }}><InlineError message={list.error} onRetry={list.refresh} /></View>
  ) : null;

  return (
    <Screen scroll={false} bar={bar}>
      <FlatList
        data={list.loading ? [] : list.items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[L.content, { paddingTop: 14, paddingBottom: L.bottom }]}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={c.tint} colors={[c.tint]} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          list.loading ? <Loading />
            : list.error ? <ErrorState message={list.error} onRetry={list.retry} />
            : <EmptyState icon="cart-outline" title={type === 'debt' ? d.sales.emptyDebt : d.sales.empty} message={type === 'debt' ? d.sales.emptyDebtMsg : d.sales.emptyMsg} />
        }
        ListFooterComponent={list.loadingMore ? <ActivityIndicator color={c.tint} style={{ marginVertical: 16 }} /> : null}
        renderItem={({ item, index }) => (
          <Cell
            sep={index > 0}
            style={listCellStyle(c, index, list.items.length)}
            title={item.product}
            subtitle={[item.customer, `№${item.saleNo}`, fmtDate(item.createdAt)].filter(Boolean).join(' · ')}
            right={
              <AmountColumn amount={fmtMoney(item.totalAmount)}>
                {item.remainingAmount > 0
                  ? <Pill label={tr(d.sales.remaining, { v: fmtMoney(item.remainingAmount) })} tone="bad" />
                  : <Pill label={payLabel(item.paymentType)} tone={PAY_TONE[item.paymentType] ?? 'mut'} />}
              </AmountColumn>
            }
            onPress={() => router.push(`/sale/${item.id}`)}
          />
        )}
      />
    </Screen>
  );
}
