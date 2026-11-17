// Instagram assetlari: profil rasmi (3 variant) + highlight muqovalari.
// Ishga tushirish (repo ildizidan):  node marketing/instagram/src/make.mjs
// Logo geometriyasi web/lib/brand.ts va web/public/icon-512.svg bilan bir xil.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOGO, COLORS, ICONS } from './brand.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(join(here, '../../../web/package.json'));
const sharp = require('sharp');

/** Logo <svg> bo'lagi: (x, y) chap-yuqori, h — balandlik */
function logo(x, y, h, variant) {
  const c = COLORS[variant];
  const w = (h * 222) / 298;
  const stops = (arr) => arr.map((col, i) => `<stop offset="${arr.length === 3 ? [0, 0.55, 1][i] : i}" stop-color="${col}"/>`).join('');
  return `
  <defs>
    <linearGradient id="la" x1="0" y1="0" x2=".35" y2="1">${stops(c.a)}</linearGradient>
    <linearGradient id="lb" x1=".15" y1="0" x2=".55" y2="1">${stops(c.b)}</linearGradient>
    <linearGradient id="lr" x1="0" y1="0" x2="0" y2="1">${stops(c.bars)}</linearGradient>
    <radialGradient id="ls" cx="92" cy="150" r="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.shade}" stop-opacity="${c.shadeOp}"/><stop offset="1" stop-color="${c.shade}" stop-opacity="0"/></radialGradient>
    <clipPath id="lk"><path d="${LOGO.a}"/></clipPath>
  </defs>
  <svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="6 2 222 298">
    <path d="${LOGO.a}" fill="url(#la)"/><rect x="5" y="80" width="125" height="77" fill="url(#ls)" clip-path="url(#lk)"/>
    <path d="${LOGO.b}" fill="url(#lb)"/>
    ${LOGO.bars.map((d) => `<path d="${d}" fill="url(#lr)"/>`).join('')}
  </svg>`;
}

const BG = {
  tun: `<linearGradient id="bg" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#13254d"/><stop offset="1" stop-color="#0a1530"/></linearGradient>`,
  kun: `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F2F5FA"/></linearGradient>`,
  kok: `<linearGradient id="bg" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#3A86FF"/><stop offset=".55" stop-color="#1A5FE0"/><stop offset="1" stop-color="#1646C0"/></linearGradient>`,
};

function avatar(bg, variant) {
  const S = 1080, H = 610, W = (H * 222) / 298;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>${BG[bg]}</defs>
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  ${logo((S - W) / 2, (S - H) / 2, H, variant)}
</svg>`;
}

const HIGHLIGHTS = ['nasiya', 'ombor', 'kassa', 'ai', 'darslar', 'tariflar', 'ilova', 'fikrlar', 'aloqa'];

function cover(icon) {
  const W = 1080, H = 1920, size = 470, cx = W / 2, cy = H / 2;
  const k = size / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${BG.tun}
    <radialGradient id="glow" cx="${cx}" cy="${cy}" r="430" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1F86F7" stop-opacity=".26"/><stop offset="1" stop-color="#1F86F7" stop-opacity="0"/></radialGradient>
    <linearGradient id="ig" x1="2" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4FD2FF"/><stop offset=".55" stop-color="#2A98FA"/><stop offset="1" stop-color="#2F6BFF"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${cy}" r="430" fill="url(#glow)"/>
  <g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${k})" fill="none" stroke="url(#ig)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</g>
</svg>`;
}

mkdirSync(join(root, 'avatar'), { recursive: true });
mkdirSync(join(root, 'highlights'), { recursive: true });

const jobs = [
  ['avatar/avatar-tun.png', avatar('tun', 'color')],
  ['avatar/avatar-kun.png', avatar('kun', 'color')],
  ['avatar/avatar-kok.png', avatar('kok', 'mono')],
  ...HIGHLIGHTS.map((k, i) => [`highlights/${String(i + 1).padStart(2, '0')}-${k}.png`, cover(k)]),
];
for (const [file, svg] of jobs) {
  await sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 9 }).toFile(join(root, file));
  console.log('✓', file);
}
