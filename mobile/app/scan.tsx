import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { colors } from '@/lib/theme';

export default function Scan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const onScan = useCallback(async ({ data }: { data: string }) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    const code = String(data || '').trim();
    try {
      const r = await api<{ items: { id: string }[] }>(`/api/mobile/products?q=${encodeURIComponent(code)}`);
      if (r.items.length > 0) {
        router.replace(`/product/${r.items[0].id}`);
      } else {
        Alert.alert('Topilmadi', `"${code}" bo'yicha mahsulot yo'q. Yangi qo'shasizmi?`, [
          { text: 'Bekor', style: 'cancel', onPress: () => { lock.current = false; setBusy(false); } },
          { text: 'Qo\'shish', onPress: () => router.replace(`/product-new?code=${encodeURIComponent(code)}`) },
        ]);
      }
    } catch (e) {
      Alert.alert('Xatolik', e instanceof Error ? e.message : 'Qidirishda xatolik', [
        { text: 'OK', onPress: () => { lock.current = false; setBusy(false); } },
      ]);
    }
  }, [router]);

  if (!permission) return <View style={s.center}><ActivityIndicator color={colors.brand} /></View>;

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.center}>
        <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
        <Text style={s.permText}>Shtrix kodni skaner qilish uchun kamera ruxsati kerak.</Text>
        <TouchableOpacity style={s.btn} onPress={requestPermission}><Text style={s.btnT}>Ruxsat berish</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 14 }}><Text style={s.cancel}>Bekor qilish</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
        onBarcodeScanned={busy ? undefined : onScan}
      />
      <SafeAreaView style={s.overlay} edges={['top']}>
        <TouchableOpacity style={s.close} onPress={() => router.back()} hitSlop={10}><Ionicons name="close" size={26} color="#fff" /></TouchableOpacity>
      </SafeAreaView>
      <View style={s.frame} pointerEvents="none" />
      <View style={s.hint}><Text style={s.hintT}>{busy ? 'Qidirilmoqda…' : 'Shtrix kodni ramka ichiga tuting'}</Text></View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 28 },
  permText: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: 14, marginBottom: 20 },
  btn: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28 },
  btnT: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancel: { color: colors.textMuted, fontSize: 14 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  close: { alignSelf: 'flex-end', margin: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  frame: { position: 'absolute', top: '34%', left: '12%', right: '12%', height: 160, borderWidth: 3, borderColor: '#fff', borderRadius: 16 },
  hint: { position: 'absolute', bottom: 70, left: 0, right: 0, alignItems: 'center' },
  hintT: { color: '#fff', fontSize: 14.5, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
});
