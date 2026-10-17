import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';

/**
 * Ochilish animatsiyasi — native splash (app.json: expo-splash-screen) ustidan davom etadi.
 * Birinchi kadr native splash bilan bir xil: fon rangi va belgi geometriyasi (assets/make-icons.py,
 * splash-icon 200px qutida 15–85% → 140px). Keyin ustunlar qayta o'sadi, oltin chiziq chiziladi,
 * "Savora" harflari chiqadi. Animatsiya tugab, `ready` bo'lgach overlay so'nadi va `onDone` chaqiriladi.
 */

const MARK = 140;
const K = MARK / 100;
const BARS = [
  { x: 20, y: 58, h: 24, a: 0.55 },
  { x: 40, y: 45, h: 37, a: 0.8 },
  { x: 60, y: 32, h: 50, a: 1 },
];
const GOLD = '#F0BF4C';
const CURVE = 'M24 46 C38 28 58 20 79 21';
const CURVE_LEN = 64;
const WORD = 'Savora';
/** Animatsiyaning eng qisqa davomiyligi (ms) — shundan oldin overlay yopilmaydi. */
const MIN_MS = 1900;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

export function AnimatedSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const { dark } = useTheme();
  const d = useDict();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const bg = dark ? '#05080F' : '#1F4FA8';

  const [reduce, setReduce] = useState<boolean | null>(null);
  const [minDone, setMinDone] = useState(false);
  const started = useRef(false);
  const laidOut = useRef(false);
  const exiting = useRef(false);

  const bars = useRef(BARS.map(() => new Animated.Value(1))).current;
  const curve = useRef(new Animated.Value(0)).current; // strokeDashoffset (JS driver — SVG prop)
  const dot = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const pattern = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const letters = useRef(WORD.split('').map(() => new Animated.Value(0))).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => setReduce(false));
  }, []);

  function start() {
    if (started.current || reduce === null) return;
    started.current = true;
    SplashScreen.hideAsync().catch(() => { /* native splash allaqachon yopilgan */ });

    if (reduce) {
      setMinDone(true);
      return;
    }

    const t = (v: Animated.Value, toValue: number, duration: number, delay = 0, easing = ease) =>
      Animated.timing(v, { toValue, duration, delay, easing, useNativeDriver: true });
    const spring = (v: Animated.Value, delay: number) =>
      Animated.spring(v, { toValue: 1, delay, damping: 9, stiffness: 140, mass: 0.7, useNativeDriver: true });

    // 1) Belgi "yig'iladi": ustunlar pastga, chiziq va nuqta yashirinadi
    Animated.parallel([
      ...bars.map((b) => t(b, 0.12, 180, 80, Easing.in(Easing.quad))),
      t(dot, 0, 160, 80),
    ]).start();
    Animated.timing(curve, { toValue: CURVE_LEN, duration: 180, delay: 80, useNativeDriver: false }).start();

    // 2) Ustunlar prujina bilan ketma-ket o'sadi, keyin oltin chiziq chiziladi va nuqta chiqadi
    bars.forEach((b, i) => spring(b, 280 + i * 110).start());
    Animated.timing(curve, { toValue: 0, duration: 460, delay: 640, easing: Easing.bezier(0.65, 0, 0.35, 1), useNativeDriver: false }).start();
    spring(dot, 1020).start();

    // 3) Fon naqshi, halqa, belgi yuqoriga, harflar, shior va progress
    t(pattern, 1, 1200, 700).start();
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 60000, easing: Easing.linear, useNativeDriver: true })).start();
    t(ring, 1, 1300, 950, Easing.out(Easing.quad)).start();
    t(lift, 1, 520, 1100).start();
    letters.forEach((l, i) => t(l, 1, 520, 1180 + i * 55).start());
    t(tagline, 1, 460, 1600).start();
    t(progress, 0.85, 900, 1700).start();

    setTimeout(() => setMinDone(true), MIN_MS);
  }

  // reduce aniqlanishidan oldin layout bo'lgan bo'lsa — keyin boshlaymiz
  useEffect(() => { if (reduce !== null && laidOut.current) start(); });

  useEffect(() => {
    if (!ready || !minDone || exiting.current) return;
    exiting.current = true;
    Animated.parallel([
      Animated.timing(progress, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(exit, { toValue: 1, duration: reduce ? 250 : 380, delay: reduce ? 0 : 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => onDone());
  }, [ready, minDone, reduce, exit, progress, onDone]);

  const markTop = height / 2 - MARK / 2;
  const liftY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -64] });

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={() => { laidOut.current = true; start(); }}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: bg,
          zIndex: 100,
          opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [{ scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
        },
      ]}
    >
      {/* Girih naqshi — ikki aylantirilgan kvadrat va doiralar */}
      <Animated.View
        style={[
          s.pattern,
          {
            top: height / 2 - 310,
            opacity: pattern.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }),
            transform: [
              { scale: pattern.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
              { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
            ],
          },
        ]}
      >
        <Svg width={620} height={620} viewBox="0 0 200 200">
          <G fill="none" stroke="#FFFFFF" strokeWidth={1}>
            <Rect x={40} y={40} width={120} height={120} />
            <Rect x={40} y={40} width={120} height={120} transform="rotate(45 100 100)" />
            <Rect x={62} y={62} width={76} height={76} />
            <Rect x={62} y={62} width={76} height={76} transform="rotate(45 100 100)" />
            <Circle cx={100} cy={100} r={26} />
            <Circle cx={100} cy={100} r={92} />
          </G>
        </Svg>
      </Animated.View>

      <Animated.View style={[s.markBox, { top: markTop, transform: [{ translateY: liftY }] }]}>
        <Animated.View
          style={[
            s.ring,
            {
              opacity: ring.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.5, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.2] }) }],
            },
          ]}
        />
        {BARS.map((b, i) => (
          <Animated.View
            key={b.x}
            style={{
              position: 'absolute', left: b.x * K, top: b.y * K, width: 13 * K, height: b.h * K,
              borderRadius: 6.5 * K, backgroundColor: '#FFFFFF', opacity: b.a,
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
            position: 'absolute', left: (79 - 6.5) * K, top: (21 - 6.5) * K, width: 13 * K, height: 13 * K,
            borderRadius: 6.5 * K, backgroundColor: GOLD, transform: [{ scale: dot }],
          }}
        />
      </Animated.View>

      <View style={[s.wordWrap, { top: markTop + MARK - 30 }]}>
        <View style={s.word}>
          {WORD.split('').map((ch, i) => (
            <Animated.Text
              key={i}
              style={[
                s.letter,
                {
                  opacity: letters[i],
                  transform: [
                    { translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
                    { rotate: letters[i].interpolate({ inputRange: [0, 1], outputRange: ['6deg', '0deg'] }) },
                  ],
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
            { opacity: tagline.interpolate({ inputRange: [0, 1], outputRange: [0, 0.82] }), transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
          ]}
        >
          {d.splash.tagline}
        </Animated.Text>
      </View>

      <Animated.View style={[s.loadWrap, { bottom: insets.bottom + 72, opacity: tagline }]}>
        <View style={s.track}>
          <Animated.View style={[s.fill, { transformOrigin: 'left', transform: [{ scaleX: progress }] }]} />
        </View>
        <Text style={s.loadText}>{d.splash.loading}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  pattern: { position: 'absolute', left: '50%', marginLeft: -310, width: 620, height: 620 },
  markBox: { position: 'absolute', left: '50%', marginLeft: -MARK / 2, width: MARK, height: MARK },
  ring: { position: 'absolute', left: 10, top: 10, width: MARK - 20, height: MARK - 20, borderRadius: (MARK - 20) / 2, borderWidth: 2, borderColor: GOLD },
  wordWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 10 },
  word: { flexDirection: 'row', overflow: 'hidden', paddingVertical: 4 },
  letter: { color: '#FFFFFF', fontSize: 42, fontWeight: '800', letterSpacing: -0.8 },
  tagline: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  loadWrap: { position: 'absolute', left: 64, right: 64, alignItems: 'center', gap: 12 },
  track: { alignSelf: 'stretch', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: GOLD },
  loadText: { color: 'rgba(255,255,255,0.72)', fontSize: 13 },
});
