import React, { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Text } from '@/components/ui/Text';
import {
  Screen, useLayout, TopBar, SearchField, SegmentedControl, Button, Loading, EmptyState, ErrorState, InlineError,
} from '@/components/ui';
import { api, errMsg } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { useTheme, tabular, MAX_CONTENT } from '@/lib/theme';
import { tr } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';
import { useMarketDict, type MarketDict } from '@/lib/marketI18n';
import { useMarketCart } from '@/lib/marketCart';
import { discountPct, type ListingCard, type ListingsResp, type MarketSort } from '@/lib/market';
import { AccountButton, CartButton, QtyStepper, Thumb } from './parts';

const GAP = 12;

interface CatalogProps {
  /** Faqat shu do'kon tovarlari (do'kon sahifasi) */
  shop?: string;
  title: string;
  subtitle?: string;
  /** Sarlavha chapidagi element (logo yoki orqaga tugmasi) */
  left?: ReactNode;
  /** Sarlavha ostidagi qo'shimcha (biznes kirish havolasi) */
  extra?: ReactNode;
  /** Ro'yxat tepasidagi blok (do'kon shartlari) */
  listHeader?: ReactNode;
}

/** Narx matni: «12 000 so'm» yoki «12 000 so'm dan» (nusxalar narxi har xil) */
export function priceLabel(m: MarketDict, price: number, from: boolean): string {
  const p = fmtMoney(price, { suffix: true });
  return from ? tr(m.priceFrom, { price: p }) : p;
}

/**
 * Savora Market katalogi: qidiruv, turkumlar, saralash, 2 ustunli to'r (sahifalab yuklanadi).
 * Bozor ekrani (app/market), biznes «Bozor» tabi va do'kon sahifasi shu komponentni ishlatadi.
 * Ochiq ma'lumot — tokensiz so'rov, telefonda saqlanmaydi (meta.persist: false).
 */
export function Catalog({ shop, title, subtitle, left, extra, listHeader }: CatalogProps) {
  const { c } = useTheme();
  const L = useLayout();
  const m = useMarketDict();
  const router = useRouter();
  const cart = useMarketCart();
  const qc = useQueryClient();

  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 350);
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState<MarketSort>('new');

  const qs = [
    `sort=${sort}`,
    dq ? `q=${encodeURIComponent(dq)}` : '',
    cat ? `c=${encodeURIComponent(cat)}` : '',
    shop ? `shop=${encodeURIComponent(shop)}` : '',
  ].filter(Boolean).join('&');
  const key = useMemo(() => ['market', 'listings', qs], [qs]);
  // Foydalanuvchi o'zi tortib yangiladi — oflayn holatda ham tarmoqqa chiqiladi
  const force = useRef(false);

  const list = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => {
      const f = force.current;
      force.current = false;
      return api<ListingsResp>(`/api/market/listings?${qs}&page=${pageParam}`, { token: null, force: f });
    },
    initialPageParam: 1,
    getNextPageParam: (last: ListingsResp) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    meta: { persist: false },
  });

  const cats = useQuery({
    queryKey: ['market', 'categories', shop ?? ''],
    queryFn: () => api<{ items: { name: string; count: number }[] }>(
      `/api/market/categories${shop ? `?shop=${encodeURIComponent(shop)}` : ''}`, { token: null },
    ),
    meta: { persist: false },
  });

  const pages = list.data?.pages;
  const items = useMemo(() => {
    const out: ListingCard[] = [];
    const seen = new Set<string>();
    // Sahifalar orasida siljish bo'lsa (yangi tovar qo'shildi) — takror chiqmasin
    for (const p of pages ?? []) for (const it of p.items) if (!seen.has(it.id)) { seen.add(it.id); out.push(it); }
    return out;
  }, [pages]);
  const total = pages?.length ? pages[pages.length - 1].total : 0;
  const loading = list.isPending || list.isPlaceholderData;
  const error = list.error ? errMsg(list.error) : null;

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Faqat 1-sahifadan qayta boshlaymiz (aks holda yuklangan barcha sahifalar qayta so'raladi)
      const data = qc.getQueryData<InfiniteData<ListingsResp, number>>(key);
      if (data && data.pages.length > 1) {
        qc.setQueryData<InfiniteData<ListingsResp, number>>(key, { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) });
      }
      force.current = true;
      await Promise.all([list.refetch(), cats.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [qc, key, list, cats]);

  const loadMore = useCallback(() => {
    if (!list.hasNextPage || list.isFetchingNextPage || loading) return;
    void list.fetchNextPage({ cancelRefetch: false });
  }, [list, loading]);

  // Karta kengligi: kontent kengligi (planshetda chegaralangan) ikkiga bo'linadi
  const cardW = Math.floor((Math.min(L.width, MAX_CONTENT) - L.padX * 2 - GAP) / 2);
  const catItems = cats.data?.items ?? [];

  const bar = (
    <TopBar title={title} subtitle={subtitle} left={left} profile={false} actions={<><CartButton /><AccountButton /></>}>
      {extra}
      <SearchField
        value={q}
        onChangeText={setQ}
        placeholder={m.catalog.searchPh}
        right={loading && items.length > 0 ? <ActivityIndicator size="small" color={c.ink3} /> : null}
      />
    </TopBar>
  );

  const header = (
    <View style={{ gap: 12, paddingBottom: 14 }}>
      {listHeader}
      {catItems.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -L.padX }}
          contentContainerStyle={{ paddingHorizontal: L.padX, gap: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {[{ name: '', count: 0 }, ...catItems].map((it) => {
            const on = it.name === cat;
            return (
              <Pressable
                key={it.name || '__all'}
                onPress={() => setCat(it.name)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [s.chip, { backgroundColor: on ? c.tintFill : c.fill }, pressed && { opacity: 0.5 }]}
              >
                <Text style={[s.chipT, { color: on ? c.onTint : c.ink }]} numberOfLines={1}>{it.name || m.catalog.all}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <SegmentedControl<MarketSort>
        options={[
          { key: 'new', label: m.catalog.sort.new },
          { key: 'cheap', label: m.catalog.sort.cheap },
          { key: 'expensive', label: m.catalog.sort.expensive },
        ]}
        value={sort}
        onChange={setSort}
      />
      {items.length > 0 ? (
        <Text style={[s.count, tabular, { color: c.ink3 }]}>{tr(m.catalog.results, { n: fmtMoney(total) })}</Text>
      ) : null}
      {error && items.length > 0 ? <InlineError message={error} onRetry={refresh} /> : null}
    </View>
  );

  return (
    <Screen scroll={false} bar={bar}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        numColumns={2}
        columnWrapperStyle={{ gap: GAP }}
        ItemSeparatorComponent={Sep}
        extraData={cart.items}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[L.content, { paddingTop: 14, paddingBottom: L.bottom }]}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.tint} colors={[c.tint]} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          loading ? <Loading />
            : error ? <ErrorState message={error} onRetry={refresh} />
            : <EmptyState icon={dq ? 'search' : 'storefront-outline'} title={m.catalog.emptyTitle} message={dq || cat ? m.catalog.emptySearch : m.catalog.empty} />
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={c.tint} style={{ marginVertical: 16 }} /> : null}
        renderItem={({ item }) => (
          <ProductCard
            item={item}
            width={cardW}
            inCart={cart.qtyOf(item.id)}
            onOpen={() => router.push(`/market/p/${item.id}`)}
            onAdd={() => cart.add(item, 1)}
            // Kartochkadagi yangi qoldiq bilan — savat qatoridagi eski chegara «+» ni jimgina to'xtatmasin
            onQty={(v) => cart.put(item, v)}
            onRemove={() => cart.remove(item.id)}
          />
        )}
      />
    </Screen>
  );
}

const Sep = () => <View style={{ height: 14 }} />;

function ProductCard({ item, width, inCart, onOpen, onAdd, onQty, onRemove }: {
  item: ListingCard; width: number; inCart: number;
  onOpen: () => void; onAdd: () => void; onQty: (v: number) => void; onRemove: () => void;
}) {
  const { c, dark } = useTheme();
  const m = useMarketDict();
  const pct = discountPct(item.price, item.oldPrice);
  const soldOut = !(item.qty > 0);
  return (
    <View style={[s.card, { width, backgroundColor: c.cell }, !dark && s.cardShadow]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${priceLabel(m, item.price, item.priceFrom)}`}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
      >
        <View>
          <Thumb uri={item.image} radius={16} />
          {pct > 0 ? (
            <View style={[s.disc, { backgroundColor: c.bad }]}>
              <Text style={[s.discT, tabular]}>{tr(m.discount, { n: pct })}</Text>
            </View>
          ) : null}
        </View>
        <View style={s.body}>
          <Text style={[s.price, tabular, { color: c.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {priceLabel(m, item.price, item.priceFrom)}
          </Text>
          {pct > 0 && item.oldPrice ? (
            <Text style={[s.old, tabular, { color: c.ink3 }]} numberOfLines={1}>{fmtMoney(item.oldPrice, { suffix: true })}</Text>
          ) : null}
          <Text style={[s.name, { color: c.ink }]} numberOfLines={2}>{item.name}</Text>
          <Text style={[s.shop, { color: c.ink3 }]} numberOfLines={1}>{item.shopName}</Text>
        </View>
      </Pressable>
      <View>
        {soldOut ? (
          <Button title={m.catalog.soldOut} size="sm" variant="gray" disabled full />
        ) : inCart > 0 ? (
          <QtyStepper value={inCart} max={item.qty} fractional={item.fractional} onChange={onQty} onRemove={onRemove} />
        ) : (
          <Button title={m.catalog.addToCart} icon="cart-outline" size="sm" variant="tinted" full onPress={onAdd} style={{ minHeight: 36 }} />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', maxWidth: 220 },
  chipT: { fontSize: 14, fontWeight: '600' },
  count: { fontSize: 13.5, fontWeight: '600', paddingHorizontal: 4 },
  // Qatordagi ikki karta bir xil balandlikda — tugmalar pastda bir chiziqda
  card: { borderRadius: 20, padding: 8, gap: 8, justifyContent: 'space-between' },
  cardShadow: { shadowColor: '#0D1526', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  disc: { position: 'absolute', top: 8, left: 8, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  discT: { color: '#fff', fontSize: 12, fontWeight: '800' },
  body: { paddingHorizontal: 4, paddingTop: 8, gap: 2 },
  price: { fontSize: 16.5, fontWeight: '800', letterSpacing: -0.3 },
  old: { fontSize: 13, fontWeight: '500', textDecorationLine: 'line-through' },
  name: { fontSize: 14.5, fontWeight: '600', lineHeight: 19, minHeight: 38, marginTop: 2 },
  shop: { fontSize: 12.5, fontWeight: '500' },
});
