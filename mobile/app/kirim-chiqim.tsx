import { useState } from 'react';
import { View, Alert } from 'react-native';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney, fmtCompact, fmtDate, digits, grouped } from '@/lib/format';
import {
  Screen, NavBar, LargeTitle, Group, Cell, StatCard, SegmentedControl, Field, Button, Loading, ErrorState, InlineError, EmptyState,
} from '@/components/ui';

interface Entry { id: string; type: 'income' | 'expense'; amount: number; description: string; recordedBy?: string; createdAt: string }
interface Data { income: number; expense: number; balance: number; items: Entry[] }

export default function KirimChiqim() {
  const { c } = useTheme();
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
    } catch (e) { Alert.alert('Xatolik', errMsg(e)); }
    finally { setBusy(false); }
  }

  const d = res.data;
  return (
    <Screen keyboard header={<NavBar />} refreshing={res.refreshing} onRefresh={res.refresh}>
      <LargeTitle title="Kirim-chiqim" />
      {res.loading && !d ? <Loading /> : !d ? <ErrorState message={res.error} onRetry={res.retry} /> : (
        <>
          {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatCard label="Kirim" value={fmtCompact(d.income)} color={c.ok} />
            <StatCard label="Chiqim" value={fmtCompact(d.expense)} color={c.bad} />
            <StatCard label="Qoldiq" value={fmtCompact(d.balance)} color={d.balance >= 0 ? c.tint : c.bad} />
          </View>

          <View style={{ gap: 12 }}>
            <SegmentedControl options={[{ key: 'income', label: 'Kirim' }, { key: 'expense', label: 'Chiqim' }]} value={type} onChange={setType} />
            <Field label="Summa" value={grouped(amount)} onChangeText={(v) => setAmount(digits(v))} placeholder="0" keyboardType="numeric" suffix="so'm" error={tried && !amountN ? 'Summani kiriting' : null} />
            <Field label="Izoh" value={desc} onChangeText={setDesc} placeholder="Masalan: ijara, elektr" error={tried && !desc.trim() ? 'Izoh kiriting' : null} />
            <Button title={type === 'income' ? 'Kirimni qo\'shish' : 'Chiqimni qo\'shish'} icon="add" full loading={busy} onPress={add} />
          </View>

          {d.items.length === 0 ? <EmptyState icon="wallet-outline" title="Yozuv yo'q" /> : (
            <Group header="So'nggi yozuvlar">
              {d.items.slice(0, 50).map((e) => (
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
