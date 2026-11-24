import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { queryClient } from '@/lib/queryClient';
import { useTheme } from '@/lib/theme';
import { digits, grouped, fmtMoney } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import { Screen, NavBar, LargeTitle, Chips, Field, Button, Loading, ErrorState } from '@/components/ui';

interface Data {
  categories: string[];
  /** Filialda ochiq smena — summa kassadagi puldan oshmasin (server ham tekshiradi) */
  shift: { shiftNo: string; current: number } | null;
}

/**
 * Filial xodimining xarajati (web kassa → «Xarajat qo'shish», filial rejimi): summa, toifa, izoh.
 * Pul o'z filiali kassasidan chiqadi; server: /api/mobile/kassa/expense (lib/branchExpense).
 */
export default function ExpenseNew() {
  const { c } = useTheme();
  const d = useDict();
  const k = d.branchExpense;
  const router = useRouter();
  const res = useResource<Data>('/api/mobile/kassa/expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = res.data;
  const amountN = Number(digits(amount)) || 0;
  const shift = data?.shift ?? null;
  const errors = {
    amount: !amountN ? k.amountErr
      : shift && amountN > shift.current ? tr(k.tooMuch, { v: fmtMoney(shift.current, { suffix: true }) }) : null,
    category: !category ? k.categoryErr : null,
  };

  async function save() {
    setTried(true);
    if (errors.amount || errors.category) return;
    setBusy(true);
    try {
      await api('/api/mobile/kassa/expense', {
        method: 'POST',
        body: { amount: amountN, category, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      // Bosh sahifa jami, kunlik kirim-chiqim va smena kassasi yangilansin
      void queryClient.invalidateQueries({ queryKey: ['res'] });
      router.back();
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard header={<NavBar />} refreshing={res.refreshing} onRefresh={res.refresh}>
      <LargeTitle title={k.title} subtitle={k.hint} />
      {!data ? (
        res.error && !res.loading ? <ErrorState message={res.error} onRetry={res.retry} /> : <Loading />
      ) : data.categories.length === 0 ? (
        <Text style={{ fontSize: 15, color: c.ink3 }}>{k.noCategory}</Text>
      ) : (
        <View style={{ gap: 14 }}>
          {shift ? (
            <Text style={{ fontSize: 14, fontWeight: '500', color: c.ink3 }}>
              {tr(k.shiftCash, { no: shift.shiftNo, v: fmtMoney(shift.current, { suffix: true }) })}
            </Text>
          ) : null}
          <Field
            label={k.amount}
            value={grouped(amount)}
            onChangeText={(v) => setAmount(digits(v))}
            placeholder="0"
            keyboardType="numeric"
            suffix={d.format.currency}
            error={tried ? errors.amount : null}
          />
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.ink3 }}>{k.category}</Text>
            <Chips options={data.categories.map((n) => ({ key: n, label: n }))} value={category} onChange={setCategory} />
            {tried && errors.category ? (
              <Text style={{ fontSize: 13, fontWeight: '500', color: c.bad }}>{errors.category}</Text>
            ) : null}
          </View>
          <Field label={k.note} value={note} onChangeText={setNote} placeholder={k.notePlaceholder} maxLength={300} />
          <Button title={k.save} icon="checkmark" full loading={busy} onPress={save} />
        </View>
      )}
    </Screen>
  );
}
