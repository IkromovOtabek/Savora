import { useCallback, useRef, useState } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth, useCan } from '@/lib/auth';
import { useDebounced, usePaged } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import {
  Screen, useLayout, TopBar, SearchField, Cell, AmountColumn, Pill, IconButton, listCellStyle,
  Loading, EmptyState, ErrorState, InlineError,
} from '@/components/ui';

interface Product {
  id: string; name: string; imei: string; barcode: string | null;
  salePrice: number; purchasePrice: number; status: string; trackQuantity: boolean; available: number;
}

export default function Products() {
  const router = useRouter();
  const { me } = useAuth();
  const can = useCan();
  const { c } = useTheme();
  const L = useLayout();
  const d = useDict();
  const t = me?.terms;
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);

  const list = usePaged<Product>(`/api/mobile/products?q=${encodeURIComponent(dq)}`);
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } list.reloadSilently(); }, [list.reloadSilently]));

  const codeOf = (p: Product) =>
    p.imei && !p.imei.startsWith('SVR-') ? p.imei : p.barcode ? p.barcode : null;

  const bar = (
    <TopBar
      title={t?.items ?? d.terms.items}
      subtitle={list.loading && list.items.length === 0 ? ' ' : tr(d.common.count, { n: fmtMoney(list.total) })}
      actions={
        <>
          <IconButton icon="barcode-outline" label={d.common.scanner} onPress={() => router.push('/scan')} />
          {can('product.create') ? <IconButton icon="add" label={t?.addItem ?? d.terms.addItem} onPress={() => router.push('/product-new')} /> : null}
        </>
      }
    >
      <SearchField
        value={q}
        onChangeText={setQ}
        placeholder={tr(d.products.searchPlaceholder, { code: (t?.codeLabel ?? d.terms.code).toLowerCase() })}
        right={list.loading && list.items.length > 0 ? <ActivityIndicator size="small" color={c.ink3} /> : null}
      />
    </TopBar>
  );

  const header = list.error && list.items.length > 0 ? (
    <View style={{ paddingBottom: 14 }}><InlineError message={list.error} onRetry={list.refresh} /></View>
  ) : null;

  return (
    <Screen scroll={false} bar={bar}>
      <FlatList
        data={list.items}
        keyExtractor={(it) => it.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[L.content, { paddingTop: 14, paddingBottom: L.bottom }]}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={c.tint} colors={[c.tint]} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          list.loading ? <Loading />
            : list.error ? <ErrorState message={list.error} onRetry={list.retry} />
            : dq ? <EmptyState icon="search" title={d.common.notFound} message={tr(d.products.notFoundMsg, { q: dq })} />
            : <EmptyState icon="cube-outline" title={tr(d.products.emptyTitle, { item: t?.item ?? d.terms.item })} message={d.products.emptyMsg} actionTitle={t?.addItem ?? d.terms.addItem} onAction={() => router.push('/product-new')} />
        }
        ListFooterComponent={list.loadingMore ? <ActivityIndicator color={c.tint} style={{ marginVertical: 16 }} /> : null}
        renderItem={({ item, index }) => {
          const code = codeOf(item);
          return (
            <Cell
              sep={index > 0}
              style={listCellStyle(c, index, list.items.length)}
              icon="cube"
              iconColor={item.available > 0 ? c.sq.b : c.sq.g}
              title={item.name}
              subtitle={code ?? (item.trackQuantity ? d.products.tracked : undefined)}
              right={
                <AmountColumn amount={fmtMoney(item.salePrice)}>
                  {item.available > 0
                    ? <Pill label={item.trackQuantity ? tr(d.common.pcs, { n: fmtMoney(item.available) }) : d.products.inSale} tone="ok" />
                    : <Pill label={d.products.soldOut} tone="bad" />}
                </AmountColumn>
              }
              chevron
              onPress={() => router.push(`/product/${item.id}`)}
            />
          );
        }}
      />
    </Screen>
  );
}
