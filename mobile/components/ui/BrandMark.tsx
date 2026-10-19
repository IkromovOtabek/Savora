import { useState } from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LOGO, LOGO_COLORS, LOGO_RATIO, LOGO_VIEWBOX, WORDMARK } from '@/lib/brand';
import { useTheme } from '@/lib/theme';

let seq = 0;
const nextId = () => `lg${++seq}`;

/**
 * Savora logosi — buklangan lenta "S" va 3 o'sib boruvchi ustun (lib/brand.ts, web bilan bir xil).
 * Kun/Tun — ko'k gradient, Qora — oq (palitra: c.logo).
 */
export function LogoSvg({ height = 40, mono }: { height?: number; mono?: boolean }) {
  const { c } = useTheme();
  const k = (mono ?? c.logo === 'mono') ? LOGO_COLORS.mono : LOGO_COLORS.color;
  const [id] = useState(nextId); // barqaror noyob id — gradientlar nusxalar orasida to'qnashmaydi
  return (
    <Svg width={height * LOGO_RATIO} height={height} viewBox={LOGO_VIEWBOX}>
      <Defs>
        <LinearGradient id={`${id}a`} x1="0" y1="0" x2="0.35" y2="1">
          <Stop offset="0" stopColor={k.a[0]} /><Stop offset="0.55" stopColor={k.a[1]} /><Stop offset="1" stopColor={k.a[2]} />
        </LinearGradient>
        <LinearGradient id={`${id}b`} x1="0.15" y1="0" x2="0.55" y2="1">
          <Stop offset="0" stopColor={k.b[0]} /><Stop offset="0.5" stopColor={k.b[1]} /><Stop offset="1" stopColor={k.b[2]} />
        </LinearGradient>
        <LinearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={k.bars[0]} /><Stop offset="1" stopColor={k.bars[1]} />
        </LinearGradient>
        <RadialGradient id={`${id}s`} cx="92" cy="150" r="58" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={k.shade} stopOpacity={0.7} /><Stop offset="1" stopColor={k.shade} stopOpacity={0} />
        </RadialGradient>
        <ClipPath id={`${id}k`}><Path d={LOGO.a} /></ClipPath>
      </Defs>
      <Path d={LOGO.a} fill={`url(#${id}a)`} />
      <Rect x={5} y={80} width={125} height={77} fill={`url(#${id}s)`} clipPath={`url(#${id}k)`} />
      <Path d={LOGO.b} fill={`url(#${id}b)`} />
      {LOGO.bars.map((d) => <Path key={d} d={d} fill={`url(#${id}r)`} />)}
    </Svg>
  );
}

/** Ilova ikonkasi: plitka (mavzu rangida) ichida logo */
export function BrandMark({ size = 72 }: { size?: number }) {
  const { c, dark } = useTheme();
  return (
    <View
      accessible={false}
      style={{
        width: size, height: size, borderRadius: size * 0.24, backgroundColor: c.logoTile,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: dark ? 1 : 0, borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#1A5FE0', shadowOpacity: dark ? 0 : 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
      }}
    >
      <LogoSvg height={size * 0.74} />
    </View>
  );
}

/** "Savora" nomi — Montserrat Bold konturlari (shrift yuklashga bog'liq emas) */
export function Wordmark({ height = 20, color }: { height?: number; color?: string }) {
  const { c } = useTheme();
  return (
    <Svg
      width={(height * WORDMARK.width) / WORDMARK.height}
      height={height}
      viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
      accessibilityLabel="Savora"
    >
      {WORDMARK.letters.map((l) => <Path key={l.x} d={l.d} fill={color ?? c.ink} />)}
    </Svg>
  );
}
