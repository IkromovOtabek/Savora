# Reels uchun teleprompter + diktofon: jumla ekranda katta chiqadi, so'zlar o'qish tezligida yonadi,
# yozuv brauzerda (mikrofon) olinadi va loyiha papkasiga saqlanadi: <loyiha>/vo/jonli/lN.webm
# Ishlatish: python3 src/prompter/server.py savora-reel-03 [--port 3121]   (marketing/video dan)
# Faqat 127.0.0.1 da tinglaydi. Keyin: .venv/bin/python src/jonli_lines.py savora-reel-03
import json
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
proj = (Path.cwd() / sys.argv[1]).resolve()
port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 3121
out_dir = proj / "vo" / "jonli"
out_dir.mkdir(parents=True, exist_ok=True)
EXT = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav"}


def dur(p):
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                             capture_output=True, text=True, check=True).stdout
        return float(out.strip())
    except Exception:
        return None


def lines():
    cfg = json.loads((proj / "voice_slots.json").read_text(encoding="utf-8"))
    res = []
    for i, (start, max_len, text) in enumerate(cfg["slots"], 1):
        # tabiiy o'qish tezligi: TTS namunasi (vo/r0) bo'lsa — uning uzunligi, bo'lmasa so'z soniga qarab
        ref = proj / "vo" / "r0" / f"l{i}.wav"
        target = dur(ref) if ref.exists() else None
        if not target:
            target = min(max_len, 0.36 * len(text.split()) + 0.2)
        takes = sorted(out_dir.glob(f"l{i}.*"))
        takes = [t.name for t in takes if ".prev" not in t.name]
        res.append({"i": i, "text": text, "max": max_len, "limit": round(max_len * 1.15, 2),
                    "target": round(min(target, max_len), 2), "saved": takes[0] if takes else None})
    return res


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(HERE), **k)

    def log_message(self, fmt, *args):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api/lines":
            return self._json({"project": proj.name, "lines": lines()})
        if u.path.startswith("/jonli/"):
            name = Path(u.path).name
            f = out_dir / name
            if f.parent != out_dir or not f.exists():
                return self._json({"error": "topilmadi"}, 404)
            data = f.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "audio/webm" if f.suffix == ".webm" else "audio/mp4")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/api/save":
            return self._json({"error": "yo'q"}, 404)
        try:
            i = int(parse_qs(u.query).get("i", ["0"])[0])
        except ValueError:
            i = 0
        n = len(lines())
        if not 1 <= i <= n:
            return self._json({"error": "jumla raqami noto'g'ri"}, 400)
        ctype = (self.headers.get("Content-Type") or "audio/webm").split(";")[0].strip()
        ext = EXT.get(ctype, "webm")
        size = int(self.headers.get("Content-Length") or 0)
        if size <= 0 or size > 30_000_000:
            return self._json({"error": "fayl hajmi noto'g'ri"}, 400)
        data = self.rfile.read(size)
        for old in out_dir.glob(f"l{i}.*"):
            if ".prev" not in old.name:
                old.replace(out_dir / f"l{i}.prev{old.suffix}")
        f = out_dir / f"l{i}.{ext}"
        f.write_bytes(data)
        return self._json({"ok": True, "saved": f.name, "duration": dur(f)})


print(f"Teleprompter: http://127.0.0.1:{port}  (loyiha: {proj.name}, yozuvlar: {out_dir})", flush=True)
ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
