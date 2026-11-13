import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildExpoMessages, chunk, isExpoPushToken, sendExpoPush, PUSH_CHANNEL_ID } from '@/lib/push';

const tok = (n: number) => `ExponentPushToken[${String(n).padStart(22, 'x')}]`;

function fakeFetch(handler: (messages: { to: string }[]) => unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const messages = JSON.parse(String(init?.body)) as { to: string }[];
    return new Response(JSON.stringify(handler(messages)), { status });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

afterEach(() => vi.unstubAllEnvs());

describe('isExpoPushToken', () => {
  it('Expo token formatini qabul qiladi', () => {
    expect(isExpoPushToken('ExponentPushToken[AbCdEf1234567890_-xyz]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[AbCdEf1234567890xyz]')).toBe(true);
  });
  it('boshqa qiymatlarni rad etadi', () => {
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[abc"<script>]')).toBe(false);
    expect(isExpoPushToken('fcm-raw-token-abcdefghijk')).toBe(false);
    expect(isExpoPushToken(123)).toBe(false);
  });
});

describe('chunk', () => {
  it("100 talik bo'laklar", () => {
    const parts = chunk(Array.from({ length: 250 }, (_, i) => i), 100);
    expect(parts.map((p) => p.length)).toEqual([100, 100, 50]);
  });
});

describe('buildExpoMessages', () => {
  it('ovoz, kanal va bosilganda ochiladigan ekran', () => {
    const [m] = buildExpoMessages([tok(1)], { title: 'Sarlavha', body: 'Matn', url: '/shifts' });
    expect(m).toMatchObject({ to: tok(1), sound: 'default', priority: 'high', channelId: PUSH_CHANNEL_ID, data: { url: '/shifts' } });
  });
  it("url bo'lmasa data yo'q, uzun matn qisqartiriladi", () => {
    const [m] = buildExpoMessages([tok(1)], { title: 'T', body: 'a'.repeat(2000) });
    expect(m).not.toHaveProperty('data');
    expect(m.body.length).toBe(600);
    expect(m.body.endsWith('…')).toBe(true);
  });
});

describe('sendExpoPush', () => {
  it("yuborilganlarni sanaydi, o'chirilgan qurilmalarni qaytaradi", async () => {
    const f = fakeFetch((msgs) => ({
      data: msgs.map((m, i) => (i === 1
        ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: `id-${m.to}` })),
    }));
    const r = await sendExpoPush([tok(1), tok(2), tok(3)], { title: 'T', body: 'B' }, f);
    expect(r).toEqual({ sent: 2, dead: [tok(2)] });
  });

  it("takror va noto'g'ri tokenlar chiqarib tashlanadi, 100 tadan bo'lib yuboriladi", async () => {
    const f = fakeFetch((msgs) => ({ data: msgs.map(() => ({ status: 'ok' })) }));
    const tokens = [...Array.from({ length: 150 }, (_, i) => tok(i)), tok(0), 'bad-token'];
    const r = await sendExpoPush(tokens, { title: 'T', body: 'B' }, f);
    expect(r.sent).toBe(150);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("token bo'lmasa so'rov yuborilmaydi", async () => {
    const f = fakeFetch(() => ({ data: [] }));
    expect(await sendExpoPush(['bad'], { title: 'T', body: 'B' }, f)).toEqual({ sent: 0, dead: [] });
    expect(f).not.toHaveBeenCalled();
  });

  it("Expo xato qaytarsa yoki tarmoq uzilsa — istisno otmaydi", async () => {
    const bad = fakeFetch(() => ({ errors: [{ code: 'X' }] }), 500);
    expect(await sendExpoPush([tok(1)], { title: 'T', body: 'B' }, bad)).toEqual({ sent: 0, dead: [] });
    const down = vi.fn(async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
    expect(await sendExpoPush([tok(1)], { title: 'T', body: 'B' }, down)).toEqual({ sent: 0, dead: [] });
  });

  it("EXPO_ACCESS_TOKEN bo'lsa Authorization sarlavhasi qo'shiladi", async () => {
    vi.stubEnv('EXPO_ACCESS_TOKEN', 'secret-token');
    const f = fakeFetch((msgs) => ({ data: msgs.map(() => ({ status: 'ok' })) }));
    await sendExpoPush([tok(1)], { title: 'T', body: 'B' }, f);
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });
});
