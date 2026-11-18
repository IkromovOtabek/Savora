import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { fmtDate, fmtMoney } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { useDict, tr } from '@/lib/i18n';
import { productionApi, useListPages, RECEIPT_TONE, type ReceiptStatus, type ReceiptSummary } from '@/lib/production';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Pill, Button, Chips, SearchField, Loading, ErrorState, InlineError, EmptyState, AmountColumn,
} from '@/components/ui';

type Filter = 'all' | ReceiptStatus;
const FILTERS: Filter[] = ['all', 'draft', 'posted', 'cancelled'];

/**
 * Kirim aktlari — omborchi uchun faqat ko'rish (yaratish va kirim qilish — web). Holat filtri, qidiruv
 * (raqam, yetkazib beruvchi, tovar); narx huquqi bo'lmasa summa ko'rsatilmaydi (server `null` beradi).
 */
export default function Receipts() {
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const r = d.production.receipts;
  const st = d.production.receiptStatuses;
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 350);

  const list = useListPages<ReceiptSummary>(`rc:${filter}:${dq}`, (page) => productionApi.receipts({
    status: filter === 'all' ? undefined : filter, q: dq || undefined, page, limit: 30,
  }));
  // Tafsilotdan qaytganda — jimgina yangilash (filtr/qidiruv o'zgarishi bu yerda qayta ishga tushirmasin)
  const first = useRef(true);
  const onFocus = useRef(() => {});
  onFocus.current = list.reloadSilently;
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } onFocus.current(); }, []));

  return (
    <Screen header={<NavBar />} refreshing={list.refreshing} onRefresh={list.refresh} gap={14}>
      <LargeTitle title={r.title} subtitle={r.readOnly} />
      <SearchField value={q} onChangeText={setQ} placeholder={r.search} />
      <Chips options={FILTERS.map((f) => ({ key: f, label: f === 'all' ? d.common.all : st[f] }))} value={filter} onChange={setFilter} />
      {list.error && list.items.length ? <InlineError message={list.error} onRetry={list.retry} /> : null}
      {list.loading ? <Loading /> : list.error && !list.items.length ? (
        <ErrorState message={list.error} onRetry={list.retry} />
      ) : list.items.length === 0 ? (
        <EmptyState icon="archive-outline" title={dq ? d.common.notFound : r.empty} message={dq ? undefined : r.emptyHint} />
      ) : (
        <>
          <Group>
            {list.items.map((x) => (
              <Cell
                key={x.id}
                icon="archive"
                iconColor={x.status === 'posted' ? c.sq.o : x.status === 'draft' ? c.sq.a : c.sq.g}
                title={x.supplierName ?? r.noSupplier}
                subtitle={[
                  [x.docNo, fmtDate(x.postedAt ?? x.createdAt)].join(' · '),
                  [x.branchName, tr(r.linesN, { n: x.lines }), x.supplierInvoiceNo ? `№ ${x.supplierInvoiceNo}` : null].filter(Boolean).join(' · '),
                ].join('\n')}
                subtitleLines={2}
                right={
                  <AmountColumn amount={x.total !== null ? fmtMoney(x.total) : ''}>
                    <Pill label={st[x.status]} tone={RECEIPT_TONE[x.status]} />
                  </AmountColumn>
                }
                chevron
                onPress={() => router.push(`/receipts/${x.id}`)}
              />
            ))}
          </Group>
          {list.hasMore ? <Button title={d.common.loadMore} variant="tinted" loading={list.loadingMore} onPress={list.loadMore} /> : null}
        </>
      )}
    </Screen>
  );
}
