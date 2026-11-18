import { useState } from 'react';
import { View, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { API_URL, errMsg } from '@/lib/api';
import { useAuth, type OnboardingAnswers } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { useTheme, useStyles, type Palette } from '@/lib/theme';
import { useI18n, tr } from '@/lib/i18n';
import { uzPhone9, uzPhoneE164 } from '@/lib/phone';
import { Screen, Group, Field, PhoneField, Button, Switch, IconSquare, BrandMark, SegmentedControl, Chips, type IconName } from '@/components/ui';

interface BType { key: string; label: string; description: string }
type Answer = string | number | boolean;
/** Ro'yxatdan o'tish ustasi savoli — server matnlari joriy tilda (web lib/onboardingQuestions.ts → questionViews) */
interface QView {
  key: string;
  kind: 'yesno' | 'choice' | 'number';
  label: string;
  hint: string | null;
  default: Answer;
  options: { value: string; label: string }[] | null;
  min: number | null;
  max: number | null;
  suffix: string | null;
  showIf: { q: string; is: Answer[] } | null;
}

const LOGIN_RE = /^[a-z0-9_]{3,40}$/;
const STEPS = 4;

/** Yo'nalish ikonkasi va rangi (palitra kalitlari) — noma'lum tur umumiy savdo ko'rinishida. */
const BIZ_ICON: Record<string, { icon: IconName; sq: keyof Palette['sq'] }> = {
  general: { icon: 'storefront', sq: 'b' },
  phone_shop: { icon: 'phone-portrait', sq: 'b' },
  electronics: { icon: 'tv', sq: 'g' },
  furniture: { icon: 'bed', sq: 'a' },
  clothing: { icon: 'shirt', sq: 'r' },
  grocery: { icon: 'basket', sq: 'o' },
  building: { icon: 'hammer', sq: 'a' },
  cosmetics: { icon: 'sparkles', sq: 'r' },
  pharmacy: { icon: 'medkit', sq: 'o' },
  auto_parts: { icon: 'car-sport', sq: 'g' },
  wholesale: { icon: 'layers', sq: 'b' },
  restaurant: { icon: 'restaurant', sq: 'a' },
  service: { icon: 'construct', sq: 'g' },
  manufacturing: { icon: 'business', sq: 'o' },
};

/**
 * Ilova ichida do'kon ochish — BILLZ kabi qadamma-qadam: 1) do'kon va telefon, 2) yo'nalish,
 * 3) bir nechta savol (ro'yxatdan o'tish ustasi — javobga qarab do'kon sozlanadi), 4) login.
 * Faqat bepul tarif (App Store qoidasi). Muvaffaqiyatda darhol kiradi.
 */
export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const { c } = useTheme();
  const st = useStyles(styles);
  const { d, locale } = useI18n();
  const k = d.signup;
  const types = useResource<{ types: BType[]; questions?: Record<string, QView[]> }>(`/api/mobile/auth/register?lang=${locale}`);

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [biz, setBiz] = useState('general');
  // Ustaning javoblari (tur almashsa — tozalanadi, standart javoblar qo'llanadi); son maydonlari matn holida
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [numText, setNumText] = useState<Record<string, string>>({});
  const [sample, setSample] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);

  const questions = types.data?.questions?.[biz] ?? [];
  const current: OnboardingAnswers = Object.fromEntries(questions.map((q) => [q.key, answers[q.key] ?? q.default]));
  const visible = questions.filter((q) => !q.showIf || q.showIf.is.includes(current[q.showIf.q]));
  const numErr = (q: QView): string | null => {
    if (q.kind !== 'number') return null;
    const raw = numText[q.key];
    if (raw === undefined) return null;
    const v = Number(raw.replace(/\s/g, '').replace(',', '.'));
    const min = q.min ?? 0;
    const max = q.max ?? Number.MAX_SAFE_INTEGER;
    return raw.trim() && Number.isFinite(v) && v >= min && v <= max ? null : tr(k.errNumber, { min, max });
  };
  const setAnswer = (key: string, v: Answer) => setAnswers((a) => ({ ...a, [key]: v }));
  function chooseBiz(key: string) {
    if (key === biz) return;
    setBiz(key);
    setAnswers({});
    setNumText({});
  }

  const errs = {
    name: name.trim().length < 2 ? k.errName : null,
    phone: !uzPhone9(phone) ? k.errPhone : null,
    username: !LOGIN_RE.test(username) ? k.errLogin : null,
    password: password.length < 6 ? k.errPass : null,
    confirm: confirm !== password ? k.errMatch : null,
  };
  const show = (n: number, e: string | null) => (tried[n] ? e : null);
  const stepOk = (n: number) =>
    n === 1 ? !errs.name && !errs.phone
      : n === 3 ? visible.every((q) => !numErr(q))
        : n === 4 ? !errs.username && !errs.password && !errs.confirm
          : true;

  async function next() {
    setTried((t) => ({ ...t, [step]: true }));
    if (!stepOk(step)) return;
    if (step < STEPS) { setStep(step + 1); return; }
    if (!agree) { Alert.alert(k.failTitle, k.errAgree); return; }
    setBusy(true);
    try {
      await register({
        name: name.trim(), phone: uzPhoneE164(phone), businessType: biz, username, password, acceptTerms: true,
        // Faqat ko'rinadigan savollar javobi; qolganini server standart javob bilan to'ldiradi
        onboarding: { answers: Object.fromEntries(visible.map((q) => [q.key, current[q.key]])), sampleData: sample },
      });
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert(k.failTitle, errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function back() {
    if (step > 1) setStep(step - 1);
    else if (router.canGoBack()) router.back();
    else router.replace('/login');
  }

  const titles = [
    { t: k.step1Title, s: k.step1Sub },
    { t: k.step2Title, s: k.bizFooter },
    { t: k.qTitle, s: k.qSub },
    { t: k.credsSection, s: k.step3Sub },
  ][step - 1];

  const header = (
    <View style={st.head}>
      <View style={st.brand}>
        <BrandMark size={34} />
        <Text style={st.brandT}>Savora</Text>
      </View>
      <View style={st.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS, now: step }}>
        {Array.from({ length: STEPS }, (_, i) => (
          <View key={i} style={[st.seg, { backgroundColor: i < step ? c.tintFill : c.fill }]} />
        ))}
      </View>
      <Text style={st.stepOf}>{tr(k.stepOf, { n: step, total: STEPS })}</Text>
      <Text style={st.title} accessibilityRole="header">{titles.t}</Text>
      <Text style={st.sub}>{titles.s}</Text>
    </View>
  );

  const footer = (
    <View style={{ gap: 10 }}>
      <View style={st.btnRow}>
        <Button title={d.common.back} variant="gray" size="lg" capsule onPress={back} style={{ flex: 1 }} />
        <Button title={step === STEPS ? k.submit : k.next} size="lg" loading={busy} onPress={next} style={{ flex: 1.4 }} />
      </View>
      {step === 1 ? (
        <Pressable onPress={() => router.replace('/login')} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 2 }}>
          <Text style={{ color: c.tint, fontSize: 15, fontWeight: '700' }}>{k.haveAccount}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <Screen keyboard footer={footer} gap={16}>
      {header}

      {step === 1 ? (
        <Group>
          <View style={{ padding: 16, gap: 14 }}>
            <Field label={k.storeName} value={name} onChangeText={setName} placeholder={k.storeNamePh} maxLength={60} error={show(1, errs.name)} />
            <PhoneField
              label={k.phone}
              value={phone}
              onChangeText={setPhone}
              textContentType="telephoneNumber"
              autoComplete="tel"
              error={show(1, errs.phone)}
            />
          </View>
        </Group>
      ) : null}

      {step === 2 ? (
        !types.data ? (
          <View style={{ padding: 24 }}><ActivityIndicator color={c.tint} /></View>
        ) : (
          <View style={st.grid}>
            {types.data.types.map((t) => {
              const on = biz === t.key;
              const ic = BIZ_ICON[t.key] ?? BIZ_ICON.general;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => chooseBiz(t.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${t.label}. ${t.description}`}
                  style={({ pressed }) => [st.tile, on && st.tileOn, pressed && { opacity: 0.7 }]}
                >
                  <View style={st.tileTop}>
                    <IconSquare icon={ic.icon} color={c.sq[ic.sq]} size={48} />
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? c.tint : c.ink3} />
                  </View>
                  <Text style={st.tileT} numberOfLines={2}>{t.label}</Text>
                  <Text style={st.tileD} numberOfLines={2}>{t.description}</Text>
                </Pressable>
              );
            })}
          </View>
        )
      ) : null}

      {step === 3 ? (
        <>
          {visible.map((q) => (
            <Group key={q.key} footer={q.hint ?? undefined}>
              <View style={{ padding: 16, gap: 12 }}>
                <Text style={st.qLabel}>{q.label}</Text>
                {q.kind === 'yesno' ? (
                  <SegmentedControl
                    options={[{ key: 'yes', label: k.yes }, { key: 'no', label: k.no }]}
                    value={current[q.key] === true ? 'yes' : 'no'}
                    onChange={(v) => setAnswer(q.key, v === 'yes')}
                  />
                ) : q.kind === 'choice' && q.options ? (
                  q.options.length > 3 ? (
                    <Chips options={q.options.map((o) => ({ key: o.value, label: o.label }))} value={String(current[q.key])} onChange={(v) => setAnswer(q.key, v)} />
                  ) : (
                    <SegmentedControl options={q.options.map((o) => ({ key: o.value, label: o.label }))} value={String(current[q.key])} onChange={(v) => setAnswer(q.key, v)} />
                  )
                ) : (
                  <Field
                    value={numText[q.key] ?? String(current[q.key])}
                    onChangeText={(v) => {
                      setNumText((m) => ({ ...m, [q.key]: v }));
                      const n = Number(v.replace(/\s/g, '').replace(',', '.'));
                      if (v.trim() && Number.isFinite(n)) setAnswer(q.key, n);
                    }}
                    keyboardType="numeric"
                    suffix={q.suffix ?? undefined}
                    maxLength={9}
                    accessibilityLabel={q.label}
                    error={show(3, numErr(q))}
                  />
                )}
              </View>
            </Group>
          ))}
          <View style={st.agree}>
            <Switch value={sample} onValueChange={setSample} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.ink }}>{k.sample}</Text>
              <Text style={{ fontSize: 13.5, color: c.ink3, lineHeight: 18 }}>{k.sampleHint}</Text>
            </View>
          </View>
          <Text style={st.note}>{k.planNote}</Text>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <Group>
            <View style={{ padding: 16, gap: 14 }}>
              <Field
                label={k.login}
                value={username}
                onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder={k.loginPh}
                hint={k.loginHint}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username-new"
                textContentType="username"
                maxLength={40}
                error={show(4, errs.username)}
              />
              <Field label={k.password} value={password} onChangeText={setPassword} placeholder={k.passwordPh} secureTextEntry textContentType="newPassword" autoComplete="password-new" error={show(4, errs.password)} />
              <Field label={k.confirm} value={confirm} onChangeText={setConfirm} secureTextEntry textContentType="newPassword" error={show(4, errs.confirm)} />
            </View>
          </Group>

          <View style={st.agree}>
            <Switch value={agree} onValueChange={setAgree} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.ink }}>{k.agree}</Text>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                <Pressable onPress={() => Linking.openURL(`${API_URL}/terms`)} hitSlop={6}><Text style={{ color: c.tint, fontSize: 14, fontWeight: '600' }}>{k.offer}</Text></Pressable>
                <Pressable onPress={() => Linking.openURL(`${API_URL}/privacy`)} hitSlop={6}><Text style={{ color: c.tint, fontSize: 14, fontWeight: '600' }}>{k.privacy}</Text></Pressable>
              </View>
            </View>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = (c: Palette) => StyleSheet.create({
  head: { alignItems: 'center', gap: 8, paddingTop: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  brandT: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: c.ink },
  progress: { flexDirection: 'row', gap: 6, alignSelf: 'stretch', paddingHorizontal: 40 },
  seg: { flex: 1, height: 5, borderRadius: 3 },
  stepOf: { fontSize: 13, fontWeight: '700', color: c.ink3, marginTop: 4 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, lineHeight: 34, color: c.ink, textAlign: 'center' },
  sub: { fontSize: 15, fontWeight: '500', lineHeight: 21, color: c.ink3, textAlign: 'center', paddingHorizontal: 12 },
  btnRow: { flexDirection: 'row', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '47%', flexGrow: 1, gap: 6, padding: 14, borderRadius: 20, backgroundColor: c.cell,
    borderWidth: 2, borderColor: 'transparent',
  },
  tileOn: { borderColor: c.tint, backgroundColor: c.tintSoft },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  tileT: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, color: c.ink },
  tileD: { fontSize: 13.5, fontWeight: '500', lineHeight: 18, color: c.ink3 },
  agree: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  qLabel: { fontSize: 16, fontWeight: '700', lineHeight: 21, color: c.ink },
  note: { fontSize: 13, lineHeight: 18, color: c.ink3, paddingHorizontal: 4 },
});
