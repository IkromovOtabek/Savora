import { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { useOfflinePos } from '@/lib/offlinePos';
import { useNetState } from '@/lib/net';

/**
 * Ekran tepasidagi ingichka holat chizig'i (butun ilova uchun, app/_layout.tsx):
 *  kulrang «Oflayn — amallar telefonda saqlanadi» · qizil «N ta muammo» · ko'k «Yuborilmoqda: N» · sariq «Internet sekin».
 * Holat kamida 3 s barqaror tursa chiqadi/almashadi (chayqalmasin). Oflayn sotuv navbati bo'lsa — bosilsa
 * «Oflayn sotuvlar» ekrani. Avvalgi bosh sahifa banneri shu chiziqqa birlashtirildi.
 */

export const NET_BAR_H = 24;
const STABLE_MS = 3000;

export type NetBarKind = 'offline' | 'problems' | 'sending' | 'slow';
export interface NetBarInfo { kind: NetBarKind; pending: number; problems: number }

/** Ko'rsatiladigan chiziq (3 s barqarorlik bilan) — null: hammasi joyida */
export function useNetBar(): NetBarInfo | null {
  const net = useNetState();
  const { pendingCount, problemCount } = useOfflinePos();
  const want: NetBarKind | null =
    net === 'offline' ? 'offline'
      : problemCount > 0 ? 'problems'
      : pendingCount > 0 ? 'sending'
      : net === 'slow' ? 'slow'
      : null;
  const [shown, setShown] = useState<NetBarKind | null>(null);
  useEffect(() => {
    if (want === shown) return;
    const t = setTimeout(() => setShown(want), STABLE_MS);
    return () => clearTimeout(t);
  }, [want, shown]);
  return shown ? { kind: shown, pending: pendingCount, problems: problemCount } : null;
}

export function OfflineBanner({ info, top }: { info: NetBarInfo; top: number }) {
  const { dark } = useTheme();
  const d = useDict();
  const router = useRouter();
  const n = d.net;

  const look = {
    offline: { bg: dark ? '#3A4357' : '#5E6779', fg: '#FFFFFF', icon: 'cloud-offline' as const, text: n.offline },
    problems: { bg: '#D92D20', fg: '#FFFFFF', icon: 'alert-circle' as const, text: tr(n.problems, { n: info.problems }) },
    sending: { bg: '#2F6BFF', fg: '#FFFFFF', icon: 'cloud-upload' as const, text: tr(n.sending, { n: info.pending }) },
    slow: { bg: '#FDB022', fg: '#2A1A00', icon: 'cellular-outline' as const, text: n.slow },
  }[info.kind];

  // Oflaynda navbat ham ko'rinsin: muammo bo'lsa — u, aks holda navbatdagi sotuvlar soni
  const extra = info.kind === 'offline'
    ? info.problems > 0 ? tr(n.problems, { n: info.problems }) : info.pending > 0 ? tr(n.queued, { n: info.pending }) : null
    : null;
  const tappable = info.pending + info.problems > 0;
  const label = extra ? `${look.text} · ${extra}` : look.text;

  return (
    <Pressable
      onPress={tappable ? () => router.push('/offline-sales') : undefined}
      disabled={!tappable}
      accessibilityRole={tappable ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={({ pressed }) => [s.bar, { top, backgroundColor: look.bg }, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name={look.icon} size={14} color={look.fg} />
      <Text style={[s.t, { color: look.fg }]} numberOfLines={1}>{look.text}</Text>
      {extra ? <Text style={[s.extra, { color: look.fg }]} numberOfLines={1}>· {extra}</Text> : null}
      {tappable ? <View style={s.chev}><Ionicons name="chevron-forward" size={13} color={look.fg} /></View> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, height: NET_BAR_H, zIndex: 100, elevation: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12,
  },
  t: { fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  extra: { fontSize: 12.5, fontWeight: '700', flexShrink: 0 },
  chev: { marginLeft: 2 },
});
