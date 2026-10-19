import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuth, useCan } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { useTheme, MONO } from '@/lib/theme';
import { fmtMoney, fmtDate } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import { fmtQty, qtyWithUnit } from '@/lib/qty';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Pill, Button, Loading, ErrorState, InlineError, type Tone,
} from '@/components/ui';

interface Detail {
  id: string; name: string; brand: string | null; deviceModel: string | null;
  imei: string; barcode: string | null; color: string | null;
  purchasePrice: number; salePrice: number; profit: number; status: string; costHidden?: boolean;
  trackQuantity: boolean; quantity: number; soldQuantity: number; available: number; unit?: string | null;
  branch: string | null; notes: string | null; createdAt: string;
  history: { action: string; detail: string | null; by: string | null; at: string }[];
}

/** Holat rangi — matni lug'atda (d.productDetail.status) */
const STATUS_TONE: Record<string, Tone> = { in_stock: 'ok', sold: 'bad', reserved: 'warn', defective: 'mut', transferred: 'mut' };

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me } = useAuth();
  const { c } = useTheme();
  const d = useDict();
  const terms = me?.terms;
  const f = me?.features ?? {};
  const can = useCan();
  const res = useResource<Detail>(id ? `/api/mobile/products/${id}` : null);
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } res.reloadSilently(); }, [res.reloadSilently]));

  const p = res.data;
  const backLabel = terms?.items ?? d.terms.items;
  if (res.loading && !p) return <Screen header={<NavBar backLabel={backLabel} />}><Loading /></Screen>;
  if (!p) return <Screen header={<NavBar backLabel={backLabel} />}><ErrorState message={res.error} onRetry={res.retry} /></Screen>;

  const statusLabels: Record<string, string> = d.productDetail.status;
  const st = { t: statusLabels[p.status] ?? p.status, tone: STATUS_TONE[p.status] ?? ('mut' as Tone) };
  const actionLabels: Record<string, string> = d.productDetail.action;
  const canSell = p.status === 'in_stock' && p.available > 0;
  const q = (o: Record<string, string | number | boolean>) =>
    Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  const sellHref = `/sale-new?${q({ productId: p.id, name: p.name, price: p.salePrice, track: p.trackQuantity ? 1 : 0, available: p.available, unit: p.unit ?? '' })}`;
  const transferHref = `/transfer?${q({ productId: p.id, name: p.name, track: p.trackQuantity ? 1 : 0, available: p.available, unit: p.unit ?? '' })}`;

  return (
    <Screen
      header={<NavBar backLabel={backLabel} />}
      refreshing={res.refreshing}
      onRefresh={res.refresh}
      footer={canSell ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {can('sale.create') ? <Button title={d.productDetail.sell} icon="cart" size="lg" style={{ flex: 1 }} onPress={() => router.push(sellHref as never)} /> : null}
          {f.transferred && can('transfer.create') ? <Button title={d.productDetail.give} icon="swap-horizontal" variant="tinted" size="lg" style={{ flex: 1 }} onPress={() => router.push(transferHref as never)} /> : null}
        </View>
      ) : undefined}
    >
      <LargeTitle
        size="medium"
        title={p.name}
        subtitle={[p.brand, p.deviceModel, p.color].filter(Boolean).join(' · ') || undefined}
      />
      <View style={{ flexDirection: 'row' }}><Pill label={st.t} tone={st.tone} /></View>

      {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}

      <Group header={d.productDetail.price}>
        <Cell title={d.productDetail.sellPrice} value={fmtMoney(p.salePrice, { suffix: true })} valueStrong />
        {!p.costHidden ? <Cell title={d.productDetail.buyPrice} value={fmtMoney(p.purchasePrice, { suffix: true })} /> : null}
        {!p.costHidden ? <Cell title={d.productDetail.profit} value={fmtMoney(p.profit, { suffix: true })} valueColor={p.profit >= 0 ? c.ok : c.bad} /> : null}
      </Group>

      <Group header={d.common.info}>
        <Cell title={terms?.codeLabel ?? d.productDetail.code} value={p.imei} valueMono={MONO} />
        {p.barcode ? <Cell title={d.productDetail.barcode} value={p.barcode} valueMono={MONO} /> : null}
        {p.branch ? <Cell title={d.common.branch} value={p.branch} /> : null}
        {p.trackQuantity ? <Cell title={d.common.remaining} value={tr(d.productDetail.remainingVal, { a: fmtQty(p.available), b: qtyWithUnit(p.quantity, p.unit, d.productFields.units) })} valueColor={p.available > 0 ? undefined : c.bad} /> : null}
        <Cell title={d.productDetail.added} value={fmtDate(p.createdAt)} />
        {p.notes ? <Cell title={d.common.note} value={p.notes} wrapValue /> : null}
      </Group>

      {p.history.length > 0 ? (
        <Group header={d.productDetail.history}>
          {p.history.map((h, i) => (
            <Cell
              key={i}
              title={actionLabels[h.action] ?? h.action}
              subtitle={[h.detail, h.by].filter(Boolean).join(' · ') || undefined}
              subtitleLines={2}
              value={fmtDate(h.at)}
            />
          ))}
        </Group>
      ) : null}
    </Screen>
  );
}
