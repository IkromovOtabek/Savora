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


def ff(*a):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *a], check=True)


def read(p):
    _, x = wavfile.read(p)
    return x.astype(np.float64) / 32768


def frames_db(x, fr=int(0.02 * SR)):
    n = len(x) // fr
    f = x[: n * fr].reshape(n, fr)
    return 10 * np.log10(np.mean(f ** 2, axis=1) + 1e-12), fr


proj = Path(sys.argv[1])
cfg = json.loads((proj / "voice_slots.json").read_text(encoding="utf-8"))
src_dir, vo = proj / "vo" / "jonli", proj / "vo"
work = src_dir / "_ish"
work.mkdir(exist_ok=True)
tts_backup = vo / "tts_oxirgi"
if not tts_backup.exists():
    tts_backup.mkdir()
    for f in vo.glob("l*.wav"):
        shutil.copy(f, tts_backup / f.name)

rows, missing = [], []
for i, (start, max_len, text) in enumerate(cfg["slots"], 1):
    srcs = [p for p in src_dir.glob(f"l{i}.*") if ".prev" not in p.name]
    if not srcs:
        missing.append(i)
        continue
    raw = work / f"raw{i}.wav"
    ff("-i", str(srcs[0]), "-af", "highpass=f=80,afftdn=nf=-32:tn=1,deesser=i=0.35,"
       "equalizer=f=220:t=q:w=1.2:g=-1.5,acompressor=threshold=-24dB:ratio=2.5:attack=6:release=120:makeup=1",
       "-ar", str(SR), "-ac", "1", str(raw))
    x = read(raw)
    db, fr = frames_db(x)
    noise = float(np.percentile(db, 10))
    loud = float(np.percentile(db, 95))
    thr = max(noise + 10, loud - 28)
    sp = np.where(db > thr)[0]
    if len(sp) == 0:
        rows.append(f"{i:2}. OVOZ TOPILMADI — {text}")
        continue
    a = max(0, sp[0] * fr - int(0.06 * SR))
    b = min(len(x), (sp[-1] + 1) * fr + int(0.10 * SR))
    y = x[a:b]
    speech = y[np.abs(y) > 10 ** (thr / 20)]
    rms_db = 20 * np.log10(np.sqrt(np.mean(speech ** 2)) + 1e-9) if len(speech) else -60
    y = y * 10 ** ((TARGET_DB - rms_db) / 20)
    y /= max(1.0, np.max(np.abs(y)) / 0.95)
    mid = work / f"mid{i}.wav"
    wavfile.write(mid, SR, (y * 32767).astype(np.int16))
    length = len(y) / SR
    tempo = min(MAX_TEMPO, length / max_len) if length > max_len else 1.0
    t = f"atempo={tempo:.4f}," if tempo > 1.001 else ""
    ff("-i", str(mid), "-af", f"{t}afade=t=in:d=0.02,areverse,afade=t=in:d=0.06,areverse", "-ar", str(SR), "-ac", "1", str(vo / f"l{i}.wav"))
    final = length / tempo
    flag = "  <-- SIG'MAYDI, qayta yozish kerak (tezroq)" if final > max_len + 0.05 else ""
    rows.append(f"{i:2}. {final:4.2f}/{max_len:4.2f}s  x{tempo:.2f}  shovqin {noise:5.1f} dB  {text}{flag}")

print("\n".join(rows))
if missing:
    print("Yozilmagan jumlalar:", missing, "— ular uchun eski TTS qoladi")
