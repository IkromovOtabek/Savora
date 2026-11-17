import React from 'react';
import { View, Modal, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Button } from './Button';
import { useLayout } from './Screen';
import { useTheme, HAIRLINE } from '@/lib/theme';
import { useDict } from '@/lib/i18n';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Sarlavha ostidagi kichik matn (narx, stol raqami) */
  subtitle?: string;
  /** Chap tugma matni (standart: «Bekor qilish») */
  closeLabel?: string;
  children: React.ReactNode;
  /** Pastda qotib turadigan asosiy tugma(lar) */
  footer?: React.ReactNode;
  gap?: number;
}

/**
 * iOS varaq (pageSheet) — sale/[id] to'lov varag'i bilan bir xil: «Bekor qilish» · sarlavha, ichi aylanadi,
 * pastda qotgan tugma. Android'da to'liq ekran. Sof RN Modal — native paket qo'shilmaydi.
 */
export function Sheet({ visible, onClose, title, subtitle, closeLabel, children, footer, gap = 16 }: SheetProps) {
  const { c } = useTheme();
  const d = useDict();
  const L = useLayout();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'ios' ? 12 : insets.top + 8;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[L.content, s.bar, { paddingTop: top }]}>
          <View style={s.side}>
            <Button title={closeLabel ?? d.common.cancel} variant="plain" onPress={onClose} />
          </View>
          <View style={s.mid} pointerEvents="none">
            <Text style={[s.title, { color: c.ink }]} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={[s.sub, { color: c.ink3 }]} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <View style={s.side} />
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[L.content, { paddingTop: 8, paddingBottom: 24, gap }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {children}
        </ScrollView>
        {footer ? (
          <View style={[s.footer, { borderTopColor: c.sep, backgroundColor: c.bg, paddingBottom: insets.bottom + 10 }]}>
            <View style={[L.content, { gap: 10 }]}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingBottom: 6 },
  side: { minWidth: 90, alignItems: 'flex-start' },
  mid: { flex: 1, alignItems: 'center', minWidth: 0 },
  title: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  footer: { paddingTop: 10, borderTopWidth: HAIRLINE },
});
