import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeProvider as NavThemeProvider, DefaultTheme, DarkTheme, type Theme as NavTheme } from '@react-navigation/native';
import { QueryClientProvider, IsRestoringProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { BuyerProvider } from '@/lib/buyer';
import { MarketCartProvider } from '@/lib/marketCart';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { I18nProvider } from '@/lib/i18n';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { OfflineBanner, useNetBar, NET_BAR_H } from '@/components/OfflineBanner';
import { OfflinePosProvider } from '@/lib/offlinePos';
import { queryClient, startCachePersist, stopCachePersist } from '@/lib/queryClient';
import { registerForPush, pushUrlOf } from '@/lib/push';
import {
  useFonts, Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold, Onest_800ExtraBold,
} from '@expo-google-fonts/onest';
import { enableAppFont } from '@/components/ui/Text';

// Native splash JS animatsiyasi boshlanguncha turadi (AnimatedSplash onLayout'da yopadi)
SplashScreen.preventAutoHideAsync().catch(() => { /* allaqachon yopilgan */ });

/** Token bekor bo'lsa (401) — qaysi ekranda bo'lmasin, kirish sahifasiga. */
function AuthGate() {
  const { loading, me, error } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (loading || me || error) return;
    // Kirmagan foydalanuvchi faqat kirish, ro'yxatdan o'tish va Savora Market ekranlarida qola oladi
    const seg = segments[0] as string | undefined;
    if (seg !== 'login' && seg !== 'register' && seg !== 'market') router.replace('/market');
  }, [loading, me, error, segments, router]);
  return null;
}

/**
 * Push: kirgandan keyin qurilmani ro'yxatdan o'tkazadi; bildirishnoma bosilsa — tegishli ekranga.
 * Ilova yopiq bo'lganda bosilgan bildirishnoma ham (sovuq start) kirish tugagach ochiladi.
 */
function PushGate() {
  const { me, fromCache } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const userId = me && !fromCache ? me.user.id : null;
  useEffect(() => { if (userId) void registerForPush(); }, [userId]);

  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  // Bosh sahifa yo'naltirishi tugaguncha kutamiz (aks holda u bizning o'tishni bosib ketadi)
  const ready = !!me && segments.length > 0 && segments[0] !== 'login' && segments[0] !== 'register';
  useEffect(() => {
    if (!ready || !response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    Notifications.clearLastNotificationResponse();
    const url = pushUrlOf(response.notification.request.content.data);
    if (url) router.push(url);
  }, [ready, response, router]);
  return null;
}

/**
 * O'qish keshi (TanStack Query) + telefonda saqlash. PersistQueryClientProvider o'rniga o'zimizniki:
 * u buster'ni faqat birinchi mount'da o'qiydi, bizda esa buster = foydalanuvchi + versiya — kirish/chiqishda
 * qayta tiklash kerak (butun daraxtni qayta mount qilmasdan). Tiklanayotganda so'rovlar kutadi (IsRestoringProvider).
 */
function QueryProvider({ children }: { children: ReactNode }) {
  const { loading, me } = useAuth();
  // undefined — sessiya hali aniqlanmagan; null — kirmagan
  const userId = loading ? undefined : me?.user.id ?? null;
  const [restoring, setRestoring] = useState(true);
  useEffect(() => {
    if (userId === undefined) return;
    let alive = true;
    setRestoring(true);
    void startCachePersist(userId).finally(() => { if (alive) setRestoring(false); });
    return () => { alive = false; stopCachePersist(); };
  }, [userId]);
  return (
    <QueryClientProvider client={queryClient}>
      <IsRestoringProvider value={restoring}>{children}</IsRestoringProvider>
    </QueryClientProvider>
  );
}

/** Ochilish animatsiyasi: sessiya tekshiruvi tugamaguncha va animatsiya oxirigacha ustida turadi. */
function SplashGate() {
  const { loading } = useAuth();
  const [visible, setVisible] = useState(true);
  const onDone = useCallback(() => setVisible(false), []);
  if (!visible) return null;
  return (
    <>
      <StatusBar style="light" />
      <AnimatedSplash ready={!loading} onDone={onDone} />
    </>
  );
}

function Navigation() {
  const { c, dark } = useTheme();
  const navTheme = useMemo<NavTheme>(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark,
      colors: { ...base.colors, primary: c.tint, background: c.bg, card: c.cell, text: c.ink, border: c.sep, notification: c.bad },
    };
  }, [c, dark]);

  // Tarmoq chizig'i ko'rinsa — ekranlar uchun yuqori safe area chiziq balandligiga ko'payadi (kontent ostida qolmasin)
  const netBar = useNetBar();
  const insets = useSafeAreaInsets();
  const barOn = !!netBar;
  const screenInsets = useMemo(() => (barOn ? { ...insets, top: insets.top + NET_BAR_H } : insets), [barOn, insets]);

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <AuthGate />
      <PushGate />
      <SafeAreaInsetsContext.Provider value={screenInsets}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" options={{ animation: 'fade' }} />
          <Stack.Screen name="market/index" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="offline-sales" />
          <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', contentStyle: { backgroundColor: '#000' } }} />
          {/* Tur tanlash — shaffof fon ustidagi pastki varaq */}
          <Stack.Screen name="product-kind" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
        </Stack>
      </SafeAreaInsetsContext.Provider>
      {netBar ? <OfflineBanner info={netBar} top={insets.top} /> : null}
      <SplashGate />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold, Onest_800ExtraBold,
  });
  // Shrift yuklanguncha native splash turadi; yuklanmasa — tizim shrifti bilan davom etamiz
  if (!fontsLoaded && !fontError) return null;
  if (fontsLoaded) enableAppFont();

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <ThemeProvider>
          <AuthProvider>
            {/* Savora Market xaridori va savati — biznes sessiyasidan mustaqil */}
            <BuyerProvider>
              <MarketCartProvider>
                <QueryProvider>
                  <OfflinePosProvider>
                    <Navigation />
                  </OfflinePosProvider>
                </QueryProvider>
              </MarketCartProvider>
            </BuyerProvider>
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
