# UzbekVoice.ai TTS bilan har bir jumlani alohida ovozlash (tts_lines.py o'rnida — natija formati bir xil).
# Kalit: UZBEKVOICE_API_KEY muhit o'zgaruvchisi yoki marketing/video/.env (gitignore'da) ichida
#   UZBEKVOICE_API_KEY=...
# Ishlatish:
#   .venv/bin/python src/tts_uzbekvoice.py <loyiha>/vo/lines.txt --voice jasur      -> l1.wav, l2.wav ...
#   .venv/bin/python src/tts_uzbekvoice.py <loyiha>/vo/lines.txt --namuna           -> 1-jumla 5 ovozda: namuna-<ovoz>.wav
# Keyin: .venv/bin/python src/mix_tts.py <loyiha>  (vo.wav + mix.wav)
# Narx (2026-11): 500 so'm / 1000 belgi; API hujjati: https://uzbekvoice.ai/developers/api/tts
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://uzbekvoice.ai/api/v1/tts"
VOICES = ["jasur", "shoira", "lola", "kamola", "sevinch"]
TRIM = ("silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
        "silenceremove=start_periods=1:start_threshold=-45dB,areverse")


def api_key():
    key = os.environ.get("UZBEKVOICE_API_KEY", "").strip()
    env = Path(__file__).resolve().parent.parent / ".env"
    if not key and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("UZBEKVOICE_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit(f"UZBEKVOICE_API_KEY topilmadi: {env} fayliga  UZBEKVOICE_API_KEY=...  qatorini yozing")
    return key


def find_url(obj):
    """Javob JSON ichidan audio havolasini topish (javob tuzilishi hujjatda to'liq yozilmagan)."""
    if isinstance(obj, str):
        return obj if obj.startswith("http") else None
    if isinstance(obj, dict):
        for k in ("url", "audio_url", "result_url", "file", "audio", "result"):
            if k in obj and (u := find_url(obj[k])):
                return u
        obj = list(obj.values())
    if isinstance(obj, list):
        for v in obj:
            if u := find_url(v):
                return u
    return None


def synth(text, voice, key, out_raw):
    body = json.dumps({"text": text, "model": voice, "blocking": "true"}).encode()
    req = urllib.request.Request(API, data=body, method="POST",
                                 headers={"Authorization": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            ctype = r.headers.get("Content-Type", "")
            data = r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"UzbekVoice xato {e.code}: {e.read()[:300].decode(errors='replace')}")
    if ctype.startswith("audio/") or data[:4] in (b"RIFF", b"ID3\x03", b"OggS") or data[:2] == b"\xff\xfb":
        out_raw.write_bytes(data)
        return
    payload = json.loads(data)
    url = find_url(payload)
    if not url:
        sys.exit(f"Javobda audio havola topilmadi: {json.dumps(payload, ensure_ascii=False)[:400]}")
    with urllib.request.urlopen(url, timeout=120) as r:
        out_raw.write_bytes(r.read())


def to_wav(raw, wav):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", TRIM, "-ar", "48000", "-ac", "1", str(wav)], check=True)
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__ or "Ishlatish: tts_uzbekvoice.py <lines.txt> [--voice jasur | --namuna]")
    src = Path(args[0])
    voice = args[args.index("--voice") + 1] if "--voice" in args else "jasur"
    if voice not in VOICES:
        sys.exit(f"Ovoz {voice!r} yo'q. Mavjud: {', '.join(VOICES)}")
    lines = [l.strip() for l in src.read_text(encoding="utf-8").splitlines() if l.strip()]
    key = api_key()
    if "--namuna" in args:
        jobs = [(f"namuna-{v}", v, lines[0]) for v in VOICES]
    else:
        jobs = [(f"l{i}", voice, t) for i, t in enumerate(lines, 1)]
    chars = sum(len(t) for _, _, t in jobs)
    print(f"{len(jobs)} ta so'rov, {chars} belgi ≈ {chars * 0.5:.0f} so'm")
    for name, v, text in jobs:
        raw = src.parent / f"{name}.uv"
        wav = src.parent / f"{name}.wav"
        synth(text, v, key, raw)
        print(f"{name}\t{v}\t{to_wav(raw, wav):.2f}s\t{text}")
        raw.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
