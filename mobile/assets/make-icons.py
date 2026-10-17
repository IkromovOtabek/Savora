#!/usr/bin/env python3
"""
Savora mobil ilova ikonkalarini brend belgisidan (web/public/icon-512.svg) yaratadi.
Qayta yaratish:  python3 assets/make-icons.py   (mobile/ papkasidan; Pillow kerak)

Chiqish:
  icon.png            1024×1024, fon bilan, burchak yumaloqlanmagan (iOS o'zi kesadi)
  adaptive-icon.png   1024×1024, shaffof fon, belgi markaziy 66% zonada (Android)
  splash-icon.png     1024×1024, shaffof fon, belgi (expo-splash-screen)
  android-icon-monochrome.png  1024×1024, oq belgi (Android 13+ tematik ikonka)
"""
from PIL import Image, ImageDraw

OUT = __file__.rsplit('/', 1)[0]
S = 1024          # yakuniy o'lcham
SS = 4            # antialiasing uchun supersampling
W = S * SS
TOP, BOTTOM = (0x3A, 0x68, 0xC4), (0x17, 0x3F, 0x8F)   # SVG gradient
WHITE, GOLD = (255, 255, 255), (0xF0, 0xBF, 0x4C)


def gradient(size):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        col = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = col
    return img


def bezier(p0, p1, p2, p3, n=120):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def stroke(d, pts, r, color):
    """Yumaloq uchli silliq chiziq: egri bo'ylab zich doira shtamplari (Pillow line joint artefaktlarisiz)."""
    for cx, cy in pts:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (255,))

def draw_mark(img, scale, offset, bar_alpha=True):
    """Belgini SVG koordinatalarida (0..100) chizadi: scale — 1 birlik piksellarda, offset — (x, y)."""
    ox, oy = offset
    k = lambda v: v * scale  # noqa: E731
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    bars = [(20, 58, 24, 0.55), (40, 45, 37, 0.8), (60, 32, 50, 1.0)]
    for x, y, h, a in bars:
        alpha = round(255 * (a if bar_alpha else 1))
        d.rounded_rectangle([ox + k(x), oy + k(y), ox + k(x + 13), oy + k(y + h)], radius=k(6.5), fill=WHITE + (alpha,))
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    stroke(d, [(ox + k(x), oy + k(y)) for x, y in bezier((24, 46), (38, 28), (58, 20), (79, 21), n=600)], k(3.25), GOLD)
    r = k(6.5)
    cx, cy = ox + k(79), oy + k(21)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD + (255,))


def save(img, name):
    img.resize((S, S), Image.LANCZOS).save(f'{OUT}/{name}', optimize=True)
    print('✓', name)


# 1) iOS / umumiy ikonka — gradient fon, belgi 80% xavfsiz zonada (SVG kabi)
icon = gradient(W).convert('RGBA')
draw_mark(icon, scale=W * 0.8 / 100, offset=(W * 0.1, W * 0.1))
save(icon.convert('RGB'), 'icon.png')

# 2) Android adaptive — shaffof fon, belgi markaziy 66% doira ichida (xavfsiz zona)
adaptive = Image.new('RGBA', (W, W), (0, 0, 0, 0))
draw_mark(adaptive, scale=W * 0.56 / 100, offset=(W * 0.22, W * 0.22))
save(adaptive, 'adaptive-icon.png')

# 3) Splash — shaffof fon, belgi (fon rangi app.json'da)
splash = Image.new('RGBA', (W, W), (0, 0, 0, 0))
draw_mark(splash, scale=W * 0.7 / 100, offset=(W * 0.15, W * 0.15))
save(splash, 'splash-icon.png')

# 3b) Native splash uchun shaffof rasm — «Oltin nuqta» animatsiyasi bo'sh qorong'i fondan boshlanadi
#     (rasmsiz Android 12+ o'rniga ilova ikonkasini ko'rsatadi, shuning uchun shaffof rasm beriladi)
save(Image.new('RGBA', (W, W), (0, 0, 0, 0)), 'splash-blank.png')

# 4) Android monochrome — faqat oq silhouette
mono = Image.new('RGBA', (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(mono)
k = W * 0.56 / 100
ox = oy = W * 0.22
for x, y, h, _ in [(20, 58, 24, 0), (40, 45, 37, 0), (60, 32, 50, 0)]:
    d.rounded_rectangle([ox + x * k, oy + y * k, ox + (x + 13) * k, oy + (y + h) * k], radius=6.5 * k, fill=WHITE + (255,))
stroke(d, [(ox + x * k, oy + y * k) for x, y in bezier((24, 46), (38, 28), (58, 20), (79, 21), n=600)], 3.25 * k, WHITE)
d.ellipse([ox + (79 - 6.5) * k, oy + (21 - 6.5) * k, ox + (79 + 6.5) * k, oy + (21 + 6.5) * k], fill=WHITE + (255,))
save(mono, 'android-icon-monochrome.png')
