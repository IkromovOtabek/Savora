import { useCallback, useState } from 'react';
import { View, Text, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, usePaged } from '@/lib/hooks';
import { takePicked, type PickedProduct } from '@/lib/pick';
import { useTheme, tabular } from '@/lib/theme';
import { digits, grouped, fmtMoney, fmtPhoneLocal, phoneLocal, phoneE164, PAY_LABELS, type PayType } from '@/lib/format';
import {
  Screen, NavBar, LargeTitle, SearchField, Group, Cell, AmountColumn, Pill, Button, IconButton, SegmentedControl,
  Field, Chips, Stepper, Loading, EmptyState, ErrorState,
} from '@/components/ui';

const MONTH_PRESETS = [3, 6, 9, 12];

export default function SaleNew() {
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string; name?: string; price?: string; track?: string; available?: string; pay?: string }>();
  const { me } = useAuth();
  const { c } = useTheme();
  const f = me?.features ?? {};
  const nasiyaOn = !!(f.variant || f.nasiya);

  // Bank krediti: server bankName talab qiladi, lekin mobil API'da banklar ro'yxati yo'q — shu sababli yashirin.
  const payTypes: PayType[] = ['cash', 'debt', ...(nasiyaOn ? ['installment' as PayType] : [])];

  const initial: PickedProduct | null = params.productId && params.name ? {
    id: String(params.productId), name: String(params.name), salePrice: Number(params.price) || 0,
    available: Number(params.available) || 1, trackQuantity: params.track === '1', status: 'in_stock',
  } : null;

  const [picked, setPicked] = useState<PickedProduct | null>(initial);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);

  const [pay, setPay] = useState<PayType>(params.pay === 'installment' && nasiyaOn ? 'installment' : 'cash');
  const [qty, setQty] = useState(1);
  const [total, setTotal] = useState(initial ? String(initial.salePrice) : '');
  const [totalEdited, setTotalEdited] = useState(false);
  const [paid, setPaid] = useState('');
  const [months, setMonths] = useState('6');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const list = usePaged<PickedProduct>(picked ? null : `/api/mobile/products?q=${encodeURIComponent(dq)}`);

  const choose = useCallback((p: PickedProduct) => {
    setPicked(p); setQty(1); setTotal(String(p.salePrice)); setTotalEdited(false);
  }, []);

  // Skanerdan (mode=pick) qaytganda
  useFocusEffect(useCallback(() => { const p = takePicked(); if (p) choose(p); }, [choose]));

  function changeQty(n: number) {
    setQty(n);
    if (picked && !totalEdited) setTotal(String(picked.salePrice * n));
  }

  const totalN = Number(digits(total)) || 0;
  const paidN = pay === 'cash' ? totalN : Number(digits(paid)) || 0;
  const monthsN = Number(months) || 0;
  const needCustomer = pay !== 'cash';
  const phone = phoneLocal(custPhone);

  const errors = {
    total: totalN <= 0 ? 'Summani kiriting' : null,
    paid: pay !== 'cash' && paidN > totalN ? 'Jami summadan oshmasin' : null,
    months: pay === 'installment' && (monthsN < 1 || monthsN > 60) ? '1 dan 60 oygacha' : null,
    name: needCustomer && !custName.trim() ? 'Mijoz ismini kiriting' : null,
    phone: needCustomer && phone.length !== 9 ? 'Telefon 9 ta raqam: 90 123 45 67' : null,
  };
  const show = (k: keyof typeof errors) => (tried ? errors[k] : null);
  const valid = !Object.values(errors).some(Boolean);

  async function submit() {
    setTried(true);
    if (!picked) { Alert.alert('Mahsulot', 'Mahsulot tanlang.'); return; }
    if (!valid) return;
    setBusy(true);
    try {
      const r = await api<{ id: string }>('/api/mobile/sales', {
        method: 'POST',
        body: {
          productId: picked.id,
          paymentType: pay,
          totalAmount: totalN,
          paidAmount: paidN,
          installmentMonths: pay === 'installment' ? monthsN : undefined,
          customerName: needCustomer ? custName.trim() : '',
          customerPhone: needCustomer ? phoneE164(phone) : '',
          saleQty: picked.trackQuantity ? qty : undefined,
          notes: notes.trim() || undefined,
        },
      });
      router.replace(`/sale/${r.id}`);
    } catch (e) {
      Alert.alert('Sotuv amalga oshmadi', errMsg(e, 'Sotuvda xatolik'));
    } finally { setBusy(false); }
  }

  /* ───── 1-qadam: mahsulot tanlash ───── */
  if (!picked) {
    return (
      <Screen keyboard header={<NavBar backLabel="Bekor qilish" />}>
        <LargeTitle title="Yangi sotuv" subtitle="Mahsulotni tanlang yoki skaner qiling" />
        <SearchField
          value={q}
          onChangeText={setQ}
          placeholder="Mahsulot nomi yoki kodi"
          right={<IconButton icon="barcode-outline" label="Skaner" tone="plain" onPress={() => router.push('/scan?mode=pick')} />}
        />
        {list.loading && list.items.length === 0 ? <Loading />
          : list.error && list.items.length === 0 ? <ErrorState message={list.error} onRetry={list.retry} />
          : list.items.length === 0 ? <EmptyState icon="search" title="Mahsulot topilmadi" message={dq ? `«${dq}» bo'yicha hech narsa yo'q.` : 'Omborda sotuvdagi mahsulot yo\'q.'} />
          : (
            <Group>
              {list.items.map((p) => {
                const ok = p.status === 'in_stock' && p.available > 0;
                return (
                  <Cell
                    key={p.id}
                    icon="cube"
                    iconColor={ok ? c.sq.b : c.sq.g}
                    title={p.name}
                    subtitle={p.trackQuantity ? `${fmtMoney(p.available)} dona qoldi` : undefined}
                    right={<AmountColumn amount={fmtMoney(p.salePrice)}>{ok ? null : <Pill label="Sotuvda emas" tone="mut" />}</AmountColumn>}
                    disabled={!ok}
                    onPress={() => choose(p)}
                  />
                );
              })}
            </Group>
          )}
        {list.loadingMore ? <ActivityIndicator color={c.tint} /> : list.hasMore ? <Button title="Ko'proq ko'rsatish" variant="plain" onPress={list.loadMore} style={{ alignSelf: 'center' }} /> : null}
      </Screen>
    );
  }

  /* ───── 2-qadam: to'lov ───── */
  const left = Math.max(0, totalN - paidN);
  const monthly = pay === 'installment' && monthsN > 0 ? Math.ceil(left / monthsN) : 0;

  return (
    <Screen
      keyboard
      header={<NavBar backLabel="Bekor qilish" />}
      footer={<Button title="Sotuvni yakunlash" value={fmtMoney(totalN)} size="lg" full loading={busy} onPress={submit} />}
    >
      <LargeTitle title="Yangi sotuv" />

      <Group>
        <Cell
          icon="cube"
          iconColor={c.sq.b}
          title={picked.name}
          subtitle={`${fmtMoney(picked.salePrice, { suffix: true })}${picked.trackQuantity ? ` · ${fmtMoney(picked.available)} dona bor` : ''}`}
          right={<Button title="O'zgartirish" size="sm" variant="tinted" onPress={() => setPicked(null)} />}
        />
        {picked.trackQuantity ? (
          <Cell title="Miqdor" right={<Stepper value={qty} onChange={changeQty} min={1} max={Math.max(1, picked.available)} />} />
        ) : null}
      </Group>

      <View style={{ gap: 8 }}>
        <Text style={[s.label, { color: c.ink3 }]}>To&apos;lov turi</Text>
        <SegmentedControl options={payTypes.map((k) => ({ key: k, label: PAY_LABELS[k] }))} value={pay} onChange={setPay} />
      </View>

      <Field
        label="Sotuv summasi"
        value={grouped(total)}
        onChangeText={(v) => { setTotal(digits(v)); setTotalEdited(true); }}
        keyboardType="numeric"
        placeholder="0"
        suffix="so'm"
        error={show('total')}
      />

      {needCustomer ? (
        <Field
          label={pay === 'installment' ? 'Boshlang\'ich to\'lov' : 'Hozir to\'langan (ixtiyoriy)'}
          value={grouped(paid)}
          onChangeText={(v) => setPaid(digits(v))}
          keyboardType="numeric"
          placeholder="0"
          suffix="so'm"
          error={show('paid')}
        />
      ) : null}

      {pay === 'installment' ? (
        <View style={{ gap: 8 }}>
          <Text style={[s.label, { color: c.ink3 }]}>Muddat (oy)</Text>
          <Chips options={MONTH_PRESETS.map((m) => ({ key: m, label: `${m} oy` }))} value={MONTH_PRESETS.includes(monthsN) ? monthsN : null} onChange={(m) => setMonths(String(m))} />
          <Field value={months} onChangeText={(v) => setMonths(digits(v).slice(0, 2))} keyboardType="numeric" placeholder="Boshqa muddat" suffix="oy" error={show('months')} />
        </View>
      ) : null}

      {needCustomer ? (
        <>
          <Field label="Mijoz ismi" value={custName} onChangeText={setCustName} placeholder="Ism Familiya" autoCapitalize="words" textContentType="name" error={show('name')} />
          <Field
            label="Telefon"
            prefix="+998"
            value={fmtPhoneLocal(custPhone)}
            onChangeText={(v) => setCustPhone(phoneLocal(v))}
            placeholder="90 123 45 67"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            maxLength={12}
            error={show('phone')}
          />
        </>
      ) : null}

      <Field label="Izoh (ixtiyoriy)" value={notes} onChangeText={setNotes} placeholder="Qo'shimcha ma'lumot" />

      <Group header="Xulosa">
        <Cell title="Jami" value={fmtMoney(totalN, { suffix: true })} valueStrong />
        {needCustomer ? <Cell title="Hozir to'lanadi" value={fmtMoney(paidN, { suffix: true })} valueColor={c.ok} /> : null}
        {needCustomer ? <Cell title="Qoldiq" value={fmtMoney(left, { suffix: true })} valueColor={left > 0 ? c.bad : c.ok} /> : null}
        {monthly > 0 ? <Cell title="Oylik (taxminan)" right={<Text style={[s.gold, tabular, { color: c.gold }]}>{fmtMoney(monthly, { suffix: true })}</Text>} /> : null}
      </Group>
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500' },
  gold: { fontSize: 15, fontWeight: '600' },
});
