# Teleprompter yozuvlarini (vo/jonli/lN.webm) tozalab, har jumlani o'z joyiga tayyorlash -> vo/lN.wav
# Ishlatish: .venv/bin/python src/jonli_lines.py <loyiha>     (keyin: src/mix_tts.py <loyiha>)
# Qadamlar: shovqin/past chastota/sibilyant tozalash -> chetdagi jimlikni kesish -> jumlalar balandligini tenglash
#           -> slot'ga sig'masa ≤15% tezlashtirish (ton saqlanadi) -> yumshoq fade.
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile

SR = 48000
MAX_TEMPO = 1.15
TARGET_DB = -20.0  # nutq RMS (dBFS)
GAP = 0.02        # fayllar orasidagi qo'shimcha pauza; jami pauza ≈ 0.25 + 0.12 + GAP ≈ 0.4 s (diktor kabi)
MAX_LAG = 0.35    # jumla o'z sahnasidan ko'pi bilan shuncha kech boshlanishi mumkin
HEAD = 0.12       # fayl boshidagi zaxira (nutqdan oldin)
# Diktor (radio/TV) zanjiri: past chastota tozalanadi, «quti» ovozi (350 Hz) kamaytiriladi, tiniqlik (2.5–5 kHz)
# va havo (8.5 kHz+) qo'shiladi, sibilyant yumshatiladi, ikki bosqichli kompressiya ovozni zich va bir tekis qiladi.
# Shovqin tozalash yo'q: yozuvlar shovqini −60…−78 dB, afftdn faqat ovozni bo'g'iq qilardi.
BROADCAST = ("highpass=f=75,equalizer=f=150:t=q:w=1:g=1.5,equalizer=f=350:t=q:w=1.2:g=-2.5,"
             "equalizer=f=2500:t=q:w=1.5:g=2,equalizer=f=5000:t=q:w=1.4:g=5,highshelf=f=8500:g=4,"
             "deesser=i=0.5:m=0.5:f=0.5,"
             "acompressor=threshold=-24dB:ratio=3:attack=4:release=70:makeup=2,"
             "acompressor=threshold=-12dB:ratio=4:attack=1:release=40:makeup=1")


def ff(*a):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *a], check=True)


def read(p):
    _, x = wavfile.read(p)
    return x.astype(np.float64) / 32768


def frames_db(x, fr=int(0.02 * SR)):
    n = len(x) // fr
    f = x[: n * fr].reshape(n, fr)
    return 10 * np.log10(np.mean(f ** 2, axis=1) + 1e-12), fr


# --src vo/eleven: boshqa manba (masalan ElevenLabs); --chain toza: studiya TTS uchun yengil zanjir (EQ/kompressiya kam)
CLEAN = "highpass=f=70,deesser=i=0.3,acompressor=threshold=-22dB:ratio=2:attack=6:release=90:makeup=1"
argv = sys.argv[1:]
proj = Path(argv[0])
cfg = json.loads((proj / "voice_slots.json").read_text(encoding="utf-8"))
src_dir, vo = proj / (argv[argv.index("--src") + 1] if "--src" in argv else "vo/jonli"), proj / "vo"
PAUSE_MAX = float(argv[argv.index("--pauza") + 1]) if "--pauza" in argv else 0.0  # jumla ichidagi pauza chegarasi (s)
if "--lag" in argv:
    MAX_LAG = float(argv[argv.index("--lag") + 1])
if "--chain" in argv and argv[argv.index("--chain") + 1] == "toza":
    BROADCAST = CLEAN
work = src_dir / "_ish"
work.mkdir(exist_ok=True)
tts_backup = vo / "tts_oxirgi"
if not tts_backup.exists():
    tts_backup.mkdir()
    for f in vo.glob("l*.wav"):
        shutil.copy(f, tts_backup / f.name)

rows, missing, items = [], [], []
for i, (start, max_len, text) in enumerate(cfg["slots"], 1):
    srcs = [p for p in src_dir.glob(f"l{i}.*") if ".prev" not in p.name]
    if not srcs:
        missing.append(i)
        continue
    raw = work / f"raw{i}.wav"
    ff("-i", str(srcs[0]), "-af", BROADCAST, "-ar", str(SR), "-ac", "1", str(raw))
    x = read(raw)
    db, fr = frames_db(x)
    noise = float(np.percentile(db, 10))
    loud = float(np.percentile(db, 95))
    thr = max(noise + 6, loud - 42)
    sp = np.where(db > thr)[0]
    if len(sp) == 0:
        rows.append(f"{i:2}. OVOZ TOPILMADI — {text}")
        continue
    a = max(0, sp[0] * fr - int(0.12 * SR))
    b = min(len(x), (sp[-1] + 1) * fr + int(0.25 * SR))
    y = x[a:b]
    if PAUSE_MAX:
        # jumla ichidagi uzun pauzani PAUSE_MAX gacha qisqartirish (tezlashtirishdan tabiiyroq); 10 ms crossfade
        dbs, f10 = frames_db(y, int(0.01 * SR))
        on = dbs > thr
        idx = np.where(on)[0]
        k, cuts = idx[0], []
        while k <= idx[-1]:
            if not on[k]:
                s0 = k
                while k <= idx[-1] and not on[k]:
                    k += 1
                if (k - s0) * 0.01 > PAUSE_MAX:
                    keep = int(PAUSE_MAX / 0.01)
                    cuts.append((s0 + keep // 2, k - keep // 2))
            k += 1
        xf = int(0.01 * SR)
        for c0, c1 in reversed(cuts):
            p0, p1 = c0 * f10, c1 * f10
            fade = np.linspace(1, 0, xf)
            y = np.concatenate([y[:p0], y[p0:p0 + xf] * fade + y[p1:p1 + xf] * fade[::-1], y[p1 + xf:]])
    speech = y[np.abs(y) > 10 ** (thr / 20)]
    rms_db = 20 * np.log10(np.sqrt(np.mean(speech ** 2)) + 1e-9) if len(speech) else -60
    y = y * 10 ** ((TARGET_DB - rms_db) / 20)
    y /= max(1.0, np.max(np.abs(y)) / 0.95)
    mid = work / f"mid{i}.wav"
    wavfile.write(mid, SR, (y * 32767).astype(np.int16))
    items.append((i, mid, len(y) / SR, text, noise))

# Joylashuv: jumla nutqi o'z sahnasi boshlanishiga (anchor) tushsin, oldingisi bilan orasida tabiiy pauza
# (fayl chetidagi 0.12 + 0.25 s zaxira + GAP). Sig'masa — avval ≤8%, kerak bo'lsa ≤15% tezlashtirish.
anchors = cfg.get("anchors") or [s_[0] for s_ in cfg["slots"]]
cfg["anchors"] = anchors
by_i = {it[0]: it for it in items}
prev_end = -9.0
for k, (anchor, slot) in enumerate(zip(anchors, cfg["slots"])):
    n_i = k + 1
    if n_i not in by_i:
        prev_end = slot[0] + slot[1]
        continue
    _, mid, length, text, noise = by_i[n_i]
    start = max(anchor - HEAD, prev_end + GAP)
    nxt = anchors[k + 1] if k + 1 < len(anchors) else cfg["duration"] - 0.4 + HEAD
    avail = (nxt - HEAD + MAX_LAG - GAP) - start
    tempo = 1.0
    if length > avail:
        tempo = min(1.08, length / avail)
        if length / tempo > avail:
            tempo = min(MAX_TEMPO, length / avail)
    t = f"atempo={tempo:.4f}," if tempo > 1.001 else ""
    ff("-i", str(mid), "-af", f"{t}afade=t=in:d=0.03,areverse,afade=t=in:d=0.15,areverse", "-ar", str(SR), "-ac", "1", str(vo / f"l{n_i}.wav"))
    final = length / tempo
    cfg["slots"][k] = [round(start, 3), round(final + 0.01, 3), text]
    prev_end = start + final
    lag = start + HEAD - anchor
    flag = "  <-- SIG'MAYDI" if final > avail + 0.05 else ""
    rows.append(f"{n_i:2}. nutq {start + HEAD:5.2f}s (sahnadan {lag:+.2f})  {final:4.2f}s  x{tempo:.2f}  {text}{flag}")

(proj / "voice_slots.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
print("\n".join(rows))
if missing:
    print("Yozilmagan jumlalar:", missing, "— ular uchun eski TTS qoladi")
