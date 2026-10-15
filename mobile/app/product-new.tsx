import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { digits, grouped, fmtMoney } from '@/lib/format';
import { Screen, NavBar, LargeTitle, Field, Button, Group, Cell } from '@/components/ui';
import { useTheme } from '@/lib/theme';

export default function ProductNew() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { me } = useAuth();
  const { c } = useTheme();
  const t = me?.terms;

  const [name, setName] = useState('');
  const [codeVal, setCodeVal] = useState(code ?? '');
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [brand, setBrand] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameErr = touched && !name.trim() ? 'Nomini kiriting' : null;
  const sellErr = touched && !Number(digits(sell)) ? 'Sotuv narxini kiriting' : null;
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
      Alert.alert('Saqlandi', `${t?.item ?? 'Mahsulot'} qo'shildi.`);
      router.back();
    } catch (e) {
      Alert.alert('Xatolik', errMsg(e, 'Saqlashda xatolik'));
    } finally { setBusy(false); }
  }

  return (
    <Screen
      keyboard
      header={<NavBar backLabel={t?.items ?? 'Ombor'} />}
      footer={<Button title="Saqlash" size="lg" full loading={busy} onPress={onSave} />}
    >
      <LargeTitle size="medium" title={t?.addItem ?? 'Mahsulot qo\'shish'} />

      <Field label={`${t?.item ?? 'Mahsulot'} nomi`} value={name} onChangeText={setName} placeholder="Nomi" autoFocus error={nameErr} returnKeyType="next" />
      <Field
        label={t?.codeLabel ?? 'Kod / shtrix'}
        value={codeVal}
        onChangeText={setCodeVal}
        placeholder="Bo'sh qoldirsangiz avtomatik"
        autoCapitalize="characters"
        hint="Kod takrorlanmasligi kerak"
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Kelish narxi" value={grouped(buy)} onChangeText={(v) => setBuy(digits(v))} placeholder="0" keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Sotuv narxi" value={grouped(sell)} onChangeText={(v) => setSell(digits(v))} placeholder="0" keyboardType="numeric" error={sellErr} />
        </View>
      </View>
      {Number(digits(sell)) > 0 ? (
        <Group>
          <Cell icon="trending-up" iconColor={profit >= 0 ? c.sq.o : c.sq.r} title="Foyda" value={fmtMoney(profit, { suffix: true })} valueColor={profit >= 0 ? c.ok : c.bad} />
        </Group>
      ) : null}
      <Field label="Brend (ixtiyoriy)" value={brand} onChangeText={setBrand} placeholder="Masalan: Samsung" />
      <Field label="Izoh (ixtiyoriy)" value={notes} onChangeText={setNotes} placeholder="Rangi, holati..." multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
    </Screen>
  );
}
