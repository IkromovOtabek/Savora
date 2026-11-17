// Savora brend geometriyasi (web/lib/brand.ts bilan bir xil) + ikonkalar (web/components/icons/Icon.tsx).
export const LOGO = {
  a: 'M165,6 L168,50 C136,61 111,73 99,87 C92,95 91,102 92,110 L130,156 L100,157 C58,157 16,146 10,114 C5,88 20,70 45,58 C80,41 120,25 165,6 Z',
  b: 'M91,116 Q91,103 104,103 C152,106 204,130 217,166 C230,204 214,248 180,269 C155,284 120,292 78,293 L42,273 L148,214 C153,205 153,188 145,174 C135,158 115,149 91,148 Z',
  bars: [
    'M26,221 Q26,212 35,212 L38.5,212 Q47.5,212 47.5,221 L47.5,261.2 L26,272.6 Z',
    'M58.5,205 Q58.5,196 67.5,196 L72,196 Q81,196 81,205 L81,243.5 L58.5,255.4 Z',
    'M91,188 Q91,179 100,179 L105,179 Q114,179 114,188 L114,226 L91,238.2 Z',
  ],
};

export const COLORS = {
  color: { a: ['#2CC3FF', '#1F86F7', '#1F5BE6'], b: ['#2AA2FF', '#2566F0', '#2238D6'], bars: ['#2BB6FF', '#1D5CE8'], shade: '#071457', shadeOp: 0.7 },
  mono: { a: ['#FFFFFF', '#F1F2F5', '#D9DCE3'], b: ['#FFFFFF', '#E8EAEF', '#C6CAD3'], bars: ['#FFFFFF', '#CFD3DB'], shade: '#0B2A8A', shadeOp: 0.45 },
};

const stops = (arr) => arr.map((col, i) => `<stop offset="${arr.length === 3 ? [0, 0.55, 1][i] : i}" stop-color="${col}"/>`).join('');

/** Mustaqil logo <svg> (HTML ichiga qo'yish uchun). id — sahifada bir nechta logo bo'lsa gradientlar to'qnashmasin. */
export function logoSvg({ h, variant = 'color', id = 'l', opacity = 1 }) {
  const c = COLORS[variant];
  const w = (h * 222) / 298;
  return `<svg width="${w}" height="${h}" viewBox="6 2 222 298" style="opacity:${opacity}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${id}a" x1="0" y1="0" x2=".35" y2="1">${stops(c.a)}</linearGradient>
    <linearGradient id="${id}b" x1=".15" y1="0" x2=".55" y2="1">${stops(c.b)}</linearGradient>
    <linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1">${stops(c.bars)}</linearGradient>
    <radialGradient id="${id}s" cx="92" cy="150" r="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.shade}" stop-opacity="${c.shadeOp}"/><stop offset="1" stop-color="${c.shade}" stop-opacity="0"/></radialGradient>
    <clipPath id="${id}k"><path d="${LOGO.a}"/></clipPath>
  </defs>
  <path d="${LOGO.a}" fill="url(#${id}a)"/><rect x="5" y="80" width="125" height="77" fill="url(#${id}s)" clip-path="url(#${id}k)"/>
  <path d="${LOGO.b}" fill="url(#${id}b)"/>
  ${LOGO.bars.map((d) => `<path d="${d}" fill="url(#${id}r)"/>`).join('')}
</svg>`;
}

/** 24×24 stroke ikonkalar */
export const ICONS = {
  nasiya: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  ombor: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  kassa: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M12.5 8v8M15 8v8M17 8v8"/>',
  ai: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>',
  darslar: '<rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/><path d="M10 11.5v6l5-3z"/>',
  tariflar: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><path d="M6 15h2M10 15h4"/>',
  ilova: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  fikrlar: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  aloqa: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  filial: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-5"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  telegram: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  excel: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13l4 5M12 13l-4 5"/>',
};

export function icon(name, { size = 48, stroke = 'currentColor', width = 2 } = {}) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}
