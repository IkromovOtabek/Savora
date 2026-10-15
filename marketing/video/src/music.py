# Savora Reels uchun original musiqa foni (protsedural sintez, litsenziya talab qilmaydi).
# 120 BPM, A minor (Am-F-C-G), 30 s, 48 kHz stereo -> savora-reels/assets/audio/music.wav
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile
import sys

SR = 48000
DUR = 30.0
N = int(SR * DUR)
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(7)

L = np.zeros(N); R = np.zeros(N)


def t_of(n):
    return np.arange(n) / SR


def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    L[i:i + len(sig)] += sig * gain * l * 1.414
    R[i:i + len(sig)] += sig * gain * r * 1.414


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, f1, f2):
    return sosfilt(butter(2, [f1, f2], 'band', fs=SR, output='sos'), x)


def env(n, a=0.005, d=0.2, s=0.0, rel=None):
    t = t_of(n)
    e = np.minimum(1, t / max(a, 1e-4)) * (s + (1 - s) * np.exp(-t / d))
    if rel:
        e *= np.clip((n / SR - t) / rel, 0, 1)
    return e


def note_hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def saw(f, n, detune=0.0):
    t = t_of(n)
    out = np.zeros(n)
    for d in (-detune, 0, detune) if detune else (0,):
        ph = (t * f * (1 + d)) % 1.0
        out += 2 * ph - 1
    return out / (3 if detune else 1)


# --- drum voices
def kick(gain=1.0):
    n = int(0.45 * SR); t = t_of(n)
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t / 0.16)
    click = hp(rng.standard_normal(n), 2000) * np.exp(-t / 0.004) * 0.3
    return (s + click) * gain


def clap():
    n = int(0.3 * SR); t = t_of(n)
    nz = bp(rng.standard_normal(n), 900, 5000)
    e = np.exp(-t / 0.09)
    for k in (0.0, 0.011, 0.022):
        e += 0.6 * np.exp(-np.clip(t - k, 0, None) / 0.008) * (t >= k)
    return nz * e * 0.35


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR); t = t_of(n)
    nz = hp(rng.standard_normal(n), 7000)
    return nz * np.exp(-t / (0.08 if open_ else 0.015)) * 0.18


def whoosh(length=0.6, up=True):
    n = int(length * SR); t = t_of(n)
    nz = rng.standard_normal(n)
    # sweeping bandpass approximated by crossfading filtered layers
    lo = bp(nz, 300, 1500); hi = bp(nz, 2500, 9000)
    x = t / length
    mix = (lo * (1 - x) + hi * x) if up else (hi * (1 - x) + lo * x)
    e = np.sin(np.pi * np.clip(x, 0, 1)) ** 2
    return mix * e * 0.35


def impact():
    n = int(2.2 * SR); t = t_of(n)
    f = 38 + 80 * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.6)
    crash = hp(rng.standard_normal(n), 4000) * np.exp(-t / 0.7) * 0.25
    return boom * 0.9 + crash


def riser(length):
    n = int(length * SR); t = t_of(n)
    f = 200 * (8 ** (t / length))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.15
    nz = hp(rng.standard_normal(n), 1500) * 0.25
    e = (t / length) ** 2
    return (tone + nz) * e


def tick():
    n = int(0.03 * SR); t = t_of(n)
    return np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.006) * 0.25


# --- tonal voices
def pad(midis, length, cutoff=1800):
    n = int(length * SR)
    x = sum(saw(note_hz(m), n, 0.004) for m in midis) / len(midis)
    x = lp(x, cutoff, 2)
    t = t_of(n)
    e = np.minimum(1, t / 0.35) * np.minimum(1, (length - t) / 0.35).clip(0, 1)
    return x * e * 0.22


def bass(m, length):
    n = int(length * SR); t = t_of(n)
    f = note_hz(m)
    x = lp(saw(f, n) * 0.6 + np.sin(2 * np.pi * f * t) * 0.6, 600)
    e = np.minimum(1, t / 0.01) * np.exp(-t / 0.5) * (0.4 + 0.6)
    e *= np.clip((length - t) / 0.03, 0, 1)
    return x * e * 0.45


def pluck(m, length=0.22):
    n = int(length * SR); t = t_of(n)
    f = note_hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    return x * np.exp(-t / 0.09) * 0.12


CHORDS = {  # (pad notes, bass root, arp notes)
    'Am': ([57, 60, 64, 69], 33, [69, 72, 76, 72]),
    'F': ([53, 57, 60, 65], 29, [65, 69, 72, 69]),
    'C': ([55, 60, 64, 67], 36, [67, 72, 76, 72]),
    'G': ([55, 59, 62, 67], 31, [67, 71, 74, 71]),
}
PROG = ['Am', 'F', 'C', 'G']
BAR = 4 * BEAT

# ---------- 0 - 3.0 hook: tense pad + clock ticks
add(pad(CHORDS['Am'][0], 3.2, 900), 0.0, 0.9)
for k in range(6):
    add(tick(), k * BEAT, 1.0, 0.3 if k % 2 else -0.3)
add(whoosh(0.7), 1.35, 1.0, 0.4)           # daftar uchib ketadi
add(kick(0.5), 2.0)

# ---------- 3.0 - 7.5 pain: filtered groove + riser
add(whoosh(0.5, False), 2.75, 0.9, -0.4)
add(pad(CHORDS['F'][0], 2.0, 1100), 3.0, 0.9)
add(pad(CHORDS['G'][0], 2.5, 1300), 5.0, 0.9)
for k in range(9):  # 3.0..7.0
    t0 = 3.0 + k * BEAT
    add(kick(0.55), t0)
    add(tick(), t0 + BEAT / 2, 0.8)
add(bass(33, 0.45), 3.0); add(bass(29, 0.45), 4.0); add(bass(31, 0.45), 5.0); add(bass(31, 0.45), 6.0)
add(riser(1.45), 6.0, 1.0)

# ---------- 7.5 reveal impact
add(impact(), 7.5, 0.9)
add(pad(CHORDS['Am'][0], 0.6, 2500), 7.5, 1.0)

# ---------- 8.0 - 28.0 main groove
groove_start, groove_end = 8.0, 28.0
bar_i = 0
t0 = groove_start
while t0 < groove_end - 1e-6:
    c = PROG[bar_i % 4]
    pn, root, arp = CHORDS[c]
    cutoff = 2600 if 22.5 <= t0 < 26.0 else 2000
    add(pad(pn, BAR, cutoff), t0, 0.75)
    for b in range(4):
        tb = t0 + b * BEAT
        add(kick(0.85), tb)
        if b in (1, 3):
            add(clap(), tb, 0.9)
        add(hat(), tb + BEAT / 2, 1.0, 0.25)
        add(hat(), tb + BEAT / 4, 0.45, -0.25)
        add(bass(root, BEAT / 2 * 0.95), tb + BEAT / 2)
    for s in range(16):
        add(pluck(arp[s % 4] + (12 if s % 8 == 7 else 0)), t0 + s * BEAT / 4, 1.0, 0.35 if s % 2 else -0.35)
    t0 += BAR
    bar_i += 1

# feature-cut whooshes (on scene changes)
for tc in (11.0, 13.5, 16.0, 18.0, 19.5, 22.5, 26.0):
    add(whoosh(0.45), tc - 0.3, 0.7, 0.5 if int(tc) % 2 else -0.5)

# ---------- 28.0 outro: final chord + tail
add(kick(1.0), 28.0)
add(impact(), 28.0, 0.5)
add(pad(CHORDS['Am'][0] + [76], 2.0, 2200), 28.0, 0.9)

mix = np.stack([L, R])
# simple reverb on whole bed (wet 18%)
ir_n = int(1.6 * SR)
ir = rng.standard_normal(ir_n) * np.exp(-t_of(ir_n) / 0.45)
ir = lp(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2))
wet = np.stack([fftconvolve(mix[0], ir)[:N], fftconvolve(mix[1], ir[::-1])[:N]])
mix = mix * 0.85 + wet * 0.18
# final fade
fade = np.ones(N); fl = int(1.2 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 1.5
mix *= fade
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) / 0.9
out = sys.argv[1]
wavfile.write(out, SR, (mix.T * 32767).astype(np.int16))
print('wrote', out)
