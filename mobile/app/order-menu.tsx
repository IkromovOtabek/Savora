import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, ScrollView, Pressable, Image, Alert, RefreshControl, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { errMsg } from '@/lib/api';
import { fileUri } from '@/lib/catalog';
import { useTheme, tabular, HAIRLINE } from '@/lib/theme';
import { fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import { useDict, tr } from '@/lib/i18n';
import {
  restaurantApi, isNetErr, errCode, failedOf, getCart, setCart, addToCart, lineTotal, cartTotal, cartCount,
  groupBounds, invalidGroup,
  type Menu, type MenuItem, type MenuGroup, type CartLine, type OrderView, type SendFailure,
} from '@/lib/restaurant';
import {
  Screen, NavBar, SearchField, Cell, AmountColumn, Pill, Button, Field, Stepper, Group, Sheet, IconSquare, listCellStyle,
  Loading, ErrorState, EmptyState, InlineError, useLayout,
} from '@/components/ui';

const ADD_CHUNK = 50; // server: bitta so'rovda ≤ 50 taom

const soldOut = (m: MenuItem) => m.available !== null && m.available <= 0;
const blocked = (m: MenuItem) => m.stopListed || soldOut(m);

/**
 * Menyu va savat (ofitsant): kategoriya, qidiruv, modifikator varag'i, miqdor, izoh → «Oshxonaga yuborish».
 * Har savat qatorining `key` i server uchun `clientItemId` — takroriy yuborish dublikat bermaydi.
 */
export default function OrderMenu() {
  const params = useLocalSearchParams<{ orderId: string; branchId?: string; title?: string }>();
  const orderId = String(params.orderId ?? '');
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const r = d.restaurant;
  const L = useLayout();

  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      setMenu(await restaurantApi.menu(params.branchId || null));
      setError(null);
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [params.branchId]);
  useEffect(() => { load('initial'); }, [load]);

  /* ───── savat (buyurtma bo'yicha xotirada) ───── */
  const [cart, setCartState] = useState<CartLine[]>(() => getCart(orderId));
  const cartRef = useRef(cart);
  const updateCart = useCallback((fn: (cur: CartLine[]) => CartLine[]) => {
    const next = fn(cartRef.current);
    cartRef.current = next;
    setCart(orderId, next);
    setCartState(next);
  }, [orderId]);
  const qtyInCart = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
    return m;
  }, [cart]);

  /* ───── taom varag'i (modifikator, miqdor, izoh) ───── */
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);

  function openItem(m: MenuItem) {
    setSheetItem(m); setPicked(new Set()); setQty(1); setNote(''); setTried(false);
  }

  function quickAdd(m: MenuItem) {
    if (blocked(m)) return;
    if (m.modifierGroups.length) { openItem(m); return; }
    updateCart((cur) => addToCart(cur, { productId: m.id, name: m.name, unitPrice: m.price, qty: 1, optionIds: [], optionNames: [], note: '' }));
  }

  function toggle(g: MenuGroup, optionId: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      const inGroup = g.options.filter((o) => next.has(o.id)).map((o) => o.id);
      const { max } = groupBounds(g);
      if (next.has(optionId)) { next.delete(optionId); return next; }
      if (max === 1) inGroup.forEach((id) => next.delete(id)); // bitta tanlov — almashtiramiz
      else if (inGroup.length >= max) return cur;               // ko'p tanlov — chegarada qo'shilmaydi
      next.add(optionId);
      return next;
    });
  }

  const sheetPrice = sheetItem
    ? sheetItem.price + sheetItem.modifierGroups.flatMap((g) => g.options).filter((o) => picked.has(o.id)).reduce((s, o) => s + o.price, 0)
    : 0;
  const badGroup = sheetItem ? invalidGroup(sheetItem.modifierGroups, picked) : null;

  function addFromSheet() {
    if (!sheetItem) return;
    setTried(true);
    if (badGroup) return;
    // Tanlov tartibi menyudagidek (bir xil taomni savatda birlashtirish uchun)
    const opts = sheetItem.modifierGroups.flatMap((g) => g.options).filter((o) => picked.has(o.id));
    updateCart((cur) => addToCart(cur, {
      productId: sheetItem.id,
      name: sheetItem.name,
      unitPrice: sheetPrice,
      qty,
      optionIds: opts.map((o) => o.id),
      optionNames: opts.map((o) => o.name),
      note: note.trim(),
    }));
    setSheetItem(null);
  }

  /* ───── yuborish ───── */
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusyState] = useState<'send' | 'save' | null>(null);
  const busyRef = useRef(false); // bir kadrdagi ikki bosish — bitta so'rov
  const setBusy = (v: 'send' | 'save' | null) => { busyRef.current = !!v; setBusyState(v); };

  function showFailed(failed: SendFailure[]) {
    if (failed.length) Alert.alert(r.sendFailedTitle, failed.map((f) => `• ${f.message || f.name}`).join('\n'));
  }

  async function submit(send: boolean) {
    const lines = cartRef.current;
    if (busyRef.current || !lines.length || !orderId) return;
    setBusy(send ? 'send' : 'save');
    let order: OrderView | null = null;
    try {
      // 1) Buyurtmaga qo'shish — clientItemId bo'yicha idempotent (timeout'dan keyin qayta bosish xavfsiz)
      for (let i = 0; i < lines.length; i += ADD_CHUNK) {
        const chunk = lines.slice(i, i + ADD_CHUNK);
        const res = await restaurantApi.op<{ order: OrderView; added: string[]; duplicates: string[] }>(orderId, {
          op: 'addItems',
          items: chunk.map((l) => ({
            clientItemId: l.key,
            productId: l.productId,
            qty: l.qty,
            ...(l.optionIds.length ? { optionIds: l.optionIds } : {}),
            ...(l.note ? { note: l.note } : {}),
          })),
        });
        order = res.order;
        const done = new Set(chunk.map((l) => l.key));
        updateCart((cur) => cur.filter((l) => !done.has(l.key)));
      }
    } catch (e) {
      // Savatdagi qolgan qatorlar (kalitlari bilan) saqlanadi — qayta bosish dublikat bermaydi
      Alert.alert(d.common.error, isNetErr(e) ? r.netError : errMsg(e));
      // Stop-list / tugagan taom — menyudagi belgilarni yangilaymiz (savatdan olib tashlash oson bo'lsin)
      if (!isNetErr(e)) void load('initial');
      setBusy(null);
      return;
    }

    // 2) Oshxonaga — faqat shu savatdan qo'shilgan va hali yuborilmaganlar
    if (send && order) {
      const keys = new Set(lines.map((l) => l.key));
      const ids = order.items.filter((i) => i.clientItemId && keys.has(i.clientItemId) && i.status === 'new').map((i) => i.id);
      if (ids.length) {
        try {
          const res = await restaurantApi.op<{ order: OrderView; sent: string[]; failed: SendFailure[] }>(orderId, { op: 'send', itemIds: ids });
          showFailed(res.failed ?? []);
        } catch (e) {
          const code = errCode(e);
          if (code === 'sendFailed') showFailed(failedOf(e));
          else if (code !== 'nothingToSend') Alert.alert(r.addedOk, isNetErr(e) ? r.addedNotSent : `${r.addedNotSent}\n\n${errMsg(e)}`);
        }
      }
    }
    setBusy(null);
    setCartOpen(false);
    if (router.canGoBack()) router.back();
    else router.replace(`/order/${orderId}`);
  }

  /* ───── ro'yxat ───── */
  const items = useMemo(() => {
    const all = menu?.items ?? [];
    const s = q.trim().toLowerCase();
    if (s) return all.filter((m) => m.name.toLowerCase().includes(s));
    return cat === 'all' ? all : all.filter((m) => m.category === cat);
  }, [menu, cat, q]);

  const total = cartTotal(cart);
  const count = cartCount(cart);
  const title = params.title || r.menuTitle;

  const top = (
    <View style={[L.content, { gap: 10, paddingTop: 4, paddingBottom: 10 }]}>
      <Text style={[s.h1, { color: c.ink }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      <SearchField value={q} onChangeText={setQ} placeholder={r.searchPh} />
      {menu && menu.categories.length > 0 && !q.trim() ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cats} keyboardShouldPersistTaps="handled">
          {['all', ...menu.categories].map((k) => {
            const on = k === cat;
            return (
              <Pressable
                key={k}
                onPress={() => setCat(k)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [s.cat, { backgroundColor: on ? c.tintFill : c.fill }, pressed && { opacity: 0.5 }]}
              >
                <Text style={[s.catT, { color: on ? c.onTint : c.ink }]} numberOfLines={1}>{k === 'all' ? d.common.all : k}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  const thumb = (m: MenuItem) => m.photoUrl
    ? <Image source={{ uri: fileUri(m.photoUrl) }} style={[s.thumb, { backgroundColor: c.fill2 }]} />
    : <IconSquare icon="restaurant" color={blocked(m) ? c.sq.g : c.sq.p} />;

  return (
    <Screen scroll={false} header={<NavBar backLabel={d.common.back} />}>
      {top}
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[L.content, { paddingBottom: 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={c.tint} colors={[c.tint]} />}
        ListHeaderComponent={error && menu ? <View style={{ paddingBottom: 10 }}><InlineError message={error} onRetry={() => load('refresh')} /></View> : null}
        ListEmptyComponent={
          loading ? <Loading />
            : !menu ? <ErrorState message={error} onRetry={() => { setLoading(true); load('initial'); }} />
            : q.trim() ? <EmptyState icon="search" title={tr(r.notFound, { q: q.trim() })} />
            : <EmptyState icon="restaurant-outline" title={r.noMenu} message={r.noMenuMsg} />
        }
        renderItem={({ item: m, index }) => {
          const inCart = qtyInCart.get(m.id) ?? 0;
          const off = blocked(m);
          const sub = [
            m.modifierGroups.length ? m.modifierGroups.map((g) => g.name).join(', ') : null,
            m.available !== null && m.available > 0 && m.available <= 10 ? tr(r.leftN, { n: fmtQty(m.available) }) : null,
          ].filter(Boolean).join(' · ');
          return (
            <Cell
              sep={index > 0}
              style={listCellStyle(c, index, items.length)}
              left={thumb(m)}
              title={m.name}
              titleLines={2}
              subtitle={sub || undefined}
              right={
                <AmountColumn amount={fmtMoney(m.price)} color={off ? c.ink3 : undefined}>
                  {m.stopListed ? <Pill label={r.stopList} tone="bad" />
                    : soldOut(m) ? <Pill label={r.soldOut} tone="bad" />
                    : inCart ? <Pill label={`× ${fmtQty(inCart)}`} tone="br" /> : null}
                </AmountColumn>
              }
              disabled={off}
              onPress={() => quickAdd(m)}
              onLongPress={off ? undefined : () => openItem(m)}
              accessibilityLabel={[m.name, fmtMoney(m.price, { suffix: true }), m.stopListed ? r.stopList : soldOut(m) ? r.soldOut : ''].filter(Boolean).join(', ')}
            />
          );
        }}
      />

      {/* Savat paneli */}
      <View style={[s.bar, { backgroundColor: c.bg, borderTopColor: c.sep, paddingBottom: L.insets.bottom + 10 }]}>
        <View style={L.content}>
          <Button
            title={count ? tr(r.cartN, { n: fmtQty(count) }) : r.cartEmpty}
            icon="cart"
            value={count ? fmtMoney(total) : undefined}
            size="lg"
            full
            disabled={!count}
            onPress={() => setCartOpen(true)}
          />
        </View>
      </View>

      {/* Taom varag'i */}
      <Sheet
        visible={!!sheetItem}
        onClose={() => setSheetItem(null)}
        title={sheetItem?.name ?? ''}
        subtitle={sheetItem ? fmtMoney(sheetItem.price, { suffix: true }) : undefined}
        footer={<Button title={r.addToCart} value={fmtMoney(lineTotal({ unitPrice: sheetPrice, qty }))} size="lg" full onPress={addFromSheet} />}
      >
        {sheetItem?.modifierGroups.map((g) => {
          const b = groupBounds(g);
          const n = g.options.filter((o) => picked.has(o.id)).length;
          const bad = tried && (n < b.min || n > b.max);
          const hint = [
            g.required || b.min > 0 ? r.required : null,
            b.max === 1 ? r.pickOne : b.min > 1 && b.min !== b.max ? tr(r.pickRange, { min: b.min, max: b.max }) : tr(r.pickUpTo, { n: b.max }),
          ].filter(Boolean).join(' · ');
          return (
            <View key={g.id} style={{ gap: 6 }}>
              <View style={s.gHead}>
                <Text style={[s.gName, { color: bad ? c.bad : c.ink }]}>{g.name}</Text>
                <Text style={[s.gHint, { color: bad ? c.bad : c.ink3 }]}>{hint}</Text>
              </View>
              <Group>
                {g.options.map((o) => (
                  <Cell
                    key={o.id}
                    title={o.name}
                    value={o.price > 0 ? `+${fmtMoney(o.price)}` : undefined}
                    checked={picked.has(o.id)}
                    onPress={() => toggle(g, o.id)}
                  />
                ))}
              </Group>
            </View>
          );
        })}
        {tried && badGroup ? <Text style={[s.err, { color: c.bad }]}>{tr(r.pickGroup, { g: badGroup })}</Text> : null}
        <Group>
          <Cell title={d.common.qty} right={<Stepper value={qty} onChange={setQty} min={1} max={99} />} />
        </Group>
        <Field label={r.noteLabel} value={note} onChangeText={setNote} placeholder={r.notePh} maxLength={200} />
      </Sheet>

      {/* Savat */}
      <Sheet
        visible={cartOpen}
        onClose={() => setCartOpen(false)}
        closeLabel={d.common.close}
        title={r.cart}
        subtitle={title}
        footer={cart.length ? (
          <>
            <Button title={r.send} icon="flame" value={fmtMoney(total)} size="lg" full loading={busy === 'send'} disabled={!!busy} onPress={() => { void submit(true); }} />
            <Button title={r.saveOnly} variant="gray" full loading={busy === 'save'} disabled={!!busy} onPress={() => { void submit(false); }} />
          </>
        ) : undefined}
      >
        {cart.length === 0 ? <EmptyState icon="cart-outline" title={r.cartEmpty} /> : (
          <Group>
            {cart.map((l) => (
              <Cell
                key={l.key}
                title={l.name}
                titleLines={2}
                subtitle={[l.optionNames.join(', '), l.note ? `«${l.note}»` : null, fmtMoney(lineTotal(l), { suffix: true })].filter(Boolean).join(' · ')}
                subtitleLines={3}
                right={
                  <Stepper
                    value={l.qty}
                    min={0}
                    max={99}
                    onChange={(v) => updateCart((cur) => (v <= 0 ? cur.filter((x) => x.key !== l.key) : cur.map((x) => (x.key === l.key ? { ...x, qty: v } : x))))}
                  />
                }
              />
            ))}
          </Group>
        )}
        {cart.length ? (
          <View style={[s.totalRow, { borderTopColor: c.sep }]}>
            <Text style={[s.totalL, { color: c.ink2 }]}>{d.common.total}</Text>
            <Text style={[s.totalV, tabular, { color: c.ink }]}>{fmtMoney(total, { suffix: true })}</Text>
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7 },
  cats: { gap: 8, paddingRight: 8 },
  cat: { minHeight: 40, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  catT: { fontSize: 15, fontWeight: '600' },
  thumb: { width: 46, height: 46, borderRadius: 14 },
  bar: { paddingTop: 10, borderTopWidth: HAIRLINE },
  gHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingHorizontal: 4 },
  gName: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, flexShrink: 1 },
  gHint: { fontSize: 13, fontWeight: '600' },
  err: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingHorizontal: 4, borderTopWidth: HAIRLINE },
  totalL: { fontSize: 16, fontWeight: '600' },
  totalV: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
});
