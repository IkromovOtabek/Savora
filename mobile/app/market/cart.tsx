import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import {
  Screen, NavBar, LargeTitle, Group, Field, SegmentedControl, Button, Pill, EmptyState, InlineError,
} from '@/components/ui';
import { api, ApiError, errMsg } from '@/lib/api';
import { useTheme, tabular, HAIRLINE } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { priceTimesQty, qtyWithUnit } from '@/lib/qty';
import { formatUzPhoneInput } from '@/lib/phone';
import { useMarketDict } from '@/lib/marketI18n';
import { useMarketCart, type CartItem } from '@/lib/marketCart';
import { useBuyer } from '@/lib/buyer';
import type { ListingCard } from '@/lib/market';
import { priceLabel } from '@/components/market/Catalog';
import { QtyStepper, Thumb } from '@/components/market/parts';

type Delivery = 'pickup' | 'delivery';
/** Savatni server bilan qayta moslash kerak bo'lgan buyurtma xatolari */
const RESYNC_CODES = ['unavailable', 'notEnough', 'priceChanged'];

/**
 * Savora Market savati: do'konlar bo'yicha guruhlangan qatorlar, ochilganda narx/qoldiq server bilan moslanadi.
 * Xaridor kirgan bo'lsa — olish usuli, manzil, izoh va buyurtma (har do'konga alohida). To'lov — topshirishda.
 */
export default function MarketCart() {
  const m = useMarketDict();
  const { c } = useTheme();
  const router = useRouter();
  const cart = useMarketCart();
  const { buyer, request } = useBuyer();

  const [changed, setChanged] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [delivery, setDelivery] = useState<Delivery>('pickup');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [addrErr, setAddrErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Xaridorning oxirgi manzili — bir marta oldindan to'ldiriladi
  const prefilled = useRef(false);
  useEffect(() => {
    if (!buyer?.address || prefilled.current) return;
    prefilled.current = true;
    const a = buyer.address;
    setAddress((cur) => cur || a);
  }, [buyer]);

  const itemsRef = useRef(cart.items);
  itemsRef.current = cart.items;
  const cartSync = cart.sync;

  /** Narx/qoldiqni serverdan olib savatni yangilaydi; o'zgargan bo'lsa ogohlantirish chiqadi */
  const resync = useCallback(async () => {
    const ids = itemsRef.current.map((x) => x.id);
    if (!ids.length) return;
    setSyncing(true);
    try {
      const r = await api<{ items: ListingCard[] }>('/api/market/cart', { method: 'POST', token: null, body: { ids } });
      if (cartSync(r.items)) setChanged(true);
      setSyncErr(null);
    } catch (e) {
      setSyncErr(errMsg(e));
    } finally {
      setSyncing(false);
    }
  }, [cartSync]);

  // Har ochilganda (va saqlangan savat o'qilgach) — server bilan moslash
  const ready = cart.ready;
  useFocusEffect(useCallback(() => { if (ready) void resync(); }, [ready, resync]));

  const groups = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; items: CartItem[] }>();
    for (const x of cart.items) {
      const g = map.get(x.shopSlug) ?? { slug: x.shopSlug, name: x.shopName, items: [] };
      g.items.push(x);
      map.set(x.shopSlug, g);
    }
    return [...map.values()];
  }, [cart.items]);
  const live = cart.items.filter((x) => x.max > 0);
  const total = live.reduce((sum, x) => sum + priceTimesQty(x.price, x.qty), 0);
  // «…dan» narxli tovar: server nusxalarni eng arzonidan taqsimlaydi — haqiqiy jami ko'proq bo'lishi mumkin
  const totalLabel = priceLabel(m, total, live.some((x) => x.priceFrom));

  async function place() {
    if (!live.length || busy) return;
    if (delivery === 'delivery' && !address.trim()) { setAddrErr(m.checkout.addressRequired); return; }
    setAddrErr(null);
    setBusy(true);
    try {
      const r = await request<{ orders: { id: string; orderNo: string; shopName: string; total: number }[]; message: string }>('/api/market/orders', {
        method: 'POST',
        body: {
          lines: live.map((x) => ({ listingId: x.id, qty: x.qty, price: x.price })),
          delivery,
          address: delivery === 'delivery' ? address.trim() : undefined,
          note: note.trim() || undefined,
        },
      });
      cart.clear();
      setChanged(false);
      router.replace('/market/orders');
      Alert.alert(m.checkout.successTitle, r.message);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code && RESYNC_CODES.includes(e.code)) {
        await resync();
        Alert.alert(m.checkout.failTitle, e.message);
      } else if (e instanceof ApiError && e.code === 'addressRequired') {
        setAddrErr(e.message);
      } else {
        Alert.alert(m.checkout.failTitle, errMsg(e));
      }
    } finally {
      setBusy(false);
    }
  }

  const header = <NavBar onBack={() => (router.canGoBack() ? router.back() : router.replace('/market'))} />;

  if (!cart.items.length) {
    return (
      <Screen header={header}>
        <LargeTitle title={m.cart.title} />
        <EmptyState
          icon="cart-outline"
          title={m.cart.emptyTitle}
          message={m.cart.emptyMsg}
          actionTitle={m.cart.toCatalog}
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/market'))}
        />
      </Screen>
    );
  }

  const next = encodeURIComponent('/market/cart');
  const footer = buyer ? (
    <Button
      title={m.checkout.send}
      value={totalLabel}
      size="lg"
      full
      loading={busy}
      disabled={!live.length}
      onPress={place}
    />
  ) : (
    <View style={{ gap: 10 }}>
      <Text style={[s.hint, { color: c.ink3 }]}>{m.cart.loginToBuy}</Text>
      {/* Ustma-ust: «Ro'yxatdan o'tish» / «Зарегистрироваться» yarim kenglikka sig'maydi */}
      <Button title={m.cart.login} size="lg" onPress={() => router.push(`/market/login?next=${next}`)} />
      <Button title={m.cart.register} variant="tinted" size="lg" onPress={() => router.push(`/market/register?next=${next}`)} />
    </View>
  );

  return (
    <Screen header={header} footer={footer} keyboard gap={16}>
      <LargeTitle title={m.cart.title} subtitle={m.cart.perShop} />

      {changed ? (
        <View style={[s.notice, { backgroundColor: c.warnSoft }]}>
          <Ionicons name="alert-circle" size={18} color={c.warn} />
          <Text style={[s.noticeT, { color: c.warn }]}>{m.cart.changed}</Text>
        </View>
      ) : null}
      {syncErr ? <InlineError message={syncErr} onRetry={() => void resync()} /> : null}

      {groups.map((g) => (
        <Group
          key={g.slug}
          header={g.name}
          icon="storefront-outline"
          headerRight={syncing ? <ActivityIndicator size="small" color={c.ink3} /> : undefined}
        >
          {g.items.map((x) => (
            <CartLine
              key={x.id}
              item={x}
              onOpen={() => router.push(`/market/p/${x.id}`)}
              onQty={(v) => cart.setQty(x.id, v)}
              onRemove={() => cart.remove(x.id)}
            />
          ))}
        </Group>
      ))}

      <View style={[s.totalRow, { backgroundColor: c.cell }]}>
        <Text style={[s.totalL, { color: c.ink2 }]}>{m.cart.total}</Text>
        <Text style={[s.totalV, tabular, { color: c.ink }]}>{totalLabel}</Text>
      </View>

      {buyer ? (
        <Group header={m.checkout.how} icon="bag-handle-outline">
          <View style={{ padding: 12, gap: 14 }}>
            <SegmentedControl<Delivery>
              options={[{ key: 'pickup', label: m.checkout.pickup }, { key: 'delivery', label: m.checkout.delivery }]}
              value={delivery}
              onChange={(v) => { setDelivery(v); setAddrErr(null); }}
            />
            {delivery === 'delivery' ? (
              <Field
                label={m.checkout.address}
                value={address}
                onChangeText={(v) => { setAddress(v); if (addrErr) setAddrErr(null); }}
                placeholder={m.checkout.addressPh}
                multiline
                maxLength={300}
                error={addrErr}
              />
            ) : null}
            <Field
              label={m.checkout.note}
              value={note}
              onChangeText={setNote}
              placeholder={m.checkout.notePh}
              multiline
              maxLength={500}
            />
            <Text style={[s.hint, { color: c.ink3, textAlign: 'left' }]}>
              {tr(m.checkout.contact, { phone: formatUzPhoneInput(buyer.phone) })} {m.product.payNote}
            </Text>
          </View>
        </Group>
      ) : (
        <Text style={[s.hint, { color: c.ink3 }]}>{m.product.payNote}</Text>
      )}
    </Screen>
  );
}

/** Savat qatori: rasm, nom, narx, miqdor; sotuvda yo'q — xira, faqat o'chirish. */
function CartLine({ item: x, onOpen, onQty, onRemove, sep }: {
  item: CartItem; onOpen: () => void; onQty: (v: number) => void; onRemove: () => void; sep?: boolean;
}) {
  const { c } = useTheme();
  const d = useDict();
  const m = useMarketDict();
  const off = x.max <= 0;
  return (
    <View style={[s.line, sep && { borderTopWidth: HAIRLINE, borderTopColor: c.sep }]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={x.name} style={[s.lineMain, off && { opacity: 0.45 }]}>
        <Thumb uri={x.image} size={64} radius={14} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={[s.lineName, { color: c.ink }]} numberOfLines={2}>{x.name}</Text>
          <Text style={[s.linePrice, tabular, { color: c.ink3 }]} numberOfLines={1}>
            {priceLabel(m, x.price, x.priceFrom)}{x.unit && x.unit !== 'dona' ? ` / ${d.productFields.units[x.unit] ?? x.unit}` : ''}
          </Text>
          {!off ? (
            <Text style={[s.lineTotal, tabular, { color: c.ink }]} numberOfLines={1}>
              {priceLabel(m, priceTimesQty(x.price, x.qty), x.priceFrom)}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={s.lineSide}>
        {off ? (
          <>
            <Pill label={m.cart.unavailable} tone="bad" />
            <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={m.cart.remove} style={({ pressed }) => [s.trash, { backgroundColor: c.badSoft }, pressed && { opacity: 0.5 }]}>
              <Ionicons name="trash-outline" size={18} color={c.bad} />
            </Pressable>
          </>
        ) : (
          <>
            {/* Qoldiqqa yetdi — nega «+» ishlamayotgani ko'rinsin */}
            {x.qty >= x.max ? (
              <Text style={[s.max, tabular, { color: c.ink3 }]} numberOfLines={1}>{tr(m.product.inStock, { qty: qtyWithUnit(x.max, x.unit, d.productFields.units) })}</Text>
            ) : null}
            <QtyStepper value={x.qty} max={x.max} fractional={x.fractional} onChange={onQty} onRemove={onRemove} style={{ width: 124 }} />
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, paddingVertical: 8 },
  noticeT: { flex: 1, fontSize: 13.5, fontWeight: '600' },
  line: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  lineMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineName: { fontSize: 15.5, fontWeight: '700', letterSpacing: -0.2 },
  linePrice: { fontSize: 13.5, fontWeight: '500' },
  lineTotal: { fontSize: 15, fontWeight: '800' },
  lineSide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  trash: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  max: { flexShrink: 1, fontSize: 12.5, fontWeight: '500' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, paddingHorizontal: 16, minHeight: 58 },
  totalL: { fontSize: 16, fontWeight: '600' },
  totalV: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  hint: { fontSize: 14, fontWeight: '500', lineHeight: 20, textAlign: 'center' },
});
