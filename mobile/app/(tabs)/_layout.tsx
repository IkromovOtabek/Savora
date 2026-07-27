import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { loading, me } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }
  if (!me) return <Redirect href="/login" />;

  const f = me.features ?? {};
  const nasiyaOn = !!(f.variant || f.nasiya);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 60, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Asosiy', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="products" options={{ title: 'Ombor', tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="sales" options={{ title: 'Sotuvlar', tabBarIcon: ({ color, size }) => <Ionicons name="cart-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="nasiya" options={{ title: 'Nasiya', href: nasiyaOn ? undefined : null, tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Kabinet', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
