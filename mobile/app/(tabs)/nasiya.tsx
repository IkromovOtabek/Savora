import { useCallback, useMemo, useRef, useState } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useDebounced, usePaged } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney, fmtCompact, isOverdue, isToday, digits } from '@/lib/format';
import { useDict, tr, type Dict } from '@/lib/i18n';
import {
  Screen, useLayout, LargeTitle, SearchField, SegmentedControl, Cell, Avatar, AmountColumn, Pill, ProgressBar, Button,
  listCellStyle, Loading, EmptyState, ErrorState, InlineError, IconButton, type Tone,
} from '@/components/ui';

interface Sale {
  id: string; saleNo: string; product: string; customer: string | null; phone: string | null;
  totalAmount: number; paidAmount: number; remainingAmount: number; installmentMonths: number | null;
  dueDate: string | null; status: string;
}
type Seg = 'all' | 'today' | 'late';

function stateOf(s: Sale, d: Dict): { label: string; tone: Tone } {
  if (s.status === 'paid' || s.remainingAmount <= 0) return { label: d.common.paid, tone: 'ok' };
  if (isOverdue(s.dueDate)) return { label: d.common.overdue, tone: 'bad' };
  if (isToday(s.dueDate)) return { label: d.common.today, tone: 'warn' };
  return { label: d.nasiya.active, tone: 'br' };
}

export default function Nasiya() {
  const router = useRouter();
  const { c } = useTheme();
  const L = useLayout();
  const d = useDict();
  const [q, setQ] = useState('');
  const [seg, setSeg] = useState<Seg>('all');
  const dq = useDebounced(q.trim().toLowerCase(), 300);

  const list = usePaged<Sale>('/api/mobile/sales?type=installment');
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } list.reloadSilently(); }, [list.reloadSilently]));

  // API sotuvlarni qidirishni qo'llamaydi — yuklangan sahifalar ichida filtrlaymiz
  const shown = useMemo(() => {
    const qd = digits(dq);
    return list.items.filter((x) => {
      if (seg === 'today' && !(x.remainingAmount > 0 && isToday(x.dueDate))) return false;
      if (seg === 'late' && !(x.remainingAmount > 0 && isOverdue(x.dueDate))) return false;
      if (!dq) return true;
      const hay = `${x.customer ?? ''} ${x.product} ${x.saleNo}`.toLowerCase();
      return hay.includes(dq) || (qd.length >= 3 && digits(x.phone ?? '').includes(qd));
    });
  }, [list.items, seg, dq]);

  const remainingSum = list.items.reduce((a, x) => a + (x.remainingAmount || 0), 0);
  const filtered = !!dq || seg !== 'all';

  const header = (
    <View style={{ gap: 12, paddingBottom: 14 }}>
      <LargeTitle
        title={d.nasiya.title}
        subtitle={list.loading ? ' ' : `${tr(d.common.count, { n: fmtMoney(list.total) })}${!list.hasMore ? tr(d.nasiya.remainingSuffix, { v: fmtCompact(remainingSum) }) : ''}`}
        actions={<IconButton icon="add" label={d.nasiya.newNasiya} onPress={() => router.push('/sale-new?pay=installment')} />}
      />
      <SearchField value={q} onChangeText={setQ} placeholder={d.nasiya.searchPlaceholder} />
      <SegmentedControl
        options={[{ key: 'all', label: d.common.all }, { key: 'today', label: d.common.today }, { key: 'late', label: d.common.overdue }]}
        value={seg}
        onChange={setSeg}
      />
      {list.error && list.items.length > 0 ? <InlineError message={list.error} onRetry={list.refresh} /> : null}
    </View>
  );

  return (
    <Screen scroll={false}>
      <FlatList
        data={list.loading ? [] : shown}
        keyExtractor={(i) => i.id}
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
            : filtered ? <EmptyState icon="search" title={d.common.notFound} message={list.hasMore ? d.nasiya.notFoundLoaded : d.nasiya.notFoundOther} />
            : <EmptyState icon="time-outline" title={d.nasiya.empty} message={d.nasiya.emptyMsg} actionTitle={d.nasiya.sellNasiya} onAction={() => router.push('/sale-new?pay=installment')} />
        }
        ListFooterComponent={
          list.loadingMore ? <ActivityIndicator color={c.tint} style={{ marginVertical: 16 }} />
            : filtered && list.hasMore ? <Button title={d.common.loadMore} variant="plain" onPress={list.loadMore} style={{ alignSelf: 'center', marginTop: 8 }} />
            : null
        }
        renderItem={({ item, index }) => {
          const st = stateOf(item, d);
          const pct = item.totalAmount > 0 ? item.paidAmount / item.totalAmount : 0;
          return (
            <Cell
              sep={index > 0}
              style={listCellStyle(c, index, shown.length)}
              left={<Avatar name={item.customer ?? item.product} />}
              title={item.customer ?? item.product}
              subtitle={[item.installmentMonths ? tr(d.common.months, { n: item.installmentMonths }) : null, item.product].filter(Boolean).join(' · ')}
              right={<AmountColumn amount={fmtMoney(item.remainingAmount)} color={st.tone === 'bad' ? c.bad : undefined}><Pill label={st.label} tone={st.tone} /></AmountColumn>}
              onPress={() => router.push(`/sale/${item.id}`)}
            >
              <ProgressBar value={pct} tone={st.tone === 'bad' ? 'bad' : st.tone === 'ok' ? 'ok' : 'br'} style={{ marginTop: 7 }} />
            </Cell>
          );
        }}
      />
    </Screen>
  );
}
