import React, { createContext, forwardRef, useContext } from 'react';
import {
  Text as RNText, TextInput as RNTextInput, StyleSheet,
  type TextProps, type TextInputProps, type StyleProp, type TextStyle,
} from 'react-native';

/**
 * Ilova shrifti — Onest (geometrik, BILLZ'dagi Gilroy'ga yaqin; lotin + kirill). Har og'irlik alohida fayl,
 * shu sababli fontWeight → aniq fontFamily ga aylantiriladi (Android'da boshqa yo'l yo'q).
 * Shrift yuklanmasa (enableAppFont chaqirilmasa) — tizim shrifti qoladi.
 */
const FAMILY: Record<string, string> = {
  '100': 'Onest_400Regular', '200': 'Onest_400Regular', '300': 'Onest_400Regular',
  '400': 'Onest_400Regular', normal: 'Onest_400Regular',
  '500': 'Onest_500Medium',
  '600': 'Onest_600SemiBold',
  '700': 'Onest_700Bold', bold: 'Onest_700Bold',
  '800': 'Onest_800ExtraBold', '900': 'Onest_800ExtraBold',
};

let enabled = false;
/** _layout shriftlarni yuklagach chaqiradi. */
export function enableAppFont() { enabled = true; }
/** Tab bar yorlig'i kabi kutubxona chizadigan matnlar uchun: og'irlik → shrift uslubi. */
export function fontFor(weight: '500' | '600' | '700' | '800'): { fontFamily?: string; fontWeight: TextStyle['fontWeight'] } {
  return enabled ? { fontFamily: FAMILY[weight], fontWeight: 'normal' } : { fontWeight: weight };
}

/** Ichki <Text> og'irlik bermasa — ota-matnning shriftini meros oladi. */
const InText = createContext(false);

function withFont(style: StyleProp<TextStyle>, nested: boolean): StyleProp<TextStyle> {
  if (!enabled) return style;
  const flat = StyleSheet.flatten(style) ?? {};
  // Boshqa shrift (masalan, MONO) ataylab berilgan bo'lsa — tegmaymiz
  if (flat.fontFamily && !flat.fontFamily.startsWith('Onest')) return style;
  if (nested && flat.fontWeight === undefined) return style;
  const family = FAMILY[String(flat.fontWeight ?? '400')] ?? FAMILY['400'];
  return [style, { fontFamily: family, fontWeight: 'normal' }];
}

export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...rest }, ref) {
  const nested = useContext(InText);
  const el = <RNText ref={ref} style={withFont(style, nested)} {...rest} />;
  return nested ? el : <InText.Provider value>{el}</InText.Provider>;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  return <RNTextInput ref={ref} style={withFont(style, false)} {...rest} />;
});

/** ref turlari: useRef<TextInput>() kabi ishlatish uchun */
export type Text = RNText;
export type TextInput = RNTextInput;
