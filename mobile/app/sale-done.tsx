import { View, Share, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Screen, Group, Cell, Button } from '@/components/ui';
import { API_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme, tabular } from '@/lib/theme';
import { fmtMoney } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';

/**
 * Sotuvdan keyingi ekran (BILLZ uslubi): muvaffaqiyat, chekni ulashish (imzolangan ochiq havola —
 * mijoz brauzerda ochadi va chop eta oladi), chekni ochish, sotuvni ko'rish yoki yangi sotuv.
 */
export default function SaleDone() {
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const { me } = useAuth();
  const p = useLocalSearchParams<{ id: string; no: string; total: string; remaining: string; receipt?: string }>();
  const total = Number(p.total) || 0;
  const remaining = Number(p.remaining) || 0;
  const url = p.receipt ? `${API_URL}${p.receipt}` : null;

  async function share() {
    if (!url) return;
    const title = tr(d.saleNew.shareMsg, { shop: me?.org.name ?? 'Savora', no: String(p.no) });
    // iOS: url alohida (ilovalar havolani taniydi); Android: matn ichida
    await Share.share({ title, message: `${title}\n${url}`, url }).catch(() => undefined);
  }

  return (
    <Screen
      footer={(
        <View style={{ gap: 10 }}>
          <Button title={d.saleNew.newSale} size="lg" full onPress={() => router.replace('/sale-new')} />
          <Button title={d.saleNew.viewSale} variant="plain" full onPress={() => router.replace(`/sale/${p.id}`)} />
        </View>
      )}
    >
      <View style={st.hero}>
        <View style={[st.check, { backgroundColor: c.ok }]}>
          <Ionicons name="checkmark" size={40} color="#fff" />
        </View>
        <Text style={[st.title, { color: c.ink }]}>{tr(d.saleNew.doneTitle, { no: String(p.no) })}</Text>
        <Text style={[st.sum, tabular, { color: c.ink }]}>{fmtMoney(total, { suffix: true })}</Text>
        {remaining > 0 ? <Text style={[st.debt, { color: c.warn }]}>{tr(d.saleNew.doneDebt, { sum: fmtMoney(remaining, { suffix: true }) })}</Text> : null}
      </View>

      {url ? (
        <Group>
          <Cell icon="share-outline" iconColor={c.sq.b} title={d.saleNew.shareReceipt} chevron onPress={share} />
          <Cell icon="receipt-outline" iconColor={c.sq.o} title={d.saleNew.openReceipt} chevron onPress={() => Linking.openURL(url)} />
        </Group>
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { alignItems: 'center', gap: 10, paddingTop: 40, paddingBottom: 8 },
  check: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', lineHeight: 28 },
  sum: { fontSize: 30, fontWeight: '800' },
  debt: { fontSize: 15, fontWeight: '600' },
});
