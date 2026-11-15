# Savora Reels #02 («Bitta tizim») uchun original musiqa foni (protsedural sintez, litsenziya talab qilmaydi).
# 120 BPM, A minor, 24 s, 48 kHz stereo -> savora-reel-02/assets/audio/music.wav
# Sahna kesimlari (3, 6, 9, 12, 16, 18) bit chegarasiga tushadi.
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile
import sys

SR = 48000
DUR = 24.0
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


def rustle(length=0.5):
    n = int(length * SR); t = t_of(n)
    nz = bp(rng.standard_normal(n), 1500, 7000)
    e = np.abs(np.sin(2 * np.pi * 9 * t)) * np.exp(-t / (length / 2.5))
    return nz * e * 0.22



def groove(t_start, t_end, seq, light=False):
    """To'liq groove: kick, clap, hat, bas, arpedjio — t_end da kesiladi."""
    t0 = t_start; bi = 0
    while t0 < t_end - 1e-6:
        pn, root, arp = CHORDS[seq[bi % len(seq)]]
        add(pad(pn, min(BAR, t_end - t0), 2000), t0, 0.7)
        for b in range(4):
            tb = t0 + b * BEAT
            if tb >= t_end - 1e-6:
                break
            add(kick(0.7 if light else 0.85), tb)
            if b in (1, 3):
                add(clap(), tb, 0.6 if light else 0.8)
            add(hat(), tb + BEAT / 2, 0.8 if light else 1.0, 0.25)
            if not light:
                add(hat(), tb + BEAT / 4, 0.4, -0.25)
            add(bass(root, BEAT / 2 * 0.95), tb + BEAT / 2, 0.8 if light else 1.0)
        for s_ in range(16):
            ts = t0 + s_ * BEAT / 4
            if ts < t_end - 1e-6:
                add(pluck(arp[s_ % 4] + (12 if s_ % 8 == 7 else 0)), ts, 0.55 if light else 0.75, 0.35 if s_ % 2 else -0.35)
        t0 += BAR; bi += 1


# ---------- 0 - 3 hook: kechki xotirjamlik, past pad + yurak urishi, oxirida riser
add(pad(CHORDS['Am'][0], 3.1, 700), 0.0, 0.9)
add(bass(33, 1.2), 0.0, 0.6)
for t in (0.3, 0.8, 1.3, 1.8, 2.3):
    add(kick(0.55), t)
for s_, m in enumerate([69, 72, 76, 72, 69, 72, 76, 79]):
    add(pluck(m, 0.3), 0.3 + s_ * 0.25, 0.45, 0.4 if s_ % 2 else -0.4)
add(riser(1.0), 2.0, 0.9)
add(whoosh(0.45), 2.75, 0.9)                  # klipdan klipga

# ---------- 3 - 12 qahramonlar: to'liq groove, har kesimda whoosh, kartaga pluck
add(impact(), 3.0, 0.6)
groove(3.0, 12.0, ['F', 'C', 'G', 'Am'])
for t in (5.8, 8.8):
    add(whoosh(0.4), t, 0.85, 0.5 if t < 7 else -0.5)
for t in (3.55, 6.55, 9.55):                  # 3D kartalar uchib chiqadi
    add(whoosh(0.3, False), t - 0.1, 0.6, 0.6)
    add(pluck(88, 0.4), t + 0.1, 0.8, 0.3)
for s_ in range(6):                           # nasiya segmentlari to'ladi
    add(pluck(76 + s_ * 2, 0.16), 7.0 + s_ * 0.14, 0.6, 0.3 if s_ % 2 else -0.3)
add(riser(0.8), 11.2, 0.9)
add(whoosh(0.5), 11.75, 0.9)                  # telefonga zoom-through

# ---------- 12 - 16 3D tizim: groove davom etadi, modul chiplari, riser
add(impact(), 12.0, 0.7)
groove(12.0, 16.0, ['Am', 'F'])
for s_ in range(6):
    add(pluck(81 + (s_ % 3) * 3, 0.22), 12.35 + s_ * 0.5, 0.7, 0.4 if s_ % 2 else -0.4)
add(riser(1.4), 14.6, 1.0)

# ---------- 16 logo
add(impact(), 16.0, 0.95); add(kick(1.0), 16.0)
add(pad(CHORDS['Am'][0] + [76], 2.2, 2200), 16.0, 0.85)
add(bass(33, 1.8), 16.0, 0.8)
for s_, m in enumerate([69, 72, 76, 81, 84]):
    add(pluck(m, 0.5), 16.1 + s_ * 0.11, 0.7, 0.4 if s_ % 2 else -0.4)
add(pluck(88, 0.9), 16.8, 1.0, 0.3)
add(whoosh(0.4), 17.7, 0.7)

# ---------- 18 - 24 CTA
add(impact(), 18.0, 0.75); add(kick(1.0), 18.0)
groove(18.0, 22.0, ['F', 'G'], light=True)
add(pad(CHORDS['Am'][0] + [76], 2.2, 2200), 22.0, 0.9)
add(bass(33, 2.0), 22.0, 0.8); add(kick(0.9), 22.0)
add(pluck(84, 0.3), 21.55, 1.0)              # tugma bosildi
add(pluck(88, 0.6), 21.65, 0.9, 0.2)
add(pluck(93, 0.9), 22.05, 0.8, -0.3)

mix = np.stack([L, R])
ir_n = int(1.6 * SR)
ir = rng.standard_normal(ir_n) * np.exp(-t_of(ir_n) / 0.45)
ir = lp(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2))
wet = np.stack([fftconvolve(mix[0], ir)[:N], fftconvolve(mix[1], ir[::-1])[:N]])
mix = mix * 0.85 + wet * 0.18
fade = np.ones(N); fl = int(1.2 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 1.5
mix *= fade
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) / 0.9
out = sys.argv[1]
wavfile.write(out, SR, (mix.T * 32767).astype(np.int16))
print('wrote', out)
