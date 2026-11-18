import { useCallback, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import {
  Screen, NavBar, useLayout, Group, Cell, Button, Pill, Loading, EmptyState, ErrorState,
} from '@/components/ui';
import { api, ApiError, errMsg } from '@/lib/api';
import { useTheme, tabular, MAX_CONTENT } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';
import { fmtQty, qtyWithUnit, roundQty } from '@/lib/qty';
import { useMarketDict } from '@/lib/marketI18n';
import { useMarketCart } from '@/lib/marketCart';
import { discountPct, type ListingDetail } from '@/lib/market';
import { priceLabel } from '@/components/market/Catalog';
import { CartButton, QtyStepper, Thumb } from '@/components/market/parts';

/** Savora Market: tovar sahifasi — rasmlar, narx, qoldiq, savatga qo'shish, do'kon, tavsif. */
export default function MarketProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = useMarketDict();
  const d = useDict();
  const { c } = useTheme();
  const L = useLayout();
  const router = useRouter();
  const cart = useMarketCart();
  const force = useRef(false);

  const q = useQuery({
    queryKey: ['market', 'listing', id ?? ''],
    queryFn: () => {
      const f = force.current;
      force.current = false;
      return api<{ item: ListingDetail }>(`/api/market/listings/${encodeURIComponent(String(id))}`, { token: null, force: f });
    },
    enabled: !!id,
    meta: { persist: false },
  });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    force.current = true;
    try { await q.refetch(); } finally { setRefreshing(false); }
  }, [q]);

  const [qty, setQty] = useState(1);
  const [slide, setSlide] = useState(0);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/market'));
  const header = <NavBar onBack={back} right={<CartButton />} />;
  const it = q.data?.item;

  if (!it) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Screen header={header}>
        {q.isPending && !q.error ? <Loading />
          : notFound ? <EmptyState icon="pricetag-outline" title={d.common.notFound} message={m.product.notFound} actionTitle={m.cart.toCatalog} onAction={back} />
          : <ErrorState message={q.error ? errMsg(q.error) : null} onRetry={refresh} />}
      </Screen>
    );
  }

  const images = it.images?.length ? it.images : it.image ? [it.image] : [];
  const w = Math.min(L.width, MAX_CONTENT) - L.padX * 2;
  const pct = discountPct(it.price, it.oldPrice);
  const inCart = cart.qtyOf(it.id);
  // Savatga yana qancha qo'shish mumkin (qoldiq − savatdagi)
  const room = Math.max(0, roundQty(it.qty - inCart));
  const pick = Math.min(qty, room);
  const units = d.productFields.units;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, w));
    if (i !== slide) setSlide(i);
  }

  function add() {
    if (!it || !(pick > 0)) return;
    cart.add(it, pick);
    setQty(1);
  }

  const footer = (
    <View style={{ gap: 10 }}>
      {inCart > 0 ? (
        <Button
          title={`${tr(m.product.inCart, { qty: fmtQty(inCart) })} · ${m.product.goCart}`}
          icon="cart"
          variant="tinted"
          size="lg"
          full
          onPress={() => router.push('/market/cart')}
        />
      ) : null}
      {room > 0 ? (
        <View style={s.buy}>
          <QtyStepper value={pick} max={room} fractional={it.fractional} onChange={setQty} style={{ width: 132, minHeight: 50 }} />
          <Button title={m.product.addToCart} icon="cart-outline" size="lg" onPress={add} style={{ flex: 1 }} />
        </View>
      ) : it.qty > 0 ? (
        <Text style={[s.note, { color: c.ink3, textAlign: 'center' }]}>{m.product.allInCart}</Text>
      ) : (
        <Button title={m.catalog.soldOut} variant="gray" size="lg" full disabled />
      )}
    </View>
  );

  return (
    <Screen header={header} footer={footer} refreshing={refreshing} onRefresh={refresh} gap={16}>
      {/* Rasmlar — gorizontal sahifalab */}
      <View>
        {images.length > 1 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
            style={{ width: w, borderRadius: 22, overflow: 'hidden' }}
          >
            {images.map((u, i) => (
              <Thumb key={`${u}-${i}`} uri={u} size={w} radius={0} />
            ))}
          </ScrollView>
        ) : (
          <Thumb uri={images[0]} size={w} radius={22} />
        )}
        {pct > 0 ? (
          <View style={[s.disc, { backgroundColor: c.bad }]}>
            <Text style={[s.discT, tabular]}>{tr(m.discount, { n: pct })}</Text>
          </View>
        ) : null}
        {images.length > 1 ? (
          <View style={s.dots} accessibilityLabel={tr(m.product.photo, { n: slide + 1, total: images.length })}>
            {images.map((_, i) => (
              <View key={i} style={[s.dot, { backgroundColor: i === slide ? c.tint : c.fill3, width: i === slide ? 18 : 7 }]} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[s.name, { color: c.ink }]} accessibilityRole="header">{it.name}</Text>
        <View style={s.priceRow}>
          <Text style={[s.price, tabular, { color: c.ink }]}>{priceLabel(m, it.price, it.priceFrom)}</Text>
          {pct > 0 && it.oldPrice ? (
            <Text style={[s.old, tabular, { color: c.ink3 }]}>{fmtMoney(it.oldPrice, { suffix: true })}</Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {it.qty > 0
            ? <Pill label={tr(m.product.inStock, { qty: qtyWithUnit(it.qty, it.unit, units) })} tone="ok" />
            : <Pill label={m.catalog.soldOut} tone="bad" />}
        </View>
      </View>

      <Group>
        <Cell
          icon="storefront"
          iconColor={c.sq.b}
          title={it.shopName}
          subtitle={m.product.shopProducts}
          chevron
          onPress={() => router.push(`/market/shop/${encodeURIComponent(it.shopSlug)}`)}
        />
        {it.brand ? <Cell icon="ribbon" iconColor={c.sq.a} title={m.product.brand} value={it.brand} /> : null}
        {it.category ? <Cell icon="pricetags" iconColor={c.sq.p} title={m.product.category} value={it.category} /> : null}
      </Group>

      <Group header={m.product.description} icon="document-text-outline">
        <View style={{ padding: 16 }}>
          <Text style={[s.desc, { color: it.description ? c.ink2 : c.ink3 }]}>{it.description || m.product.noDescription}</Text>
        </View>
      </Group>

      <View style={[s.pay, { backgroundColor: c.okSoft }]}>
        <Ionicons name="cash-outline" size={20} color={c.ok} />
        <Text style={[s.note, { color: c.ink2, flex: 1 }]}>{m.product.payNote}</Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  disc: { position: 'absolute', top: 12, left: 12, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  discT: { color: '#fff', fontSize: 13, fontWeight: '800' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingTop: 10 },
  dot: { height: 7, borderRadius: 4 },
  name: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, lineHeight: 30 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10 },
  price: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  old: { fontSize: 16, fontWeight: '500', textDecorationLine: 'line-through' },
  desc: { fontSize: 15.5, lineHeight: 22 },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  note: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  buy: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
