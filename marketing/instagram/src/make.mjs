// Instagram assetlari: profil rasmi (3 variant) + highlight muqovalari.
// Ishga tushirish (repo ildizidan):  node marketing/instagram/src/make.mjs
// Logo geometriyasi web/lib/brand.ts va web/public/icon-512.svg bilan bir xil.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(join(here, '../../../web/package.json'));
const sharp = require('sharp');

const LOGO = {
  a: 'M165,6 L168,50 C136,61 111,73 99,87 C92,95 91,102 92,110 L130,156 L100,157 C58,157 16,146 10,114 C5,88 20,70 45,58 C80,41 120,25 165,6 Z',
  b: 'M91,116 Q91,103 104,103 C152,106 204,130 217,166 C230,204 214,248 180,269 C155,284 120,292 78,293 L42,273 L148,214 C153,205 153,188 145,174 C135,158 115,149 91,148 Z',
  bars: [
    'M26,221 Q26,212 35,212 L38.5,212 Q47.5,212 47.5,221 L47.5,261.2 L26,272.6 Z',
    'M58.5,205 Q58.5,196 67.5,196 L72,196 Q81,196 81,205 L81,243.5 L58.5,255.4 Z',
    'M91,188 Q91,179 100,179 L105,179 Q114,179 114,188 L114,226 L91,238.2 Z',
  ],
};
const COLORS = {
  color: { a: ['#2CC3FF', '#1F86F7', '#1F5BE6'], b: ['#2AA2FF', '#2566F0', '#2238D6'], bars: ['#2BB6FF', '#1D5CE8'], shade: '#071457', shadeOp: 0.7 },
  mono: { a: ['#FFFFFF', '#F1F2F5', '#D9DCE3'], b: ['#FFFFFF', '#E8EAEF', '#C6CAD3'], bars: ['#FFFFFF', '#CFD3DB'], shade: '#0B2A8A', shadeOp: 0.45 },
};

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

// Ikonkalar — web/components/icons/Icon.tsx dan (24×24, stroke)
const ICONS = {
  nasiya: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  ombor: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  kassa: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M12.5 8v8M15 8v8M17 8v8"/>',
  ai: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>',
  darslar: '<rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/><path d="M10 11.5v6l5-3z"/>',
  tariflar: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><path d="M6 15h2M10 15h4"/>',
  ilova: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  fikrlar: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  aloqa: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
};

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
  ...Object.keys(ICONS).map((k, i) => [`highlights/${String(i + 1).padStart(2, '0')}-${k}.png`, cover(k)]),
];
for (const [file, svg] of jobs) {
  await sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 9 }).toFile(join(root, file));
  console.log('✓', file);
}
