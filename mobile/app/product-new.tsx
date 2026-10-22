import { useCallback, useRef, useState } from 'react';
import { View, Alert, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { digits, grouped } from '@/lib/format';
import {
  Screen, ModalBar, Field, Button, SegmentedControl, Switch, FormCard, PickRow, InlineAction,
} from '@/components/ui';
import { Text } from '@/components/ui/Text';
import type { ProductFieldKey, ProductFieldSpec } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import {
  takeChoice, generateArticle, generateBarcode, uploadPhoto, fileUri,
  type NamedItem, type CategoryChoice,
} from '@/lib/catalog';

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

interface Variant { key: string; name: string; code: string; barcode: string; sell: string }

let variantSeq = 0;
const newVariant = (): Variant => ({ key: `v${++variantSeq}`, name: '', code: '', barcode: '', sell: '' });

export default function ProductNew() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { me } = useAuth();
  const { c } = useTheme();
  const d = useDict();
  const f = d.productForm;
  const t = me?.terms;
  const hasImei = !!t?.hasImei;

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

  // Tanlov ekranlaridan qaytganda natijani olamiz
  useFocusEffect(useCallback(() => {
    const u = takeChoice('unit'); if (u !== undefined) setUnit(u);
    const b = takeChoice('brand'); if (b !== undefined) setBrand(b);
    const s = takeChoice('supplier'); if (s !== undefined) setSupplier(s);
    const cat = takeChoice('category'); if (cat !== undefined) setCategory(cat);
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
  const sellErr = touched && !hasVariants && !sellN ? d.productNew.sellRequired : null;
  const imeiOk = (v: string) => v.replace(/\s/g, '').length >= 10;
  const articleErr = touched && hasImei && !hasVariants && !imeiOk(article) ? d.productNew.imeiRequired : null;

  function variantError(v: Variant): string | null {
    if (!v.name.trim()) return f.variantNameRequired;
    if (hasImei && !imeiOk(v.code)) return d.productNew.imeiRequired;
    if (!(Number(digits(v.sell)) || sellN)) return d.productNew.sellRequired;
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
    if (!name.trim() || (!hasVariants && !sellN) || (hasImei && !hasVariants && !imeiOk(article)) || !variantsOk || fields.some((x) => fieldError(x))) {
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
          salePrice: sellN,
          oldPrice: oldOn ? Number(digits(oldPrice)) || 0 : 0,
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
              salePrice: Number(digits(v.sell)) || sellN,
              purchasePrice: buyN,
            })),
          } : {}),
        },
      });
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
      bar={<ModalBar title={f.title} actionLabel={d.common.save} onAction={onSave} actionBusy={busy} actionDisabled={photoBusy} />}
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
          </>
        ) : null}
        <PickRow label={f.unit} value={unitLabel} placeholder={f.notSelected} onPress={() => router.push(`/product-unit?value=${encodeURIComponent(unit)}`)} />
      </FormCard>

      {/* Variativlik */}
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
                  />
                  {err ? <Text style={[st.hint, { color: c.bad }]}>{err}</Text> : null}
                </View>
              );
            })}
            <Button title={f.variantAdd} icon="add" variant="tinted" onPress={() => setVariants((vs) => [...vs, newVariant()])} disabled={variants.length >= 50} />
          </>
        ) : null}
      </FormCard>

      {/* Narxlari */}
      <FormCard title={f.prices}>
        <Field label={f.buyPrice} value={grouped(buy)} onChangeText={onBuy} placeholder="0" keyboardType="numeric" suffix={f.currency} />
        <Field label={f.sellPrice} value={grouped(sell)} onChangeText={onSell} placeholder="0" keyboardType="numeric" suffix={f.currency} error={sellErr} />
        <Field label={f.markup} value={markup} onChangeText={onMarkup} placeholder="0" keyboardType="decimal-pad" suffix="%" />
        <View style={st.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[st.switchT, { color: c.ink }]}>{f.oldPrice}</Text>
            <Text style={[st.hint, { color: c.ink3 }]}>{f.oldPriceHint}</Text>
          </View>
          <Switch value={oldOn} onValueChange={setOldOn} />
        </View>
        {oldOn ? (
          <Field label={f.oldPrice} value={grouped(oldPrice)} onChangeText={(v) => setOldPrice(digits(v))} placeholder="0" keyboardType="numeric" suffix={f.currency} />
        ) : null}
      </FormCard>

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
});
