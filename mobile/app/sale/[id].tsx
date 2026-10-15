import { useCallback, useRef, useState } from 'react';
import { View, Text, Modal, Alert, Linking, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useTheme, tabular, MONO } from '@/lib/theme';
import { fmtMoney, fmtDate, fmtDayMonth, payLabel, digits, grouped } from '@/lib/format';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Pill, Ring, Button, Field, Chips, Loading, ErrorState, InlineError, useLayout, type Tone, type IconName,
} from '@/components/ui';

interface Month { month: number; amount: number; paidAmount: number; paid: boolean; state: string; dueDate: string }
interface Plan { total: number; down: number; monthly: number; months: number; monthsPaid: number; remaining: number; overdueCount: number; schedule: Month[] }
interface Payment { amount: number; paidAt: string; note: string | null; recordedBy: string | null }
interface Sale {
  id: string; saleNo: string; product: string; imei: string | null; customer: string | null; phone: string | null;
  paymentType: string; bankName: string | null; totalAmount: number; paidAmount: number; remainingAmount: number;
  installmentMonths: number | null; dueDate: string | null; status: string; createdAt: string; soldBy: string | null;
  payments: Payment[]; plan: Plan | null;
}

const MONTH_STATE: Record<string, { label: string; tone: Tone; icon: IconName; sq: 'o' | 'a' | 'g' | 'r' | 'b' }> = {
  paid: { label: 'To\'landi', tone: 'ok', icon: 'checkmark', sq: 'o' },
  partial: { label: 'Qisman', tone: 'br', icon: 'pie-chart', sq: 'b' },
  upcoming: { label: 'Kutilmoqda', tone: 'mut', icon: 'time', sq: 'g' },
  overdue: { label: 'Kechikkan', tone: 'bad', icon: 'alert', sq: 'r' },
};
const STATUS: Record<string, { label: string; tone: Tone }> = {
  paid: { label: 'To\'langan', tone: 'ok' },
  partial: { label: 'Qoldiq bor', tone: 'warn' },
  cancelled: { label: 'Bekor qilingan', tone: 'mut' },
};

export default function SaleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const res = useResource<Sale>(id ? `/api/mobile/sales/${id}` : null);
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } res.reloadSilently(); }, [res.reloadSilently]));
  const [sheet, setSheet] = useState(false);

  const s = res.data;
  const backLabel = s?.paymentType === 'installment' ? 'Nasiya' : 'Orqaga';

  if (res.loading && !s) return <Screen header={<NavBar backLabel={backLabel} />}><Loading /></Screen>;
  if (!s) return <Screen header={<NavBar backLabel={backLabel} />}><ErrorState message={res.error} onRetry={res.retry} /></Screen>;

  const pct = s.totalAmount > 0 ? s.paidAmount / s.totalAmount : 0;
  const canPay = s.remainingAmount > 0 && s.status !== 'cancelled';
  const nextMonth = s.plan?.schedule.find((m) => !m.paid);
  const nextDue = nextMonth ? Math.min(Math.max(0, nextMonth.amount - nextMonth.paidAmount), s.remainingAmount) : s.remainingAmount;
  const st = STATUS[s.status] ?? { label: s.status, tone: 'mut' as Tone };
  const metaLine = [`№${s.saleNo}`, s.customer ? s.product : null, s.plan ? `${s.plan.monthsPaid}/${s.plan.months}-oy` : payLabel(s.paymentType)].filter(Boolean).join(' · ');

  return (
    <Screen
      header={<NavBar backLabel={backLabel} />}
      refreshing={res.refreshing}
      onRefresh={res.refresh}
      gap={18}
      footer={canPay ? (
        <Button title="To'lov qabul qilish" value={fmtMoney(nextDue)} size="lg" full onPress={() => setSheet(true)} />
      ) : undefined}
    >
      <LargeTitle
        size="medium"
        left={<Ring value={pct} size={84} stroke={9} color={s.status === 'paid' ? c.ok : c.tint} />}
        title={s.customer ?? s.product}
        subtitle={metaLine}
      />

      {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}

      <Group>
        <Cell title="Qoldiq" right={<Text style={[st2.amount, tabular, { color: s.remainingAmount > 0 ? c.bad : c.ok }]}>{fmtMoney(s.remainingAmount, { suffix: true })}</Text>} />
        <Cell title="Jami summa" value={fmtMoney(s.totalAmount, { suffix: true })} />
        <Cell title="To'langan" value={fmtMoney(s.paidAmount, { suffix: true })} valueColor={c.ok} />
        <Cell title="Holat" right={<Pill label={st.label} tone={st.tone} />} />
      </Group>

      <Group header="Ma'lumot">
        <Cell title="To'lov turi" value={payLabel(s.paymentType)} />
        {s.bankName ? <Cell title="Bank" value={s.bankName} /> : null}
        {s.plan ? <Cell title="Oylik to'lov" value={fmtMoney(s.plan.monthly, { suffix: true })} /> : null}
        {s.plan && s.plan.down > 0 ? <Cell title="Boshlang'ich to'lov" value={fmtMoney(s.plan.down, { suffix: true })} /> : null}
        {s.dueDate ? <Cell title="Muddat" value={fmtDate(s.dueDate)} /> : null}
        {s.customer ? <Cell title="Mijoz" value={s.customer} /> : null}
        {s.phone ? <Cell title="Telefon" value={s.phone} valueColor={c.tint} onPress={() => Linking.openURL(`tel:${s.phone}`)} accessibilityLabel={`Qo'ng'iroq: ${s.phone}`} /> : null}
        <Cell title="Mahsulot" value={s.product} />
        {s.imei && !s.imei.startsWith('SVR-') ? <Cell title="Kod" value={s.imei} valueMono={MONO} /> : null}
        <Cell title="Sana" value={fmtDate(s.createdAt)} />
        {s.soldBy ? <Cell title="Sotuvchi" value={s.soldBy} /> : null}
      </Group>

      {s.plan && s.plan.schedule.length > 0 ? (
        <Group header={`To'lov jadvali · ${s.plan.monthsPaid}/${s.plan.months}`}>
          {s.plan.schedule.map((m) => {
            const meta = MONTH_STATE[m.state] ?? MONTH_STATE.upcoming;
            return (
              <Cell
                key={m.month}
                icon={meta.icon}
                iconColor={c.sq[meta.sq]}
                title={fmtDayMonth(m.dueDate)}
                subtitle={m.state === 'partial' ? `${m.month}-oy · ${fmtMoney(m.paidAmount)} to'landi` : `${m.month}-oy`}
                right={
                  <View style={st2.col}>
                    <Text style={[st2.colAmt, tabular, { color: c.ink }]}>{fmtMoney(m.amount)}</Text>
                    <Pill label={meta.label} tone={meta.tone} />
                  </View>
                }
              />
            );
          })}
        </Group>
      ) : null}

      {s.payments.length > 0 ? (
        <Group header="To'lovlar tarixi">
          {[...s.payments].reverse().map((p, i) => (
            <Cell
              key={`${p.paidAt}-${i}`}
              icon="cash"
              iconColor={c.sq.o}
              title={fmtMoney(p.amount, { suffix: true })}
              subtitle={[fmtDate(p.paidAt), p.note, p.recordedBy].filter(Boolean).join(' · ')}
            />
          ))}
        </Group>
      ) : null}

      <PaySheet
        visible={sheet}
        onClose={() => setSheet(false)}
        sale={s}
        suggested={nextDue}
        onPaid={() => { setSheet(false); res.reloadSilently(); }}
      />
    </Screen>
  );
}

function PaySheet({ visible, onClose, sale, suggested, onPaid }: {
  visible: boolean; onClose: () => void; sale: Sale; suggested: number; onPaid: () => void;
}) {
  const { c } = useTheme();
  const L = useLayout();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const val = Number(digits(amount)) || 0;
  const tooMuch = val > sale.remainingAmount;

  async function pay() {
    if (!val) { Alert.alert('Summa', 'To\'lov summasini kiriting.'); return; }
    if (tooMuch) { Alert.alert('Summa', `Qoldiqdan oshmasin: ${fmtMoney(sale.remainingAmount, { suffix: true })}`); return; }
    setBusy(true);
    try {
      await api(`/api/mobile/sales/${sale.id}`, { method: 'POST', body: { amount: val, note: 'Mobil to\'lov' } });
      setAmount('');
      onPaid();
      Alert.alert('Qabul qilindi', `${fmtMoney(val, { suffix: true })} to'lov yozildi.`);
    } catch (e) {
      Alert.alert('Xatolik', errMsg(e, 'To\'lovda xatolik'));
    } finally { setBusy(false); }
  }

  const quick = [
    ...(sale.plan && suggested > 0 && suggested < sale.remainingAmount ? [{ key: suggested, label: `Bir oy · ${fmtMoney(suggested)}` }] : []),
    { key: sale.remainingAmount, label: `To'liq · ${fmtMoney(sale.remainingAmount)}` },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent={false}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[L.content, { paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 12, paddingBottom: insets.bottom + 24, gap: 18 }]} keyboardShouldPersistTaps="handled">
          <View style={st2.sheetBar}>
            <Button title="Bekor qilish" variant="plain" onPress={onClose} />
            <Text style={[st2.sheetTitle, { color: c.ink }]}>To&apos;lov</Text>
            <View style={{ width: 90 }} />
          </View>
          <Group>
            <Cell title={sale.customer ?? sale.product} subtitle={`№${sale.saleNo}`} />
            <Cell title="Qoldiq" value={fmtMoney(sale.remainingAmount, { suffix: true })} valueColor={c.bad} />
          </Group>
          <Field
            label="To'lov summasi"
            value={grouped(amount)}
            onChangeText={(v) => setAmount(digits(v))}
            keyboardType="numeric"
            placeholder="0"
            suffix="so'm"
            autoFocus
            error={tooMuch ? 'Qoldiqdan katta' : null}
          />
          <Chips options={quick} value={val || null} onChange={(k) => setAmount(String(k))} />
          <Button title="Qabul qilish" value={val ? fmtMoney(val) : undefined} size="lg" full loading={busy} disabled={!val || tooMuch} onPress={pay} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st2 = StyleSheet.create({
  amount: { fontSize: 15, fontWeight: '700' },
  col: { alignItems: 'flex-end', gap: 3 },
  colAmt: { fontSize: 15, fontWeight: '600' },
  sheetBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 17, fontWeight: '600' },
});
