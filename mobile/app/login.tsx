import { useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, Pressable, Animated, Easing, AccessibilityInfo, type TextInput,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Rect } from 'react-native-svg';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { useDict, useI18n, LOCALES, LOCALE_SHORT } from '@/lib/i18n';
import { Field, Button, BrandMark } from '@/components/ui';

const TILES = 12;
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { c, dark } = useTheme();
  const d = useDict();
  const { locale, setLocale } = useI18n();
  const insets = useSafeAreaInsets();
  // savora://login?u=... — web'da ro'yxatdan o'tgach ilovaga qaytganda login oldindan to'ldiriladi
  const { u } = useLocalSearchParams<{ u?: string }>();
  const [username, setUsername] = useState(typeof u === 'string' && /^[a-z0-9_]{3,40}$/.test(u) ? u : '');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const passRef = useRef<TextInput>(null);

  // Kirish animatsiyasi: hero tepadan tushadi, plitkalar ketma-ket chiqadi, karta va maydonlar ko'tariladi
  const hero = useRef(new Animated.Value(0)).current;
  const tiles = useRef(Array.from({ length: TILES }, () => new Animated.Value(0))).current;
  const heading = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const rows = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const foot = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const all = [hero, ...tiles, heading, card, ...rows, foot];
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (cancelled) return;
      if (reduce) { all.forEach((v) => v.setValue(1)); return; }
      const t = (v: Animated.Value, delay: number, duration = 600) =>
        Animated.timing(v, { toValue: 1, duration, delay, easing: ease, useNativeDriver: true });
      Animated.parallel([
        t(hero, 0, 750),
        ...tiles.map((v, i) => Animated.spring(v, { toValue: 1, delay: 280 + i * 50, damping: 10, stiffness: 160, useNativeDriver: true })),
        t(heading, 320),
        t(card, 460, 700),
        ...rows.map((v, i) => t(v, 600 + i * 100, 520)),
        t(foot, 1000, 500),
      ]).start();
    });
    return () => { cancelled = true; };
  }, [hero, tiles, heading, card, rows, foot]);

  async function onSubmit() {
    if (!username.trim() || !password) {
      Alert.alert(d.login.fieldsTitle, d.login.fieldsMsg);
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert(d.login.failTitle, errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const heroBg = dark ? '#13214A' : c.tint;
  const rise = (v: Animated.Value, dy = 22) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) }],
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Tepadan tortilganda (iOS bounce) hero rangi davom etadi */}
          <View pointerEvents="none" style={[s.overscroll, { backgroundColor: heroBg }]} />
          <Animated.View
            style={[
              s.hero,
              {
                backgroundColor: heroBg,
                paddingTop: insets.top + 14,
                transform: [{ translateY: hero.interpolate({ inputRange: [0, 1], outputRange: [-360, 0] }) }],
              },
            ]}
          >
            <View style={[s.tiles, { top: insets.top + 70 }]} pointerEvents="none">
              {tiles.map((v, i) => (
                <Animated.View
                  key={i}
                  style={{
                    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }),
                    transform: [
                      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                      { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-45deg', '0deg'] }) },
                    ],
                  }}
                >
                  <Svg width={52} height={52} viewBox="0 0 100 100">
                    <G fill="none" stroke="#FFFFFF" strokeWidth={5}>
                      <Rect x={22} y={22} width={56} height={56} />
                      <Rect x={22} y={22} width={56} height={56} transform="rotate(45 50 50)" />
                    </G>
                  </Svg>
                </Animated.View>
              ))}
            </View>

            <View style={s.topRow}>
              <View style={s.brand}>
                <View style={s.logoChip}><BrandMark size={34} /></View>
                <Text style={s.brandName}>Savora</Text>
              </View>
              <View style={s.lang} accessibilityRole="radiogroup" accessibilityLabel={d.login.language}>
                {LOCALES.map((l) => {
                  const on = l === locale;
                  return (
                    <Pressable
                      key={l}
                      onPress={() => setLocale(l)}
                      hitSlop={6}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={[s.langBtn, on && { backgroundColor: '#FFFFFF' }]}
                    >
                      <Text style={[s.langT, { color: on ? heroBg : 'rgba(255,255,255,0.85)' }]}>{LOCALE_SHORT[l]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Animated.View style={[s.heading, rise(heading)]}>
              <Text style={s.title} accessibilityRole="header">{d.login.heroTitle}</Text>
              <Text style={s.sub}>{d.login.heroSub}</Text>
            </Animated.View>
          </Animated.View>

          <Animated.View
            style={[
              s.card,
              { backgroundColor: c.cell, borderColor: c.sep, shadowColor: c.shadow },
              rise(card, 30),
            ]}
          >
            <Animated.View style={rise(rows[0], 16)}>
              <Field
                label={d.common.login}
                value={username}
                onChangeText={setUsername}
                placeholder={d.login.loginPlaceholder}
                autoCapitalize="none"
                textContentType="username"
                autoComplete="username"
                returnKeyType="next"
                onSubmitEditing={() => passRef.current?.focus()}
              />
            </Animated.View>
            <Animated.View style={rise(rows[1], 16)}>
              <Field
                ref={passRef}
                label={d.common.password}
                value={password}
                onChangeText={setPassword}
                placeholder={d.login.passwordPlaceholder}
                secureTextEntry={!showPass}
                textContentType="password"
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                right={
                  <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={12} accessibilityLabel={showPass ? d.login.hidePass : d.login.showPass}>
                    <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.ink3} />
                  </Pressable>
                }
              />
            </Animated.View>
            <Animated.View style={rise(rows[2], 16)}>
              <Button title={d.login.submit} size="lg" full loading={busy} onPress={onSubmit} style={{ marginTop: 6 }} />
              {/* Do'kon ochish — ilova ichida (bepul tarif) */}
              <Pressable
                onPress={() => router.push('/register')}
                hitSlop={8}
                accessibilityRole="link"
                style={({ pressed }) => [s.register, pressed && { opacity: 0.6 }]}
              >
                <Text style={[s.registerT, { color: c.ink3 }]}>{d.login.noStore} </Text>
                <Text style={[s.registerT, { color: c.tint, fontWeight: '600' }]}>{d.login.register}</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>

          <Animated.Text style={[s.foot, { color: c.ink3, opacity: foot }]}>{d.login.foot}</Animated.Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  hero: {
    borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: 'hidden',
    paddingHorizontal: 24, paddingBottom: 92,
  },
  overscroll: { position: 'absolute', top: -800, left: 0, right: 0, height: 900 },
  tiles: { position: 'absolute', right: -30, width: 250, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoChip: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  lang: { flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' },
  langBtn: { minWidth: 44, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  langT: { fontSize: 12, fontWeight: '700' },
  heading: { marginTop: 36, gap: 10 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.8, lineHeight: 35, maxWidth: 330 },
  sub: { color: 'rgba(255,255,255,0.82)', fontSize: 15, lineHeight: 22, maxWidth: 300 },
  card: {
    marginTop: -60, marginHorizontal: 16, borderRadius: 28, padding: 22, gap: 14,
    borderWidth: StyleSheet.hairlineWidth, maxWidth: 440,
    shadowOpacity: 0.16, shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 6,
  },
  register: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingTop: 6 },
  registerT: { fontSize: 15 },
  foot: { fontSize: 13, textAlign: 'center', marginTop: 22, lineHeight: 18, paddingHorizontal: 32 },
});
