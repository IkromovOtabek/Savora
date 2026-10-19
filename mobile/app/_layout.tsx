import { useCallback, useEffect, useMemo, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider as NavThemeProvider, DefaultTheme, DarkTheme, type Theme as NavTheme } from '@react-navigation/native';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { I18nProvider } from '@/lib/i18n';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { OfflinePosProvider } from '@/lib/offlinePos';
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
    // Kirmagan foydalanuvchi faqat kirish va ro'yxatdan o'tish ekranlarida qola oladi
    if (segments[0] !== 'login' && segments[0] !== 'register') router.replace('/login');
  }, [loading, me, error, segments, router]);
  return null;
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

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <AuthGate />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="offline-sales" />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', contentStyle: { backgroundColor: '#000' } }} />
      </Stack>
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
            <OfflinePosProvider>
              <Navigation />
            </OfflinePosProvider>
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
