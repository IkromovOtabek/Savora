import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Alert, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { digits, grouped } from '@/lib/format';
import { isFractionalUnit, parseQty } from '@/lib/qty';
import {
  Screen, ModalBar, Field, Button, SegmentedControl, Switch, FormCard, PickRow, InlineAction, AddRow,
} from '@/components/ui';
import { Text } from '@/components/ui/Text';
import type { ProductFieldKey, ProductFieldSpec } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import {
  takeChoice, generateArticle, generateBarcode, uploadPhoto, fileUri,
  type NamedItem, type CategoryChoice, type BundleChoice,
} from '@/lib/catalog';
import { qtyWithUnit } from '@/lib/qty';

/** "31032027" → "31.03.2027" (yozish davomida nuqtalar qo'yiladi) */
function maskDate(v: string): string {
  const n = v.replace(/\D/g, '').slice(0, 8);
  return [n.slice(0, 2), n.slice(2, 4), n.slice(4)].filter(Boolean).join('.');
}

/** KK.OO.YYYY haqiqiy sanami (31.02 kabi emas) */
function isValidDate(v: string): boolean {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v);
  if (!m) return false;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return y >= 2000 && y <= 2100 && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Ustama % = (sotuv − kelish) / kelish × 100, bir xona aniqlikda */
function markupOf(buy: number, sell: number): string {
  if (!(buy > 0) || !(sell > 0)) return '';
  return String(Math.round(((sell - buy) / buy) * 1000) / 10);
}

interface Variant { key: string; name: string; code: string; barcode: string; sell: string; qty: string }

let variantSeq = 0;
const newVariant = (): Variant => ({ key: `v${++variantSeq}`, name: '', code: '', barcode: '', sell: '', qty: '' });

/** Shtrix-kod bo'yicha: omborda bormi / ochiq bazadan nomi (server: lib/barcodeLookup.ts) */
interface BarcodeLookup {
  existing: { id: string; name: string; status: string } | null;
  suggestion: { name: string; brand: string | null } | null;
}

export default function ProductNew() {
  const router = useRouter();
  const { code, kind: kindParam } = useLocalSearchParams<{ code?: string; kind?: string }>();
  // Tur: tovar / xizmat / to'plam (product-kind varag'idan). Xizmat va to'plamning qoldig'i, IMEI'si, variantlari yo'q
  const kind: 'goods' | 'service' | 'bundle' = kindParam === 'service' || kindParam === 'bundle' ? kindParam : 'goods';
  const stockless = kind !== 'goods';
  const { me } = useAuth();
  const { c } = useTheme();
  const d = useDict();
  const f = d.productForm;
  const t = me?.terms;
  const hasImei = !!t?.hasImei && !stockless;

  // Rasm
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  // Asosiy parametrlar
  const [name, setName] = useState('');
  const [article, setArticle] = useState(hasImei ? (code ?? '') : '');
  const [barcode, setBarcode] = useState(hasImei ? '' : (code ?? ''));
  const [unit, setUnit] = useState('dona');

  // Variativlik
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<Variant[]>(() => [newVariant()]);

  // Narxlar
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [markup, setMarkup] = useState('');
  const [oldOn, setOldOn] = useState(false);
  const [oldPrice, setOldPrice] = useState('');
  // Erkin narx — sotuv narxi 0, kassada har safar qo'lda kiritiladi
  const [freePrice, setFreePrice] = useState(false);

  // Tovarlar soni (IMEI'siz yo'nalishlarda). Bo'sh — eskicha bitta dona
  const [qty, setQty] = useState('');

  // To'plam tarkibi: tanlangan tovar va 1 to'plamdagi miqdori
  const [bundle, setBundle] = useState<(BundleChoice & { qty: string })[]>([]);

  // Xususiyatlar
  const [brand, setBrand] = useState<NamedItem | null>(null);
  const [supplier, setSupplier] = useState<NamedItem | null>(null);
  const [category, setCategory] = useState<CategoryChoice | null>(null);
  const [notes, setNotes] = useState('');
  // Yo'nalishga xos maydonlar (kafolat, muddat…) — turkum va birlik alohida tanlov ekranlarida
  const fields: ProductFieldSpec[] = (me?.productFields ?? []).filter((x) => x.key !== 'category' && x.key !== 'unit');
  const [extra, setExtra] = useState<Partial<Record<ProductFieldKey, string>>>({});
  const setField = (key: ProductFieldKey, v: string) => setExtra((prev) => ({ ...prev, [key]: v }));
  const pf = d.productFields;

  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  // Skaner natijasi qaysi maydonga: 'main' yoki variant kaliti
  const scanTarget = useRef<string>('main');

  // Shtrix-kod o'zgarsa (yozish yoki skaner) — omborda bormi va ochiq bazadan nomi.
  // Nom bo'sh bo'lsa topilgan nom o'zi yoziladi; to'lgan bo'lsa — «Nomga qo'yish» taklifi
  const [bcInfo, setBcInfo] = useState<(BarcodeLookup & { filled: boolean }) | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;
  useEffect(() => {
    const code = barcode.replace(/\s/g, '');
    if (hasVariants || code.length < 8) { setBcInfo(null); return; }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const r = await api<BarcodeLookup>(`/api/mobile/products/lookup?code=${encodeURIComponent(code)}`);
        if (!alive) return;
        const fill = !!r.suggestion && !nameRef.current.trim();
        if (fill && r.suggestion) setName(r.suggestion.name);
        setBcInfo(r.existing || r.suggestion ? { ...r, filled: fill } : null);
      } catch {
        // Qidiruv ishlamasa ham forma ishlayveradi
        if (alive) setBcInfo(null);
      }
    }, 450);
    return () => { alive = false; clearTimeout(timer); };
  }, [barcode, hasVariants]);

  // Yopishda (tugma yoki pastga surish) — kiritilgan ma'lumot bo'lsa tasdiq so'raladi
  const navigation = useNavigation();
  const allowLeave = useRef(false);
  const dirty = !!(name.trim() || buy || sell || qty || photoUrl || notes.trim() || brand || supplier || category || hasVariants || bundle.length || Object.values(extra).some(Boolean));
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (allowLeave.current || !dirtyRef.current) return;
    e.preventDefault();
    Alert.alert(f.cancelTitle, f.cancelMsg, [
      { text: f.cancelNo, style: 'cancel' },
      { text: f.cancelYes, style: 'destructive', onPress: () => { allowLeave.current = true; navigation.dispatch(e.data.action); } },
    ]);
  }), [navigation, f]);

  // Tanlov ekranlaridan qaytganda natijani olamiz
  useFocusEffect(useCallback(() => {
    const u = takeChoice('unit'); if (u !== undefined) setUnit(u);
    const b = takeChoice('brand'); if (b !== undefined) setBrand(b);
    const s = takeChoice('supplier'); if (s !== undefined) setSupplier(s);
    const cat = takeChoice('category'); if (cat !== undefined) setCategory(cat);
    const bi = takeChoice('bundleItem');
    if (bi) setBundle((xs) => (xs.some((x) => x.id === bi.id) ? xs : [...xs, { ...bi, qty: '1' }]));
    const bc = takeChoice('barcode');
    if (bc !== undefined) {
      const target = scanTarget.current;
      if (target === 'main') setBarcode(bc);
      else setVariants((vs) => vs.map((v) => (v.key === target ? { ...v, barcode: bc } : v)));
    }
  }, []));

  const buyN = Number(digits(buy)) || 0;
  const sellN = Number(digits(sell)) || 0;

  function onBuy(v: string) { const n = digits(v); setBuy(n); setMarkup(markupOf(Number(n) || 0, sellN)); }
  function onSell(v: string) { const n = digits(v); setSell(n); setMarkup(markupOf(buyN, Number(n) || 0)); }
  function onMarkup(v: string) {
    const clean = v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 7);
    setMarkup(clean);
    const m = Number(clean);
    if (buyN > 0 && clean !== '' && Number.isFinite(m)) setSell(String(Math.round(buyN * (1 + m / 100))));
  }

  function openScan(target: string) {
    scanTarget.current = target;
    router.push('/scan?mode=capture');
  }

  const updVariant = (key: string, patch: Partial<Variant>) => setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));

  /* ───────── Rasm ───────── */

  async function pickPhoto(source: 'camera' | 'gallery') {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert(f.photo, f.photoPerm); return; }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
      const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setPhotoBusy(true);
      setPhotoUrl(await uploadPhoto(asset.uri, asset.mimeType));
    } catch (e) {
      Alert.alert(f.photoError, errMsg(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  function onPhotoPress() {
    Alert.alert(f.photo, undefined, [
      { text: f.photoCamera, onPress: () => pickPhoto('camera') },
      { text: f.photoGallery, onPress: () => pickPhoto('gallery') },
      ...(photoUrl ? [{ text: f.photoRemove, style: 'destructive' as const, onPress: () => setPhotoUrl(null) }] : []),
      { text: d.common.cancel, style: 'cancel' as const },
    ]);
  }

  /* ───────── Tekshiruv va saqlash ───────── */

  const nameErr = touched && !name.trim() ? d.productNew.nameRequired : null;
  const sellErr = touched && !hasVariants && !freePrice && !sellN ? d.productNew.sellRequired : null;
  // Miqdor: bo'sh — yuborilmaydi; aks holda birlikka mos (kg → kasr, dona → butun)
  const qtyBad = (v: string) => v.trim() !== '' && parseQty(v, unit) === null;
  const qtyErr = touched && !hasVariants && qtyBad(qty) ? f.qtyInvalid : null;
  const fractional = isFractionalUnit(unit);
  // To'plam: har tarkib miqdori birlikka mos bo'lishi shart; nechta yig'ilishi — eng kam yetadigan tarkib bo'yicha
  const bundleBad = (x: { qty: string; unit: string | null }) => parseQty(x.qty, x.unit) === null;
  const bundleErr = touched && kind === 'bundle' ? (!bundle.length ? d.bundle.required : bundle.some(bundleBad) ? f.qtyInvalid : null) : null;
  const canMake = bundle.length && !bundle.some(bundleBad)
    ? Math.min(...bundle.map((x) => Math.floor(x.available / (parseQty(x.qty, x.unit) as number))))
    : 0;
  const imeiOk = (v: string) => v.replace(/\s/g, '').length >= 10;
  const articleErr = touched && hasImei && !hasVariants && !imeiOk(article) ? d.productNew.imeiRequired : null;

  function variantError(v: Variant): string | null {
    if (!v.name.trim()) return f.variantNameRequired;
    if (hasImei && !imeiOk(v.code)) return d.productNew.imeiRequired;
    if (!freePrice && !(Number(digits(v.sell)) || sellN)) return d.productNew.sellRequired;
    if (!hasImei && qtyBad(v.qty)) return f.qtyInvalid;
    return null;
  }

  function fieldError(spec: ProductFieldSpec): string | null {
    const v = (extra[spec.key] ?? '').trim();
    if (!v) return spec.required ? tr(d.productNew.fieldRequired, { field: pf.labels[spec.key] }) : null;
    if (spec.key === 'expiryDate' && !isValidDate(v)) return d.productNew.dateInvalid;
    if (spec.key === 'warrantyMonths' && Number(v) > 120) return d.productNew.warrantyInvalid;
    return null;
  }

  async function onSave() {
    setTouched(true);
    const variantsOk = !hasVariants || (variants.length > 0 && variants.every((v) => !variantError(v)));
    const bundleOk = kind !== 'bundle' || (bundle.length > 0 && !bundle.some(bundleBad));
    if (!name.trim() || (!hasVariants && !freePrice && !sellN) || (!hasVariants && qtyBad(qty)) || (hasImei && !hasVariants && !imeiOk(article)) || !variantsOk || !bundleOk || fields.some((x) => fieldError(x))) {
      if (hasVariants && !variants.length) Alert.alert(d.common.error, f.variantsRequired);
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ id: string; count: number }>('/api/mobile/products', {
        method: 'POST',
        body: {
          name: name.trim(),
          code: hasVariants ? '' : article.trim(),
          barcode: hasVariants ? '' : barcode.trim(),
          purchasePrice: buyN,
          salePrice: freePrice ? 0 : sellN,
          freePrice,
          kind,
          ...(kind === 'bundle' ? { bundleItems: bundle.map((x) => ({ productId: x.id, qty: parseQty(x.qty, x.unit) })) } : {}),
          oldPrice: oldOn && !freePrice ? Number(digits(oldPrice)) || 0 : 0,
          ...(!hasImei && !stockless && !hasVariants && qty.trim() ? { quantity: parseQty(qty, unit) } : {}),
          unit,
          photoUrl: photoUrl ?? '',
          brand: brand?.name ?? '',
          supplierId: supplier?.id ?? '',
          categoryId: category?.id ?? '',
          notes: notes.trim(),
          ...Object.fromEntries(fields.map((x) => [x.key, (extra[x.key] ?? '').trim()])),
          ...(hasVariants ? {
            variants: variants.map((v) => ({
              name: v.name.trim(),
              code: v.code.trim(),
              barcode: v.barcode.trim(),
              salePrice: freePrice ? 0 : Number(digits(v.sell)) || sellN,
              purchasePrice: buyN,
              ...(!hasImei && v.qty.trim() ? { quantity: parseQty(v.qty, unit) } : {}),
            })),
          } : {}),
        },
      });
      allowLeave.current = true;
      Alert.alert(
        d.productNew.saved,
        r.count > 1 ? tr(f.variantsSaved, { n: r.count }) : tr(d.productNew.savedMsg, { item: t?.item ?? d.terms.item }),
      );
      router.back();
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e, d.productNew.saveError));
    } finally { setBusy(false); }
  }

  const unitLabel = pf.units[unit] ?? unit;

  return (
    <Screen
      keyboard
      gap={14}
      bar={<ModalBar title={kind === 'service' ? d.productKind.newService : kind === 'bundle' ? d.productKind.newBundle : f.title} actionLabel={d.common.save} onAction={onSave} actionBusy={busy} actionDisabled={photoBusy} />}
      footer={!hasVariants ? (
        <Button title={f.scanBarcode} icon="barcode-outline" variant="gray" size="lg" full onPress={() => openScan('main')} />
      ) : undefined}
    >
      {/* Rasm */}
      <FormCard>
        <Pressable onPress={onPhotoPress} disabled={photoBusy} accessibilityRole="button" accessibilityLabel={f.photo} style={({ pressed }) => [st.photoRow, pressed && { opacity: 0.6 }]}>
          <View style={[st.photo, { backgroundColor: c.fill2, borderColor: c.sep }]}>
            {photoBusy ? <ActivityIndicator color={c.tint} />
              : photoUrl ? <Image source={{ uri: fileUri(photoUrl) }} style={st.photoImg} />
              : <Ionicons name="camera-outline" size={30} color={c.tint} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[st.photoT, { color: c.ink }]}>{f.photo}</Text>
            <Text style={[st.photoH, { color: c.ink3 }]}>{photoBusy ? f.photoUploading : f.photoHint}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.tint} />
        </Pressable>
      </FormCard>

      {/* Asosiy parametrlar */}
      <FormCard title={f.main}>
        <Field label={f.name} value={name} onChangeText={setName} placeholder={d.productNew.namePlaceholder} error={nameErr} returnKeyType="next" maxLength={120} />
        {!hasVariants ? (
          <>
            <Field
              label={hasImei ? (t?.codeLabel ?? f.article) : f.article}
              value={article}
              onChangeText={setArticle}
              placeholder={hasImei ? '353456789012345' : f.articlePlaceholder}
              autoCapitalize="characters"
              keyboardType={hasImei ? 'numeric' : 'default'}
              error={articleErr}
              maxLength={64}
              right={hasImei ? undefined : <InlineAction title={f.generate} onPress={() => setArticle(generateArticle())} />}
            />
            <Field
              label={f.barcode}
              value={barcode}
              onChangeText={setBarcode}
              placeholder={f.barcodePlaceholder}
              keyboardType="numeric"
              maxLength={64}
              right={(
                <View style={st.actions}>
                  <InlineAction icon="scan-outline" onPress={() => openScan('main')} />
                  <InlineAction title={f.generate} onPress={() => setBarcode(generateBarcode())} />
                </View>
              )}
            />
            {bcInfo?.existing ? (
              <Pressable onPress={() => router.push(`/product/${bcInfo.existing!.id}`)} accessibilityRole="link" style={({ pressed }) => [st.bcHint, { backgroundColor: c.badSoft }, pressed && { opacity: 0.6 }]}>
                <Ionicons name="alert-circle" size={18} color={c.bad} />
                <Text style={[st.bcText, { color: c.bad }]}>{tr(f.barcodeExists, { name: bcInfo.existing.name })}</Text>
                <Text style={[st.bcLink, { color: c.bad }]}>{f.barcodeOpen}</Text>
              </Pressable>
            ) : bcInfo?.suggestion ? (
              <View style={[st.bcHint, { backgroundColor: c.tintSoft }]}>
                <Ionicons name="sparkles" size={18} color={c.tint} />
                <Text style={[st.bcText, { color: c.tint }]}>
                  {bcInfo.filled ? f.barcodeFilled : tr(f.barcodeFound, { name: bcInfo.suggestion.name })}
                </Text>
                {!bcInfo.filled ? (
                  <InlineAction title={f.barcodeApply} onPress={() => { setName(bcInfo.suggestion!.name); setBcInfo({ ...bcInfo, filled: true }); }} />
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}
        <PickRow label={f.unit} value={unitLabel} placeholder={f.notSelected} onPress={() => router.push(`/product-unit?value=${encodeURIComponent(unit)}`)} />
      </FormCard>

      {/* Variativlik (xizmat/to'plamda yo'q) */}
      {!stockless ? (
      <FormCard title={f.variants}>
        <SegmentedControl
          options={[{ key: 'no', label: f.variantsNo }, { key: 'yes', label: f.variantsYes }]}
          value={hasVariants ? 'yes' : 'no'}
          onChange={(k) => setHasVariants(k === 'yes')}
        />
        {hasVariants ? (
          <>
            <Text style={[st.hint, { color: c.ink3 }]}>{f.variantsHint}</Text>
            {variants.map((v, i) => {
              const err = touched ? variantError(v) : null;
              return (
                <View key={v.key} style={[st.variant, { borderColor: err ? c.bad : c.sep }]}>
                  <View style={st.variantHead}>
                    <Text style={[st.variantT, { color: c.ink }]}>{tr(f.variantN, { n: i + 1 })}</Text>
                    <Pressable
                      onPress={() => setVariants((vs) => vs.filter((x) => x.key !== v.key))}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={f.variantRemove}
                      style={({ pressed }) => pressed && { opacity: 0.5 }}
                    >
                      <Ionicons name="trash-outline" size={20} color={c.bad} />
                    </Pressable>
                  </View>
                  <Field label={f.variantName} value={v.name} onChangeText={(x) => updVariant(v.key, { name: x })} placeholder={f.variantNamePlaceholder} maxLength={60} />
                  <Field
                    label={hasImei ? (t?.codeLabel ?? f.article) : f.article}
                    value={v.code}
                    onChangeText={(x) => updVariant(v.key, { code: x })}
                    placeholder={hasImei ? '353456789012345' : f.articlePlaceholder}
                    autoCapitalize="characters"
                    keyboardType={hasImei ? 'numeric' : 'default'}
                    maxLength={64}
                    right={hasImei ? undefined : <InlineAction title={f.generate} onPress={() => updVariant(v.key, { code: generateArticle() })} />}
                  />
                  <Field
                    label={f.barcode}
                    value={v.barcode}
                    onChangeText={(x) => updVariant(v.key, { barcode: x })}
                    placeholder={f.barcodePlaceholder}
                    keyboardType="numeric"
                    maxLength={64}
                    right={(
                      <View style={st.actions}>
                        <InlineAction icon="scan-outline" onPress={() => openScan(v.key)} />
                        <InlineAction title={f.generate} onPress={() => updVariant(v.key, { barcode: generateBarcode() })} />
                      </View>
                    )}
                  />
                  <Field
                    label={f.sellPrice}
                    value={grouped(v.sell)}
                    onChangeText={(x) => updVariant(v.key, { sell: digits(x) })}
                    placeholder={sellN ? grouped(String(sellN)) : '0'}
                    keyboardType="numeric"
                    suffix={f.currency}
                    editable={!freePrice}
                  />
                  {!hasImei ? (
                    <Field
                      label={f.qty}
                      value={v.qty}
                      onChangeText={(x) => updVariant(v.key, { qty: x.replace(fractional ? /[^\d.,]/g : /\D/g, '') })}
                      placeholder="1"
                      keyboardType={fractional ? 'decimal-pad' : 'numeric'}
                      suffix={unitLabel}
                    />
                  ) : null}
                  {err ? <Text style={[st.hint, { color: c.bad }]}>{err}</Text> : null}
                </View>
              );
            })}
            <Button title={f.variantAdd} icon="add" variant="tinted" onPress={() => setVariants((vs) => [...vs, newVariant()])} disabled={variants.length >= 50} />
          </>
        ) : null}
      </FormCard>
      ) : null}

      {/* To'plam tarkibi — sotilganda shu tovarlar ombordan ayriladi */}
      {kind === 'bundle' ? (
        <FormCard title={d.bundle.section}>
          <Text style={[st.hint, { color: c.ink3 }]}>{d.bundle.hint}</Text>
          {bundle.length === 0 ? (
            <Text style={[st.hint, { color: bundleErr ? c.bad : c.ink3 }]}>{bundleErr ?? d.bundle.empty}</Text>
          ) : bundle.map((x) => (
            <View key={x.id} style={[st.variant, { borderColor: bundleBad(x) && touched ? c.bad : c.sep }]}>
              <View style={st.variantHead}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.variantT, { color: c.ink }]} numberOfLines={1}>{x.name}</Text>
                  <Text style={[st.hint, { color: c.ink3 }]}>{tr(d.bundle.left, { n: qtyWithUnit(x.available, x.unit, pf.units) })}</Text>
                </View>
                <Pressable onPress={() => setBundle((xs) => xs.filter((y) => y.id !== x.id))} hitSlop={10} accessibilityRole="button" accessibilityLabel={f.variantRemove}>
                  <Ionicons name="trash-outline" size={20} color={c.bad} />
                </Pressable>
              </View>
              <Field
                label={d.bundle.qty}
                value={x.qty}
                onChangeText={(v) => setBundle((xs) => xs.map((y) => (y.id === x.id ? { ...y, qty: v.replace(isFractionalUnit(x.unit) ? /[^\d.,]/g : /\D/g, '') } : y)))}
                keyboardType={isFractionalUnit(x.unit) ? 'decimal-pad' : 'numeric'}
                suffix={pf.units[x.unit ?? 'dona'] ?? x.unit ?? ''}
              />
            </View>
          ))}
          {bundle.length > 0 && !bundle.some(bundleBad) ? (
            <Text style={[st.hint, { color: c.ink2 }]}>{tr(d.bundle.canMake, { n: canMake })}</Text>
          ) : null}
          <AddRow title={d.bundle.add} onPress={() => router.push(`/bundle-pick?skip=${bundle.map((x) => x.id).join(',')}`)} />
        </FormCard>
      ) : null}

      {/* Narxlari */}
      <FormCard title={f.prices}>
        <Field label={f.buyPrice} value={grouped(buy)} onChangeText={onBuy} placeholder="0" keyboardType="numeric" suffix={f.currency} />
        {!freePrice ? (
          <>
            <Field label={f.sellPrice} value={grouped(sell)} onChangeText={onSell} placeholder="0" keyboardType="numeric" suffix={f.currency} error={sellErr} />
            <Field label={f.markup} value={markup} onChangeText={onMarkup} placeholder="0" keyboardType="decimal-pad" suffix="%" />
          </>
        ) : null}
        <View style={st.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[st.switchT, { color: c.ink }]}>{f.freePrice}</Text>
            <Text style={[st.hint, { color: c.ink3 }]}>{f.freePriceHint}</Text>
          </View>
          <Switch value={freePrice} onValueChange={setFreePrice} />
        </View>
        {!freePrice ? (
        <View style={st.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[st.switchT, { color: c.ink }]}>{f.oldPrice}</Text>
            <Text style={[st.hint, { color: c.ink3 }]}>{f.oldPriceHint}</Text>
          </View>
          <Switch value={oldOn} onValueChange={setOldOn} />
        </View>
        ) : null}
        {oldOn && !freePrice ? (
          <Field label={f.oldPrice} value={grouped(oldPrice)} onChangeText={(v) => setOldPrice(digits(v))} placeholder="0" keyboardType="numeric" suffix={f.currency} />
        ) : null}
      </FormCard>

      {/* Tovarlar soni — qaysi omborga va nechta (IMEI'li yo'nalishda har biri alohida dona) */}
      {!hasImei && !stockless && !hasVariants ? (
        <FormCard title={f.stock}>
          <Field
            label={me?.stockBranch?.name ?? f.qty}
            value={qty}
            onChangeText={(v) => setQty(v.replace(fractional ? /[^\d.,]/g : /\D/g, ''))}
            placeholder="1"
            keyboardType={fractional ? 'decimal-pad' : 'numeric'}
            suffix={unitLabel}
            error={qtyErr}
            hint={f.stockHint}
          />
        </FormCard>
      ) : null}

      {/* Xususiyatlar */}
      <FormCard title={f.props}>
        <PickRow label={f.brand} value={brand?.name} placeholder={f.notSelected} onPress={() => router.push('/catalog-pick?kind=brand')} />
        <PickRow label={f.supplier} value={supplier?.name} placeholder={f.notSelected} onPress={() => router.push('/catalog-pick?kind=supplier')} />
        <PickRow label={f.category} value={category?.path} placeholder={f.notSelected} onPress={() => router.push('/category-pick')} />
        {fields.map((spec) => {
          const label = `${pf.labels[spec.key]}${spec.required ? ' *' : ''}`;
          const err = touched ? fieldError(spec) : null;
          if (spec.key === 'expiryDate') {
            return (
              <Field key={spec.key} label={label} value={extra.expiryDate ?? ''} onChangeText={(v) => setField('expiryDate', maskDate(v))}
                placeholder={pf.placeholders.expiryDate} keyboardType="numeric" maxLength={10} error={err} />
            );
          }
          if (spec.key === 'warrantyMonths') {
            return (
              <Field key={spec.key} label={label} value={extra.warrantyMonths ?? ''} onChangeText={(v) => setField('warrantyMonths', digits(v).slice(0, 3))}
                placeholder={pf.placeholders.warrantyMonths} keyboardType="numeric" suffix={pf.monthsSuffix} error={err} />
            );
          }
          return (
            <Field key={spec.key} label={label} value={extra[spec.key] ?? ''} onChangeText={(v) => setField(spec.key, v)}
              placeholder={pf.placeholders[spec.key]} maxLength={spec.key === 'size' ? 20 : 40}
              autoCapitalize={spec.key === 'batchNumber' || spec.key === 'oemCode' ? 'characters' : 'sentences'} error={err} />
          );
        })}
        <Field value={notes} onChangeText={setNotes} placeholder={f.description} multiline maxLength={500} style={{ minHeight: 80, textAlignVertical: 'top' }} />
      </FormCard>
    </Screen>
  );
}

const st = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photo: { width: 76, height: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  photoImg: { width: '100%', height: '100%' },
  photoT: { fontSize: 17, fontWeight: '700' },
  photoH: { fontSize: 14, fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hint: { fontSize: 13.5, fontWeight: '500' },
  variant: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 10 },
  variantHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  variantT: { fontSize: 16, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  switchT: { fontSize: 16, fontWeight: '600' },
  bcHint: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  bcText: { flex: 1, fontSize: 14, fontWeight: '600' },
  bcLink: { fontSize: 14, fontWeight: '700' },
});
