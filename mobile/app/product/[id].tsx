import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { useTheme, MONO } from '@/lib/theme';
import { fmtMoney, fmtDate } from '@/lib/format';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Pill, Button, Loading, ErrorState, InlineError, type Tone,
} from '@/components/ui';

interface Detail {
  id: string; name: string; brand: string | null; deviceModel: string | null;
  imei: string; barcode: string | null; color: string | null;
  purchasePrice: number; salePrice: number; profit: number; status: string;
  trackQuantity: boolean; quantity: number; soldQuantity: number; available: number;
  branch: string | null; notes: string | null; createdAt: string;
  history: { action: string; detail: string | null; by: string | null; at: string }[];
}

const STATUS: Record<string, { t: string; tone: Tone }> = {
  in_stock: { t: 'Sotuvda', tone: 'ok' },
  sold: { t: 'Sotilgan', tone: 'bad' },
  reserved: { t: 'Band', tone: 'warn' },
  defective: { t: 'Nuqsonli', tone: 'mut' },
  transferred: { t: 'O\'tkazilgan', tone: 'mut' },
};
const ACTION: Record<string, string> = { created: 'Qo\'shildi', sold: 'Sotildi', transferred: 'O\'tkazildi', returned: 'Qaytarildi', edited: 'Tahrirlandi', restocked: 'To\'ldirildi' };

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me } = useAuth();
  const { c } = useTheme();
  const terms = me?.terms;
  const f = me?.features ?? {};
  const res = useResource<Detail>(id ? `/api/mobile/products/${id}` : null);
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } res.reloadSilently(); }, [res.reloadSilently]));

  const p = res.data;
  const backLabel = terms?.items ?? 'Ombor';
  if (res.loading && !p) return <Screen header={<NavBar backLabel={backLabel} />}><Loading /></Screen>;
  if (!p) return <Screen header={<NavBar backLabel={backLabel} />}><ErrorState message={res.error} onRetry={res.retry} /></Screen>;

  const st = STATUS[p.status] ?? { t: p.status, tone: 'mut' as Tone };
  const canSell = p.status === 'in_stock' && p.available > 0;
  const q = (o: Record<string, string | number | boolean>) =>
    Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  const sellHref = `/sale-new?${q({ productId: p.id, name: p.name, price: p.salePrice, track: p.trackQuantity ? 1 : 0, available: p.available })}`;
  const transferHref = `/transfer?${q({ productId: p.id, name: p.name, track: p.trackQuantity ? 1 : 0, available: p.available })}`;

  return (
    <Screen
      header={<NavBar backLabel={backLabel} />}
      refreshing={res.refreshing}
      onRefresh={res.refresh}
      footer={canSell ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Sotish" icon="cart" size="lg" style={{ flex: 1 }} onPress={() => router.push(sellHref as never)} />
          {f.transferred ? <Button title="Berish" icon="swap-horizontal" variant="tinted" size="lg" style={{ flex: 1 }} onPress={() => router.push(transferHref as never)} /> : null}
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

      <Group header="Narx">
        <Cell title="Sotuv narxi" value={fmtMoney(p.salePrice, { suffix: true })} valueStrong />
        <Cell title="Kelish narxi" value={fmtMoney(p.purchasePrice, { suffix: true })} />
        <Cell title="Foyda" value={fmtMoney(p.profit, { suffix: true })} valueColor={p.profit >= 0 ? c.ok : c.bad} />
      </Group>

      <Group header="Ma'lumot">
        <Cell title={terms?.codeLabel ?? 'Kod'} value={p.imei} valueMono={MONO} />
        {p.barcode ? <Cell title="Shtrix kod" value={p.barcode} valueMono={MONO} /> : null}
        {p.branch ? <Cell title="Filial" value={p.branch} /> : null}
        {p.trackQuantity ? <Cell title="Qoldiq" value={`${fmtMoney(p.available)} / ${fmtMoney(p.quantity)} dona`} valueColor={p.available > 0 ? undefined : c.bad} /> : null}
        <Cell title="Qo'shilgan" value={fmtDate(p.createdAt)} />
        {p.notes ? <Cell title="Izoh" value={p.notes} wrapValue /> : null}
      </Group>

      {p.history.length > 0 ? (
        <Group header="Tarix">
          {p.history.map((h, i) => (
            <Cell
              key={i}
              title={ACTION[h.action] ?? h.action}
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
