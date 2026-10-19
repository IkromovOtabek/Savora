import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/Text';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';

/**
 * Ochilish animatsiyasi «Oltin nuqta» — native splash (app.json: qorong'i fon, shaffof rasm) ustidan davom etadi.
 * Oltin nuqta tepadan tushib sakraydi → undan doira ochilib brend rangini ochadi → belgi chiqadi,
 * ustunlar o'sadi, oltin chiziq chiziladi → "Savora" harflari tushadi, shior. Animatsiya tugab,
 * `ready` bo'lgach overlay so'nadi va `onDone` chaqiriladi. Reduce Motion'da faqat qisqa fade.
 */

const MARK = 104;
const U = MARK / 100;
const BARS = [
  { x: 20, y: 58, h: 24, a: 0.55 },
  { x: 40, y: 45, h: 37, a: 0.8 },
  { x: 60, y: 32, h: 50, a: 1 },
];
const GOLD = '#F0BF4C';
const DOT = 26;
const CURVE = 'M24 46 C38 28 58 20 79 21';
const CURVE_LEN = 64;
const WORD = 'Savora';
/** Animatsiyaning eng qisqa davomiyligi (ms) — shundan oldin overlay yopilmaydi. */
const MIN_MS = 2600;
/** Belgi markazi ekran balandligining shu qismida. */
const CENTER_Y = 0.45;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

export function AnimatedSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { dark } = useTheme();
  const d = useDict();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Native splash bilan bir xil boshlang'ich fon (app.json → expo-splash-screen)
  const deep = dark ? '#05080F' : '#0B1A3D';
  const reveal = dark ? '#13214A' : '#1F4FA8';
  const markBg = dark ? '#2F6BE0' : '#FFFFFF';
  const markInk = dark ? '#FFFFFF' : '#1F4FA8';

  const [reduce, setReduce] = useState<boolean | null>(null);
  const [minDone, setMinDone] = useState(false);
  const started = useRef(false);
  const laidOut = useRef(false);
  const exiting = useRef(false);

  const fallY = useRef(new Animated.Value(-480)).current;
  const sqX = useRef(new Animated.Value(1)).current;
  const sqY = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const iris = useRef(new Animated.Value(0)).current;
  const waves = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const mark = useRef(new Animated.Value(0)).current;
  const bars = useRef(BARS.map(() => new Animated.Value(0))).current;
  const curve = useRef(new Animated.Value(CURVE_LEN)).current; // strokeDashoffset (JS driver — SVG prop)
  const goldDot = useRef(new Animated.Value(0)).current;
  const letters = useRef(WORD.split('').map(() => new Animated.Value(0))).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const loading = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => setReduce(false));
  }, []);

  function start() {
    if (started.current || reduce === null) return;
    started.current = true;
    SplashScreen.hideAsync().catch(() => { /* native splash allaqachon yopilgan */ });

    if (reduce) {
      // Harakatsiz: yakuniy holat darhol, faqat chiqishda qisqa fade
      [iris, mark, ...bars, goldDot, ...letters, tagline, loading].forEach((v) => v.setValue(1));
      fallY.setValue(0);
      burst.setValue(1);
      curve.setValue(0);
      setMinDone(true);
      return;
    }

    const t = (v: Animated.Value, toValue: number, duration: number, delay = 0, easing: (n: number) => number = ease) =>
      Animated.timing(v, { toValue, duration, delay, easing, useNativeDriver: true });
    const spring = (v: Animated.Value, delay: number, damping = 9) =>
      Animated.spring(v, { toValue: 1, delay, damping, stiffness: 150, mass: 0.7, useNativeDriver: true });
    const step = (y: number, sx: number, sy: number, ms: number, easing: (n: number) => number) =>
      Animated.parallel([t(fallY, y, ms, 0, easing), t(sqX, sx, ms, 0, easing), t(sqY, sy, ms, 0, easing)]);

    // 1) Oltin nuqta tushadi va "ezilib" sakraydi
    Animated.sequence([
      t(fallY, 0, 470, 0, Easing.in(Easing.quad)),
      step(0, 1.45, 0.6, 60, Easing.out(Easing.quad)),
      step(-60, 0.9, 1.12, 120, Easing.out(Easing.quad)),
      step(0, 1.15, 0.88, 110, Easing.in(Easing.quad)),
      step(-10, 1, 1, 60, Easing.out(Easing.quad)),
      step(0, 1, 1, 50, Easing.in(Easing.quad)),
    ]).start();

    // 2) Nuqtadan doira ochiladi, oltin to'lqinlar tarqaladi
    t(burst, 1, 360, 900, Easing.bezier(0.6, 0, 0.8, 0.2)).start();
    t(iris, 1, 800, 900, Easing.bezier(0.7, 0, 0.2, 1)).start();
    waves.forEach((w, i) => t(w, 1, 1100, 900 + i * 150, Easing.out(Easing.quad)).start());

    // 3) Belgi: kvadrat, ustunlar, oltin chiziq va nuqta
    spring(mark, 1350).start();
    bars.forEach((b, i) => spring(b, 1600 + i * 80, 10).start());
    Animated.timing(curve, { toValue: 0, duration: 400, delay: 1850, easing: Easing.bezier(0.65, 0, 0.35, 1), useNativeDriver: false }).start();
    spring(goldDot, 2150).start();

    // 4) Harflar tepadan tushadi, shior va yuklanish qatori
    letters.forEach((l, i) => spring(l, 1750 + i * 60, 11).start());
    t(tagline, 1, 460, 2250).start();
    t(loading, 1, 400, 2500).start();

    setTimeout(() => setMinDone(true), MIN_MS);
  }

  // reduce aniqlanishidan oldin layout bo'lgan bo'lsa — keyin boshlaymiz
  useEffect(() => { if (reduce !== null && laidOut.current) start(); });

  useEffect(() => {
    if (!ready || !minDone || exiting.current) return;
    exiting.current = true;
    Animated.timing(exit, {
      toValue: 1, duration: reduce ? 250 : 380, delay: reduce ? 0 : 120, easing: Easing.in(Easing.quad), useNativeDriver: true,
    }).start(() => onDone());
  }, [ready, minDone, reduce, exit, onDone]);

  const cy = height * CENTER_Y;
  // Doira markazdan eng uzoq burchakkacha yetishi kerak
  const R = Math.ceil(Math.hypot(width / 2, height - cy)) + 4;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={() => { laidOut.current = true; start(); }}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: deep,
          zIndex: 100,
          opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
        },
      ]}
    >
      {/* Iris: brend rangidagi doira nuqtadan ochiladi */}
      <Animated.View
        style={{
          position: 'absolute', left: width / 2 - R, top: cy - R, width: R * 2, height: R * 2, borderRadius: R,
          backgroundColor: reveal, transform: [{ scale: iris }],
        }}
      />

      {waves.map((w, i) => (
        <Animated.View
          key={i}
          style={[
            s.wave,
            {
              top: cy - 80,
              opacity: w.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.5, 0] }),
              transform: [{ scale: w.interpolate({ inputRange: [0, 1], outputRange: [0.2, 3.2] }) }],
            },
          ]}
        />
      ))}

      {/* Tushayotgan oltin nuqta */}
      <Animated.View
        style={[
          s.dropWrap,
          {
            top: cy - DOT / 2,
            opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 3] }) }],
          },
        ]}
      >
        <Animated.View
          style={[
            s.drop,
            { transformOrigin: 'bottom', transform: [{ translateY: fallY }, { scaleX: sqX }, { scaleY: sqY }] },
          ]}
        />
      </Animated.View>

      <View style={[s.center, { top: cy - MARK / 2 }]}>
        <Animated.View
          style={[
            s.mark,
            {
              backgroundColor: markBg,
              opacity: mark.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
              transform: [{ scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
            },
          ]}
        >
          {BARS.map((b, i) => (
            <Animated.View
              key={b.x}
              style={{
                position: 'absolute', left: b.x * U, top: b.y * U, width: 13 * U, height: b.h * U,
                borderRadius: 6.5 * U, backgroundColor: markInk, opacity: b.a,
                transformOrigin: 'bottom', transform: [{ scaleY: bars[i] }],
              }}
            />
          ))}
          <Svg width={MARK} height={MARK} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <AnimatedPath
              d={CURVE}
              stroke={GOLD}
              strokeWidth={6.5}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${CURVE_LEN} ${CURVE_LEN}`}
              strokeDashoffset={curve}
            />
          </Svg>
          <Animated.View
            style={{
              position: 'absolute', left: (79 - 6.5) * U, top: (21 - 6.5) * U, width: 13 * U, height: 13 * U,
              borderRadius: 6.5 * U, backgroundColor: GOLD, transform: [{ scale: goldDot }],
            }}
          />
        </Animated.View>

        <View style={s.word}>
          {WORD.split('').map((ch, i) => (
            <Animated.Text
              key={i}
              style={[
                s.letter,
                {
                  opacity: letters[i].interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
                  transform: [{ translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }],
                },
              ]}
            >
              {ch}
            </Animated.Text>
          ))}
        </View>
        <Animated.Text
          style={[
            s.tagline,
            {
              opacity: tagline.interpolate({ inputRange: [0, 1], outputRange: [0, 0.82] }),
              transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}
        >
          {d.splash.tagline}
        </Animated.Text>
      </View>

      <Animated.View style={[s.loadWrap, { bottom: insets.bottom + 56, opacity: loading }]}>
        <Text style={s.loadText}>{d.splash.loading}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wave: { position: 'absolute', left: '50%', marginLeft: -80, width: 160, height: 160, borderRadius: 80, borderWidth: 2, borderColor: GOLD },
  dropWrap: { position: 'absolute', left: '50%', marginLeft: -DOT / 2, width: DOT, height: DOT },
  drop: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: GOLD },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  mark: { width: MARK, height: MARK, borderRadius: 30, overflow: 'hidden' },
  word: { flexDirection: 'row', marginTop: 24 },
  letter: { color: '#FFFFFF', fontSize: 42, fontWeight: '800', letterSpacing: -0.8 },
  tagline: { color: '#FFFFFF', fontSize: 16, fontWeight: '500', marginTop: 6 },
  loadWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  loadText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
});
