import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';
import { Button, type IconName } from './Button';

export function Loading({ full }: { full?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[s.loading, full && { flex: 1, backgroundColor: c.bg }]}>
      <ActivityIndicator color={c.tint} size={full ? 'large' : 'small'} />
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, message, actionTitle, onAction }: {
  icon?: IconName; title: string; message?: string; actionTitle?: string; onAction?: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={s.wrap}>
      <View style={[s.iconCircle, { backgroundColor: c.fill2 }]}><Ionicons name={icon} size={28} color={c.ink3} /></View>
      <Text style={[s.title, { color: c.ink }]}>{title}</Text>
      {message ? <Text style={[s.msg, { color: c.ink3 }]}>{message}</Text> : null}
      {actionTitle && onAction ? <Button title={actionTitle} onPress={onAction} variant="tinted" style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry, full }: { message?: string | null; onRetry?: () => void; full?: boolean }) {
  const { c } = useTheme();
  const d = useDict();
  return (
    <View style={[s.wrap, full && { flex: 1, justifyContent: 'center', backgroundColor: c.bg }]}>
      <View style={[s.iconCircle, { backgroundColor: c.badSoft }]}><Ionicons name="cloud-offline-outline" size={28} color={c.bad} /></View>
      <Text style={[s.title, { color: c.ink }]}>{d.common.loadFailed}</Text>
      <Text style={[s.msg, { color: c.ink3 }]}>{message || d.common.errorGenericDot}</Text>
      {onRetry ? <Button title={d.common.retry} icon="refresh" onPress={onRetry} variant="tinted" style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

/** Ro'yxat ustidagi ingichka xato satri (ma'lumot bor, lekin yangilash muvaffaqiyatsiz). */
export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { c } = useTheme();
  const d = useDict();
  return (
    <View style={[s.inline, { backgroundColor: c.badSoft }]}>
      <Ionicons name="alert-circle" size={18} color={c.bad} />
      <Text style={[s.inlineT, { color: c.bad }]} numberOfLines={2}>{message}</Text>
      {onRetry ? <Button title={d.common.retryShort} size="sm" variant="plain" onPress={onRetry} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  loading: { paddingVertical: 40, alignItems: 'center', justifyContent: 'center' },
  wrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 6 },
  iconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  msg: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingLeft: 12, paddingRight: 6, minHeight: 44 },
  inlineT: { flex: 1, fontSize: 13.5, fontWeight: '500' },
});
