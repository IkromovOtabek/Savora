import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet, Group, Cell, Stepper, Switch, Button, Loading, InlineError } from '@/components/ui';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { errMsg } from '@/lib/api';
import { fetchLabels, printLabels, type LabelData } from '@/lib/labels';

/** web LABEL_LIMITS.maxCopies — server ham shu chegarada kesadi */
const MAX_COPIES = 50;

/**
 * «Barkod chop etish» varag'i — web'dagi oyna bilan bir xil: o'lcham, nusxa, «har bir donaga», ogohlantirishlar.
 * Yorliq HTML'i serverda yasaladi; nusxa o'zgarsa — shu nusxa bilan qayta so'raladi.
 */
export function LabelPrintSheet({ ids, visible, onClose }: { ids: string[]; visible: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const d = useDict();
  const t = d.labels;
  const [data, setData] = useState<LabelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copies, setCopies] = useState(1);
  const [perUnit, setPerUnit] = useState(false);
  const [printing, setPrinting] = useState(false);
  const key = ids.join(',');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setError(null);
    try {
      const r = await fetchLabels(key.split(','));
      if (my !== seq.current) return;
      setData(r);
      setCopies(r.copies);
      setPerUnit(false);
    } catch (e) {
      if (my === seq.current) setError(errMsg(e, t.failed));
    }
  }, [key, t.failed]);

  // Har ochilishda yangidan: narx, IMEI yoki sozlama o'zgargan bo'lishi mumkin
  useEffect(() => {
    if (!visible) return;
    setData(null);
    void load();
  }, [visible, load]);

  async function onPrint() {
    if (!data) return;
    setPrinting(true);
    try {
      let doc = data;
      if (copies !== data.copies || perUnit !== data.perUnit) {
        try {
          doc = await fetchLabels(key.split(','), { copies, perUnit });
        } catch (e) {
          Alert.alert(d.common.error, errMsg(e, t.failed));
          return;
        }
      }
      try {
        if (await printLabels(doc)) onClose();
      } catch {
        Alert.alert(d.common.error, t.printFailed);
      }
    } finally {
      setPrinting(false);
    }
  }

  const first = data?.items[0];
  const hasUnits = !!data?.items.some((i) => i.available > 1);
  // Tugmadagi son (web: expandCopies natijasi uzunligi)
  const total = data
    ? perUnit
      ? data.items.reduce((n, i) => n + Math.max(1, Math.floor(i.available)), 0)
      : copies * data.items.length
    : 0;
  const w = data?.warnings;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={d.common.close}
      title={t.title}
      subtitle={first ? first.name + (data!.items.length > 1 ? ` ${tr(t.more, { n: data!.items.length - 1 })}` : '') : undefined}
      footer={
        <Button
          title={t.print}
          value={total > 1 ? tr(t.total, { n: total }) : undefined}
          icon="print-outline"
          size="lg"
          full
          loading={printing}
          disabled={!data || printing}
          onPress={() => { void onPrint(); }}
        />
      }
    >
      {!data ? (
        error ? <InlineError message={error} onRetry={() => { void load(); }} /> : <Loading />
      ) : (
        <>
          <Group>
            <Cell title={t.size} value={tr(t.sizeVal, { w: data.settings.width, h: data.settings.height })} />
            {!perUnit ? <Cell title={t.copies} right={<Stepper value={copies} onChange={setCopies} min={1} max={MAX_COPIES} />} /> : null}
            {hasUnits ? <Cell title={t.perUnit} titleLines={2} right={<Switch value={perUnit} onValueChange={setPerUnit} />} /> : null}
          </Group>

          {w && w.imeiPending > 0 ? <Warn text={tr(t.imeiPending, { n: w.imeiPending })} /> : null}
          {w?.noCode ? <Warn text={tr(t.noCode, { name: w.noCode })} /> : null}
          {w?.tight && !w.noCode ? <Warn text={t.tight} /> : null}

          <Text style={[s.hint, { color: c.ink3 }]}>{t.settingsHint}</Text>
        </>
      )}
    </Sheet>
  );
}

function Warn({ text }: { text: string }) {
  const { c } = useTheme();
  return (
    <View style={[s.warn, { backgroundColor: c.warnSoft }]} accessibilityRole="alert">
      <Ionicons name="warning" size={18} color={c.warn} />
      <Text style={[s.warnT, { color: c.ink }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  warn: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 14 },
  warnT: { flex: 1, fontSize: 14, lineHeight: 19 },
  hint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
});
