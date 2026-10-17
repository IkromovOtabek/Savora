import { useState } from 'react';
import { View, Alert } from 'react-native';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney, fmtCompact, fmtDate, digits, grouped } from '@/lib/format';
import { useDict } from '@/lib/i18n';
import {
  Screen, NavBar, LargeTitle, Group, Cell, StatCard, SegmentedControl, Field, Button, Loading, ErrorState, InlineError, EmptyState,
} from '@/components/ui';

interface Entry { id: string; type: 'income' | 'expense'; amount: number; description: string; recordedBy?: string; createdAt: string }
interface Data { income: number; expense: number; balance: number; items: Entry[] }

export default function KirimChiqim() {
  const { c } = useTheme();
  const d = useDict();
  const res = useResource<Data>('/api/mobile/kirim-chiqim');
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const amountN = Number(digits(amount)) || 0;

  async function add() {
    setTried(true);
    if (!amountN || !desc.trim()) return;
    setBusy(true);
    try {
      await api('/api/mobile/kirim-chiqim', { method: 'POST', body: { type, amount: amountN, description: desc.trim() } });
      setAmount(''); setDesc(''); setTried(false);
      res.reloadSilently();
    } catch (e) { Alert.alert(d.common.error, errMsg(e)); }
    finally { setBusy(false); }
  }

  const data = res.data;
  return (
    <Screen keyboard header={<NavBar />} refreshing={res.refreshing} onRefresh={res.refresh}>
      <LargeTitle title={d.kirimChiqim.title} />
      {res.loading && !data ? <Loading /> : !data ? <ErrorState message={res.error} onRetry={res.retry} /> : (
        <>
          {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatCard label={d.kirimChiqim.income} value={fmtCompact(data.income)} color={c.ok} />
            <StatCard label={d.kirimChiqim.expense} value={fmtCompact(data.expense)} color={c.bad} />
            <StatCard label={d.kirimChiqim.balance} value={fmtCompact(data.balance)} color={data.balance >= 0 ? c.tint : c.bad} />
          </View>

          <View style={{ gap: 12 }}>
            <SegmentedControl options={[{ key: 'income', label: d.kirimChiqim.income }, { key: 'expense', label: d.kirimChiqim.expense }]} value={type} onChange={setType} />
            <Field label={d.kirimChiqim.amount} value={grouped(amount)} onChangeText={(v) => setAmount(digits(v))} placeholder="0" keyboardType="numeric" suffix={d.format.currency} error={tried && !amountN ? d.kirimChiqim.amountErr : null} />
            <Field label={d.common.note} value={desc} onChangeText={setDesc} placeholder={d.kirimChiqim.notePlaceholder} error={tried && !desc.trim() ? d.kirimChiqim.noteErr : null} />
            <Button title={type === 'income' ? d.kirimChiqim.addIncome : d.kirimChiqim.addExpense} icon="add" full loading={busy} onPress={add} />
          </View>

          {data.items.length === 0 ? <EmptyState icon="wallet-outline" title={d.kirimChiqim.empty} /> : (
            <Group header={d.kirimChiqim.recent}>
              {data.items.slice(0, 50).map((e) => (
                <Cell
                  key={e.id}
                  icon={e.type === 'income' ? 'arrow-down' : 'arrow-up'}
                  iconColor={e.type === 'income' ? c.sq.o : c.sq.r}
                  title={e.description}
                  subtitle={[fmtDate(e.createdAt), e.recordedBy].filter(Boolean).join(' · ')}
                  value={`${e.type === 'income' ? '+' : '−'}${fmtMoney(e.amount)}`}
                  valueColor={e.type === 'income' ? c.ok : c.bad}
                  valueStrong
                />
              ))}
            </Group>
          )}
        </>
      )}
    </Screen>
  );
}
