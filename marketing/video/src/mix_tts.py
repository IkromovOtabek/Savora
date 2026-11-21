# TTS jumlalarini vaqtlarga joylash va musiqa bilan aralashtirish.
# Ishlatish: .venv/bin/python src/mix_tts.py <loyiha>
# Kerak: <loyiha>/voice_slots.json ({"duration": 24, "slots": [[start, max_len, "matn"], ...]}),
#        <loyiha>/vo/l1.wav ... (src/tts_lines.py natijasi), <loyiha>/assets/audio/music.wav
# Natija: assets/audio/vo.wav va mix.wav (VO + sidechain-ducked musiqa, -14 LUFS).
# Ixtiyoriy "mix" bloki (voice_slots.json): music_db, duck_threshold, duck_ratio, vo_db, vo_presence_db, target_lufs, ceiling_db.
import json
import subprocess
import sys
from pathlib import Path


def humanize(vo_path, a, hz, cfg, proj):
    """TTS ovozini «jonli yozuv»ga yaqinlashtirish: iliq EQ, sibilyantni yumshatish, yengil kompressiya,
    kichik xona akustikasi (sintetik IR) va uzun pauzalardan oldin juda past nafas. Natija: vo_human.wav"""
    import numpy as np
    from scipy.io import wavfile
    from scipy.signal import butter, sosfilt, fftconvolve
    sr = 48000
    eq = a / "vo_eq.wav"
    chain = ("highpass=f=70,equalizer=f=180:t=q:w=1.0:g=2.5,equalizer=f=3200:t=q:w=1.5:g=-1.5,"
             "equalizer=f=6000:t=q:w=2:g=1,deesser=i=0.4,acompressor=threshold=-24dB:ratio=2.5:attack=8:release=150:makeup=2")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(vo_path), "-af", chain, "-ar", str(sr), "-ac", "1", str(eq)], check=True)
    _, x = wavfile.read(eq)
    x = x.astype(np.float64) / 32768
    rng = np.random.default_rng(11)
    # xona: erta aks-sadolar + 0.3 s so'nish, 6 kHz dan yuqorisi kesilgan
    n = int(0.35 * sr)
    t = np.arange(n) / sr
    ir = rng.standard_normal(n) * np.exp(-t / 0.07)
    ir = sosfilt(butter(2, 6000, "low", fs=sr, output="sos"), ir)
    ir[:int(0.004 * sr)] = 0
    for ms, g in ((7, 0.5), (13, 0.35), (19, 0.25)):
        ir[int(ms / 1000 * sr)] += g * 4
    ir /= np.sqrt(np.sum(ir ** 2))
    wet = fftconvolve(x, ir)[: len(x)]
    y = x + wet * hz.get("room", 0.08)
    # nafas: jumla oldidan, faqat oldingi jumladan keyin pauza yetarli bo'lsa
    speech_rms = np.sqrt(np.mean(x[np.abs(x) > 0.02] ** 2)) if np.any(np.abs(x) > 0.02) else 0.1
    level = speech_rms * 10 ** (hz.get("breath_db", -26) / 20)
    prev_end = -1.0
    for i, (start, max_len, _t) in enumerate(cfg["slots"], 1):
        if i in hz.get("breaths", []) and start - prev_end > 0.5:
            bl = 0.32
            bn = int(bl * sr)
            bt = np.arange(bn) / bl / sr
            nz = rng.standard_normal(bn)
            b = sosfilt(butter(2, [450, 2300], "band", fs=sr, output="sos"), nz)
            b += 0.4 * sosfilt(butter(2, [150, 450], "band", fs=sr, output="sos"), rng.standard_normal(bn))
            env = np.where(bt < 0.45, np.sin(np.pi / 2 * bt / 0.45) ** 2, np.cos(np.pi / 2 * (bt - 0.45) / 0.55) ** 2)
            b = b * env
            b *= level / (np.sqrt(np.mean(b ** 2)) + 1e-9)
            s0 = int((start - 0.06 - bl) * sr)
            if s0 > 0:
                y[s0:s0 + bn] += b
        ln = wavfile.read(proj / "vo" / f"l{i}.wav")[1].shape[0] / sr
        prev_end = start + min(max_len, ln)
    y /= max(1.0, np.max(np.abs(y)) / 0.97)
    out = a / "vo_human.wav"
    wavfile.write(out, sr, (y * 32767).astype(np.int16))
    eq.unlink()
    return out


p = Path(sys.argv[1])
cfg = json.loads((p / "voice_slots.json").read_text(encoding="utf-8"))
total = cfg["duration"]
a = p / "assets" / "audio"

inputs, chains = [], []
for i, (start, max_len, _text) in enumerate(cfg["slots"], 1):
    wav = p / "vo" / f"l{i}.wav"
    inputs += ["-i", str(wav)]
    ms = int(round(start * 1000))
    chains.append(f"[{i - 1}:a]atrim=0:{max_len},adelay={ms}|{ms},apad=whole_dur={total}[v{i}]")
n = len(cfg["slots"])
graph = ";".join(chains) + ";" + "".join(f"[v{i}]" for i in range(1, n + 1)) + f"amix=inputs={n}:normalize=0,atrim=0:{total}[vo]"
subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", graph, "-map", "[vo]", "-ar", "48000", "-ac", "1", str(a / "vo.wav")], check=True)

mx = cfg.get("mix")
if not mx:
    # eski reels'lar uchun asl zanjir (o'zgarmagan)
    mix = ("[1:a]aformat=channel_layouts=stereo,asplit=2[vo][sc];[0:a]volume=-7dB[m];"
           "[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350:makeup=1[md];"
           "[md][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=9[a]")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(a / "music.wav"), "-i", str(a / "vo.wav"), "-filter_complex", mix,
                    "-map", "[a]", "-ar", "48000", "-ac", "2", "-t", str(total), str(a / "mix.wav")], check=True)
else:
    # voice_slots.json → "mix": ovoz oldinda (EQ + kompressor), musiqa past va ovoz ostida kuchli ducking,
    # so'ng statik gain bilan target LUFS va limiter (dinamik loudnorm musiqani pauzalarda ko'tarib yubormasin)
    vo_in = a / "vo.wav"
    hz = mx.get("humanize")
    if hz:
        vo_in = humanize(vo_in, a, hz, cfg, p)
        vo_chain = f"volume={mx.get('vo_db', 0)}dB"
    else:
        vo_chain = (f"highpass=f=80,equalizer=f=3000:t=q:w=1.2:g={mx.get('vo_presence_db', 3)},"
                    f"acompressor=threshold=-22dB:ratio=3:attack=5:release=120:makeup=2,volume={mx.get('vo_db', 0)}dB")
    # music_dips: [[boshlanish, tugash, dB], ...] — muhim jumla ostida musiqani qo'shimcha pasaytirish
    dips = "".join(f",volume={d}dB:enable='between(t,{s0},{s1})'" for s0, s1, d in mx.get("music_dips", []))
    mix = (f"[1:a]{vo_chain},aformat=channel_layouts=stereo,asplit=2[vo][sc];[0:a]volume={mx.get('music_db', -14)}dB{dips}[m];"
           f"[m][sc]sidechaincompress=threshold={mx.get('duck_threshold', 0.015)}:ratio={mx.get('duck_ratio', 12)}:attack=10:release={mx.get('duck_release', 300)}:makeup=1[md];"
           "[md][vo]amix=inputs=2:normalize=0[a]")
    tmp = a / "mix.pre.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(a / "music.wav"), "-i", str(vo_in), "-filter_complex", mix,
                    "-map", "[a]", "-ar", "48000", "-ac", "2", "-t", str(total), str(tmp)], check=True)
    meas = subprocess.run(["ffmpeg", "-nostats", "-i", str(tmp), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    lufs = float(meas.split("Integrated loudness:")[1].split("I:")[1].split("LUFS")[0])
    gain = mx.get("target_lufs", -14.5) - lufs
    ceiling = 10 ** (mx.get("ceiling_db", -3) / 20)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(tmp), "-af",
                    f"volume={gain:.2f}dB,alimiter=limit={ceiling:.4f}:attack=5:release=60:level=false",
                    "-ar", "48000", "-ac", "2", str(a / "mix.wav")], check=True)
    tmp.unlink()
    print(f"mix: {lufs:.1f} LUFS -> {gain:+.1f} dB")
print("wrote", a / "vo.wav", a / "mix.wav")
