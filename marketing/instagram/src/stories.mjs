// Highlight uchun story kadrlari (1080×1920, JPEG — Instagram web story faqat JPEG qabul qiladi).
// Kadr o'rtasi (y≈600–1320) bo'sh: u yerda katta ikonka — highlight muqovasi shu joydan kesiladi.
// Ishga tushirish (repo ildizidan):  node marketing/instagram/src/stories.mjs [id ...]
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logoSvg, ICONS } from './brand.mjs';
import { STORIES } from './stories.data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(join(here, '../../../web/package.json'));
const sharp = require('sharp');
const outDir = join(root, 'stories');
const tmpDir = join(root, '.render');
const font = pathToFileURL(join(here, '../../../web/app/fonts/onest-latin.woff2')).href;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

function page(s) {
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><style>
@font-face{font-family:Onest;src:url('${font}') format('woff2');font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden}
body{font-family:Onest,system-ui,sans-serif;color:#fff;background:linear-gradient(165deg,#16295A 0%,#0C1736 50%,#081129 100%);position:relative;-webkit-font-smoothing:antialiased}
.top{position:absolute;left:84px;right:84px;top:110px}
.brand{display:flex;align-items:center;justify-content:space-between}
.brand .b{display:flex;align-items:center;gap:16px;font-weight:800;font-size:40px;letter-spacing:-.02em}
.eyebrow{font-size:24px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#4FD2FF;border:2px solid rgba(255,255,255,.14);padding:12px 22px;border-radius:999px}
h1{margin-top:64px;font-size:80px;line-height:1.04;font-weight:800;letter-spacing:-.035em}
h1 b{color:#4FD2FF}
.mid{position:absolute;left:50%;top:960px;transform:translate(-50%,-50%);width:620px;height:620px;border-radius:50%;
  background:radial-gradient(circle,rgba(31,134,247,.30) 0%,rgba(31,134,247,0) 68%);display:flex;align-items:center;justify-content:center}
.mid svg{width:400px;height:400px}
.bot{position:absolute;left:84px;right:84px;bottom:96px}
.rows{display:flex;flex-direction:column;gap:18px}
.row{display:flex;align-items:center;justify-content:space-between;gap:20px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.13);border-radius:28px;padding:26px 30px;font-size:34px;font-weight:600;line-height:1.25}
.row .v{flex:none;font-weight:800;color:#FFA800;font-variant-numeric:tabular-nums}
.row.hl{border-color:#4FD2FF}
.foot{margin-top:36px;display:flex;justify-content:space-between;align-items:center;font-size:30px;font-weight:700;color:rgba(255,255,255,.7)}
.foot .cta{background:#1A5FE0;color:#fff;padding:18px 30px;border-radius:999px}
</style></head><body>
<div class="top">
  <div class="brand"><div class="b">${logoSvg({ h: 60, variant: 'color', id: 'b' })}Savora</div><div class="eyebrow">${esc(s.eyebrow)}</div></div>
  <h1>${rich(s.title)}</h1>
</div>
<div class="mid"><svg viewBox="0 0 24 24" fill="none" stroke="url(#ig)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <defs><linearGradient id="ig" x1="2" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4FD2FF"/><stop offset=".55" stop-color="#2A98FA"/><stop offset="1" stop-color="#2F6BFF"/></linearGradient></defs>
  ${ICONS[s.icon]}</svg></div>
<div class="bot">
  <div class="rows">${s.rows.map((r) => `<div class="row${r.hl ? ' hl' : ''}"><span>${rich(r.t)}</span>${r.v ? `<span class="v">${esc(r.v)}</span>` : ''}</div>`).join('')}</div>
  <div class="foot"><span>savora.uz</span><span class="cta">${esc(s.cta || '14 kun bepul')} →</span></div>
</div>
</body></html>`;
}

const only = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });
for (const s of STORIES) {
  if (only.length && !only.includes(s.id)) continue;
  const html = join(tmpDir, `${s.id}.html`);
  const png = join(tmpDir, `${s.id}.png`);
  writeFileSync(html, page(s));
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1080,1920', '--force-device-scale-factor=1', `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore' });
  await sharp(png).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(join(outDir, `${s.id}.jpg`));
  console.log('✓', `stories/${s.id}.jpg`);
}
rmSync(tmpDir, { recursive: true, force: true });
