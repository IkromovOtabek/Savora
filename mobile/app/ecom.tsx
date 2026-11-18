import { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import {
  Screen, NavBar, useLayout, LargeTitle, Group, Cell, Field, Button, Switch, SegmentedControl, SearchField, Pill, StatCard,
  listCellStyle, Loading, EmptyState, ErrorState, InlineError, CacheStamp, type Tone,
} from '@/components/ui';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, useResource } from '@/lib/hooks';
import { useTheme, tabular } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';
import { qtyWithUnit } from '@/lib/qty';
import { useMarketDict } from '@/lib/marketI18n';
import { BadgeButton, Thumb } from '@/components/market/parts';

type Filter = 'all' | 'live' | 'hidden' | 'noPrice';
type State = 'live' | 'hidden' | 'noPrice';

interface EcomRow {
  key: string; name: string; image?: string; price: number; maxPrice: number; qty: number; unit?: string;
  state: State; listed: boolean; manual: boolean;
}
interface EcomResp {
  autoPublish: boolean; note: string; slug: string;
  counts: { live: number; hidden: number; noPrice: number };
  newOrders: number;
  items: EcomRow[];
}

const STATE_TONE: Record<State, Tone> = { live: 'ok', hidden: 'mut', noPrice: 'warn' };

/**
 * «Onlayn do'kon» (faqat do'kon egasi): avtomatik chiqarish sozlamasi, xaridor uchun shartlar,
 * tovarlarni Savora Market'da ko'rsatish/yashirish; qator bosilsa — e-commerce ma'lumotlarini tahrirlash.
 */
export default function EcomScreen() {
  const m = useMarketDict();
  const e = m.ecom;
  const d = useDict();
  const { c } = useTheme();
  const L = useLayout();
  const router = useRouter();
  const { me } = useAuth();
  const isAdmin = !!me?.user.isAdmin;

  const [f, setF] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const res = useResource<EcomResp>(isAdmin ? `/api/mobile/ecom?f=${f}&q=${encodeURIComponent(dq)}` : null);
  const data = res.data;

  // Tahrirdan qaytganda — jim yangilash
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } res.reloadSilently(); }, [res.reloadSilently]));

  // Xaridor uchun shartlar — serverdagi qiymatdan boshlanadi, o'zgarsa «Saqlash» chiqadi
  const [note, setNote] = useState<string | null>(null);
  const serverNote = data?.note ?? '';
  const noteVal = note ?? serverNote;
  const noteDirty = note !== null && note.trim() !== serverNote.trim();
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  useEffect(() => { setNote(null); }, [serverNote]);

  async function saveSettings(patch: { autoPublish: boolean; note?: string }) {
    if (!data || savingSettings) return;
    const prev = data;
    res.setData({ ...prev, autoPublish: patch.autoPublish, ...(patch.note !== undefined ? { note: patch.note } : {}) });
    setSavingSettings(true);
    try {
      await api('/api/mobile/ecom/settings', { method: 'PATCH', body: patch });
      if (patch.note !== undefined) setNote(null);
      // Avtomatik chiqarish o'zgarsa tovarlar holati ham o'zgaradi
      res.reloadSilently();
    } catch (err) {
      res.setData(prev);
      Alert.alert(d.common.error, errMsg(err));
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggle(row: EcomRow, show: boolean) {
    if (!data || busyKey) return;
    const prev = data;
    // Optimistik: kalit darhol o'zgaradi, holat (state) server javobidan keyin aniqlanadi
    res.setData({ ...prev, items: prev.items.map((x) => (x.key === row.key ? { ...x, listed: show, manual: true } : x)) });
    setBusyKey(row.key);
    try {
      await api('/api/mobile/ecom/listed', { method: 'POST', body: { keys: [row.key], mode: show ? 'show' : 'hide' } });
      res.reloadSilently();
    } catch (err) {
      res.setData(prev);
      Alert.alert(d.common.error, errMsg(err));
    } finally {
      setBusyKey(null);
    }
  }

  const header = (
    <NavBar
      right={isAdmin ? (
        <BadgeButton icon="receipt-outline" label={e.orders} badge={data?.newOrders} onPress={() => router.push('/ecom-orders')} />
      ) : undefined}
    />
  );

  if (!isAdmin) {
    return (
      <Screen header={header}>
        <LargeTitle title={e.title} />
        <EmptyState icon="lock-closed-outline" title={e.title} message={e.adminOnly} />
      </Screen>
    );
  }

  const items = data?.items ?? [];
  const counts = data?.counts;
  const priceText = (r: EcomRow) => (r.maxPrice > r.price
    ? tr(m.priceFrom, { price: fmtMoney(r.price, { suffix: true }) })
    : fmtMoney(r.price, { suffix: true }));

  const listHeader = (
    <View style={{ gap: 16, paddingBottom: 14 }}>
      <LargeTitle title={e.title} subtitle={e.sub} />
      <CacheStamp of={res} />
      {res.error && data ? <InlineError message={res.error} onRetry={res.refresh} /> : null}

      {data ? (
        <Group>
          <Cell
            icon="flash"
            iconColor={c.sq.o}
            title={e.autoPublish}
            titleLines={2}
            subtitle={data.autoPublish ? e.autoOn : e.autoOff}
            subtitleLines={4}
            right={<Switch value={data.autoPublish} onValueChange={(v) => void saveSettings({ autoPublish: v })} disabled={savingSettings} />}
          />
          <View style={{ padding: 16, paddingTop: 12, gap: 10 }}>
            <Field
              label={e.note}
              value={noteVal}
              onChangeText={setNote}
              placeholder={e.notePh}
              multiline
              maxLength={300}
            />
            {noteDirty ? (
              <Button
                title={e.saveNote}
                variant="tinted"
                loading={savingSettings}
                onPress={() => void saveSettings({ autoPublish: data.autoPublish, note: noteVal.trim() })}
              />
            ) : null}
          </View>
        </Group>
      ) : null}

      {counts ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatCard label={e.state.live} value={fmtMoney(counts.live)} color={c.ok} />
          <StatCard label={e.state.hidden} value={fmtMoney(counts.hidden)} />
          <StatCard label={e.state.noPrice} value={fmtMoney(counts.noPrice)} color={counts.noPrice ? c.warn : undefined} />
        </View>
      ) : null}

      <SegmentedControl<Filter>
        options={[
          { key: 'all', label: e.filter.all },
          { key: 'live', label: e.filter.live },
          { key: 'hidden', label: e.filter.hidden },
          { key: 'noPrice', label: e.filter.noPrice },
        ]}
        value={f}
        onChange={setF}
      />
      <SearchField
        value={q}
        onChangeText={setQ}
        placeholder={e.searchPh}
        right={res.loading && items.length > 0 ? <ActivityIndicator size="small" color={c.ink3} /> : null}
      />
    </View>
  );

  return (
    <Screen scroll={false} header={header}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[L.content, { paddingTop: 4, paddingBottom: L.bottom }]}
        ListHeaderComponent={listHeader}
        refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.refresh} tintColor={c.tint} colors={[c.tint]} />}
        ListEmptyComponent={
          res.loading ? <Loading />
            : res.error ? <ErrorState message={res.error} onRetry={res.retry} />
            : <EmptyState icon="storefront-outline" title={e.emptyTitle} message={f === 'all' && !dq ? e.empty : e.emptyFilter} />
        }
        renderItem={({ item, index }) => {
          const noPrice = item.state === 'noPrice';
          return (
            <Cell
              sep={index > 0}
              style={listCellStyle(c, index, items.length)}
              left={<Thumb uri={item.image} size={50} radius={12} />}
              title={item.name}
              titleLines={2}
              subtitle={noPrice ? e.noPriceHint : priceText(item)}
              onPress={() => router.push(`/ecom-item/${item.key}`)}
              accessibilityLabel={item.name}
              right={
                <Switch
                  value={!noPrice && item.listed}
                  disabled={noPrice || busyKey === item.key}
                  onValueChange={(v) => void toggle(item, v)}
                />
              }
            >
              <View style={s.meta}>
                <Pill label={e.state[item.state]} tone={STATE_TONE[item.state]} />
                <Text style={[s.qty, tabular, { color: c.ink3 }]} numberOfLines={1}>
                  {tr(e.qty, { qty: qtyWithUnit(item.qty, item.unit, d.productFields.units) })}
                </Text>
              </View>
            </Cell>
          );
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  qty: { fontSize: 13, fontWeight: '500' },
});
