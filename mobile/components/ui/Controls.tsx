import React, { forwardRef } from 'react';
import {
  View, Pressable, Switch as RNSwitch, StyleSheet, Platform, type TextInputProps, type StyleProp, type ViewStyle,
} from 'react-native';
import { Text, TextInput } from './Text';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, HAIRLINE, tabular } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';

/* ───────── Segmented control ───────── */

interface SegOption<K extends string> { key: K; label: string }

export function SegmentedControl<K extends string>({ options, value, onChange, style }: {
  options: SegOption<K>[]; value: K; onChange: (k: K) => void; style?: StyleProp<ViewStyle>;
}) {
  const { c, dark } = useTheme();
  return (
    <View style={[s.seg, { backgroundColor: c.fill }, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[
              s.segBtn,
              on && [{ backgroundColor: dark ? c.fill3 : c.cell }, !dark && s.segShadow],
            ]}
          >
            <Text
              style={[s.segT, { color: c.ink, fontWeight: on ? '600' : '500' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ───────── Switch ───────── */

export function Switch({ value, onValueChange, disabled }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: c.fill, true: '#34C759' }}
      ios_backgroundColor={c.fill}
      thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
    />
  );
}

/* ───────── Search field ───────── */

export function SearchField({ value, onChangeText, placeholder: placeholderProp, right, autoFocus }: {
  value: string; onChangeText: (v: string) => void; placeholder?: string; right?: React.ReactNode; autoFocus?: boolean;
}) {
  const { c } = useTheme();
  const d = useDict();
  const placeholder = placeholderProp ?? d.common.search;
  return (
    <View style={[s.search, { backgroundColor: c.fill }]}>
      <Ionicons name="search" size={17} color={c.ink3} />
      <TextInput
        style={[s.searchInput, { color: c.ink }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.ink3}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        autoFocus={autoFocus}
        accessibilityLabel={placeholder}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel={d.common.clear}>
          <Ionicons name="close-circle" size={18} color={c.ink3} />
        </Pressable>
      ) : null}
      {right}
    </View>
  );
}

/* ───────── Matn maydoni ───────── */

interface FieldProps extends TextInputProps {
  label?: string;
  prefix?: string;
  suffix?: string;
  error?: string | null;
  hint?: string;
  right?: React.ReactNode;
}

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, prefix, suffix, error, hint, right, style, ...rest }, ref,
) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={[s.label, { color: c.ink3 }]}>{label}</Text> : null}
      <View style={[s.inputWrap, { backgroundColor: c.fill2, borderColor: error ? c.bad : 'transparent' }]}>
        {prefix ? <Text style={[s.affix, tabular, { color: c.ink2 }]}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          style={[s.input, { color: c.ink }, rest.keyboardType === 'numeric' || rest.keyboardType === 'phone-pad' ? tabular : null, style]}
          placeholderTextColor={c.ink3}
          autoCorrect={false}
          accessibilityLabel={label}
          {...rest}
        />
        {suffix ? <Text style={[s.affix, { color: c.ink3 }]}>{suffix}</Text> : null}
        {right}
      </View>
      {error ? <Text style={[s.help, { color: c.bad }]}>{error}</Text> : hint ? <Text style={[s.help, { color: c.ink3 }]}>{hint}</Text> : null}
    </View>
  );
});

/* ───────── Stepper (miqdor) ───────── */

export function Stepper({ value, onChange, min = 1, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const { c } = useTheme();
  const d = useDict();
  const canDec = value > min;
  const canInc = max === undefined || value < max;
  return (
    <View style={[s.stepper, { backgroundColor: c.fill }]}>
      <Pressable
        onPress={() => canDec && onChange(value - 1)}
        disabled={!canDec}
        accessibilityLabel={d.common.decrease}
        style={({ pressed }) => [s.stepBtn, (!canDec || pressed) && { opacity: canDec ? 0.5 : 0.3 }]}
      >
        <Ionicons name="remove" size={20} color={c.ink} />
      </Pressable>
      <Text style={[s.stepVal, tabular, { color: c.ink, borderColor: c.sep }]} accessibilityLabel={tr(d.common.qtyA11y, { n: value })}>{value}</Text>
      <Pressable
        onPress={() => canInc && onChange(value + 1)}
        disabled={!canInc}
        accessibilityLabel={d.common.increase}
        style={({ pressed }) => [s.stepBtn, (!canInc || pressed) && { opacity: canInc ? 0.5 : 0.3 }]}
      >
        <Ionicons name="add" size={20} color={c.ink} />
      </Pressable>
    </View>
  );
}

/* ───────── Tanlov chiplari (oylar va h.k.) ───────── */

export function Chips<K extends string | number>({ options, value, onChange }: {
  options: { key: K; label: string }[]; value: K | null; onChange: (k: K) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={String(o.key)}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [s.chip, { backgroundColor: on ? c.tintFill : c.fill }, pressed && { opacity: 0.5 }]}
          >
            <Text style={[s.chipT, tabular, { color: on ? c.onTint : c.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  seg: { flexDirection: 'row', padding: 4, borderRadius: 14 },
  segBtn: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segShadow: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segT: { fontSize: 14 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 14, minHeight: 50 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 14, minHeight: 54, borderWidth: 1.5, gap: 8 },
  input: { flex: 1, fontSize: 17, fontWeight: '500', paddingVertical: 12 },
  affix: { fontSize: 17, fontWeight: '600' },
  help: { fontSize: 13, fontWeight: '500' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, overflow: 'hidden' },
  stepBtn: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepVal: { minWidth: 40, textAlign: 'center', fontSize: 15, fontWeight: '600', lineHeight: 36, borderLeftWidth: HAIRLINE, borderRightWidth: HAIRLINE },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, minWidth: 52, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chipT: { fontSize: 14, fontWeight: '600' },
});
