import { useCallback, useMemo, useState } from 'react';
import { View, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced, usePaged } from '@/lib/hooks';
import { takePicked, type PickedProduct } from '@/lib/pick';
import { useTheme, tabular } from '@/lib/theme';
import { digits, grouped, fmtMoney, fmtDateTime, fmtPhoneLocal, phoneLocal, phoneE164, payLabels, payMethodLabel, PAY_METHODS, type PayMethod, type PayType } from '@/lib/format';
import { useOfflinePos } from '@/lib/offlinePos';
import { isNetworkError, searchCatalog, toPicked } from '@/lib/offline';
import { useDict, tr } from '@/lib/i18n';
import { fmtQty, isFractionalUnit, parseQty, priceTimesQty, qtyWithUnit } from '@/lib/qty';
import {
  Screen, NavBar, LargeTitle, SearchField, Group, Cell, AmountColumn, Pill, Button, IconButton, SegmentedControl,
  Field, Chips, Stepper, Loading, EmptyState, ErrorState,
} from '@/components/ui';

const MONTH_PRESETS = [3, 6, 9, 12];

export default function SaleNew() {
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string; name?: string; price?: string; track?: string; available?: string; unit?: string; pay?: string }>();
  const { me } = useAuth();
  const { c } = useTheme();
  const d = useDict();
  const f = me?.features ?? {};
  const nasiyaOn = !!(f.variant || f.nasiya);

  // Bank krediti: server bankName talab qiladi, lekin mobil API'da banklar ro'yxati yo'q — shu sababli yashirin.
  const payTypes: PayType[] = ['cash', 'debt', ...(nasiyaOn ? ['installment' as PayType] : [])];

  const initial: PickedProduct | null = params.productId && params.name ? {
    id: String(params.productId), name: String(params.name), salePrice: Number(params.price) || 0,
    available: Number(params.available) || 1, trackQuantity: params.track === '1', status: 'in_stock',
    unit: params.unit || null,
  } : null;

  const [picked, setPicked] = useState<PickedProduct | null>(initial);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);

  const [pay, setPay] = useState<PayType>(params.pay === 'installment' && nasiyaOn ? 'installment' : 'cash');
  // Pul qanday keldi: naqd / UzCard / HUMO / Click / Payme (qarz/nasiyada — hozir to'langan qism)
  const [method, setMethod] = useState<PayMethod>('cash');
  const [qty, setQty] = useState(1);
  // kg/m… — miqdor matn bilan kiritiladi ("1,5"); dona — Stepper
  const [qtyText, setQtyText] = useState(initial ? fmtQty(Math.min(1, initial.available)) : '1');
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

  // Oflayn: server ro'yxati tarmoq xatosi bilan tugasa — qurilmadagi katalogdan qidiramiz
  const pos = useOfflinePos();
  // usePaged xatoni matn qilib beradi — tarmoq xatosi api.ts dagi aynan shu matnlar
  const listNetErr = !!list.error && (list.error === d.api.offline || list.error === d.api.timeout);
  const listOffline = listNetErr && list.items.length === 0 && !!pos.catalog;
  const offlineItems = useMemo(
    () => (listOffline ? searchCatalog(pos.catalog, dq).map(toPicked) : []),
    [listOffline, pos.catalog, dq],
  );

  const choose = useCallback((p: PickedProduct) => {
    const first = p.trackQuantity && isFractionalUnit(p.unit) ? Math.min(1, p.available) : 1;
    setPicked(p); setQty(1); setQtyText(fmtQty(first)); setTotal(String(priceTimesQty(p.salePrice, first))); setTotalEdited(false);
  }, []);

  // Skanerdan (mode=pick) qaytganda
  useFocusEffect(useCallback(() => { const p = takePicked(); if (p) choose(p); }, [choose]));

  function changeQty(n: number) {
    setQty(n);
    if (picked && !totalEdited) setTotal(String(priceTimesQty(picked.salePrice, n)));
  }

  const fractional = !!picked?.trackQuantity && isFractionalUnit(picked?.unit);
  const fracQty = fractional ? parseQty(qtyText, picked?.unit) : null;
  /** Sotiladigan miqdor: kasrli birlikda kiritilgan matndan, aks holda Stepper qiymati */
  const saleQty = fractional ? fracQty : qty;

  function changeQtyText(v: string) {
    const text = v.replace(/[^\d.,]/g, '');
    setQtyText(text);
    const n = parseQty(text, picked?.unit);
    if (picked && n !== null && !totalEdited) setTotal(String(priceTimesQty(picked.salePrice, n)));
  }

  const totalN = Number(digits(total)) || 0;
  const paidN = pay === 'cash' ? totalN : Number(digits(paid)) || 0;
  const monthsN = Number(months) || 0;
  const needCustomer = pay !== 'cash';
  const phone = phoneLocal(custPhone);

  const errors = {
    qty: fractional && (fracQty === null || fracQty > (picked?.available ?? 0)) ? d.saleNew.errQty : null,
    total: totalN <= 0 ? d.saleNew.errTotal : null,
    paid: pay !== 'cash' && paidN > totalN ? d.saleNew.errPaid : null,
    months: pay === 'installment' && (monthsN < 1 || monthsN > 60) ? d.saleNew.errMonths : null,
    name: needCustomer && !custName.trim() ? d.saleNew.errName : null,
    phone: needCustomer && phone.length !== 9 ? d.saleNew.errPhone : null,
  };
  const show = (k: keyof typeof errors) => (tried ? errors[k] : null);
  const valid = !Object.values(errors).some(Boolean);

  async function submit() {
    setTried(true);
    if (!picked) { Alert.alert(d.saleNew.pickTitle, d.saleNew.pickMsg); return; }
    if (!valid) return;
    setBusy(true);
    const body = {
      productId: picked.id,
      paymentType: pay,
      totalAmount: totalN,
      paidAmount: paidN,
      installmentMonths: pay === 'installment' ? monthsN : undefined,
      customerName: needCustomer ? custName.trim() : '',
      customerPhone: needCustomer ? phoneE164(phone) : '',
      saleQty: picked.trackQuantity ? saleQty ?? undefined : undefined,
      notes: notes.trim() || undefined,
      payMethod: paidN > 0 ? method : undefined,
    };
    try {
      const r = await api<{ id: string; saleNo: string; totalAmount: number; remainingAmount: number; receiptPath: string | null }>('/api/mobile/sales', { method: 'POST', body });
      router.replace({
        pathname: '/sale-done',
        params: { id: r.id, no: r.saleNo, total: String(r.totalAmount), remaining: String(r.remainingAmount), receipt: r.receiptPath ?? '' },
      });
    } catch (e) {
      if (!isNetworkError(e)) {
        Alert.alert(d.saleNew.failTitle, errMsg(e, d.saleNew.failFallback));
        return;
      }
      // Internet yo'q: naqd sotuv telefonda saqlanadi va keyin yuboriladi; qarz/nasiya — yo'q
      pos.markOffline();
      // Oflayn faqat naqd: karta/o'tkazma to'lovini tasdiqlab bo'lmaydi
      if (pay !== 'cash' || method !== 'cash') {
        Alert.alert(d.offline.bannerTitle, d.offline.cashOnly);
        return;
      }
      try {
        await pos.enqueue({
          productId: picked.id,
          name: picked.name,
          qty: picked.trackQuantity ? saleQty ?? 1 : 1,
          unit: picked.unit ?? null,
          totalAmount: totalN,
          notes: notes.trim(),
        });
        Alert.alert(d.offline.savedTitle, d.offline.savedMsg, [{ text: 'OK', onPress: () => router.back() }]);
      } catch (err) {
        Alert.alert(d.saleNew.failTitle, errMsg(err, d.saleNew.failFallback));
      }
    } finally { setBusy(false); }
  }

  /* ───── 1-qadam: mahsulot tanlash ───── */
  if (!picked) {
    return (
      <Screen keyboard header={<NavBar backLabel={d.common.cancel} />}>
        <LargeTitle title={d.saleNew.title} subtitle={d.saleNew.subtitle} />
        <SearchField
          value={q}
          onChangeText={setQ}
          placeholder={d.saleNew.searchPlaceholder}
          right={<IconButton icon="barcode-outline" label={d.common.scanner} tone="plain" onPress={() => router.push('/scan?mode=pick')} />}
        />
        {listOffline ? (
          <Text style={[s.offline, { color: c.warn }]}>
            {d.offline.bannerTitle}. {tr(d.offline.bannerCatalog, { time: fmtDateTime(pos.catalog?.savedAt) })}
          </Text>
        ) : null}
        {list.loading && list.items.length === 0 ? <Loading />
          : listOffline ? (
            offlineItems.length === 0
              ? <EmptyState icon="search" title={d.saleNew.notFound} message={dq ? tr(d.saleNew.notFoundQ, { q: dq }) : d.saleNew.notFoundEmpty} />
              : (
                <Group>
                  {offlineItems.map((p) => {
                    const ok = p.available > 0;
                    return (
                      <Cell
                        key={p.id}
                        icon="cube"
                        iconColor={ok ? c.sq.b : c.sq.g}
                        title={p.name}
                        subtitle={p.trackQuantity ? tr(d.saleNew.leftPcs, { n: qtyWithUnit(p.available, p.unit, d.productFields.units) }) : undefined}
                        right={<AmountColumn amount={fmtMoney(p.salePrice)}>{ok ? null : <Pill label={d.saleNew.notInSale} tone="mut" />}</AmountColumn>}
                        disabled={!ok}
                        onPress={() => choose(p)}
                      />
                    );
                  })}
                </Group>
              )
          )
          : list.error && list.items.length === 0 ? <ErrorState message={listNetErr ? d.offline.noCatalog : list.error} onRetry={list.retry} />
          : list.items.length === 0 ? <EmptyState icon="search" title={d.saleNew.notFound} message={dq ? tr(d.saleNew.notFoundQ, { q: dq }) : d.saleNew.notFoundEmpty} />
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
                    subtitle={p.trackQuantity ? tr(d.saleNew.leftPcs, { n: qtyWithUnit(p.available, p.unit, d.productFields.units) }) : undefined}
                    right={<AmountColumn amount={fmtMoney(p.salePrice)}>{ok ? null : <Pill label={d.saleNew.notInSale} tone="mut" />}</AmountColumn>}
                    disabled={!ok}
                    onPress={() => choose(p)}
                  />
                );
              })}
            </Group>
          )}
        {list.loadingMore ? <ActivityIndicator color={c.tint} /> : list.hasMore ? <Button title={d.common.showMore} variant="plain" onPress={list.loadMore} style={{ alignSelf: 'center' }} /> : null}
      </Screen>
    );
  }

  /* ───── 2-qadam: to'lov ───── */
  const left = Math.max(0, totalN - paidN);
  const monthly = pay === 'installment' && monthsN > 0 ? Math.ceil(left / monthsN) : 0;

  return (
    <Screen
      keyboard
      header={<NavBar backLabel={d.common.cancel} />}
      footer={<Button title={d.saleNew.finish} value={fmtMoney(totalN)} size="lg" full loading={busy} onPress={submit} />}
    >
      <LargeTitle title={d.saleNew.title} />

      <Group>
        <Cell
          icon="cube"
          iconColor={c.sq.b}
          title={picked.name}
          subtitle={`${fmtMoney(picked.salePrice, { suffix: true })}${picked.trackQuantity ? tr(d.saleNew.available, { n: qtyWithUnit(picked.available, picked.unit, d.productFields.units) }) : ''}`}
          right={<Button title={d.common.change} size="sm" variant="tinted" onPress={() => setPicked(null)} />}
        />
        {picked.trackQuantity && !fractional ? (
          <Cell title={d.common.qty} right={<Stepper value={qty} onChange={changeQty} min={1} max={Math.max(1, picked.available)} />} />
        ) : null}
      </Group>

      {fractional ? (
        <Field
          label={d.common.qty}
          value={qtyText}
          onChangeText={changeQtyText}
          keyboardType="decimal-pad"
          placeholder="1,5"
          suffix={picked.unit ? d.productFields.units[picked.unit] : undefined}
          error={show('qty')}
          hint={d.saleNew.qtyHint}
        />
      ) : null}

      <View style={{ gap: 8 }}>
        <Text style={[s.label, { color: c.ink3 }]}>{d.saleNew.payType}</Text>
        <SegmentedControl options={payTypes.map((k) => ({ key: k, label: payLabels()[k] }))} value={pay} onChange={setPay} />
      </View>

      <Field
        label={d.saleNew.amount}
        value={grouped(total)}
        onChangeText={(v) => { setTotal(digits(v)); setTotalEdited(true); }}
        keyboardType="numeric"
        placeholder="0"
        suffix={d.format.currency}
        error={show('total')}
      />

      {needCustomer ? (
        <Field
          label={pay === 'installment' ? d.saleNew.down : d.saleNew.paidNow}
          value={grouped(paid)}
          onChangeText={(v) => setPaid(digits(v))}
          keyboardType="numeric"
          placeholder="0"
          suffix={d.format.currency}
          error={show('paid')}
        />
      ) : null}

      {pay === 'cash' || paidN > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={[s.label, { color: c.ink3 }]}>{d.saleNew.payMethod}</Text>
          <Chips options={PAY_METHODS.map((m) => ({ key: m, label: payMethodLabel(m) }))} value={method} onChange={setMethod} />
        </View>
      ) : null}

      {pay === 'installment' ? (
        <View style={{ gap: 8 }}>
          <Text style={[s.label, { color: c.ink3 }]}>{d.saleNew.term}</Text>
          <Chips options={MONTH_PRESETS.map((m) => ({ key: m, label: tr(d.common.months, { n: m }) }))} value={MONTH_PRESETS.includes(monthsN) ? monthsN : null} onChange={(m) => setMonths(String(m))} />
          <Field value={months} onChangeText={(v) => setMonths(digits(v).slice(0, 2))} keyboardType="numeric" placeholder={d.saleNew.otherTerm} suffix={d.saleNew.monthSuffix} error={show('months')} />
        </View>
      ) : null}

      {needCustomer ? (
        <>
          <Field label={d.saleNew.custName} value={custName} onChangeText={setCustName} placeholder={d.saleNew.custPlaceholder} autoCapitalize="words" textContentType="name" error={show('name')} />
          <Field
            label={d.common.phone}
            prefix="+998"
            value={fmtPhoneLocal(custPhone)}
            onChangeText={(v) => setCustPhone(phoneLocal(v))}
            placeholder={d.common.phonePlaceholder}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            maxLength={12}
            error={show('phone')}
          />
        </>
      ) : null}

      <Field label={d.common.noteOptional} value={notes} onChangeText={setNotes} placeholder={d.saleNew.notesPlaceholder} />

      <Group header={d.saleNew.summary}>
        <Cell title={d.common.total} value={fmtMoney(totalN, { suffix: true })} valueStrong />
        {needCustomer ? <Cell title={d.saleNew.payNow} value={fmtMoney(paidN, { suffix: true })} valueColor={c.ok} /> : null}
        {needCustomer ? <Cell title={d.common.remaining} value={fmtMoney(left, { suffix: true })} valueColor={left > 0 ? c.bad : c.ok} /> : null}
        {monthly > 0 ? <Cell title={d.saleNew.monthly} right={<Text style={[s.gold, tabular, { color: c.gold }]}>{fmtMoney(monthly, { suffix: true })}</Text>} /> : null}
      </Group>
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500' },
  offline: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  gold: { fontSize: 15, fontWeight: '600' },
});
