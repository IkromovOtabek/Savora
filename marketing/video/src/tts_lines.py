# Har bir jumlani alohida TTS bilan yaratish va chetidagi sukutni kesish.
# Ishlatish: .venv/bin/python src/tts_lines.py <loyiha>/vo/lines.txt
# Natija: <loyiha>/vo/l1.wav, l2.wav ... (48 kHz mono) va uzunliklar ro'yxati.
# Ixtiyoriy: --rate +0% --pitch -3Hz (sukut: +10%, 0Hz). Sekinroq tezlik va biroz past ton — tabiiyroq.
import asyncio
import subprocess
import sys
from pathlib import Path

import edge_tts

VOICE = "uz-UZ-SardorNeural"
RATE = sys.argv[sys.argv.index("--rate") + 1] if "--rate" in sys.argv else "+10%"
PITCH = sys.argv[sys.argv.index("--pitch") + 1] if "--pitch" in sys.argv else "+0Hz"
TRIM = ("silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
        "silenceremove=start_periods=1:start_threshold=-45dB,areverse")


def dur(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


async def main(lines_path):
    src = Path(lines_path)
    lines = [l.strip() for l in src.read_text(encoding="utf-8").splitlines() if l.strip()]
    for i, text in enumerate(lines, 1):
        raw = src.parent / f"raw{i}.mp3"
        wav = src.parent / f"l{i}.wav"
        await edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH).save(str(raw))
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", TRIM, "-ar", "48000", "-ac", "1", str(wav)], check=True)
        print(f"{i}\t{dur(wav):.2f}\t{text}")


asyncio.run(main(sys.argv[1]))
