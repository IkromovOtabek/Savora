# TTS jumlalarini vaqtlarga joylash va musiqa bilan aralashtirish.
# Ishlatish: .venv/bin/python src/mix_tts.py <loyiha>
# Kerak: <loyiha>/voice_slots.json ({"duration": 24, "slots": [[start, max_len, "matn"], ...]}),
#        <loyiha>/vo/l1.wav ... (src/tts_lines.py natijasi), <loyiha>/assets/audio/music.wav
# Natija: assets/audio/vo.wav va mix.wav (VO + sidechain-ducked musiqa, -14 LUFS).
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

mix = ("[1:a]aformat=channel_layouts=stereo,asplit=2[vo][sc];[0:a]volume=-7dB[m];"
       "[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350:makeup=1[md];"
       "[md][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=9[a]")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(a / "music.wav"), "-i", str(a / "vo.wav"), "-filter_complex", mix,
                "-map", "[a]", "-ar", "48000", "-ac", "2", "-t", str(total), str(a / "mix.wav")], check=True)
print("wrote", a / "vo.wav", a / "mix.wav")
