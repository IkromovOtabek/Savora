import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/Text';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';
import { LOGO, LOGO_ALL, LOGO_COLORS, LOGO_LENGTHS, LOGO_RATIO, LOGO_VIEWBOX, WORDMARK } from '@/lib/brand';

/**
 * Ochilish animatsiyasi — "Chiziq" shabloni, UrbanDrive uslubi (web: components/brand/AnimatedLogo.tsx):
 * xira iz → kontur chiziladi → ichiga to'lqinli "suyuq" rang pastdan quyiladi → "Savora" harflari
 * o'ngdan chapga to'ladi → yaltiroq aks chayqaladi → shior. `ready` bo'lgach splash chapga surilib
 * ilovani ochadi va `onDone` chaqiriladi. Reduce Motion'da — yakuniy holat va qisqa fade.
 * Kadrlar requestAnimationFrame bilan hisoblanadi (SVG clipPath/transform native driver'da yo'q).
 */

const LOGO_H = 132;
const WM_H = 30;
/** Animatsiya shu vaqtda tugaydi (ms) — keyin kadr hisoblash to'xtaydi */
const T_END = 2600;
/** Shundan oldin splash yopilmaydi */
const MIN_MS = 2400;
const CENTER_Y = 0.45;

type Ease = (n: number) => number;
const LIN: Ease = (n) => n;
const IN = Easing.bezier(0.55, 0, 0.25, 1);
const OUT = Easing.bezier(0.6, 0, 0.4, 1);
const SOFT = Easing.bezier(0.45, 0, 0.55, 1);

/** Kalit kadrlar: [vaqt ms, qiymat, shu oraliqqa easing] */
function kf(t: number, frames: [number, number, Ease?][]): number {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1, e = LIN] = frames[i];
    const [t0, v0] = frames[i - 1];
    if (t <= t1) return v0 + (v1 - v0) * e((t - t0) / (t1 - t0 || 1));
  }
  return frames[frames.length - 1][1];
}

const WAVE = (() => {
  let top = '';
  for (let x = -160; x <= 420; x += 10) top += ` L${x},${(7 * Math.sin((2 * Math.PI * x) / 80)).toFixed(2)}`;
  return { fill: `M-160,420${top} L420,420 Z`, crest: `M-160,0${top}` };
})();

function Frame({ t, mono }: { t: number; mono: boolean }) {
  const k = mono ? LOGO_COLORS.mono : LOGO_COLORS.color;
  const ink = '#FFFFFF';
  const ghost = kf(t, [[0, 0], [200, 1]]);
  const olOpacity = kf(t, [[0, 0], [100, 0.9], [900, 0.9], [1400, 0]]);
  const y = kf(t, [[300, 310], [1000, 160, SOFT], [1600, -26, SOFT]]);
  const rot = kf(t, [[300, -10], [1000, 7, SOFT], [1600, -3, SOFT], [2200, 0, OUT]]);
  const phase = -(((t / 1300) * 80) % 80);
  const wave = `translate(0 ${y.toFixed(2)}) rotate(${rot.toFixed(2)} 117 0) translate(${phase.toFixed(2)} 0)`;
  const slosh = { o: kf(t, [[1700, 0], [2050, 1, SOFT], [2500, 0, SOFT]]), y: kf(t, [[1700, -40], [2050, 90, SOFT], [2500, 230, SOFT]]) };
  const shim = kf(t, [[1700, -1300], [2400, WORDMARK.width + 100, SOFT]]);
  const n = WORDMARK.letters.length;

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={LOGO_H * LOGO_RATIO} height={LOGO_H} viewBox={LOGO_VIEWBOX}>
        <Defs>
          <LinearGradient id="sa" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={k.a[0]} /><Stop offset="0.55" stopColor={k.a[1]} /><Stop offset="1" stopColor={k.a[2]} />
          </LinearGradient>
          <LinearGradient id="sb" x1="0.15" y1="0" x2="0.55" y2="1">
            <Stop offset="0" stopColor={k.b[0]} /><Stop offset="0.5" stopColor={k.b[1]} /><Stop offset="1" stopColor={k.b[2]} />
          </LinearGradient>
          <LinearGradient id="sr" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={k.bars[0]} /><Stop offset="1" stopColor={k.bars[1]} />
          </LinearGradient>
          <RadialGradient id="ss" cx="92" cy="150" r="58" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={k.shade} stopOpacity={0.7} /><Stop offset="1" stopColor={k.shade} stopOpacity={0} />
          </RadialGradient>
          <ClipPath id="sk"><Path d={LOGO.a} /></ClipPath>
          <ClipPath id="su">{LOGO_ALL.map((d) => <Path key={d} d={d} />)}</ClipPath>
          <ClipPath id="sw"><Path d={WAVE.fill} transform={wave} /></ClipPath>
        </Defs>
        <G opacity={0.1 * ghost}>{LOGO_ALL.map((d) => <Path key={d} d={d} fill={ink} />)}</G>
        <G clipPath="url(#sw)">
          <Path d={LOGO.a} fill="url(#sa)" />
          <Rect x={5} y={80} width={125} height={77} fill="url(#ss)" clipPath="url(#sk)" />
          <Path d={LOGO.b} fill="url(#sb)" />
          {LOGO.bars.map((d) => <Path key={d} d={d} fill="url(#sr)" />)}
        </G>
        <G clipPath="url(#su)">
          <Path d={WAVE.crest} transform={wave} fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={5} />
          <Path d="M-30,30 Q117,-8 270,30 L270,52 Q117,16 -30,52 Z" fill="#FFFFFF" fillOpacity={0.32 * slosh.o} transform={`translate(0 ${slosh.y.toFixed(1)})`} />
        </G>
        {LOGO_ALL.map((d, i) => {
          const L = LOGO_LENGTHS[i];
          const p = kf(t, [[100 + i * 40, 0], [750 + i * 40, 1, IN]]);
          return (
            <Path key={d} d={d} fill="none" stroke={ink} strokeWidth={1.3} strokeLinejoin="round"
              strokeOpacity={olOpacity} strokeDasharray={`${L} ${L}`} strokeDashoffset={L * (1 - p)} />
          );
        })}
      </Svg>

      <View style={{ height: LOGO_H * 0.1 }} />

      <Svg width={(WM_H * WORDMARK.width) / WORDMARK.height} height={WM_H} viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}>
        <Defs>
          {WORDMARK.letters.map((l, i) => {
            const p = kf(t, [[800 + (n - 1 - i) * 90, 0], [1120 + (n - 1 - i) * 90, 1, OUT]]);
            const left = l.x - 40;
            const w = l.w + 80;
            return <ClipPath key={l.x} id={`sl${i}`}><Rect x={left + w * (1 - p)} y={-20} width={w * p} height={WORDMARK.height + 40} /></ClipPath>;
          })}
          <ClipPath id="sc">{WORDMARK.letters.map((l) => <Path key={l.x} d={l.d} />)}</ClipPath>
          <LinearGradient id="sg" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} /><Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.75} /><Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {WORDMARK.letters.map((l, i) => (
          <G key={l.x}>
            <Path d={l.d} fill={ink} opacity={0.13 * ghost} />
            <G clipPath={`url(#sl${i})`}><Path d={l.d} fill={ink} /></G>
          </G>
        ))}
        <G clipPath="url(#sc)"><Rect x={shim} y={0} width={1100} height={WORDMARK.height} fill="url(#sg)" /></G>
      </Svg>
    </View>
  );
}

export function AnimatedSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { c } = useTheme();
  const d = useDict();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [reduce, setReduce] = useState<boolean | null>(null);
  const [t, setT] = useState(0);
  const [minDone, setMinDone] = useState(false);
  const started = useRef(false);
  const laidOut = useRef(false);
  const exiting = useRef(false);
  const raf = useRef<number | null>(null);
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => setReduce(false));
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current); };
  }, []);

  function start() {
    if (started.current || reduce === null) return;
    started.current = true;
    SplashScreen.hideAsync().catch(() => { /* native splash allaqachon yopilgan */ });

    if (reduce) {
      setT(T_END);
      setMinDone(true);
      return;
    }
    const t0 = Date.now();
    const tick = () => {
      const e = Date.now() - t0;
      setT(Math.min(e, T_END));
      if (e < T_END) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    setTimeout(() => setMinDone(true), MIN_MS);
  }

  // reduce aniqlanishidan oldin layout bo'lgan bo'lsa — keyin boshlaymiz
  useEffect(() => { if (reduce !== null && laidOut.current) start(); });

  useEffect(() => {
    if (!ready || !minDone || exiting.current) return;
    exiting.current = true;
    // UrbanDrive'dagidek: splash chapga surilib ilova ochiladi (Reduce Motion — oddiy fade)
    Animated.timing(exit, {
      toValue: 1, duration: reduce ? 250 : 460, delay: reduce ? 0 : 80,
      easing: reduce ? Easing.linear : Easing.bezier(0.7, 0, 0.25, 1), useNativeDriver: true,
    }).start(() => onDone());
  }, [ready, minDone, reduce, exit, onDone]);

  const tagline = kf(t, [[1500, 0], [1900, 1, OUT]]);
  const loading = kf(t, [[2100, 0], [2500, 1]]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={() => { laidOut.current = true; start(); }}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: c.splash,
          zIndex: 100,
          opacity: reduce ? exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 1,
          transform: [{ translateX: reduce ? 0 : exit.interpolate({ inputRange: [0, 1], outputRange: [0, -width] }) }],
        },
      ]}
    >
      <View style={[s.center, { top: height * CENTER_Y - LOGO_H * 0.62 }]}>
        <Frame t={t} mono={c.logo === 'mono'} />
        <Text style={[s.tagline, { opacity: tagline * 0.78, transform: [{ translateY: (1 - tagline) * 8 }] }]}>
          {d.splash.tagline}
        </Text>
      </View>

      <View style={[s.loadWrap, { bottom: insets.bottom + 56, opacity: loading }]}>
        <Text style={s.loadText}>{d.splash.loading}</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  tagline: { color: '#FFFFFF', fontSize: 14, fontWeight: '500', letterSpacing: 2.4, marginTop: 14 },
  loadWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  loadText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
});
