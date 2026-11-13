import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { digits, grouped, fmtMoney } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import { Screen, NavBar, LargeTitle, Field, Button } from '@/components/ui';
import { KassaChoice, kassaBody, kassaError, useKassaMeta, type KassaAnswer } from '@/components/DaftarKassa';

/**
 * Daftar: qaytarish — to'liq yoki qisman summa va «kassaga tushdimi?» savoli.
 * Parametrlar ro'yxat ekranidan (daftar.tsx): id, name, type, remaining, kassaBranchId.
 */
export default function DaftarPay() {
  const d = useDict();
  const k = d.daftar;
  const router = useRouter();
  const p = useLocalSearchParams<{ id: string; name?: string; type?: string; remaining?: string; kassaBranchId?: string }>();
  const given = p.type !== 'taken';
  const remaining = Number(p.remaining) || 0;

  const [amount, setAmount] = useState(String(remaining || ''));
  const { meta: kassa, loading: kassaLoading } = useKassaMeta();
  const [toKassa, setToKassa] = useState<KassaAnswer>(null);
  // Yozuv kassa orqali ochilgan bo'lsa — o'sha filial oldindan tanlangan (javob baribir so'raladi)
  const [kassaBranch, setKassaBranch] = useState<string | null>(p.kassaBranchId || null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const amountN = Number(digits(amount)) || 0;
  const errors = {
    amount: amountN < 1 || (remaining > 0 && amountN > remaining) ? tr(k.payErrAmount, { v: fmtMoney(remaining) }) : null,
    kassa: kassaError(kassa, toKassa, kassaBranch, k),
  };

  async function save() {
    setTried(true);
    if (Object.values(errors).some(Boolean) || kassaLoading || !p.id) return;
    setBusy(true);
    try {
      await api(`/api/mobile/daftar/${p.id}`, {
        method: 'PATCH',
        body: { status: 'returned', amount: amountN, ...kassaBody(kassa, toKassa, kassaBranch) },
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
      <LargeTitle title={k.payTitle} subtitle={p.name} />
      <View style={{ gap: 14 }}>
        <View style={{ gap: 8 }}>
          <Field
            label={k.payAmount}
            value={grouped(amount)}
            onChangeText={(v) => setAmount(digits(v))}
            placeholder="0"
            keyboardType="numeric"
            suffix={d.format.currency}
            error={tried ? errors.amount : null}
          />
          {remaining > 0 && amountN !== remaining ? (
            <View style={{ flexDirection: 'row' }}>
              <Button title={tr(k.payFull, { v: fmtMoney(remaining) })} size="sm" variant="gray" onPress={() => setAmount(String(remaining))} />
            </View>
          ) : null}
        </View>
        <KassaChoice
          meta={kassa}
          question={given ? k.payQGiven : k.payQTaken}
          yesLabel={given ? k.kassaYesTaken : k.kassaYesGiven}
          answer={toKassa}
          onAnswer={setToKassa}
          branchId={kassaBranch}
          onBranch={setKassaBranch}
          error={tried ? errors.kassa : null}
        />
        <Button title={k.markReturned} icon="checkmark" full loading={busy || kassaLoading} onPress={save} />
      </View>
    </Screen>
  );
}
