import { useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet, type TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Screen, NavBar, LargeTitle, Group, Field, PhoneField, Button, InlineError, IconSquare, type IconName } from '@/components/ui';
import { api, errMsg } from '@/lib/api';
import { useBuyer } from '@/lib/buyer';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';
import { formatUzPhoneInput, uzPhone9, uzPhoneE164 } from '@/lib/phone';
import { useMarketDict } from '@/lib/marketI18n';
import { safeNext } from '@/lib/market';
import { useTgSignup, type TgVerified } from '@/lib/tgSignup';

type Role = 'buyer' | 'business';
type Step = 'role' | 'method' | 'form';

/**
 * Ro'yxatdan o'tish: 1) kim sifatida — Mijoz (xaridor) yoki Biznes; 2) usul — Telegram orqali (raqam botda
 * tasdiqlanadi) yoki oddiy raqam bilan; 3) kerakli ma'lumotlar. Biznes — mavjud do'kon ochish ustasiga (/register)
 * o'tadi (Telegram'da tasdiqlangan raqam bilan). Tanlov doim so'raladi; `next` (savat/buyurtmalar) — mijoz uchun qaytish joyi.
 */
export function Signup() {
  const m = useMarketDict();
  const a = m.auth;
  const { c } = useTheme();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const target = safeNext(next);

  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState<Step>('role');
  const [verified, setVerified] = useState<TgVerified | null>(null);

  // Bot serverda sozlanganmi — yo'q bo'lsa (yoki eski server) Telegram tugmasi ko'rsatilmaydi, raqam bilan davom etiladi
  const tgCfg = useQuery({
    queryKey: ['market', 'tgSignupEnabled'],
    queryFn: () => api<{ enabled?: boolean }>('/api/mobile/auth/tg', { token: null }),
    staleTime: 5 * 60_000,
    retry: 1,
    meta: { persist: false },
  });
  const tgKnown = tgCfg.isFetched || tgCfg.isError;
  const tgOn = tgCfg.data?.enabled === true;

  const tg = useTgSignup((r) => {
    setVerified(r);
    if (role === 'business') {
      router.replace({ pathname: '/register', params: { tg: r.ticket, tgPhone: r.phone } });
    } else {
      setStep('form');
    }
  });

  const back = () => {
    if (step === 'form') { setStep(tgOn ? 'method' : 'role'); setVerified(null); return; }
    if (step === 'method' && tg.state === 'waiting') { tg.cancel(); return; }
    if (step === 'method') { tg.cancel(); setStep('role'); return; }
    if (router.canGoBack()) router.back();
    else router.replace('/market');
  };

  const goPhone = (r: Role) => {
    tg.cancel();
    if (r === 'business') router.replace('/register');
    else { setVerified(null); setStep('form'); }
  };
  const viaPhone = () => { if (role) goPhone(role); };

  const pickRole = (r: Role) => {
    setRole(r);
    // Telegram o'chiq — usul tanlash ma'nosiz, to'g'ridan-to'g'ri ma'lumotlarga
    if (tgKnown && !tgOn) goPhone(r);
    else setStep('method');
  };

  const toLogin = () => router.replace(`/market/login${target ? `?next=${encodeURIComponent(target)}` : ''}`);

  return (
    <Screen keyboard header={<NavBar onBack={back} />} gap={16}>
      <LargeTitle title={step === 'form' ? a.formTitle : a.registerTitle} subtitle={step === 'role' ? a.roleQ : step === 'method' ? a.methodQ : a.sub} />

      {step === 'role' ? (
        <View style={{ gap: 12 }}>
          <RoleCard icon="bag-handle" color={c.sq.o} title={a.roleBuyer} sub={a.roleBuyerSub} onPress={() => pickRole('buyer')} />
          <RoleCard icon="briefcase" color={c.sq.b} title={a.roleBusiness} sub={a.roleBusinessSub} onPress={() => pickRole('business')} />
        </View>
      ) : null}

      {step === 'method' && role ? (
        <>
          <RoleCard
            icon={role === 'buyer' ? 'bag-handle' : 'briefcase'}
            color={role === 'buyer' ? c.sq.o : c.sq.b}
            title={role === 'buyer' ? a.roleBuyer : a.roleBusiness}
            sub={role === 'buyer' ? a.roleBuyerSub : a.roleBusinessSub}
            action={a.changeRole}
            onPress={() => { tg.cancel(); setStep('role'); }}
            compact
          />

          {!tgKnown ? <ActivityIndicator color={c.tint} style={{ paddingVertical: 12 }} />
          : !tgOn ? <Button title={a.viaPhone} icon="call-outline" size="lg" full onPress={viaPhone} />
          : tg.state === 'waiting' ? (
            <Group>
              <View style={s.wait}>
                <View style={s.waitHead}>
                  <ActivityIndicator color={c.tint} />
                  <Text style={[s.waitTitle, { color: c.ink }]}>{a.tgWaitTitle}</Text>
                </View>
                <Text style={[s.waitSteps, { color: c.ink2 }]}>{a.tgWaitSteps}</Text>
                <Button title={a.tgOpen} icon="paper-plane" variant="tinted" full onPress={() => { void tg.reopen(a.tgNoApp); }} />
              </View>
            </Group>
          ) : (
            <Button
              title={a.viaTelegram}
              icon="paper-plane"
              size="lg"
              full
              loading={tg.state === 'starting'}
              onPress={() => { void tg.start(a.tgNoApp); }}
              style={{ backgroundColor: '#229ED9' }}
            />
          )}
          {tgOn && tg.state !== 'waiting' ? <Text style={[s.note, { color: c.ink3 }]}>{a.viaTelegramSub}</Text> : null}
          {tg.state === 'expired' ? <InlineError message={a.tgExpired} /> : null}
          {tg.error ? <InlineError message={tg.error} /> : null}

          {tgOn ? (
            <Pressable onPress={viaPhone} hitSlop={8} accessibilityRole="link" style={({ pressed }) => [s.link, pressed && { opacity: 0.6 }]}>
              <Ionicons name="call-outline" size={16} color={c.tint} />
              <Text style={[s.linkT, { color: c.tint }]}>{a.viaPhone}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {step === 'form' ? <BuyerForm verified={verified} target={target} /> : null}

      {step !== 'form' ? (
        <Pressable onPress={toLogin} hitSlop={8} accessibilityRole="link" style={({ pressed }) => [s.link, pressed && { opacity: 0.6 }]}>
          <Text style={[s.linkT, { color: c.ink3, fontWeight: '600' }]}>{a.haveAccount}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function RoleCard({ icon, color, title, sub, onPress, action, compact }: {
  icon: IconName; color: string; title: string; sub: string; onPress: () => void; action?: string; compact?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      style={({ pressed }) => [s.card, { backgroundColor: c.cell, padding: compact ? 14 : 18 }, pressed && { opacity: 0.7 }]}
    >
      <IconSquare icon={icon} color={color} size={compact ? 40 : 48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.cardT, { color: c.ink, fontSize: compact ? 17 : 19 }]}>{title}</Text>
        <Text style={[s.cardS, { color: c.ink3 }]} numberOfLines={2}>{sub}</Text>
      </View>
      {action ? <Text style={[s.cardA, { color: c.tint }]}>{action}</Text> : <Ionicons name="chevron-forward" size={20} color={c.ink3} />}
    </Pressable>
  );
}

/** Xaridor ma'lumotlari: ism, telefon (Telegram'da tasdiqlangan bo'lsa — qulflangan), parol. */
function BuyerForm({ verified, target }: { verified: TgVerified | null; target: string | null }) {
  const m = useMarketDict();
  const a = m.auth;
  const d = useDict();
  const { c } = useTheme();
  const router = useRouter();
  const buyer = useBuyer();

  const [name, setName] = useState(verified?.name ?? '');
  const [phone, setPhone] = useState(verified ? formatUzPhoneInput(verified.phone) : '');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);

  const errs = {
    name: name.trim().length < 2 || name.trim().length > 80 ? a.errName : null,
    phone: !uzPhone9(phone) ? a.errPhone : null,
    password: password.length < 6 ? a.errPassword : null,
  };
  const show = (e: string | null) => (tried ? e : null);

  async function submit() {
    setTried(true);
    if (errs.name || errs.phone || errs.password) return;
    setBusy(true);
    setError(null);
    try {
      await buyer.register(name.trim(), uzPhoneE164(phone), password, verified?.ticket);
      if (target) router.dismissTo(target);
      else if (router.canGoBack()) router.back();
      else router.replace('/market');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Group>
        <View style={{ padding: 16, gap: 14 }}>
          <Field
            label={a.name}
            value={name}
            onChangeText={setName}
            placeholder={a.namePh}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
            maxLength={80}
            returnKeyType="next"
            onSubmitEditing={() => (verified ? passRef.current?.focus() : phoneRef.current?.focus())}
            error={show(errs.name)}
          />
          <PhoneField
            ref={phoneRef}
            label={a.phone}
            value={phone}
            onChangeText={setPhone}
            editable={!verified}
            textContentType="telephoneNumber"
            autoComplete="tel"
            returnKeyType="next"
            onSubmitEditing={() => passRef.current?.focus()}
            error={show(errs.phone)}
            hint={verified ? a.tgVerified : undefined}
            right={verified ? <Ionicons name="checkmark-circle" size={20} color={c.ok} /> : undefined}
          />
          <Field
            ref={passRef}
            label={a.password}
            value={password}
            onChangeText={setPassword}
            placeholder={a.passwordPh}
            secureTextEntry={!showPass}
            autoCapitalize="none"
            textContentType="newPassword"
            autoComplete="new-password"
            maxLength={100}
            returnKeyType="go"
            onSubmitEditing={submit}
            hint={a.passwordHint}
            error={show(errs.password)}
            right={
              <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={12} accessibilityLabel={showPass ? d.login.hidePass : d.login.showPass}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.ink3} />
              </Pressable>
            }
          />
        </View>
      </Group>

      {error ? <InlineError message={error} /> : null}

      <Button title={a.register} size="lg" full loading={busy} onPress={submit} />
    </>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20 },
  cardT: { fontWeight: '700' },
  cardS: { fontSize: 14, lineHeight: 19 },
  cardA: { fontSize: 15, fontWeight: '700' },
  wait: { padding: 16, gap: 12 },
  waitHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  waitTitle: { fontSize: 17, fontWeight: '700' },
  waitSteps: { fontSize: 15, lineHeight: 23 },
  note: { fontSize: 13, textAlign: 'center', marginTop: -6 },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  linkT: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
