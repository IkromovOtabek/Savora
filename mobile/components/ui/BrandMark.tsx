import { View } from 'react-native';

/**
 * Savora belgisi — kobalt kvadratda o'sib boruvchi to'lov ustunlari va oltin nuqta.
 * Web: web/components/BrandMark.tsx (u yerda ustunlarni bog'lovchi oltin chiziq ham bor;
 * bu yerda react-native-svg yo'qligi uchun faqat ustunlar va nuqta).
 */
export function BrandMark({ size = 72 }: { size?: number }) {
  const u = size / 100;
  const bar = (left: number, top: number, h: number, opacity: number) => (
    <View style={{ position: 'absolute', left: left * u, top: top * u, width: 13 * u, height: h * u, borderRadius: 6.5 * u, backgroundColor: '#fff', opacity }} />
  );
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: '#1F4FA8', overflow: 'hidden' }}
    >
      {bar(20, 58, 24, 0.55)}
      {bar(40, 45, 37, 0.8)}
      {bar(60, 32, 50, 1)}
      <View style={{ position: 'absolute', left: 72.5 * u, top: 14.5 * u, width: 13 * u, height: 13 * u, borderRadius: 6.5 * u, backgroundColor: '#F0BF4C' }} />
    </View>
  );
}
