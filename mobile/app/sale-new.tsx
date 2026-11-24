import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { api, ApiError, errMsg } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth';
import { useDebounced, usePaged, useResource } from '@/lib/hooks';
import { takePicked, type PickedProduct } from '@/lib/pick';
import { useTheme, tabular } from '@/lib/theme';
import { digits, grouped, fmtMoney, fmtDate, fmtDateTime, payLabels, payMethodLabel, PAY_METHODS, type PayMethod, type PayType } from '@/lib/format';
import { uzPhone9, uzPhoneE164 } from '@/lib/phone';
import { useOfflinePos } from '@/lib/offlinePos';
import { getNetState } from '@/lib/net';
import { isNetworkError, newClientSaleId, searchCatalog, toPicked } from '@/lib/offline';
import { useDict, tr } from '@/lib/i18n';
import { CustomerPicker, EMPTY_CUSTOMER, type PickedCustomer } from '@/components/CustomerPicker';
import { fmtQty, isFractionalUnit, parseQty, priceTimesQty, qtyWithUnit } from '@/lib/qty';
import {
  Screen, NavBar, LargeTitle, SearchField, Group, Cell, AmountColumn, Pill, Button, IconButton, SegmentedControl,
  Field, Chips, Stepper, Loading, EmptyState, ErrorState, InlineError,
} from '@/components/ui';

const MONTH_PRESETS = [3, 6, 9, 12];
/** Bitta sotuvda eng ko'p bank (web lib/bankCredit MAX_BANK_PARTS) va bank + qarz muddati chegarasi (MAX_BANK_DEBT_DAYS) */
const MAX_BANK_PARTS = 5;
const MAX_BANK_DEBT_DAYS = 365;
/** Mijoz qismi muddati: kun — muddatgacha bir martalik qarz, oy — oylik nasiya jadvali (web SaleForm TERM_PRESETS) */
type TermUnit = 'days' | 'months';
const TERM_PRESETS = [
  { key: 'd7', unit: 'days', n: 7 },
  { key: 'd14', unit: 'days', n: 14 },
  { key: 'm1', unit: 'months', n: 1 },
  { key: 'm3', unit: 'months', n: 3 },
  { key: 'm6', unit: 'months', n: 6 },
  { key: 'm12', unit: 'months', n: 12 },
] as const;
type TermKey = (typeof TERM_PRESETS)[number]['key'];

export default function SaleNew() {
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string; name?: string; price?: string; track?: string; available?: string; unit?: string; pay?: string; kind?: string }>();
  const { me } = useAuth();
  const can = useCan();
  const { c } = useTheme();
  const d = useDict();
  const f = me?.features ?? {};
  const nasiyaOn = !!(f.variant || f.nasiya);

  // Bank krediti — Kredit kassa moduli yoqilganda (banklar GET /api/mobile/banks dan)
  const bankOn = !!f.creditKassa;
  const payTypes: PayType[] = ['cash', 'debt', ...(nasiyaOn ? ['installment' as PayType] : []), ...(bankOn ? ['bank_credit' as PayType] : [])];

  const initial: PickedProduct | null = params.productId && params.name ? {
    id: String(params.productId), name: String(params.name), salePrice: Number(params.price) || 0,
    available: Number(params.available) || 1, trackQuantity: params.track === '1', status: 'in_stock',
    unit: params.unit || null,
    kind: params.kind || undefined,
  } : null;

  const [picked, setPicked] = useState<PickedProduct | null>(initial);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);

  const [pay, setPay] = useState<PayType>(
    params.pay === 'installment' && nasiyaOn ? 'installment' : params.pay === 'bank_credit' && bankOn ? 'bank_credit' : 'cash',
  );
  // Pul qanday keldi: naqd / UzCard / HUMO / Click / Payme (qarz/nasiyada — hozir to'langan qism)
  const [method, setMethod] = useState<PayMethod>('cash');
  const [qty, setQty] = useState(1);
  // kg/m… — miqdor matn bilan kiritiladi ("1,5"); dona — Stepper
  const [qtyText, setQtyText] = useState(initial ? fmtQty(Math.min(1, initial.available)) : '1');
  const [total, setTotal] = useState(initial ? String(initial.salePrice) : '');
  const [totalEdited, setTotalEdited] = useState(false);
  const [paid, setPaid] = useState('');
  const [months, setMonths] = useState('6');
  // Bank krediti: bir yoki bir nechta bank (bitta bo'lsa — qolgan summa to'liq unga); mijoz qismi — nasiya yoki qarz
  const [bankRows, setBankRows] = useState<{ bank: string; amount: string }[]>([{ bank: '', amount: '' }]);
  const [partOn, setPartOn] = useState(false);
  const [partAmount, setPartAmount] = useState('');
  const [termUnit, setTermUnit] = useState<TermUnit>(nasiyaOn ? 'months' : 'days');
  const [debtDays, setDebtDays] = useState('7');
  const [newBank, setNewBank] = useState('');
  const [bankFormOpen, setBankFormOpen] = useState(false);
  const [addingBank, setAddingBank] = useState(false);
  const banks = useResource<{ banks: string[]; canAdd?: boolean }>(bankOn && pay === 'bank_credit' ? '/api/mobile/banks' : null);
  // Mijoz — har qanday to'lov turida majburiy (naqd ham, web bilan bir xil); F.I.O katagida mavjud mijozlardan tanlanadi
  const [customer, setCustomer] = useState<PickedCustomer>(EMPTY_CUSTOMER);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  // Bitta sotuv — bitta kalit: javob kelmay qolsa (timeout) qayta yuborish ham, oflayn navbat ham shu kalit
  // bilan ketadi — server sotuvni ikki marta yozmaydi. Boshqa mahsulot tanlansa — yangi sotuv, yangi kalit.
  const saleKey = useRef<string | null>(null);
  useEffect(() => { saleKey.current = null; }, [picked?.id]);

  const list = usePaged<PickedProduct>(picked ? null : `/api/mobile/products?q=${encodeURIComponent(dq)}`);

  // Oflayn: server ro'yxati tarmoq xatosi bilan tugasa — qurilmadagi katalogdan qidiramiz
  const pos = useOfflinePos();
  // Xato turi bo'yicha (matn bilan emas — til almashsa ham ishlaydi). Javob kelmasa — telefondagi katalog ustun:
  // u navbatdagi sotuvlarni qoldiqdan ayirgan, keshdagi server ro'yxati esa eskirgan bo'lishi mumkin
  const listNetErr = list.errorKind === 'network' || list.errorKind === 'timeout';
  const listOffline = listNetErr && !!pos.catalog;
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
  // Narx huquqlari (server bilan bir xil): arzonroq — sale.discount, qimmatroq — sale.editPrice.
  // Ikkalasi ham yo'q bo'lsa summa narx × miqdorga qulflanadi; narxi 0 mahsulotda cheklov yo'q.
  const canDiscount = can('sale.discount');
  const canRaise = can('sale.editPrice');
  const baseQty = picked?.trackQuantity ? saleQty : 1;
  const baseTotal = picked && picked.salePrice > 0 && baseQty !== null ? priceTimesQty(picked.salePrice, baseQty) : null;
  const priceLocked = baseTotal !== null && !canDiscount && !canRaise;
  const paidN = pay === 'cash' ? totalN : Number(digits(paid)) || 0;
  const monthsN = Number(months) || 0;
  /** Qarz/nasiya: hozir to'langan qism va qoldiq ko'rsatiladi */
  const credit = pay !== 'cash';

  // Bank krediti: qolgan summa (jami − bosh to'lov) = banklar + mijoz qismi (web SaleForm bilan bir xil hisob)
  const isBank = pay === 'bank_credit';
  const rest = Math.max(0, totalN - paidN);
  const unit: TermUnit = nasiyaOn ? termUnit : 'days';
  const partN = isBank && partOn ? Number(digits(partAmount)) || 0 : 0;
  const partDebt = isBank && partOn && unit === 'days';
  const partNasiya = isBank && partOn && !partDebt;
  const debtDaysN = Number(debtDays) || 0;
  const bankRest = rest - partN;
  const multiBank = bankRows.length > 1;
  const rowAmount = (r: { amount: string }) => (multiBank ? Number(digits(r.amount)) || 0 : bankRest);
  const bankTotal = bankRows.reduce((a, r) => a + rowAmount(r), 0);
  const unallocated = bankRest - bankTotal;
  const bankList = banks.data?.banks ?? [];
  const partDue = partDebt && debtDaysN >= 1 && debtDaysN <= MAX_BANK_DEBT_DAYS
    ? new Date(Date.now() + debtDaysN * 86_400_000) : null;

  const errors = {
    qty: fractional && (fracQty === null || fracQty > (picked?.available ?? 0)) ? d.saleNew.errQty : null,
    total: totalN <= 0 ? d.saleNew.errTotal
      : baseTotal !== null && totalN < baseTotal && !canDiscount ? d.saleNew.errDiscount
      : baseTotal !== null && totalN > baseTotal && !canRaise ? d.saleNew.errRaise
      : null,
    paid: credit && paidN > totalN ? d.saleNew.errPaid : null,
    months: (pay === 'installment' || partNasiya) && (monthsN < 1 || monthsN > 60) ? d.saleNew.errMonths : null,
    bank: isBank && bankRows.some((r) => !r.bank) ? d.saleNew.errBank : null,
    bankSum: isBank && bankRest < 1 ? d.saleNew.errBankNothing
      : isBank && multiBank && (unallocated !== 0 || bankRows.some((r) => rowAmount(r) < 1)) ? tr(d.saleNew.errBankSum, { sum: fmtMoney(bankRest, { suffix: true }) })
      : null,
    part: isBank && partOn && (partN < 1 || partN >= rest) ? tr(d.saleNew.errPart, { sum: fmtMoney(rest, { suffix: true }) }) : null,
    days: partDebt && (debtDaysN < 1 || debtDaysN > MAX_BANK_DEBT_DAYS) ? d.saleNew.errDays : null,
    // Ro'yxatdan tanlangan mijozning telefoni eski formatda bo'lishi mumkin — tekshirilmaydi
    name: !customer.name.trim() ? d.saleNew.errName : null,
    phone: !customer.id && !uzPhone9(customer.phone) ? d.saleNew.errPhone : null,
  };
  const show = (k: keyof typeof errors) => (tried ? errors[k] : null);
  const valid = !Object.values(errors).some(Boolean);

  function updateBankRow(i: number, patch: Partial<{ bank: string; amount: string }>) {
    setBankRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function addBankRow() {
    setBankRows((rows) => {
      if (rows.length >= MAX_BANK_PARTS) return rows;
      // Birinchi qo'shishda: 1-bank hozirgi qoldiqni oladi, yangisi bo'sh — foydalanuvchi bo'lib chiqadi
      if (rows.length === 1) return [{ ...rows[0], amount: String(bankRest) }, { bank: '', amount: '' }];
      return [...rows, { bank: '', amount: unallocated > 0 ? String(unallocated) : '' }];
    });
  }
  function removeBankRow(i: number) {
    setBankRows((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : rows));
  }
  function togglePart(on: boolean) {
    setPartOn(on);
    // Bir nechta bankda bo'linmagan qoldiq bo'lsa — mijoz qismi shu summadan boshlanadi
    if (on && !partAmount && multiBank && unallocated > 0) setPartAmount(String(unallocated));
    if (!on) setPartAmount('');
  }
  function pickTerm(key: TermKey) {
    const p = TERM_PRESETS.find((x) => x.key === key);
    if (!p) return;
    setTermUnit(p.unit);
    if (p.unit === 'days') setDebtDays(String(p.n));
    else setMonths(String(p.n));
  }
  async function addBank() {
    const name = newBank.trim();
    if (!name) return;
    setAddingBank(true);
    try {
      const r = await api<{ name: string }>('/api/mobile/banks', { method: 'POST', body: { name } });
      banks.setData((prev) => {
        const list = prev?.banks ?? [];
        return { ...(prev ?? {}), banks: list.includes(r.name) ? list : [...list, r.name].sort((a, b) => a.localeCompare(b)) };
      });
      // Bo'sh qatorga yangi bank darhol tanlanadi
      setBankRows((rows) => {
        const i = rows.findIndex((x) => !x.bank);
        return i >= 0 ? rows.map((x, j) => (j === i ? { ...x, bank: r.name } : x)) : rows;
      });
      setNewBank(''); setBankFormOpen(false);
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally { setAddingBank(false); }
  }

  async function submit() {
    setTried(true);
    if (!picked) { Alert.alert(d.saleNew.pickTitle, d.saleNew.pickMsg); return; }
    if (!valid) return;
    setBusy(true);
    if (!saleKey.current) saleKey.current = newClientSaleId();
    const clientSaleId = saleKey.current;
    const body = {
      clientSaleId,
      productId: picked.id,
      paymentType: pay,
      totalAmount: totalN,
      paidAmount: paidN,
      installmentMonths: pay === 'installment' || partNasiya ? monthsN : undefined,
      // Bank krediti: ulushlar, mijoz qismi va uning muddati (server web createSaleAction qoidasini takrorlaydi)
      ...(isBank ? {
        bankParts: bankRows.map((r) => ({ bankName: r.bank, amount: rowAmount(r) })),
        ...(partOn ? { nasiyaAmount: partN, bankTermUnit: unit, debtDays: partDebt ? debtDaysN : undefined } : {}),
      } : {}),
      customerId: customer.id || undefined,
      customerName: customer.name.trim(),
      customerPhone: customer.id ? customer.phone : uzPhoneE164(customer.phone),
      saleQty: picked.trackQuantity ? saleQty ?? undefined : undefined,
      notes: notes.trim() || undefined,
      payMethod: paidN > 0 ? method : undefined,
    };
    const offlineQty = picked.trackQuantity ? saleQty ?? 1 : 1;
    /** Naqd sotuv telefondagi navbatga (o'sha kalit bilan — server uni ikki marta yozmaydi) */
    async function saveOffline(p: PickedProduct) {
      try {
        await pos.enqueue({
          clientSaleId,
          productId: p.id,
          name: p.name,
          qty: offlineQty,
          unit: p.unit ?? null,
          totalAmount: totalN,
          notes: notes.trim(),
          customerId: customer.id || undefined,
          customerName: customer.name.trim(),
          customerPhone: customer.id ? customer.phone : uzPhoneE164(customer.phone),
        });
        Alert.alert(d.offline.savedTitle, d.offline.savedMsg, [{ text: 'OK', onPress: () => router.back() }]);
      } catch (err) {
        Alert.alert(d.saleNew.failTitle, errMsg(err, d.saleNew.failFallback));
      }
    }
    try {
      // Tarmoq oflayn deb aniqlangan — naqd sotuv serverni kutmasdan navbatga. Aks holda «ulangan, lekin javob yo'q»
      // tarmoqda (balans tugagan, signal yo'q) har sotuv 15 s timeout kutardi. Internet qaytsa navbat o'zi yuboriladi.
      if (pay === 'cash' && method === 'cash' && getNetState() === 'offline') {
        await saveOffline(picked);
        return;
      }
      const r = await api<{ id: string; saleNo: string; totalAmount: number; remainingAmount: number; receiptPath: string | null }>('/api/mobile/sales', { method: 'POST', body });
      // Telefondagi oflayn katalog ham kamaysin — aks holda internet uzilsa sotilgan dona yana «bor» ko'rinadi
      void pos.noteSold(picked.id, offlineQty);
      router.replace({
        pathname: '/sale-done',
        params: {
          id: r.id, no: r.saleNo, total: String(r.totalAmount), remaining: String(r.remainingAmount), receipt: r.receiptPath ?? '',
          // Bank krediti: bank qismi alohida; to'liq bank kreditida qoldiq — bank zimmasida (mijoz qarzi emas)
          ...(isBank ? { bank: String(bankTotal), bankOnly: partOn ? '0' : '1' } : {}),
        },
      });
    } catch (e) {
      if (!isNetworkError(e)) {
        Alert.alert(d.saleNew.failTitle, errMsg(e, d.saleNew.failFallback));
        return;
      }
      // Internet yo'q: naqd sotuv telefonda saqlanadi va keyin yuboriladi; qarz/nasiya — yo'q
      pos.markOffline();
      // Oflayn faqat naqd: karta/o'tkazma to'lovini tasdiqlab bo'lmaydi.
      // Timeout — natija noma'lum (server yozgan bo'lishi mumkin); qayta bosish xavfsiz: kalit o'sha (saleKey)
      if (pay !== 'cash' || method !== 'cash') {
        if (e instanceof ApiError && e.kind === 'timeout') Alert.alert(d.saleNew.failTitle, errMsg(e));
        else Alert.alert(d.offline.bannerTitle, d.offline.cashOnly);
        return;
      }
      await saveOffline(picked);
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
                        subtitle={p.trackQuantity && p.kind !== 'service' ? tr(d.saleNew.leftPcs, { n: qtyWithUnit(p.available, p.unit, d.productFields.units) }) : undefined}
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
                    subtitle={p.trackQuantity && p.kind !== 'service' ? tr(d.saleNew.leftPcs, { n: qtyWithUnit(p.available, p.unit, d.productFields.units) }) : undefined}
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
  const monthly = pay === 'installment' && monthsN > 0 ? Math.ceil(left / monthsN)
    : partNasiya && monthsN > 0 && partN > 0 ? Math.ceil(partN / monthsN)
    : 0;
  const termPresets = TERM_PRESETS.filter((p) => nasiyaOn || p.unit === 'days');
  const termKey = termPresets.find((p) => p.unit === unit && (p.unit === 'days' ? debtDaysN : monthsN) === p.n)?.key ?? null;

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
          subtitle={`${fmtMoney(picked.salePrice, { suffix: true })}${picked.trackQuantity && picked.kind !== 'service' ? tr(d.saleNew.available, { n: qtyWithUnit(picked.available, picked.unit, d.productFields.units) }) : ''}`}
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

      {/* Mijoz — yuqorida: Android'da klaviatura ekranni siqmaydi (edge-to-edge), takliflar klaviatura ustida ko'rinsin */}
      <CustomerPicker value={customer} onChange={setCustomer} nameError={show('name')} phoneError={show('phone')} />

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
        editable={!priceLocked}
        style={priceLocked ? { color: c.ink2 } : undefined}
        error={show('total')}
        hint={priceLocked ? d.saleNew.priceLocked : undefined}
      />

      {credit ? (
        <Field
          label={isBank ? d.saleNew.bankDown : pay === 'installment' ? d.saleNew.down : d.saleNew.paidNow}
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

      {isBank ? (
        <View style={{ gap: 10 }}>
          <Text style={[s.label, { color: c.ink3 }]}>{multiBank ? d.saleNew.banks : d.saleNew.bank}</Text>
          {banks.error && !banks.data ? <InlineError message={banks.error} onRetry={banks.retry} />
            : !banks.data ? <Loading />
            : (
              <>
                {bankList.length === 0 ? <Text style={[s.hint, { color: c.ink3 }]}>{d.saleNew.noBanks}</Text> : null}
                {bankList.length > 0 && bankRows.map((r, i) => (
                  <View key={i} style={[s.bankRow, { backgroundColor: c.fill2 }]}>
                    {/* Bir bank ikki qatorda tanlanmasin */}
                    <Chips
                      options={bankList.filter((b) => b === r.bank || !bankRows.some((x, j) => j !== i && x.bank === b)).map((b) => ({ key: b, label: b }))}
                      value={r.bank || null}
                      onChange={(b) => updateBankRow(i, { bank: b })}
                    />
                    {multiBank ? (
                      <Field
                        label={tr(d.saleNew.bankAmount, { n: i + 1 })}
                        value={grouped(r.amount)}
                        onChangeText={(v) => updateBankRow(i, { amount: digits(v) })}
                        keyboardType="numeric"
                        placeholder="0"
                        suffix={d.format.currency}
                        right={<IconButton icon="close" tone="plain" label={d.saleNew.removeBank} onPress={() => removeBankRow(i)} />}
                      />
                    ) : null}
                  </View>
                ))}
                {show('bank') ? <Text style={[s.hint, { color: c.bad }]}>{show('bank')}</Text> : null}
                {bankList.length > 0 ? (
                  <Text style={[s.hint, { color: show('bankSum') ? c.bad : multiBank && unallocated === 0 ? c.ok : c.ink3 }]}>
                    {show('bankSum')
                      ?? (multiBank
                        ? unallocated === 0 ? d.saleNew.bankAllocated
                          : unallocated > 0 ? tr(d.saleNew.bankUnallocated, { sum: fmtMoney(unallocated, { suffix: true }) })
                          : tr(d.saleNew.bankOver, { sum: fmtMoney(-unallocated, { suffix: true }) })
                        : tr(d.saleNew.bankSingleHint, { sum: fmtMoney(Math.max(0, bankRest), { suffix: true }) }))}
                  </Text>
                ) : null}
                <View style={s.bankActions}>
                  {bankRows.length < Math.min(MAX_BANK_PARTS, bankList.length) ? (
                    <Button title={d.saleNew.addBankRow} icon="add" size="sm" variant="tinted" onPress={addBankRow} />
                  ) : null}
                  {banks.data?.canAdd && !bankFormOpen ? (
                    <Button title={d.saleNew.newBank} icon="add" size="sm" variant="gray" onPress={() => setBankFormOpen(true)} />
                  ) : null}
                  {!partOn ? <Button title={d.saleNew.partAdd} icon="add" size="sm" variant="gray" onPress={() => togglePart(true)} /> : null}
                </View>
                {bankFormOpen ? (
                  <Field
                    label={d.saleNew.newBank}
                    value={newBank}
                    onChangeText={setNewBank}
                    placeholder={d.saleNew.newBankPh}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={addBank}
                    right={<Button title={d.saleNew.addBank} size="sm" variant="tinted" loading={addingBank} onPress={addBank} />}
                  />
                ) : null}
              </>
            )}
        </View>
      ) : null}

      {isBank && partOn ? (
        <View style={{ gap: 8 }}>
          <Field
            label={d.saleNew.partLabel}
            value={grouped(partAmount)}
            onChangeText={(v) => setPartAmount(digits(v))}
            keyboardType="numeric"
            placeholder="0"
            suffix={d.format.currency}
            error={show('part')}
            hint={partDebt ? tr(d.saleNew.partDebtHint, { date: partDue ? fmtDate(partDue) : '—' }) : d.saleNew.partNasiyaHint}
            right={<IconButton icon="close" tone="plain" label={d.saleNew.partRemove} onPress={() => togglePart(false)} />}
          />
          <Text style={[s.label, { color: c.ink3 }]}>{d.saleNew.partTerm}</Text>
          <Chips options={termPresets.map((p) => ({ key: p.key, label: d.saleNew.termPresets[p.key] }))} value={termKey} onChange={pickTerm} />
          {nasiyaOn ? (
            <SegmentedControl
              options={[{ key: 'days', label: d.saleNew.unitDays }, { key: 'months', label: d.saleNew.unitMonths }]}
              value={unit}
              onChange={setTermUnit}
            />
          ) : null}
          {partDebt ? (
            <Field value={debtDays} onChangeText={(v) => setDebtDays(digits(v).slice(0, 3))} keyboardType="numeric" placeholder={d.saleNew.otherTerm} suffix={d.saleNew.daySuffix} error={show('days')} />
          ) : (
            <Field value={months} onChangeText={(v) => setMonths(digits(v).slice(0, 2))} keyboardType="numeric" placeholder={d.saleNew.otherTerm} suffix={d.saleNew.monthSuffix} error={show('months')} />
          )}
        </View>
      ) : null}

      {pay === 'installment' ? (
        <View style={{ gap: 8 }}>
          <Text style={[s.label, { color: c.ink3 }]}>{d.saleNew.term}</Text>
          <Chips options={MONTH_PRESETS.map((m) => ({ key: m, label: tr(d.common.months, { n: m }) }))} value={MONTH_PRESETS.includes(monthsN) ? monthsN : null} onChange={(m) => setMonths(String(m))} />
          <Field value={months} onChangeText={(v) => setMonths(digits(v).slice(0, 2))} keyboardType="numeric" placeholder={d.saleNew.otherTerm} suffix={d.saleNew.monthSuffix} error={show('months')} />
        </View>
      ) : null}

      <Field label={d.common.noteOptional} value={notes} onChangeText={setNotes} placeholder={d.saleNew.notesPlaceholder} />

      <Group header={d.saleNew.summary}>
        <Cell title={d.common.total} value={fmtMoney(totalN, { suffix: true })} valueStrong />
        {credit ? <Cell title={d.saleNew.payNow} value={fmtMoney(paidN, { suffix: true })} valueColor={c.ok} /> : null}
        {isBank ? <Cell title={d.saleNew.toBank} value={fmtMoney(Math.max(0, bankTotal), { suffix: true })} valueColor={c.tint} /> : null}
        {isBank && partOn ? <Cell title={d.saleNew.partLabel} value={fmtMoney(partN, { suffix: true })} valueColor={c.bad} /> : null}
        {partDue ? <Cell title={d.saleNew.dueBy} value={fmtDate(partDue)} /> : null}
        {credit && !isBank ? <Cell title={d.common.remaining} value={fmtMoney(left, { suffix: true })} valueColor={left > 0 ? c.bad : c.ok} /> : null}
        {monthly > 0 ? <Cell title={d.saleNew.monthly} right={<Text style={[s.gold, tabular, { color: c.gold }]}>{fmtMoney(monthly, { suffix: true })}</Text>} /> : null}
      </Group>
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500' },
  offline: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  gold: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  bankRow: { gap: 10, padding: 12, borderRadius: 16 },
  bankActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
