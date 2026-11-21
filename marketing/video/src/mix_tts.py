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
    vo_chain = (f"highpass=f=80,equalizer=f=3000:t=q:w=1.2:g={mx.get('vo_presence_db', 3)},"
                f"acompressor=threshold=-22dB:ratio=3:attack=5:release=120:makeup=2,volume={mx.get('vo_db', 0)}dB")
    mix = (f"[1:a]{vo_chain},aformat=channel_layouts=stereo,asplit=2[vo][sc];[0:a]volume={mx.get('music_db', -14)}dB[m];"
           f"[m][sc]sidechaincompress=threshold={mx.get('duck_threshold', 0.015)}:ratio={mx.get('duck_ratio', 12)}:attack=10:release=300:makeup=1[md];"
           "[md][vo]amix=inputs=2:normalize=0[a]")
    tmp = a / "mix.pre.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(a / "music.wav"), "-i", str(a / "vo.wav"), "-filter_complex", mix,
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
