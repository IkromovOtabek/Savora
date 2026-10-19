import React, { useContext, useState } from 'react';
import {
  View, ScrollView, RefreshControl, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useTheme, MAX_CONTENT, HAIRLINE } from '@/lib/theme';

/**
 * Ekran o'lchamlari: yon oraliq, planshetda markazlangan kenglik, pastki bo'shliq
 * (tab bar shaffof va ustida turadi — kontent uning ostiga kirmasligi kerak).
 */
export function useLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBar = useContext(BottomTabBarHeightContext) ?? 0;
  const padX = width < 350 ? 12 : 16;
  return {
    width,
    padX,
    compact: width < 350,
    insets,
    tabBar,
    /** Kontent tugagandan keyingi pastki bo'shliq */
    bottom: (tabBar || insets.bottom) + 24,
    content: { width: '100%', maxWidth: MAX_CONTENT, alignSelf: 'center', paddingHorizontal: padX } as ViewStyle,
  };
}

interface ScreenProps {
  children: React.ReactNode;
  /** Qotib turadigan yuqori qism (NavBar) */
  header?: React.ReactNode;
  /** Tab ekranlar uchun yuqori karta (TopBar) — status bar ostidan boshlanadi */
  bar?: React.ReactNode;
  /** Pastda qotib turadigan tugma(lar) */
  footer?: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  keyboard?: boolean;
  gap?: number;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({ children, header, bar, footer, scroll = true, refreshing, onRefresh, keyboard, gap = 18, contentStyle }: ScreenProps) {
  const { c, dark } = useTheme();
  const L = useLayout();
  const [footerH, setFooterH] = useState(0);

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: bar ? 14 : header ? 4 : 8, paddingBottom: L.bottom + footerH }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentInsetAdjustmentBehavior="never"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.tint} colors={[c.tint]} /> : undefined}
    >
      <View style={[L.content, { gap }, contentStyle]}>{children}</View>
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>{children}</View>
  );

  const inner = (
    <>
      {bar ? (
        <View
          style={[
            styles.bar,
            { backgroundColor: c.cell, paddingTop: L.insets.top + 8 },
            !dark && styles.barShadow,
          ]}
        >
          <View style={L.content}>{bar}</View>
        </View>
      ) : null}
      {header ? <View style={L.content}>{header}</View> : null}
      {body}
      {footer ? (
        <View
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
          style={[
            styles.footer,
            { backgroundColor: c.bg, borderTopColor: c.sep, paddingBottom: (L.tabBar || L.insets.bottom) + 10 },
          ]}
        >
          <View style={L.content}>{footer}</View>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: bar ? 0 : L.insets.top }]}>
      {keyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{inner}</KeyboardAvoidingView>
      ) : inner}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { paddingBottom: 14, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, zIndex: 2 },
  barShadow: { shadowColor: '#0D1526', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, borderTopWidth: HAIRLINE },
});
