import { useCallback, useEffect, useRef, useState } from 'react';
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
import { qtyWithUnit } from '@/lib/qty';
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

  // Sahifa yangi ma'lumot olganda savatdagi qator ham shu qoldiq/narx bilan moslanadi
  // (qoldiq kamaygan bo'lsa — savatdagi miqdor ham tushadi, stepper chegarasi bilan bir xil bo'ladi)
  const cartRef = useRef(cart);
  cartRef.current = cart;
  useEffect(() => {
    const fresh = q.data?.item;
    const n = fresh ? cartRef.current.qtyOf(fresh.id) : 0;
    if (fresh && n > 0) cartRef.current.put(fresh, n);
  }, [q.data]);

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
  const units = d.productFields.units;
  // Savatda bor bo'lsa — stepper SAVATDAGI miqdorni ko'rsatadi va o'zgartiradi (qaytib kirganda ham 6 → 6);
  // yo'q bo'lsa — qo'shiladigan miqdorni tanlaydi. Ikkalasi ham qoldiqdan oshmaydi.
  const inCart = Math.min(cart.qtyOf(it.id), it.qty);
  const value = inCart > 0 ? inCart : Math.min(qty, it.qty);
  const atMax = it.qty > 0 && value >= it.qty - 1e-9;
  const notes = [
    inCart > 0 ? tr(m.product.inCart, { qty: qtyWithUnit(inCart, it.unit, units) }) : '',
    atMax ? tr(m.product.onlyLeft, { qty: qtyWithUnit(it.qty, it.unit, units) }) : '',
  ].filter(Boolean).join(' · ');

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, w));
    if (i !== slide) setSlide(i);
  }

  function change(v: number) {
    if (!it) return;
    if (inCart > 0) cart.put(it, v);
    else setQty(v);
  }

  function add() {
    if (!it || !(value > 0)) return;
    cart.put(it, value);
  }

  function removeFromCart() {
    if (!it) return;
    cart.remove(it.id);
    setQty(1);
  }

  const footer = it.qty > 0 ? (
    <View style={{ gap: 8 }}>
      {notes ? <Text style={[s.note, tabular, { color: atMax ? c.warn : c.ink3, textAlign: 'center' }]}>{notes}</Text> : null}
      <View style={s.buy}>
        <QtyStepper
          value={value}
          max={it.qty}
          fractional={it.fractional}
          onChange={change}
          onRemove={inCart > 0 ? removeFromCart : undefined}
          style={{ width: 132, minHeight: 50 }}
        />
        {inCart > 0 ? (
          <Button title={m.product.goCart} icon="cart" variant="tinted" size="lg" onPress={() => router.push('/market/cart')} style={{ flex: 1 }} />
        ) : (
          <Button title={m.product.addToCart} icon="cart-outline" size="lg" onPress={add} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  ) : (
    <Button title={m.catalog.soldOut} variant="gray" size="lg" full disabled />
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
