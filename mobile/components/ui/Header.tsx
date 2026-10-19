import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme, type as T } from '@/lib/theme';
import { useLayout } from './Screen';
import { useDict } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { initials } from '@/lib/format';

interface LargeTitleProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /** Yuqori qatordagi o'ng amallar (tugmalar) */
  actions?: React.ReactNode;
  /** Sarlavha yonidagi element (masalan, Ring) */
  left?: React.ReactNode;
  size?: 'large' | 'medium';
}

/** iOS katta sarlavha: 32/700, harflar orasi −0.8. */
export function LargeTitle({ title, subtitle, eyebrow, actions, left, size = 'large' }: LargeTitleProps) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const fs = size === 'large' ? (compact ? 30 : 34) : (compact ? 24 : 26);
  return (
    <View style={{ gap: 4 }}>
      {(eyebrow || actions) ? (
        <View style={s.navrow}>
          <Text style={[s.eyebrow, { color: c.ink3 }]} numberOfLines={1}>{eyebrow ?? ''}</Text>
          <View style={s.actions}>{actions}</View>
        </View>
      ) : null}
      <View style={s.titleRow}>
        {left}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            accessibilityRole="header"
            style={[T.largeTitle, { fontSize: fs, lineHeight: Math.round(fs * 1.18), color: c.ink }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {subtitle ? <Text style={[s.subtitle, { color: c.ink3 }]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
      </View>
    </View>
  );
}

interface TopBarProps {
  title: string;
  subtitle?: string;
  /** Sarlavha chapidagi element (masalan, BrandMark) */
  left?: React.ReactNode;
  /** O'ng amallar — dumaloq IconButton'lar */
  actions?: React.ReactNode;
  /** Kabinet avatari (bosilsa — Kabinet). Kabinet ekranining o'zida false. */
  profile?: boolean;
  /** Sarlavha ostidagi qotib turadigan qism (qidiruv, segment) */
  children?: React.ReactNode;
}

/**
 * Tab ekranlar sarlavhasi — pastki burchaklari yumaloq oq karta (Screen `bar` ichida).
 * Katta qalin sarlavha + dumaloq ikon tugmalar + kabinet avatari.
 */
export function TopBar({ title, subtitle, left, actions, profile = true, children }: TopBarProps) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const { me } = useAuth();
  const router = useRouter();
  const d = useDict();
  const fs = compact ? 28 : 32;
  return (
    <View style={{ gap: 12 }}>
      <View style={s.topRow}>
        {left}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            accessibilityRole="header"
            style={[T.largeTitle, { fontSize: fs, lineHeight: Math.round(fs * 1.2), color: c.ink }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {title}
          </Text>
          {subtitle ? <Text style={[s.topSub, { color: c.ink3 }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={s.actions}>
          {actions}
          {profile && me ? (
            <Pressable
              onPress={() => router.push('/(tabs)/profile')}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={d.tabs.profile}
              style={({ pressed }) => [s.me, { backgroundColor: c.tintFill }, pressed && { opacity: 0.6 }]}
            >
              <Text style={s.meT} numberOfLines={1}>{meInitials(me.user.username)}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/** Bitta so'zli login uchun ham ikki harf: "otabek" → "OT". */
function meInitials(name: string): string {
  const i = initials(name);
  return i.length > 1 ? i : name.trim().slice(0, 2).toUpperCase() || i;
}

interface NavBarProps {
  backLabel?: string;
  title?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}

/** Stack ekranlar uchun yuqori qator: "‹ Orqaga" + (ixtiyoriy) sarlavha + o'ng amal. */
export function NavBar({ backLabel: backLabelProp, title, right, onBack }: NavBarProps) {
  const { c } = useTheme();
  const d = useDict();
  const backLabel = backLabelProp ?? d.common.back;
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')));
  return (
    <View style={s.bar}>
      <Pressable
        onPress={back}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        style={({ pressed }) => [s.back, pressed && { opacity: 0.5 }]}
      >
        <Ionicons name="chevron-back" size={26} color={c.tint} style={{ marginLeft: -6 }} />
        <Text style={[s.backT, { color: c.tint }]} numberOfLines={1}>{backLabel}</Text>
      </Pressable>
      {title ? (
        <Text style={[T.headline, s.barTitle, { color: c.ink }]} numberOfLines={1} pointerEvents="none">{title}</Text>
      ) : null}
      <View style={s.right}>{right}</View>
    </View>
  );
}

const s = StyleSheet.create({
  navrow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, gap: 12 },
  eyebrow: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  topSub: { fontSize: 15, fontWeight: '600', marginTop: 1 },
  me: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  meT: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  subtitle: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, maxWidth: '40%', zIndex: 1 },
  backT: { fontSize: 17, fontWeight: '400' },
  barTitle: { position: 'absolute', left: 90, right: 90, textAlign: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 1 },
});
