# ElevenLabs TTS (o'zbekcha: eleven_v3 / eleven_v4) — reels jumlalarini ovozlash.
# Kalit: ELEVENLABS_API_KEY muhit o'zgaruvchisi yoki marketing/video/.env ichida  ELEVENLABS_API_KEY=...
# Ishlatish (marketing/video dan):
#   .venv/bin/python src/tts_elevenlabs.py --ovozlar                        -> erkak ovozlari ro'yxati
#   .venv/bin/python src/tts_elevenlabs.py savora-reel-03 --namuna [N]       -> N ta erkak ovozida namuna: vo/eleven/namuna/*.mp3
#   .venv/bin/python src/tts_elevenlabs.py savora-reel-03 --voice <voice_id> -> 9 jumla: vo/eleven/lN.mp3
#   so'ng: .venv/bin/python src/jonli_lines.py savora-reel-03 --src vo/eleven --chain toza
# Ixtiyoriy: --model eleven_v3 (sukut) | eleven_v4; --stability 0.5
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.elevenlabs.io/v1"
ROOT = Path(__file__).resolve().parent.parent
args = sys.argv[1:]


def opt(name, default=None):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default


def api_key():
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("ELEVENLABS_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit(f"ELEVENLABS_API_KEY topilmadi: {env} fayliga  ELEVENLABS_API_KEY=...  qatorini yozing")
    return key


def call(method, path, key, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            out = r.read()
    except urllib.error.HTTPError as e:
        msg = e.read()[:400].decode(errors="replace")
        raise RuntimeError(f"ElevenLabs {e.code}: {msg}") from None
    return out if raw else json.loads(out)


def male_voices(key):
    """Hisobdagi (premade + qo'shilgan) erkak ovozlari; ommaviy kutubxona ovozlari API orqali avval qo'shilishi kerak."""
    vs = call("GET", "/voices", key)["voices"]
    res = []
    for v in vs:
        lab = {k.lower(): str(val).lower() for k, val in (v.get("labels") or {}).items()}
        if lab.get("gender") == "male":
            res.append({"id": v["voice_id"], "name": v["name"], "age": lab.get("age", ""), "accent": lab.get("accent", ""),
                        "use": lab.get("use_case", lab.get("use case", "")), "desc": lab.get("description", "")})
    # reklama/diktor ovozlari oldinda
    pref = ("narration", "narrative", "news", "advertisement", "informative", "social media")
    res.sort(key=lambda v: (0 if any(p in v["use"] for p in pref) else 1, v["age"] != "middle aged", v["name"]))
    return res


def tts(key, voice_id, text, out, model, stability):
    body = {"text": text, "model_id": model,
            "voice_settings": {"stability": stability, "similarity_boost": 0.8, "style": 0.0, "use_speaker_boost": True}}
    try:
        audio = call("POST", f"/text-to-speech/{voice_id}?output_format=mp3_44100_192", key, {**body, "language_code": "uz"}, raw=True)
    except RuntimeError as e:
        if "language" not in str(e).lower():
            raise
        audio = call("POST", f"/text-to-speech/{voice_id}?output_format=mp3_44100_192", key, body, raw=True)
    Path(out).write_bytes(audio)


def dur(p):
    o = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True).stdout.strip()
    return float(o) if o else 0.0


key = api_key()
model = opt("--model", "eleven_v3")
stability = float(opt("--stability", "0.5"))

if "--ovozlar" in args:
    for v in male_voices(key):
        print(f'{v["id"]}  {v["name"]:<14} {v["age"]:<12} {v["accent"]:<12} {v["use"]:<16} {v["desc"]}')
    sys.exit(0)

proj = ROOT / args[0]
lines = [l.strip() for l in (proj / "vo" / "lines.txt").read_text(encoding="utf-8").splitlines() if l.strip()]
out_dir = proj / "vo" / "eleven"

if "--namuna" in args:
    n = int(opt("--namuna", "8")) if opt("--namuna", "8").isdigit() else 8
    nd = out_dir / "namuna"
    nd.mkdir(parents=True, exist_ok=True)
    text = f"{lines[2]} {lines[3]}"  # «Savora esa sohangizga moslashadi. Telefon do'konida — IMEI va kafolat.»
    for v in male_voices(key)[:n]:
        safe = re.sub(r"[^A-Za-z0-9_-]", "", v["name"]) or v["id"]
        f = nd / f"{safe}.mp3"
        tts(key, v["id"], text, f, model, stability)
        print(f'{safe:<14} {dur(f):4.1f}s  {v["id"]}  {v["age"]} {v["use"]}')
    sys.exit(0)

voice = opt("--voice")
if not voice:
    sys.exit("--voice <voice_id> yoki --namuna yoki --ovozlar kerak")
out_dir.mkdir(parents=True, exist_ok=True)
for i, text in enumerate(lines, 1):
    f = out_dir / f"l{i}.mp3"
    tts(key, voice, text, f, model, stability)
    print(f"{i}\t{dur(f):.2f}s\t{text}")
(out_dir / "voice.txt").write_text(f"{voice} {model} stability={stability}\n")
