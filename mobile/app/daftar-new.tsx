import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { digits, grouped, fmtPhoneLocal, phoneLocal, phoneE164, startOfToday } from '@/lib/format';
import { useDict } from '@/lib/i18n';
import { Screen, NavBar, LargeTitle, SegmentedControl, Chips, Field, Button } from '@/components/ui';

type Kind = 'given' | 'taken';
type DuePreset = '7' | '14' | '30' | '90' | 'other';

const DAY = 24 * 60 * 60 * 1000;

/** "05.11.2026" → Date (mahalliy kun boshi); noto'g'ri bo'lsa null */
function parseDmy(v: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v.trim());
  if (!m) return null;
  const [dd, mm, yyyy] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(yyyy, mm - 1, dd);
  return dt.getFullYear() === yyyy && dt.getMonth() === mm - 1 && dt.getDate() === dd ? dt : null;
}

/** Yozish paytida nuqtalarni o'zi qo'yadi: 05112026 → 05.11.2026 */
function maskDmy(v: string): string {
  const x = digits(v).slice(0, 8);
  return [x.slice(0, 2), x.slice(2, 4), x.slice(4, 8)].filter(Boolean).join('.');
}

/** Serverga sana: YYYY-MM-DD (mahalliy kun) */
const isoDay = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

export default function DaftarNew() {
  const d = useDict();
  const k = d.daftar;
  const router = useRouter();
  const [type, setType] = useState<Kind>('given');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [preset, setPreset] = useState<DuePreset>('14');
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const amountN = Number(digits(amount)) || 0;
  const due = preset === 'other' ? parseDmy(custom) : new Date(startOfToday() + Number(preset) * DAY);
  const duePast = !!due && due.getTime() < startOfToday();
  const errors = {
    name: !name.trim() ? k.errName : null,
    phone: phoneLocal(phone).length !== 9 ? k.errPhone : null,
    amount: !amountN ? k.errAmount : null,
    due: !due ? k.errDue : duePast ? k.errDuePast : null,
  };

  async function save() {
    setTried(true);
    if (Object.values(errors).some(Boolean) || !due) return;
    setBusy(true);
    try {
      await api('/api/mobile/daftar', {
        method: 'POST',
        body: { type, personName: name.trim(), personPhone: phoneE164(phone), amount: amountN, dueDate: isoDay(due), note: note.trim() },
      });
      router.back();
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard header={<NavBar />}>
      <LargeTitle title={k.newTitle} />
      <View style={{ gap: 14 }}>
        <SegmentedControl<Kind>
          options={[{ key: 'given', label: k.typeGiven }, { key: 'taken', label: k.typeTaken }]}
          value={type}
          onChange={setType}
        />
        <Field label={k.person} value={name} onChangeText={setName} placeholder={k.personPh} autoCapitalize="words" maxLength={80} error={tried ? errors.name : null} />
        <Field
          label={k.phone}
          prefix="+998"
          value={fmtPhoneLocal(phone)}
          onChangeText={(v) => setPhone(phoneLocal(v))}
          placeholder="90 123 45 67"
          keyboardType="phone-pad"
          error={tried ? errors.phone : null}
        />
        <Field
          label={k.amount}
          value={grouped(amount)}
          onChangeText={(v) => setAmount(digits(v))}
          placeholder="0"
          keyboardType="numeric"
          suffix={d.format.currency}
          error={tried ? errors.amount : null}
        />
        <View style={{ gap: 8 }}>
          <Chips<DuePreset>
            options={[
              { key: '7', label: k.week1 },
              { key: '14', label: k.week2 },
              { key: '30', label: k.month1 },
              { key: '90', label: k.month3 },
              { key: 'other', label: k.dueOther },
            ]}
            value={preset}
            onChange={setPreset}
          />
          {preset === 'other' ? (
            <Field
              label={k.due}
              value={custom}
              onChangeText={(v) => setCustom(maskDmy(v))}
              placeholder={k.duePh}
              keyboardType="numeric"
              maxLength={10}
              error={tried ? errors.due : null}
            />
          ) : (
            <Field label={k.due} value={due ? `${String(due.getDate()).padStart(2, '0')}.${String(due.getMonth() + 1).padStart(2, '0')}.${due.getFullYear()}` : ''} editable={false} />
          )}
        </View>
        <Field label={d.common.note} value={note} onChangeText={setNote} placeholder={k.notePh} maxLength={300} />
        <Button title={d.common.save} icon="checkmark" full loading={busy} onPress={save} />
      </View>
    </Screen>
  );
}
