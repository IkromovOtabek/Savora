import { Alert, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useOfflinePos } from '@/lib/offlinePos';
import { useTheme } from '@/lib/theme';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import { qtyWithUnit } from '@/lib/qty';
import { Screen, NavBar, LargeTitle, Group, Cell, AmountColumn, Pill, Button, EmptyState } from '@/components/ui';

/** Oflayn sotuvlar: yuborilishi kutilayotganlar va serverda qabul qilinmaganlar (ziddiyat). */
export default function OfflineSales() {
  const pos = useOfflinePos();
  const { c } = useTheme();
  const d = useDict();
  const o = d.offline;

  const pending = pos.queue.filter((x) => x.status === 'pending');
  const problems = pos.queue.filter((x) => x.status !== 'pending');

  async function sync() {
    const r = await pos.syncNow();
    if (r && r.sent > 0) {
      Alert.alert(o.screenTitle, r.problems > 0 ? tr(o.reportProblems, { ok: r.ok, p: r.problems }) : tr(o.reportOk, { ok: r.ok }));
    }
  }

  function dismiss(id: string) {
    Alert.alert(o.dismiss, o.dismissConfirm, [
      { text: d.common.cancel, style: 'cancel' },
      { text: o.dismiss, style: 'destructive', onPress: () => { void pos.dismiss(id); } },
    ]);
  }

  return (
    <Screen
      header={<NavBar backLabel={d.common.back} />}
      refreshing={pos.syncing}
      onRefresh={() => { void sync(); }}
      footer={pending.length > 0 ? <Button title={pos.syncing ? o.syncing : o.syncNow} size="lg" full loading={pos.syncing} onPress={sync} /> : undefined}
    >
      <LargeTitle title={o.screenTitle} subtitle={o.screenSub} />

      {pos.offline ? <Text style={[s.note, { color: c.warn }]}>{o.offlineNow}</Text> : null}
      {pos.lastError ? <Text style={[s.note, { color: c.bad }]}>{tr(o.lastError, { msg: pos.lastError })}</Text> : null}

      {pos.queue.length === 0 ? <EmptyState icon="cloud-done-outline" title={o.empty} message={o.emptyMsg} /> : null}

      {problems.length > 0 ? (
        <Group header={o.conflict} footer={o.resolveHint}>
          {problems.map((x, i) => (
            <Cell
              key={x.clientSaleId}
              sep={i > 0}
              icon="alert-circle"
              iconColor={c.bad}
              title={x.qty !== 1 ? `${x.name} × ${qtyWithUnit(x.qty, x.unit, d.productFields.units)}` : x.name}
              subtitle={`${fmtMoney(x.totalAmount, { suffix: true })} · ${fmtDateTime(x.soldAt)}\n${x.reason ? o.reasons[x.reason] : o.rejected}`}
              subtitleLines={4}
              right={<Button title={o.dismiss} size="sm" variant="tinted" onPress={() => dismiss(x.clientSaleId)} />}
            />
          ))}
        </Group>
      ) : null}

      {pending.length > 0 ? (
        <Group header={o.queueTitle}>
          {pending.map((x, i) => (
            <Cell
              key={x.clientSaleId}
              sep={i > 0}
              icon="cloud-upload-outline"
              iconColor={c.warn}
              title={x.qty !== 1 ? `${x.name} × ${qtyWithUnit(x.qty, x.unit, d.productFields.units)}` : x.name}
              subtitle={fmtDateTime(x.soldAt)}
              right={<AmountColumn amount={fmtMoney(x.totalAmount)}><Pill label={o.pending} tone="mut" /></AmountColumn>}
            />
          ))}
        </Group>
      ) : null}

      <Group header={o.catalogTitle} footer={pos.catalog?.truncated ? o.catalogTruncated : undefined}>
        <Cell
          icon="cube"
          iconColor={c.sq.b}
          title={pos.catalog ? tr(o.catalogInfo, { n: pos.catalog.items.length, time: fmtDateTime(pos.catalog.savedAt) }) : o.catalogNone}
          subtitleLines={2}
        />
      </Group>
    </Screen>
  );
}

const s = StyleSheet.create({
  note: { fontSize: 14, fontWeight: '500' },
});
