import { useState } from 'react';
import { View, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, errMsg } from '@/lib/api';
import { Screen, ModalBar, Field, FormCard } from '@/components/ui';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';

/** Ichma-ichlik chegarasi (server bilan bir xil: CATEGORY_MAX_DEPTH) */
const MAX_DEPTH = 4;

interface Node { key: string; name: string; children: Node[] }
let seq = 0;
const node = (): Node => ({ key: `n${++seq}`, name: '', children: [] });

/** Daraxtdagi tugunni o'zgartirish (kalit bo'yicha) */
function mapTree(n: Node, key: string, fn: (n: Node) => Node | null): Node | null {
  if (n.key === key) return fn(n);
  const kids = n.children.map((k) => mapTree(k, key, fn)).filter((k): k is Node => k !== null);
  return { ...n, children: kids };
}

const hasEmpty = (n: Node): boolean => !n.name.trim() || n.children.some(hasEmpty);
const toBody = (n: Node): { name: string; children: unknown[] } => ({ name: n.name.trim(), children: n.children.map(toBody) });

/** «Yangi kategoriya» — kategoriya va uning ichidagi subkategoriyalarni bir yo'la kiritish */
export default function CategoryNew() {
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const k = d.catalog;
  const [root, setRoot] = useState<Node>(() => node());
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = (key: string, fn: (n: Node) => Node | null) => setRoot((r) => mapTree(r, key, fn) ?? r);

  async function onSave() {
    setTouched(true);
    if (hasEmpty(root)) return;
    setBusy(true);
    try {
      await api('/api/mobile/catalog/categories', { method: 'POST', body: toBody(root) });
      router.back();
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally { setBusy(false); }
  }

  function renderNode(n: Node, depth: number, isRoot: boolean) {
    const err = touched && !n.name.trim() ? k.nameRequired : null;
    return (
      <View key={n.key} style={{ gap: 10 }}>
        <Field
          value={n.name}
          onChangeText={(v) => update(n.key, (x) => ({ ...x, name: v }))}
          placeholder={k.categoryName}
          maxLength={60}
          autoFocus={isRoot}
          error={err}
          right={isRoot ? undefined : (
            <Pressable onPress={() => update(n.key, () => null)} hitSlop={10} accessibilityRole="button" accessibilityLabel={d.common.clear}>
              <Ionicons name="close-circle" size={22} color={c.ink3} />
            </Pressable>
          )}
        />
        <View style={[s.branch, { borderLeftColor: c.sep }]}>
          {n.children.map((ch) => renderNode(ch, depth + 1, false))}
          {depth < MAX_DEPTH ? (
            <Pressable
              onPress={() => update(n.key, (x) => ({ ...x, children: [...x.children, node()] }))}
              accessibilityRole="button"
              style={({ pressed }) => [s.sub, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="add-circle" size={22} color={c.tint} />
              <Text style={[s.subT, { color: c.tint }]}>{k.subAdd}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <Screen keyboard bar={<ModalBar title={k.categoryNew} actionLabel={d.common.save} onAction={onSave} actionBusy={busy} />}>
      <FormCard title={k.categoryNewHead}>
        {renderNode(root, 1, true)}
      </FormCard>
    </Screen>
  );
}

const s = StyleSheet.create({
  branch: { marginLeft: 12, paddingLeft: 14, borderLeftWidth: 1.5, gap: 10 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  subT: { fontSize: 16, fontWeight: '600' },
});
