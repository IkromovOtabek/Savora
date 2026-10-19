import { useCallback, useRef, useState } from 'react';
import { View, Modal, Alert, Linking, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errMsg } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { useTheme, tabular, MONO } from '@/lib/theme';
import { fmtMoney, fmtDate, fmtDayMonth, payLabel, digits, grouped } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
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

/** Oy holati ko'rinishi — matni lug'atda (d.saleDetail.monthState) */
const MONTH_STATE: Record<string, { tone: Tone; icon: IconName; sq: 'o' | 'a' | 'g' | 'r' | 'b' }> = {
  paid: { tone: 'ok', icon: 'checkmark', sq: 'o' },
  partial: { tone: 'br', icon: 'pie-chart', sq: 'b' },
  upcoming: { tone: 'mut', icon: 'time', sq: 'g' },
  overdue: { tone: 'bad', icon: 'alert', sq: 'r' },
};
const STATUS_TONE: Record<string, Tone> = { paid: 'ok', partial: 'warn', cancelled: 'mut' };

export default function SaleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const d = useDict();
  const can = useCan();
  const res = useResource<Sale>(id ? `/api/mobile/sales/${id}` : null);
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } res.reloadSilently(); }, [res.reloadSilently]));
  const [sheet, setSheet] = useState(false);

  const s = res.data;
  const backLabel = s?.paymentType === 'installment' ? d.tabs.nasiya : d.common.back;

  if (res.loading && !s) return <Screen header={<NavBar backLabel={backLabel} />}><Loading /></Screen>;
  if (!s) return <Screen header={<NavBar backLabel={backLabel} />}><ErrorState message={res.error} onRetry={res.retry} /></Screen>;

  const pct = s.totalAmount > 0 ? s.paidAmount / s.totalAmount : 0;
  const canPay = s.remainingAmount > 0 && s.status !== 'cancelled' && can('payment.accept');
  const nextMonth = s.plan?.schedule.find((m) => !m.paid);
  const nextDue = nextMonth ? Math.min(Math.max(0, nextMonth.amount - nextMonth.paidAmount), s.remainingAmount) : s.remainingAmount;
  const statusLabels: Record<string, string> = d.saleDetail.status;
  const monthLabels: Record<string, string> = d.saleDetail.monthState;
  const st = { label: statusLabels[s.status] ?? s.status, tone: STATUS_TONE[s.status] ?? ('mut' as Tone) };
  const metaLine = [`№${s.saleNo}`, s.customer ? s.product : null, s.plan ? tr(d.saleDetail.monthsMeta, { a: s.plan.monthsPaid, b: s.plan.months }) : payLabel(s.paymentType)].filter(Boolean).join(' · ');

  return (
    <Screen
      header={<NavBar backLabel={backLabel} />}
      refreshing={res.refreshing}
      onRefresh={res.refresh}
      gap={18}
      footer={canPay ? (
        <Button title={d.saleDetail.acceptPayment} value={fmtMoney(nextDue)} size="lg" full onPress={() => setSheet(true)} />
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
        <Cell title={d.common.remaining} right={<Text style={[st2.amount, tabular, { color: s.remainingAmount > 0 ? c.bad : c.ok }]}>{fmtMoney(s.remainingAmount, { suffix: true })}</Text>} />
        <Cell title={d.saleDetail.totalAmount} value={fmtMoney(s.totalAmount, { suffix: true })} />
        <Cell title={d.saleDetail.paid} value={fmtMoney(s.paidAmount, { suffix: true })} valueColor={c.ok} />
        <Cell title={d.saleDetail.state} right={<Pill label={st.label} tone={st.tone} />} />
      </Group>

      <Group header={d.common.info}>
        <Cell title={d.saleDetail.payType} value={payLabel(s.paymentType)} />
        {s.bankName ? <Cell title={d.saleDetail.bank} value={s.bankName} /> : null}
        {s.plan ? <Cell title={d.saleDetail.monthly} value={fmtMoney(s.plan.monthly, { suffix: true })} /> : null}
        {s.plan && s.plan.down > 0 ? <Cell title={d.saleDetail.down} value={fmtMoney(s.plan.down, { suffix: true })} /> : null}
        {s.dueDate ? <Cell title={d.saleDetail.due} value={fmtDate(s.dueDate)} /> : null}
        {s.customer ? <Cell title={d.common.customer} value={s.customer} /> : null}
        {s.phone ? <Cell title={d.common.phone} value={s.phone} valueColor={c.tint} onPress={() => Linking.openURL(`tel:${s.phone}`)} accessibilityLabel={tr(d.saleDetail.callA11y, { v: s.phone })} /> : null}
        <Cell title={d.common.product} value={s.product} />
        {s.imei && !s.imei.startsWith('SVR-') ? <Cell title={d.saleDetail.code} value={s.imei} valueMono={MONO} /> : null}
        <Cell title={d.saleDetail.date} value={fmtDate(s.createdAt)} />
        {s.soldBy ? <Cell title={d.saleDetail.seller} value={s.soldBy} /> : null}
      </Group>

      {s.plan && s.plan.schedule.length > 0 ? (
        <Group header={tr(d.saleDetail.schedule, { a: s.plan.monthsPaid, b: s.plan.months })}>
          {s.plan.schedule.map((m) => {
            const meta = MONTH_STATE[m.state] ?? MONTH_STATE.upcoming;
            return (
              <Cell
                key={m.month}
                icon={meta.icon}
                iconColor={c.sq[meta.sq]}
                title={fmtDayMonth(m.dueDate)}
                subtitle={m.state === 'partial' ? tr(d.saleDetail.monthPartial, { n: m.month, v: fmtMoney(m.paidAmount) }) : tr(d.saleDetail.monthN, { n: m.month })}
                right={
                  <View style={st2.col}>
                    <Text style={[st2.colAmt, tabular, { color: c.ink }]}>{fmtMoney(m.amount)}</Text>
                    <Pill label={monthLabels[m.state] ?? monthLabels.upcoming} tone={meta.tone} />
                  </View>
                }
              />
            );
          })}
        </Group>
      ) : null}

      {s.payments.length > 0 ? (
        <Group header={d.saleDetail.paymentsHistory}>
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
  const d = useDict();
  const L = useLayout();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const val = Number(digits(amount)) || 0;
  const tooMuch = val > sale.remainingAmount;

  async function pay() {
    if (!val) { Alert.alert(d.saleDetail.sumTitle, d.saleDetail.sumMsg); return; }
    if (tooMuch) { Alert.alert(d.saleDetail.sumTitle, tr(d.saleDetail.sumMax, { v: fmtMoney(sale.remainingAmount, { suffix: true }) })); return; }
    setBusy(true);
    try {
      await api(`/api/mobile/sales/${sale.id}`, { method: 'POST', body: { amount: val, note: 'Mobil to\'lov' } });
      setAmount('');
      onPaid();
      Alert.alert(d.saleDetail.accepted, tr(d.saleDetail.acceptedMsg, { v: fmtMoney(val, { suffix: true }) }));
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e, d.saleDetail.payError));
    } finally { setBusy(false); }
  }

  const quick = [
    ...(sale.plan && suggested > 0 && suggested < sale.remainingAmount ? [{ key: suggested, label: tr(d.saleDetail.oneMonth, { v: fmtMoney(suggested) }) }] : []),
    { key: sale.remainingAmount, label: tr(d.saleDetail.full, { v: fmtMoney(sale.remainingAmount) }) },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent={false}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[L.content, { paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 12, paddingBottom: insets.bottom + 24, gap: 18 }]} keyboardShouldPersistTaps="handled">
          <View style={st2.sheetBar}>
            <Button title={d.common.cancel} variant="plain" onPress={onClose} />
            <Text style={[st2.sheetTitle, { color: c.ink }]}>{d.saleDetail.payTitle}</Text>
            <View style={{ width: 90 }} />
          </View>
          <Group>
            <Cell title={sale.customer ?? sale.product} subtitle={`№${sale.saleNo}`} />
            <Cell title={d.common.remaining} value={fmtMoney(sale.remainingAmount, { suffix: true })} valueColor={c.bad} />
          </Group>
          <Field
            label={d.saleDetail.payAmount}
            value={grouped(amount)}
            onChangeText={(v) => setAmount(digits(v))}
            keyboardType="numeric"
            placeholder="0"
            suffix={d.format.currency}
            autoFocus
            error={tooMuch ? d.saleDetail.tooMuch : null}
          />
          <Chips options={quick} value={val || null} onChange={(k) => setAmount(String(k))} />
          <Button title={d.saleDetail.accept} value={val ? fmtMoney(val) : undefined} size="lg" full loading={busy} disabled={!val || tooMuch} onPress={pay} />
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
