import { useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { digits, grouped, fmtMoney } from '@/lib/format';
import { Screen, NavBar, LargeTitle, Field, Button, Group, Cell, Chips } from '@/components/ui';
import { Text } from '@/components/ui/Text';
import type { ProductFieldKey, ProductFieldSpec } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';

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

export default function ProductNew() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { me } = useAuth();
  const { c } = useTheme();
  const d = useDict();
  const t = me?.terms;

  const [name, setName] = useState('');
  const [codeVal, setCodeVal] = useState(code ?? '');
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [brand, setBrand] = useState('');
  const [notes, setNotes] = useState('');
  // Yo'nalishga xos maydonlar — ro'yxat serverdan (me.productFields), yorliqlar lug'atdan
  const fields: ProductFieldSpec[] = me?.productFields ?? [];
  const units = me?.productUnits ?? [];
  const [extra, setExtra] = useState<Partial<Record<ProductFieldKey, string>>>({});
  const setField = (key: ProductFieldKey, v: string) => setExtra((prev) => ({ ...prev, [key]: v }));
  // O'lchov birligi tanlanmagan bo'lsa — "dona" (me keshdan maydonlarsiz kelgan bo'lishi mumkin)
  const valueOf = (key: ProductFieldKey) => (extra[key] ?? (key === 'unit' ? 'dona' : '')).trim();
  const pf = d.productFields;
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameErr = touched && !name.trim() ? d.productNew.nameRequired : null;
  const sellErr = touched && !Number(digits(sell)) ? d.productNew.sellRequired : null;
  const profit = (Number(digits(sell)) || 0) - (Number(digits(buy)) || 0);
  const codeErr = touched && t?.hasImei && codeVal.replace(/\s/g, '').length < 10 ? d.productNew.imeiRequired : null;

  function fieldError(f: ProductFieldSpec): string | null {
    const v = valueOf(f.key);
    if (!v) return f.required ? tr(d.productNew.fieldRequired, { field: pf.labels[f.key] }) : null;
    if (f.key === 'expiryDate' && !isValidDate(v)) return d.productNew.dateInvalid;
    if (f.key === 'warrantyMonths' && Number(v) > 120) return d.productNew.warrantyInvalid;
    return null;
  }
  const fieldsValid = fields.every((f) => !fieldError(f));

  async function onSave() {
    setTouched(true);
    if (!name.trim() || !Number(digits(sell)) || (t?.hasImei && codeVal.replace(/\s/g, '').length < 10) || !fieldsValid) return;
    setBusy(true);
    try {
      await api('/api/mobile/products', {
        method: 'POST',
        body: {
          name: name.trim(),
          code: codeVal.trim(),
          purchasePrice: Number(digits(buy)) || 0,
          salePrice: Number(digits(sell)) || 0,
          brand: brand.trim(),
          notes: notes.trim(),
          ...Object.fromEntries(fields.map((f) => [f.key, valueOf(f.key)])),
        },
      });
      Alert.alert(d.productNew.saved, tr(d.productNew.savedMsg, { item: t?.item ?? d.terms.item }));
      router.back();
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e, d.productNew.saveError));
    } finally { setBusy(false); }
  }

  return (
    <Screen
      keyboard
      header={<NavBar backLabel={t?.items ?? d.terms.items} />}
      footer={<Button title={d.common.save} size="lg" full loading={busy} onPress={onSave} />}
    >
      <LargeTitle size="medium" title={t?.addItem ?? d.terms.addItem} />

      <Field label={tr(d.productNew.nameLabel, { item: t?.item ?? d.terms.item })} value={name} onChangeText={setName} placeholder={d.productNew.namePlaceholder} autoFocus error={nameErr} returnKeyType="next" />
      <Field
        label={t?.codeLabel ?? d.terms.codeLabel}
        value={codeVal}
        onChangeText={setCodeVal}
        placeholder={t?.hasImei ? '353456789012345' : d.productNew.codePlaceholder}
        autoCapitalize="characters"
        keyboardType={t?.hasImei ? 'numeric' : 'default'}
        hint={d.productNew.codeHint}
        error={codeErr}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label={d.productNew.buyPrice} value={grouped(buy)} onChangeText={(v) => setBuy(digits(v))} placeholder="0" keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={d.productNew.sellPrice} value={grouped(sell)} onChangeText={(v) => setSell(digits(v))} placeholder="0" keyboardType="numeric" error={sellErr} />
        </View>
      </View>
      {Number(digits(sell)) > 0 ? (
        <Group>
          <Cell icon="trending-up" iconColor={profit >= 0 ? c.sq.o : c.sq.r} title={d.productNew.profit} value={fmtMoney(profit, { suffix: true })} valueColor={profit >= 0 ? c.ok : c.bad} />
        </Group>
      ) : null}
      {fields.map((f) => {
        const label = `${pf.labels[f.key]}${f.required ? ' *' : ''}`;
        const err = touched ? fieldError(f) : null;
        if (f.key === 'unit') {
          return (
            <View key={f.key} style={{ gap: 8 }}>
              <Text style={[st.label, { color: c.ink3 }]}>{label}</Text>
              <Chips
                options={units.map((u) => ({ key: u, label: pf.units[u] ?? u }))}
                value={valueOf('unit')}
                onChange={(u) => setField('unit', u)}
              />
            </View>
          );
        }
        if (f.key === 'expiryDate') {
          return (
            <Field key={f.key} label={label} value={extra.expiryDate ?? ''} onChangeText={(v) => setField('expiryDate', maskDate(v))}
              placeholder={pf.placeholders.expiryDate} keyboardType="numeric" maxLength={10} error={err} />
          );
        }
        if (f.key === 'warrantyMonths') {
          return (
            <Field key={f.key} label={label} value={extra.warrantyMonths ?? ''} onChangeText={(v) => setField('warrantyMonths', digits(v).slice(0, 3))}
              placeholder={pf.placeholders.warrantyMonths} keyboardType="numeric" suffix={pf.monthsSuffix} error={err} />
          );
        }
        return (
          <Field key={f.key} label={label} value={extra[f.key] ?? ''} onChangeText={(v) => setField(f.key, v)}
            placeholder={pf.placeholders[f.key]} maxLength={f.key === 'category' ? 60 : f.key === 'size' ? 20 : 40}
            autoCapitalize={f.key === 'batchNumber' || f.key === 'oemCode' ? 'characters' : 'sentences'} error={err} />
        );
      })}
      <Field label={d.productNew.brand} value={brand} onChangeText={setBrand} placeholder={d.productNew.brandPlaceholder} />
      <Field label={d.common.noteOptional} value={notes} onChangeText={setNotes} placeholder={d.productNew.notesPlaceholder} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
    </Screen>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600' },
});
