// Instagram to'ri uchun postlar (1080×1350, 3:4) — HTML shablon → headless Chrome → PNG.
// Ishga tushirish (repo ildizidan):  node marketing/instagram/src/posts.mjs [id ...]
// Matnlar: src/posts.data.mjs. Shrift: web/app/fonts/onest-latin.woff2 (SIL OFL).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logoSvg, icon } from './brand.mjs';
import { POSTS } from './posts.data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'posts');
const tmpDir = join(root, '.render');
const font = pathToFileURL(join(here, '../../../web/app/fonts/onest-latin.woff2')).href;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const THEMES = {
  tun: { bg: 'linear-gradient(160deg,#16295A 0%,#0C1736 55%,#081129 100%)', fg: '#FFFFFF', mute: 'rgba(255,255,255,.66)', accent: '#4FD2FF', card: 'rgba(255,255,255,.06)', line: 'rgba(255,255,255,.12)', logo: 'color' },
  kok: { bg: 'linear-gradient(160deg,#3A86FF 0%,#1A5FE0 50%,#1440B0 100%)', fg: '#FFFFFF', mute: 'rgba(255,255,255,.78)', accent: '#FFFFFF', card: 'rgba(255,255,255,.12)', line: 'rgba(255,255,255,.22)', logo: 'mono' },
  oq: { bg: 'linear-gradient(170deg,#FFFFFF 0%,#EEF3FB 100%)', fg: '#0A1530', mute: 'rgba(10,21,48,.62)', accent: '#1A5FE0', card: '#FFFFFF', line: 'rgba(10,21,48,.10)', logo: 'color' },
};
const GOLD = '#FFA800';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** **so'z** → urg'u rangida */
const rich = (s, color) => esc(s).replace(/\*\*(.+?)\*\*/g, `<b style="color:${color}">$1</b>`).replace(/\n/g, '<br>');

function block(b, t) {
  switch (b.type) {
    case 'bullets':
      return `<ul class="bul">${b.items.map((it) => `<li><span class="ic" style="color:${t.accent}">${icon(it.icon || 'check', { size: 40, width: 2.2 })}</span><span>${rich(it.text, t.accent)}</span></li>`).join('')}</ul>`;
    case 'steps':
      return `<ol class="steps">${b.items.map((it, i) => `<li><span class="n" style="background:${t.accent};color:${t.fg === '#FFFFFF' && t.accent === '#FFFFFF' ? '#1A5FE0' : '#fff'}">${i + 1}</span><div><b>${esc(it.title)}</b><span>${esc(it.text)}</span></div></li>`).join('')}</ol>`;
    case 'compare':
      return `<div class="cmp">
        <div class="col bad"><div class="h">${icon('x', { size: 34, width: 2.6 })}${esc(b.left.title)}</div>${b.left.items.map((x) => `<p>${esc(x)}</p>`).join('')}</div>
        <div class="col good" style="border-color:${t.accent}"><div class="h" style="color:${t.accent}">${icon('check', { size: 34, width: 2.6 })}${esc(b.right.title)}</div>${b.right.items.map((x) => `<p>${esc(x)}</p>`).join('')}</div>
      </div>`;
    case 'big':
      return `<div class="big"><div class="v" style="color:${b.gold ? GOLD : t.accent}">${esc(b.value)}</div><div class="l">${rich(b.label, t.accent)}</div></div>`;
    case 'chips':
      return `<div class="chips">${b.items.map((c) => `<span>${c.icon ? icon(c.icon, { size: 34, width: 2.2 }) : ''}${esc(c.text)}</span>`).join('')}</div>`;
    case 'schedule':
      // nasiya jadvali kartasi (misol): oylar va holat
      return `<div class="sch"><div class="sh"><span>${esc(b.title)}</span><span class="tag">${esc(b.tag || 'Misol')}</span></div>${b.rows
        .map((r) => `<div class="row"><span>${esc(r.m)}</span><span class="amt">${esc(r.sum)}</span><span class="st st-${r.s}">${{ ok: "To'landi", due: 'Bugun', late: 'Kechikdi', wait: 'Kutilmoqda' }[r.s]}</span></div>`)
        .join('')}</div>`;
    default:
      return '';
  }
}

function page(p) {
  const t = THEMES[p.theme];
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><style>
@font-face{font-family:Onest;src:url('${font}') format('woff2');font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:Onest,system-ui,sans-serif;background:${t.bg};color:${t.fg};position:relative;-webkit-font-smoothing:antialiased}
.wm{position:absolute;right:-120px;bottom:-60px;opacity:${p.theme === 'oq' ? 0.07 : 0.1};transform:rotate(-8deg)}
.glow{position:absolute;width:900px;height:900px;border-radius:50%;left:-260px;top:-300px;background:radial-gradient(circle,${p.theme === 'oq' ? 'rgba(26,95,224,.10)' : 'rgba(79,210,255,.18)'} 0%,transparent 65%)}
.wrap{position:absolute;inset:0;padding:84px 88px 76px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:16px;font-weight:800;font-size:38px;letter-spacing:-.02em}
.eyebrow{font-size:24px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${t.accent};border:2px solid ${t.line};padding:12px 22px;border-radius:999px}
.main{flex:1;display:flex;flex-direction:column;justify-content:${p.align || 'center'};gap:44px;padding:40px 0}
h1{font-size:${p.titleSize || 92}px;line-height:1.02;font-weight:800;letter-spacing:-.035em}
h1 b{color:${t.accent}}
.sub{font-size:36px;line-height:1.3;color:${t.mute};font-weight:500;max-width:860px}
.bul{list-style:none;display:flex;flex-direction:column;gap:26px}
.bul li{display:flex;gap:22px;align-items:flex-start;font-size:36px;line-height:1.25;font-weight:600}
.bul .ic{flex:none;width:64px;height:64px;border-radius:18px;background:${t.card};border:1.5px solid ${t.line};display:flex;align-items:center;justify-content:center}
.steps{list-style:none;display:flex;flex-direction:column;gap:22px}
.steps li{display:flex;gap:26px;align-items:center;background:${t.card};border:1.5px solid ${t.line};border-radius:28px;padding:26px 30px}
.steps .n{flex:none;width:68px;height:68px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:34px}
.steps b{display:block;font-size:36px;font-weight:700;letter-spacing:-.01em}
.steps span{display:block;font-size:27px;color:${t.mute};margin-top:4px}
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.cmp .col{border-radius:30px;padding:32px 30px;background:${t.card};border:2px solid ${t.line}}
.cmp .h{display:flex;align-items:center;gap:12px;font-size:32px;font-weight:800;margin-bottom:18px}
.cmp .bad .h{color:#F04438}
.cmp p{font-size:28px;line-height:1.3;padding:14px 0;border-top:1.5px solid ${t.line};font-weight:500}
.big .v{font-size:250px;line-height:.9;font-weight:900;letter-spacing:-.05em}
.big .l{font-size:44px;font-weight:700;margin-top:18px;line-height:1.2}
.chips{display:flex;flex-wrap:wrap;gap:16px}
.chips span{display:inline-flex;align-items:center;gap:12px;font-size:30px;font-weight:600;padding:18px 26px;border-radius:999px;background:${t.card};border:1.5px solid ${t.line}}
.chips svg{color:${t.accent}}
.sch{background:${p.theme === 'oq' ? '#fff' : 'rgba(255,255,255,.96)'};color:#0A1530;border-radius:34px;padding:34px 36px;box-shadow:0 30px 80px rgba(5,12,40,.35)}
.sch .sh{display:flex;justify-content:space-between;align-items:center;font-size:32px;font-weight:800;margin-bottom:14px}
.sch .tag{font-size:22px;font-weight:700;color:#1A5FE0;background:#EAF1FF;padding:8px 16px;border-radius:999px}
.sch .row{display:grid;grid-template-columns:1.1fr 1fr auto;gap:16px;align-items:center;padding:20px 0;border-top:1.5px solid #EDF0F5;font-size:29px;font-weight:600}
.sch .amt{font-variant-numeric:tabular-nums;color:#0A1530}
.sch .st{font-size:23px;font-weight:700;padding:9px 16px;border-radius:999px;text-align:center}
.st-ok{background:#E7F8EF;color:#12B76A}.st-due{background:#FFF4DE;color:#C27C00}.st-late{background:#FDECEA;color:#F04438}.st-wait{background:#EEF1F6;color:#5B6478}
.foot{display:flex;align-items:center;justify-content:space-between;border-top:2px solid ${t.line};padding-top:30px;font-size:30px;font-weight:700}
.foot .cta{display:inline-flex;align-items:center;gap:12px;background:${p.theme === 'kok' ? '#FFFFFF' : '#1A5FE0'};color:${p.theme === 'kok' ? '#1A5FE0' : '#FFFFFF'};padding:18px 30px;border-radius:999px}
.foot .site{color:${t.mute}}
.note{font-size:22px;color:${t.mute};margin-top:-20px}
</style></head><body>
<div class="glow"></div>
<div class="wm">${logoSvg({ h: 760, variant: t.logo, id: 'w' })}</div>
<div class="wrap">
  <div class="top"><div class="brand">${logoSvg({ h: 58, variant: t.logo, id: 'b' })}Savora</div>${p.eyebrow ? `<div class="eyebrow">${esc(p.eyebrow)}</div>` : ''}</div>
  <div class="main">
    ${p.title ? `<h1>${rich(p.title, t.accent)}</h1>` : ''}
    ${p.sub ? `<div class="sub">${rich(p.sub, t.accent)}</div>` : ''}
    ${(p.blocks || []).map((b) => block(b, t)).join('\n')}
    ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
  </div>
  <div class="foot"><span class="site">savora.uz</span><span class="cta">${esc(p.cta || '14 kun bepul')} →</span></div>
</div>
</body></html>`;
}

const only = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });
for (const p of POSTS) {
  if (only.length && !only.includes(p.id)) continue;
  const html = join(tmpDir, `${p.id}.html`);
  writeFileSync(html, page(p));
  const png = join(outDir, `${p.id}.png`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1080,1350', '--force-device-scale-factor=1', `--screenshot=${png}`, pathToFileURL(html).href], { stdio: 'ignore' });
  console.log('✓', `posts/${p.id}.png`);
}
rmSync(tmpDir, { recursive: true, force: true });
