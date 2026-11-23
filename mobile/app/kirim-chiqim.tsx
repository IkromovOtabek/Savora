import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { FlowTotalCard, type FlowTotals } from '@/components/FlowTotalCard';
import { ProfitReport, currentMonth, type ProfitData } from '@/components/ProfitReport';
import { DayFilter, DayStats, DayDetails, useDayFlow } from '@/components/DayFlow';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { digits, grouped } from '@/lib/format';
import { useDict } from '@/lib/i18n';
import { toDayKey, type DayKey } from '@/lib/homePeriod';
import {
  Screen, NavBar, LargeTitle, SegmentedControl, Chips, Field, Button, Loading, ErrorState, InlineError, CacheStamp,
} from '@/components/ui';

type FlowType = 'income' | 'expense';
interface Entry {
  id: string; type: FlowType; amount: number; description: string;
  category?: string | null; branch?: string | null; recordedBy?: string; createdAt: string;
}
/** Eski server javobida categories/branches bo'lmasligi mumkin */
interface Data {
  income: number; expense: number; balance: number; items: Entry[];
  categories?: { name: string; type: FlowType; inProfit: boolean }[];
  branches?: { id: string; name: string }[];
}

export default function KirimChiqim() {
  const { c } = useTheme();
  const d = useDict();
  const router = useRouter();
  const res = useResource<Data>('/api/mobile/kirim-chiqim');
  // Ombor qiymati jami (web «Kirim-chiqim» kartasi) — faqat jami, ro'yxat batafsil ekranda
  const flow = useResource<{ totals: FlowTotals }>('/api/mobile/kirim-chiqim/flow?lines=0');
  // Oylik sof foyda — chiqim qo'shilgach darhol yangilanadi
  const [month, setMonth] = useState(currentMonth);
  const profit = useResource<ProfitData>(`/api/mobile/kirim-chiqim/profit?month=${month}`);
  // Kunlik kirim-chiqim: tanlangan kundagi barcha pul harakati (sotuv, qarz/nasiya to'lovi, xarajat…) — Bugun / Sana
  const [day, setDay] = useState<DayKey>(() => toDayKey(new Date()));
  const flowDay = useDayFlow(day);
  const [type, setType] = useState<FlowType>('income');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const amountN = Number(digits(amount)) || 0;
  const categories = (res.data?.categories ?? []).filter((x) => x.type === type);
  const branches = res.data?.branches ?? [];
  const picked = categories.find((x) => x.name === category);
  // Toifa — sof foydaga ta'sir uchun majburiy (eski server toifa bermasa — tanlovsiz yuboriladi)
  const needCategory = categories.length > 0;

  function changeType(t: FlowType) {
    setType(t);
    setCategory(null);
  }

  async function add() {
    setTried(true);
    if (!amountN || (needCategory && !picked)) return;
    const description = desc.trim() || picked?.name || '';
    if (!description) return;
    setBusy(true);
    try {
      await api('/api/mobile/kirim-chiqim', {
        method: 'POST',
        body: { type, amount: amountN, description, ...(picked ? { category: picked.name } : {}), ...(branchId ? { branchId } : {}) },
      });
      setAmount(''); setDesc(''); setCategory(null); setTried(false);
      res.reloadSilently();
      profit.reloadSilently();
      // Yangi yozuv bugungi kunga tushadi — ro'yxatda darhol ko'rinsin
      const today = toDayKey(new Date());
      if (day !== today) setDay(today);
      else flowDay.res.reloadSilently();
    } catch (e) { Alert.alert(d.common.error, errMsg(e)); }
    finally { setBusy(false); }
  }

  const data = res.data;
  return (
    <Screen keyboard header={<NavBar />} refreshing={res.refreshing} onRefresh={() => { res.refresh(); flow.reloadSilently(); profit.reloadSilently(); flowDay.res.reloadSilently(); }}>
      <LargeTitle title={d.kirimChiqim.title} />
      {/* Oy almashganda oldingi oy ma'lumoti (keepPreviousData) ko'rsatilmasin */}
      <ProfitReport data={profit.data?.month === month ? profit.data : null} month={month} onMonth={setMonth} />
      {profit.error ? <InlineError message={profit.error} onRetry={profit.retry} /> : profit.data?.month !== month ? <Loading /> : null}
      {flow.data ? (
        <FlowTotalCard
          totals={flow.data.totals}
          title={d.kirimChiqim.totalAll}
          moreLabel={d.kirimChiqim.allDetail}
          onPress={() => router.push('/kirim-chiqim-all')}
        />
      ) : flow.error ? <InlineError message={flow.error} onRetry={flow.retry} /> : null}
      {res.loading && !data ? <Loading /> : !data ? <ErrorState message={res.error} onRetry={res.retry} /> : (
        <>
          <CacheStamp of={res} />
          {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
          <Text style={{ fontSize: 20, fontWeight: '700', color: c.ink, marginTop: 4 }}>{d.dayFlow.title}</Text>
          <DayFilter day={day} onChange={setDay} />
          {flowDay.data ? <DayStats data={flowDay.data} />
            : flowDay.res.error && !flowDay.res.loading ? <InlineError message={flowDay.res.error} onRetry={flowDay.res.retry} />
            : <Loading />}

          <View style={{ gap: 12 }}>
            <SegmentedControl options={[{ key: 'income', label: d.kirimChiqim.income }, { key: 'expense', label: d.kirimChiqim.expense }]} value={type} onChange={changeType} />
            <Field label={d.kirimChiqim.amount} value={grouped(amount)} onChangeText={(v) => setAmount(digits(v))} placeholder="0" keyboardType="numeric" suffix={d.format.currency} error={tried && !amountN ? d.kirimChiqim.amountErr : null} />
            {needCategory ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.ink3 }}>{d.kirimChiqim.category}</Text>
                <Chips options={categories.map((x) => ({ key: x.name, label: x.name }))} value={category} onChange={setCategory} />
                {tried && !picked ? (
                  <Text style={{ fontSize: 13, fontWeight: '500', color: c.bad }}>{d.kirimChiqim.categoryErr}</Text>
                ) : picked ? (
                  <Text style={{ fontSize: 13, fontWeight: '500', color: picked.inProfit ? (type === 'expense' ? c.bad : c.ok) : c.ink3 }}>
                    {picked.inProfit ? (type === 'expense' ? d.kirimChiqim.inProfitExpense : d.kirimChiqim.inProfitIncome) : d.kirimChiqim.notInProfit}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {branches.length > 1 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.ink3 }}>{d.kirimChiqim.branch}</Text>
                <Chips options={[{ key: '', label: d.kirimChiqim.branchAll }, ...branches.map((b) => ({ key: b.id, label: b.name }))]} value={branchId} onChange={setBranchId} />
              </View>
            ) : null}
            <Field
              label={needCategory ? d.kirimChiqim.noteOptional : d.common.note}
              value={desc}
              onChangeText={setDesc}
              placeholder={d.kirimChiqim.notePlaceholder}
              error={tried && !needCategory && !desc.trim() ? d.kirimChiqim.noteErr : null}
            />
            <Button title={type === 'income' ? d.kirimChiqim.addIncome : d.kirimChiqim.addExpense} icon="add" full loading={busy} onPress={add} />
          </View>

          {flowDay.data ? <DayDetails data={flowDay.data} /> : null}
        </>
      )}
    </Screen>
  );
}
