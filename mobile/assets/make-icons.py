#!/usr/bin/env python3
"""
Savora mobil ilova ikonkalarini brend logosidan (lib/brand.ts — web bilan bir xil shakl) yaratadi.
Qayta yaratish:  python3 assets/make-icons.py   (mobile/ papkasidan; Google Chrome kerak — SVG'ni chizadi)

Chiqish (1024×1024):
  icon.png                     tungi ko'k plitka + ko'k gradient logo (iOS burchakni o'zi kesadi)
  adaptive-icon.png            shaffof fon, logo markaziy 66% zonada (Android; fon — app.json backgroundColor)
  splash-icon.png              shaffof fon, logo
  android-icon-monochrome.png  oq logo (Android 13+ tematik ikonka)
"""
import os
import re
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
SRC = open(os.path.join(HERE, '..', 'lib', 'brand.ts'), encoding='utf-8').read()


def grab(name):
    return re.search(name + r": '([^']+)'", SRC).group(1)


A, B = grab('a'), grab('b')
BARS = re.findall(r"'(M[0-9.]+,[0-9.]+ Q[^']+)'", SRC.split('bars: [')[1].split(']')[0])
GRAD = '''
  <linearGradient id="la" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#2CC3FF"/><stop offset=".55" stop-color="#1F86F7"/><stop offset="1" stop-color="#1F5BE6"/></linearGradient>
  <linearGradient id="lb" x1=".15" y1="0" x2=".55" y2="1"><stop offset="0" stop-color="#2AA2FF"/><stop offset=".5" stop-color="#2566F0"/><stop offset="1" stop-color="#2238D6"/></linearGradient>
  <linearGradient id="lr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2BB6FF"/><stop offset="1" stop-color="#1D5CE8"/></linearGradient>
  <radialGradient id="ls" cx="92" cy="150" r="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#071457" stop-opacity=".7"/><stop offset="1" stop-color="#071457" stop-opacity="0"/></radialGradient>
  <linearGradient id="t" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#13254d"/><stop offset="1" stop-color="#0a1530"/></linearGradient>
  <clipPath id="lk"><path d="%s"/></clipPath>''' % A


def logo(h, mono=False):
    """1024 kanvas markazida balandligi h px bo'lgan logo."""
    w = h * 222 / 298
    if mono:
        body = ''.join('<path d="%s" fill="#fff"/>' % d for d in [A, B] + BARS)
    else:
        body = ('<path d="%s" fill="url(#la)"/><rect x="5" y="80" width="125" height="77" fill="url(#ls)" clip-path="url(#lk)"/>'
                '<path d="%s" fill="url(#lb)"/>' % (A, B)) + ''.join('<path d="%s" fill="url(#lr)"/>' % d for d in BARS)
    return '<svg x="%.1f" y="%.1f" width="%.1f" height="%.1f" viewBox="6 2 222 298">%s</svg>' % ((1024 - w) / 2, (1024 - h) / 2, w, h, body)


def render(name, inner):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs>%s</defs>%s</svg>' % (GRAD, inner)
    html = '<!doctype html><html><body style="margin:0;background:transparent">%s</body></html>' % svg
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, 'icon.html')
        open(page, 'w', encoding='utf-8').write(html)
        out = os.path.join(HERE, name)
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                        '--default-background-color=00000000', '--window-size=1024,1024', '--screenshot=' + out, 'file://' + page],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('✓', name)


render('icon.png', '<rect width="1024" height="1024" fill="url(#t)"/>' + logo(760))
render('adaptive-icon.png', logo(560))
render('splash-icon.png', logo(700))
render('android-icon-monochrome.png', logo(560, mono=True))
