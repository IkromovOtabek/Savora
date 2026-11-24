import { useEffect, useState } from 'react';
import { View, Alert } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, errMsg } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney, digits, grouped, startOfToday } from '@/lib/format';
import { uzPhoneE164 } from '@/lib/phone';
import { useDict, tr } from '@/lib/i18n';
import { CustomerPicker, EMPTY_CUSTOMER, type PickedCustomer } from '@/components/CustomerPicker';
import { Screen, NavBar, LargeTitle, Field, Chips, Button, Loading, ErrorState } from '@/components/ui';

/** GET /api/mobile/sales/[id] — tahrirlash uchun kerakli maydonlar */
interface Sale {
  id: string; saleNo: string; product: string; customer: string | null; phone: string | null; customerId?: string | null;
  notes?: string | null; paymentType: string; bankParts?: { bankName: string; amount: number }[];
  totalAmount: number; paidAmount: number; remainingAmount: number; dueDate: string | null; status: string;
  plan: { down: number } | null; checkoutItems?: number;
}

type DuePreset = '7' | '14' | '30' | 'none';
const DAY = 24 * 60 * 60 * 1000;

/** "05.11.2026" → "2026-11-05"; noto'g'ri — null */
function dmyToIso(v: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v.trim());
  if (!m) return null;
  const [dd, mm, yyyy] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  return dt.getUTCFullYear() === yyyy && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
/** Server sanasi (UTC kun) → "05.11.2026" */
function isoToDmy(v: string | null): string {
  if (!v) return '';
  const [y, mo, da] = new Date(v).toISOString().slice(0, 10).split('-');
  return `${da}.${mo}.${y}`;
}
/** Yozish paytida nuqtalarni o'zi qo'yadi: 05112026 → 05.11.2026 */
function maskDmy(v: string): string {
  const x = digits(v).slice(0, 8);
  return [x.slice(0, 2), x.slice(2, 4), x.slice(4, 8)].filter(Boolean).join('.');
}
/** Bugun + N kun (mahalliy) → "KK.OO.YYYY" */
function inDays(n: number): string {
  const t = new Date(startOfToday() + n * DAY);
  return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${t.getFullYear()}`;
}

/**
 * Narx o'zgarishining pul oqibati — server (web/lib/saleEdit computePriceEdit) bilan bir xil qoida:
 * oshsa — farq qoldiqqa; kamaysa — avval qoldiq, ortig'i mijozga naqd qaytariladi.
 */
function pricePreview(s: Sale, next: number) {
  if (!next || next === s.totalAmount) return null;
  if (s.paymentType === 'installment' && next <= (s.plan?.down ?? 0)) return { error: 'belowDown' as const };
  const delta = next - s.totalAmount;
  if (delta > 0) return { delta, remaining: s.remainingAmount + delta, refund: 0 };
  const debtCut = Math.min(-delta, s.remainingAmount);
  const refund = Math.min(-delta - debtCut, s.paidAmount);
  return { delta, remaining: s.remainingAmount - debtCut, refund };
}

export default function SaleEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const res = useResource<Sale>(id ? `/api/mobile/sales/${id}` : null);
  const d = useDict();
  const s = res.data;

  if (!s) {
    return (
      <Screen header={<NavBar backLabel={d.common.back} />}>
        {res.loading ? <Loading /> : <ErrorState message={res.error} onRetry={res.retry} />}
      </Screen>
    );
  }
  return <EditForm sale={s} />;
}

function EditForm({ sale: s }: { sale: Sale }) {
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const { c } = useTheme();
  const d = useDict();
  const k = d.saleEdit;

  const initialCustomer: PickedCustomer = s.customer || s.phone
    ? { id: s.customerId ?? '', name: s.customer ?? '', phone: s.phone ?? '' }
    : EMPTY_CUSTOMER;
  const hadCustomer = !!(s.customer || s.phone);
  const [customer, setCustomer] = useState<PickedCustomer>(initialCustomer);
  const [custOn, setCustOn] = useState(hadCustomer || s.paymentType !== 'cash' || s.remainingAmount > 0);
  const [notes, setNotes] = useState(s.notes ?? '');
  const initialDue = isoToDmy(s.dueDate);
  const [due, setDue] = useState(initialDue);
  const [price, setPrice] = useState(String(s.totalAmount));
  const [busy, setBusy] = useState(false);

  const bank = s.paymentType === 'bank_credit' || (s.bankParts?.length ?? 0) > 0;
  const showPrice = can('sale.editPrice') && !bank;
  const priceN = Number(digits(price)) || 0;
  const preview = showPrice ? pricePreview(s, priceN) : null;
  const remainingAfter = preview && !('error' in preview) ? preview.remaining : s.remainingAmount;
  const customerRequired = s.paymentType !== 'cash' || remainingAfter > 0;
  const showDue = (s.paymentType === 'debt' || s.paymentType === 'cash') && (remainingAfter > 0 || !!initialDue);
  const dueIso = due ? dmyToIso(due) : null;
  const dueBad = !!due && !dueIso;

  // Narx oshib qoldiq paydo bo'lsa — mijoz shart
  useEffect(() => { if (customerRequired) setCustOn(true); }, [customerRequired]);

  const duePreset: DuePreset | null = !due ? 'none' : due === inDays(7) ? '7' : due === inDays(14) ? '14' : due === inDays(30) ? '30' : null;

  async function save() {
    const body: Record<string, unknown> = {};
    if (custOn) {
      const same = customer.id === initialCustomer.id && customer.name === initialCustomer.name && customer.phone === initialCustomer.phone;
      if (!same) {
        body.customer = {
          id: customer.id || undefined,
          name: customer.name.trim(),
          phone: customer.id ? customer.phone : uzPhoneE164(customer.phone) || customer.phone,
        };
      }
    } else if (hadCustomer) {
      body.customer = null;
    }
    if (notes.trim() !== (s.notes ?? '')) body.notes = notes.trim();
    if (showDue && due !== initialDue) {
      if (dueBad) { Alert.alert(d.common.error, k.dueBad); return; }
      body.dueDate = dueIso;
    }
    if (showPrice && priceN && priceN !== s.totalAmount) body.totalAmount = priceN;
    if (Object.keys(body).length === 0) { Alert.alert(k.title, k.noChanges); return; }

    const send = async () => {
      setBusy(true);
      try {
        const r = await api<{ ok: boolean; message: string }>(`/api/mobile/sales/${s.id}`, { method: 'PATCH', body });
        // Sotuv kartasi va ro'yxatlar yangilansin
        void qc.invalidateQueries({ queryKey: ['res', `/api/mobile/sales/${s.id}`] });
        void qc.invalidateQueries({ queryKey: ['paged'] });
        Alert.alert(k.saved, r.message);
        router.back();
      } catch (e) {
        Alert.alert(k.error, errMsg(e, k.error));
      } finally { setBusy(false); }
    };
    if (preview && !('error' in preview) && preview.refund > 0 && body.totalAmount !== undefined) {
      Alert.alert(k.confirmTitle, tr(k.confirmRefund, { v: fmtMoney(preview.refund, { suffix: true }) }), [
        { text: d.common.cancel, style: 'cancel' },
        { text: k.save, onPress: () => { void send(); } },
      ]);
      return;
    }
    await send();
  }

  return (
    <Screen
      header={<NavBar backLabel={d.common.back} />}
      keyboard
      footer={<Button title={k.save} size="lg" full loading={busy} disabled={busy || dueBad || (!!preview && 'error' in preview)} onPress={save} />}
    >
      <LargeTitle size="medium" title={k.title} subtitle={`№${s.saleNo} · ${s.product}`} />
      <Text style={{ color: c.ink3, fontSize: 14, lineHeight: 20 }}>{k.hint}</Text>

      {custOn ? (
        <View style={{ gap: 8 }}>
          <CustomerPicker value={customer} onChange={setCustomer} />
          {(s.checkoutItems ?? 1) > 1 ? <Text style={{ color: c.ink3, fontSize: 13 }}>{tr(k.customerAllItems, { n: s.checkoutItems ?? 1 })}</Text> : null}
          {!customerRequired ? <Button title={k.customerRemove} variant="plain" icon="close" onPress={() => setCustOn(false)} style={{ alignSelf: 'flex-start' }} /> : null}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={{ color: c.ink3, fontSize: 14 }}>{hadCustomer ? k.customerRemoved : k.customerNone}</Text>
          <Button title={k.customerAdd} variant="tinted" icon="person-add-outline" onPress={() => { setCustomer(initialCustomer); setCustOn(true); }} style={{ alignSelf: 'flex-start' }} />
        </View>
      )}

      <Field label={d.saleDetail.notes} value={notes} onChangeText={setNotes} placeholder={k.notesPh} maxLength={500} multiline />

      {showDue ? (
        <View style={{ gap: 8 }}>
          <Field
            label={k.due}
            value={due}
            onChangeText={(v) => setDue(maskDmy(v))}
            placeholder={k.duePh}
            keyboardType="numeric"
            maxLength={10}
            error={dueBad ? k.dueBad : null}
          />
          <Chips<DuePreset>
            options={[
              { key: '7', label: k.week1 },
              { key: '14', label: k.week2 },
              { key: '30', label: k.month1 },
              { key: 'none', label: k.dueNone },
            ]}
            value={duePreset}
            onChange={(p) => setDue(p === 'none' ? '' : inDays(Number(p)))}
          />
        </View>
      ) : null}

      {showPrice ? (
        <Field
          label={k.price}
          value={grouped(price)}
          onChangeText={(v) => setPrice(digits(v))}
          keyboardType="numeric"
          suffix={d.format.currency}
          hint={`${k.priceHint}${s.paymentType === 'installment' ? ` ${k.priceInstallment}` : ''}`}
          error={preview && 'error' in preview ? k.priceBelowDown : null}
        />
      ) : (
        <Text style={{ color: c.ink3, fontSize: 14 }}>{bank ? k.priceLocked : k.priceNoPerm}</Text>
      )}

      {preview && !('error' in preview) ? (
        <View style={{ padding: 14, borderRadius: 12, backgroundColor: preview.refund > 0 ? c.badSoft : c.fill2 }}>
          <Text style={{ color: preview.refund > 0 ? c.bad : c.ink, fontSize: 15, fontWeight: '600' }}>
            {preview.refund > 0
              ? tr(k.previewRefund, { v: fmtMoney(preview.refund, { suffix: true }) })
              : preview.delta > 0
                ? tr(k.previewUp, { v: fmtMoney(preview.remaining, { suffix: true }), d: fmtMoney(preview.delta) })
                : tr(k.previewDebt, { v: fmtMoney(preview.remaining, { suffix: true }) })}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
