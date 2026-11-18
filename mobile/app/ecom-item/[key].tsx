import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import {
  Screen, NavBar, useLayout, LargeTitle, FormCard, Field, SegmentedControl, Button, Pill, Loading, ErrorState,
} from '@/components/ui';
import { api, errMsg } from '@/lib/api';
import { useTheme, MAX_CONTENT } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { digits, fmtMoney, grouped } from '@/lib/format';
import { qtyWithUnit } from '@/lib/qty';
import { fileUri, uploadPhoto } from '@/lib/catalog';
import { useMarketDict } from '@/lib/marketI18n';
import { Thumb } from '@/components/market/parts';

type Listed = 'auto' | 'show' | 'hide';

interface EcomItem {
  key: string; name: string; displayName: string; price: number; maxPrice: number; oldPrice?: number;
  description: string;
  /** Xom manzillar — saqlashda aynan shular qaytariladi */
  images: string[];
  /** Ko'rsatish uchun to'liq manzillar */
  imageUrls: string[];
  listed: Listed; state: 'live' | 'hidden' | 'noPrice'; qty: number; unit?: string; copies: number;
}
interface ItemResp { item: EcomItem; autoPublish: boolean }

/** Rasm: raw — serverga yuboriladi, uri — ko'rsatiladi */
interface Img { raw: string; uri: string }

const MAX_IMAGES = 6;
const DESC_MAX = 2000;

interface Form { name: string; price: string; oldPrice: string; description: string; images: Img[]; listed: Listed }

function formOf(it: EcomItem): Form {
  return {
    name: it.name,
    price: it.price ? grouped(String(it.price)) : '',
    oldPrice: it.oldPrice ? grouped(String(it.oldPrice)) : '',
    description: it.description ?? '',
    images: it.images.map((raw, i) => ({ raw, uri: it.imageUrls[i] ?? fileUri(raw) })),
    listed: it.listed,
  };
}
const sameForm = (a: Form, b: Form) =>
  a.name === b.name && digits(a.price) === digits(b.price) && digits(a.oldPrice) === digits(b.oldPrice)
  && a.description === b.description && a.listed === b.listed
  && a.images.length === b.images.length && a.images.every((x, i) => x.raw === b.images[i].raw);

/**
 * Tovarning e-commerce ma'lumotlari (barcha nusxalariga): nomi, sotish narxi, eski narx, tavsif, rasmlar (≤6),
 * ko'rinishi. Nom o'zgarsa kalit ham o'zgaradi — ekran yangi kalitga almashadi.
 */
export default function EcomItemScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const itemKey = String(key ?? '');
  const m = useMarketDict();
  const t = m.ecomItem;
  const d = useDict();
  const pf = d.productForm;
  const { c } = useTheme();
  const L = useLayout();
  const router = useRouter();
  const navigation = useNavigation();

  const [data, setData] = useState<ItemResp | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [base, setBase] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tried, setTried] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await api<ItemResp>(`/api/mobile/ecom/item/${encodeURIComponent(itemKey)}`, { force: true });
      const f = formOf(r.item);
      setData(r);
      setForm(f);
      setBase(f);
    } catch (e) {
      setLoadErr(errMsg(e));
    }
  }, [itemKey]);
  useEffect(() => { if (itemKey) void load(); }, [itemKey, load]);

  // Saqlanmagan o'zgarish bilan chiqishda — so'raymiz
  const dirty = !!form && !!base && !sameForm(form, base);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const allowLeave = useRef(false);
  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (allowLeave.current || !dirtyRef.current) return;
    e.preventDefault();
    Alert.alert(t.unsavedTitle, t.unsavedMsg, [
      { text: d.common.cancel, style: 'cancel' },
      { text: t.leave, style: 'destructive', onPress: () => { allowLeave.current = true; navigation.dispatch(e.data.action); } },
    ]);
  }), [navigation, t, d]);

  const header = <NavBar backLabel={m.ecom.title} />;
  if (!data || !form) {
    return (
      <Screen header={header}>
        {loadErr ? <ErrorState message={loadErr} onRetry={() => void load()} /> : <Loading />}
      </Screen>
    );
  }

  const it = data.item;
  const set = (patch: Partial<Form>) => { setSavedMsg(null); setForm((f) => (f ? { ...f, ...patch } : f)); };
  const priceN = digits(form.price) ? Number(digits(form.price)) : 0;
  const oldN = digits(form.oldPrice) ? Number(digits(form.oldPrice)) : 0;
  const errs = {
    name: !form.name.trim() || form.name.trim().length > 200 ? t.errName : null,
    oldPrice: oldN > 0 && oldN <= priceN ? t.errOldPrice : null,
  };
  const mixed = it.maxPrice > it.price;

  // Rasmlar to'ri: 3 ustun
  const gridW = Math.min(L.width, MAX_CONTENT) - L.padX * 2 - 32;
  const tile = Math.floor((gridW - 16) / 3);

  async function pickImage(source: 'camera' | 'gallery') {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert(pf.photo, pf.photoPerm); return; }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
      const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0];
      setUploading(true);
      const url = await uploadPhoto(asset.uri, asset.mimeType);
      setSavedMsg(null);
      setForm((f) => (f && f.images.length < MAX_IMAGES ? { ...f, images: [...f.images, { raw: url, uri: fileUri(url) }] } : f));
    } catch (e) {
      Alert.alert(pf.photoError, errMsg(e));
    } finally {
      setUploading(false);
    }
  }

  function onAddImage() {
    Alert.alert(t.addImage, undefined, [
      { text: pf.photoCamera, onPress: () => void pickImage('camera') },
      { text: pf.photoGallery, onPress: () => void pickImage('gallery') },
      { text: d.common.cancel, style: 'cancel' },
    ]);
  }

  function onImage(i: number) {
    if (!form) return;
    const imgs = form.images;
    Alert.alert(t.images, undefined, [
      ...(i > 0 ? [{ text: t.makeMain, onPress: () => set({ images: [imgs[i], ...imgs.filter((_, j) => j !== i)] }) }] : []),
      { text: t.remove, style: 'destructive' as const, onPress: () => set({ images: imgs.filter((_, j) => j !== i) }) },
      { text: d.common.cancel, style: 'cancel' as const },
    ]);
  }

  async function save() {
    if (!form || busy) return;
    setTried(true);
    if (errs.name || errs.oldPrice) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        oldPrice: oldN,
        description: form.description.trim(),
        // Xom manzillar (imageUrls emas) — server o'z yuklamalarini tekshiradi
        images: form.images.map((x) => x.raw),
        listed: form.listed,
      };
      // Narx faqat o'zgargan bo'lsa: aks holda nusxalarning har xil narxi saqlanib qoladi
      if (priceN !== it.price) body.salePrice = priceN;
      const r = await api<{ ok: boolean; key: string; message: string }>(`/api/mobile/ecom/item/${encodeURIComponent(itemKey)}`, { method: 'PATCH', body });
      if (r.key && r.key !== itemKey) {
        allowLeave.current = true;
        router.replace(`/ecom-item/${r.key}`);
        return;
      }
      setTried(false);
      await load();
      setSavedMsg(r.message || t.saved);
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const live = it.state === 'live';
  const visHint = form.listed === 'auto' ? (data.autoPublish ? t.visAutoOn : t.visAutoOff) : undefined;

  return (
    <Screen
      keyboard
      gap={14}
      header={header}
      footer={<Button title={d.common.save} size="lg" full loading={busy} disabled={uploading || !dirty} onPress={save} />}
    >
      <LargeTitle size="medium" title={it.displayName || it.name} subtitle={t.sub} />
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        <Pill label={live ? t.live : t.notLive} tone={live ? 'ok' : 'mut'} />
        <Pill label={tr(t.stock, { qty: qtyWithUnit(it.qty, it.unit, d.productFields.units), n: it.copies })} tone="mut" />
      </View>
      {savedMsg ? (
        <View style={[s.saved, { backgroundColor: c.okSoft }]}>
          <Ionicons name="checkmark-circle" size={18} color={c.ok} />
          <Text style={[s.savedT, { color: c.ok }]}>{savedMsg}</Text>
        </View>
      ) : null}

      <FormCard title={t.title}>
        <Field label={t.name} value={form.name} onChangeText={(v) => set({ name: v })} maxLength={200} error={tried ? errs.name : null} />
        <Field
          label={t.price}
          value={form.price}
          onChangeText={(v) => set({ price: grouped(v) })}
          keyboardType="numeric"
          suffix={d.format.currency}
          placeholder="0"
          hint={mixed && priceN === it.price
            ? tr(t.mixedPrices, { min: fmtMoney(it.price), max: fmtMoney(it.maxPrice) })
            : t.priceHint}
        />
        <Field
          label={t.oldPrice}
          value={form.oldPrice}
          onChangeText={(v) => set({ oldPrice: grouped(v) })}
          keyboardType="numeric"
          suffix={d.format.currency}
          placeholder="0"
          hint={t.oldPriceHint}
          error={errs.oldPrice}
        />
        <Field
          label={t.description}
          value={form.description}
          onChangeText={(v) => set({ description: v.slice(0, DESC_MAX) })}
          placeholder={t.descriptionPh}
          multiline
          maxLength={DESC_MAX}
          style={{ minHeight: 110, textAlignVertical: 'top' }}
          hint={`${form.description.length} / ${DESC_MAX}`}
        />
      </FormCard>

      <FormCard title={t.images}>
        <Text style={[s.hint, { color: c.ink3 }]}>{tr(t.imagesHint, { n: MAX_IMAGES })}</Text>
        <View style={s.grid}>
          {form.images.map((img, i) => (
            <Pressable
              key={`${img.raw}-${i}`}
              onPress={() => onImage(i)}
              accessibilityRole="button"
              accessibilityLabel={i === 0 ? t.main : `${t.images} ${i + 1}`}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Thumb uri={img.uri} size={tile} radius={14} />
              {i === 0 ? (
                <View style={[s.mainTag, { backgroundColor: c.tintFill }]}>
                  <Text style={s.mainTagT}>{t.main}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
          {form.images.length < MAX_IMAGES ? (
            <Pressable
              onPress={onAddImage}
              disabled={uploading}
              accessibilityRole="button"
              accessibilityLabel={t.addImage}
              style={({ pressed }) => [s.add, { width: tile, height: tile, borderColor: c.sep, backgroundColor: c.fill2 }, pressed && { opacity: 0.6 }]}
            >
              {uploading ? <ActivityIndicator color={c.tint} /> : (
                <>
                  <Ionicons name="camera-outline" size={26} color={c.tint} />
                  <Text style={[s.addT, { color: c.tint }]} numberOfLines={2}>{t.addImage}</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      </FormCard>

      <FormCard title={t.visibility}>
        <SegmentedControl<Listed>
          options={[{ key: 'auto', label: t.visAuto }, { key: 'show', label: t.visShow }, { key: 'hide', label: t.visHide }]}
          value={form.listed}
          onChange={(v) => set({ listed: v })}
        />
        {visHint ? <Text style={[s.hint, { color: c.ink3 }]}>{visHint}</Text> : null}
      </FormCard>
    </Screen>
  );
}

const s = StyleSheet.create({
  saved: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, minHeight: 42 },
  savedT: { flex: 1, fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 13.5, fontWeight: '500', lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mainTag: { position: 'absolute', left: 6, bottom: 6, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  mainTagT: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
  add: { borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 },
  addT: { fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
});
