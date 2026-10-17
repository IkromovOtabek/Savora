import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, Linking, Pressable, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { api, errMsg } from '@/lib/api';
import { putPicked, type PickedProduct } from '@/lib/pick';
import { Screen, NavBar, EmptyState, Button, Loading } from '@/components/ui';
import { useDict, tr } from '@/lib/i18n';

interface Item extends PickedProduct { imei: string; barcode: string | null }

export default function Scan() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const pickMode = mode === 'pick';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const d = useDict();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const lock = useRef(false);

  const unlock = () => { lock.current = false; setBusy(false); };

  const onScan = useCallback(async ({ data }: { data: string }) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    const code = String(data || '').trim();
    try {
      const r = await api<{ items: Item[] }>(`/api/mobile/products?q=${encodeURIComponent(code)}`);
      // Aniq mos kelganini birinchi olamiz (kod/shtrix), bo'lmasa birinchisi
      const norm = code.replace(/\s/g, '').toUpperCase();
      const hit = r.items.find((p) => p.imei?.toUpperCase() === norm || p.barcode === code) ?? r.items[0];
      if (hit) {
        if (pickMode) {
          if (hit.status !== 'in_stock' || hit.available <= 0) {
            Alert.alert(d.scan.notInSale, tr(d.scan.notInSaleMsg, { name: hit.name }), [{ text: d.scan.rescan, onPress: unlock }]);
            return;
          }
          putPicked({ id: hit.id, name: hit.name, salePrice: hit.salePrice, available: hit.available, trackQuantity: hit.trackQuantity, status: hit.status });
          router.back();
        } else {
          router.replace(`/product/${hit.id}`);
        }
      } else {
        Alert.alert(d.common.notFound, tr(d.scan.notFoundMsg, { code }), [
          { text: d.scan.rescan, style: 'cancel', onPress: unlock },
          ...(pickMode ? [] : [{ text: d.scan.addNew, onPress: () => router.replace(`/product-new?code=${encodeURIComponent(code)}`) }]),
        ]);
      }
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e, d.scan.searchError), [{ text: d.common.retry, onPress: unlock }]);
    }
  }, [router, pickMode, d]);

  if (!permission) return <Loading full />;

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <Screen header={<NavBar backLabel={d.common.close} />}>
        <EmptyState
          icon="camera-outline"
          title={d.scan.permTitle}
          message={blocked ? d.scan.permBlocked : d.scan.permAsk}
        />
        <Button
          title={blocked ? d.scan.openSettings : d.scan.grant}
          size="lg"
          full
          onPress={() => (blocked ? Linking.openSettings() : requestPermission())}
        />
      </Screen>
    );
  }

  const frameW = Math.min(width * 0.76, 360);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
        onBarcodeScanned={busy ? undefined : onScan}
      />
      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <Pressable style={({ pressed }) => [s.round, pressed && { opacity: 0.5 }]} onPress={() => setTorch((t) => !t)} hitSlop={8} accessibilityLabel={d.scan.torch}>
          <Ionicons name={torch ? 'flash' : 'flash-outline'} size={22} color="#fff" />
        </Pressable>
        <Text style={s.title}>{pickMode ? d.scan.titlePick : d.scan.title}</Text>
        <Pressable style={({ pressed }) => [s.round, pressed && { opacity: 0.5 }]} onPress={() => router.back()} hitSlop={8} accessibilityLabel={d.common.close}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
      </View>
      <View pointerEvents="none" style={s.center}>
        <View style={[s.frame, { width: frameW, height: frameW * 0.55 }]} />
      </View>
      <View style={[s.hint, { bottom: insets.bottom + 40 }]}>
        <Text style={s.hintT}>{busy ? d.scan.searching : d.scan.hint}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  title: { color: '#fff', fontSize: 17, fontWeight: '600' },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { borderWidth: 3, borderColor: '#fff', borderRadius: 18 },
  hint: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hintT: { color: '#fff', fontSize: 15, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, overflow: 'hidden' },
});
