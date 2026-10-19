import { Tabs, Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme, HAIRLINE } from '@/lib/theme';
import type { IconName } from '@/components/ui';
import { fontsOn } from '@/components/ui/Text';
import { Loading, ErrorState } from '@/components/ui';
import { useDict } from '@/lib/i18n';

/** Faol tab — ikonka orqasida yumshoq urg'u "pill"i. */
function TabIcon({ name, active, color, bg }: { name: IconName; active: boolean; color: string; bg: string }) {
  return (
    <View style={[s.ind, active && { backgroundColor: bg }]}>
      <Ionicons name={name} color={color} size={27} />
    </View>
  );
}

export default function TabsLayout() {
  const { loading, me, error, refresh } = useAuth();
  const { c, dark } = useTheme();
  const d = useDict();
  const router = useRouter();

  if (loading) return <Loading full />;
  if (!me && error) return <ErrorState full message={error} onRetry={refresh} />;
  if (!me) return <Redirect href="/login" />;

  const f = me.features ?? {};
  const nasiyaOn = !!(f.variant || f.nasiya);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.tint,
        tabBarInactiveTintColor: c.ink3,
        // Balandlik berilmaydi — kutubxona safe area (home indicator) ni o'zi qo'shadi
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: c.bar,
          borderTopColor: c.sep,
          borderTopWidth: dark ? HAIRLINE : 0,
          elevation: 8,
          shadowColor: '#0D1526',
          shadowOpacity: dark ? 0 : 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 },
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontFamily: fontsOn() ? 'Manrope_700Bold' : undefined, fontWeight: fontsOn() ? 'normal' : '600', marginTop: 3 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: d.tabs.home, tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? 'home' : 'home-outline'} active={focused} color={color} bg={c.tintSoft} /> }} />
      <Tabs.Screen name="products" options={{ title: me.terms?.items ?? d.terms.items, tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? 'cube' : 'cube-outline'} active={focused} color={color} bg={c.tintSoft} /> }} />
      <Tabs.Screen
        name="sell"
        options={{
          title: d.tabs.sell,
          tabBarAccessibilityLabel: d.tabs.newSale,
          tabBarLabelStyle: { fontSize: 12, fontFamily: fontsOn() ? 'Manrope_800ExtraBold' : undefined, fontWeight: fontsOn() ? 'normal' : '700', color: c.tint, marginTop: 3 },
          tabBarIcon: () => (
            <View style={[s.sell, { backgroundColor: c.tintFill }]}>
              <Ionicons name="add" color="#fff" size={30} />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => { e.preventDefault(); router.push('/sale-new'); },
        }}
      />
      <Tabs.Screen name="nasiya" options={{ title: d.tabs.nasiya, href: nasiyaOn ? undefined : null, tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? 'time' : 'time-outline'} active={focused} color={color} bg={c.tintSoft} /> }} />
      {/* Nasiya yoqilmagan bo'lsa — uning o'rnida Sotuvlar */}
      <Tabs.Screen name="sales" options={{ title: d.tabs.sales, href: nasiyaOn ? null : undefined, tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? 'cart' : 'cart-outline'} active={focused} color={color} bg={c.tintSoft} /> }} />
      <Tabs.Screen name="profile" options={{ title: d.tabs.profile, tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? 'person-circle' : 'person-circle-outline'} active={focused} color={color} bg={c.tintSoft} /> }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  sell: {
    width: 60, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1F4FA8', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  ind: { width: 62, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
