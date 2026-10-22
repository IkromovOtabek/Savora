import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';

type Kind = 'goods' | 'service' | 'bundle';

const ICONS: Record<Kind, React.ComponentProps<typeof Ionicons>['name']> = {
  goods: 'cube',
  service: 'layers',
  bundle: 'albums',
};

/** «Yangi tovar» — turini tanlash varag'i: tovar / xizmat / to'plam (keyin product-new shu tur bilan ochiladi) */
export default function ProductKind() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const d = useDict();
  const k = d.productKind;

  const pick = (kind: Kind) => router.replace(kind === 'goods' ? '/product-new' : `/product-new?kind=${kind}`);

  return (
    <View style={st.root}>
      <Pressable style={[StyleSheet.absoluteFill, st.backdrop]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={d.common.close} />
      <View style={[st.sheet, { backgroundColor: c.bg, paddingBottom: insets.bottom + 16 }]}>
        <Text style={[st.title, { color: c.ink }]}>{k.title}</Text>
        <Text style={[st.sub, { color: c.ink3 }]}>{k.sub}</Text>
        <View style={{ gap: 10, marginTop: 8 }}>
          {(['goods', 'service', 'bundle'] as const).map((kind) => (
            <Pressable
              key={kind}
              onPress={() => pick(kind)}
              accessibilityRole="button"
              style={({ pressed }) => [st.card, { backgroundColor: c.fill2 }, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name={ICONS[kind]} size={26} color={c.tint} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[st.cardT, { color: c.ink }]}>{k[kind]}</Text>
                <Text style={[st.cardH, { color: c.ink3 }]}>{k[`${kind}Hint`]}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Button title={d.common.close} variant="gray" size="lg" full onPress={() => router.back()} style={{ marginTop: 14 }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 24, gap: 6 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: 15, fontWeight: '500', textAlign: 'center', marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16 },
  cardT: { fontSize: 17, fontWeight: '700' },
  cardH: { fontSize: 14, fontWeight: '500' },
});
