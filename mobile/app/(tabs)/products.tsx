import { useCallback, useRef, useState } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useDebounced, usePaged } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney } from '@/lib/format';
import {
  Screen, useLayout, LargeTitle, SearchField, Cell, AmountColumn, Pill, IconButton, listCellStyle,
  Loading, EmptyState, ErrorState, InlineError,
} from '@/components/ui';

interface Product {
  id: string; name: string; imei: string; barcode: string | null;
  salePrice: number; purchasePrice: number; status: string; trackQuantity: boolean; available: number;
}

export default function Products() {
  const router = useRouter();
  const { me } = useAuth();
  const { c } = useTheme();
  const L = useLayout();
  const t = me?.terms;
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);

  const list = usePaged<Product>(`/api/mobile/products?q=${encodeURIComponent(dq)}`);
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } list.reloadSilently(); }, [list.reloadSilently]));

  const codeOf = (p: Product) =>
    p.imei && !p.imei.startsWith('SVR-') ? p.imei : p.barcode ? p.barcode : null;

  const header = (
    <View style={{ gap: 12, paddingBottom: 14 }}>
      <LargeTitle
        title={t?.items ?? 'Ombor'}
        subtitle={list.loading && list.items.length === 0 ? ' ' : `${fmtMoney(list.total)} ta`}
        actions={
          <>
            <IconButton icon="barcode-outline" label="Skaner" onPress={() => router.push('/scan')} />
            <IconButton icon="add" label={t?.addItem ?? 'Mahsulot qo\'shish'} onPress={() => router.push('/product-new')} />
          </>
        }
      />
      <SearchField
        value={q}
        onChangeText={setQ}
        placeholder={`Nomi yoki ${(t?.codeLabel ?? 'kod').toLowerCase()}`}
        right={list.loading && list.items.length > 0 ? <ActivityIndicator size="small" color={c.ink3} /> : null}
      />
      {list.error && list.items.length > 0 ? <InlineError message={list.error} onRetry={list.refresh} /> : null}
    </View>
  );

  return (
    <Screen scroll={false}>
      <FlatList
        data={list.items}
        keyExtractor={(it) => it.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[L.content, { paddingTop: 8, paddingBottom: L.bottom }]}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={c.tint} colors={[c.tint]} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          list.loading ? <Loading />
            : list.error ? <ErrorState message={list.error} onRetry={list.retry} />
            : dq ? <EmptyState icon="search" title="Topilmadi" message={`«${dq}» bo'yicha hech narsa yo'q.`} />
            : <EmptyState icon="cube-outline" title={`${t?.item ?? 'Mahsulot'} yo'q`} message="Birinchisini qo'shing yoki shtrix kodni skaner qiling." actionTitle={t?.addItem ?? 'Mahsulot qo\'shish'} onAction={() => router.push('/product-new')} />
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
              subtitle={code ?? (item.trackQuantity ? 'Miqdorli' : undefined)}
              right={
                <AmountColumn amount={fmtMoney(item.salePrice)}>
                  {item.available > 0
                    ? <Pill label={item.trackQuantity ? `${fmtMoney(item.available)} dona` : 'Sotuvda'} tone="ok" />
                    : <Pill label="Tugagan" tone="bad" />}
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
