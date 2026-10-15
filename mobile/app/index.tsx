import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Loading } from '@/components/ui';

export default function Index() {
  const { loading, me, error } = useAuth();
  if (loading) return <Loading full />;
  // Tarmoq xatosi bo'lsa ham token bor — (tabs) xato ekranini ko'rsatadi
  return <Redirect href={me || error ? '/(tabs)' : '/login'} />;
}
