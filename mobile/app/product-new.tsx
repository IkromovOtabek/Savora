import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { digits, grouped, fmtMoney } from '@/lib/format';
import { Screen, NavBar, LargeTitle, Field, Button, Group, Cell } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';

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
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameErr = touched && !name.trim() ? d.productNew.nameRequired : null;
  const sellErr = touched && !Number(digits(sell)) ? d.productNew.sellRequired : null;
  const profit = (Number(digits(sell)) || 0) - (Number(digits(buy)) || 0);

  async function onSave() {
    setTouched(true);
    if (!name.trim() || !Number(digits(sell))) return;
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
        placeholder={d.productNew.codePlaceholder}
        autoCapitalize="characters"
        hint={d.productNew.codeHint}
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
      <Field label={d.productNew.brand} value={brand} onChangeText={setBrand} placeholder={d.productNew.brandPlaceholder} />
      <Field label={d.common.noteOptional} value={notes} onChangeText={setNotes} placeholder={d.productNew.notesPlaceholder} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
    </Screen>
  );
}
