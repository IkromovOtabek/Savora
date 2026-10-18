import { Tabs, Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme, HAIRLINE } from '@/lib/theme';
import { Loading, ErrorState } from '@/components/ui';
import { useDict } from '@/lib/i18n';

export default function TabsLayout() {
  const { loading, me, error, refresh } = useAuth();
  const { c } = useTheme();
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
          borderTopWidth: HAIRLINE,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: d.tabs.home, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={24} /> }} />
      <Tabs.Screen name="products" options={{ title: me.terms?.items ?? d.terms.items, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'cube' : 'cube-outline'} color={color} size={24} /> }} />
      <Tabs.Screen
        name="sell"
        options={{
          title: d.tabs.sell,
          tabBarAccessibilityLabel: d.tabs.newSale,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600', color: c.tint },
          tabBarIcon: () => (
            <View style={[s.sell, { backgroundColor: c.tintFill }]}>
              <Ionicons name="scan" color="#fff" size={18} />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => { e.preventDefault(); router.push('/sale-new'); },
        }}
      />
      <Tabs.Screen name="nasiya" options={{ title: d.tabs.nasiya, href: nasiyaOn ? undefined : null, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'time' : 'time-outline'} color={color} size={24} /> }} />
      {/* Nasiya yoqilmagan bo'lsa — uning o'rnida Sotuvlar */}
      <Tabs.Screen name="sales" options={{ title: d.tabs.sales, href: nasiyaOn ? null : undefined, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'cart' : 'cart-outline'} color={color} size={24} /> }} />
      <Tabs.Screen name="profile" options={{ title: d.tabs.profile, tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} color={color} size={25} /> }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  sell: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
