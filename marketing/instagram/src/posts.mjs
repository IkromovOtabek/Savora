// Instagram postlari: karusel slaydlari va rasmlar (1080×1350), reels muqovalari (1080×1920).
// HTML shablon → headless Chrome → PNG. Matnlar: src/posts.data.mjs (content-plan.md asosida).
// Ishga tushirish (repo ildizidan):  node marketing/instagram/src/posts.mjs [post-raqami ...]
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
  tun: { bg: 'linear-gradient(170deg,#13254D 0%,#0C1736 55%,#0A1530 100%)', ray: 'rgba(26,95,224,.32)', fg: '#FFFFFF', mute: 'rgba(255,255,255,.72)', accent: '#4FD2FF', card: 'rgba(255,255,255,.06)', line: 'rgba(255,255,255,.13)', logo: 'color', btn: '#1A5FE0', btnFg: '#FFFFFF' },
  kok: { bg: 'linear-gradient(135deg,#3A86FF 0%,#1F5BE6 55%,#1646C0 100%)', ray: 'rgba(44,195,255,.30)', fg: '#FFFFFF', mute: 'rgba(255,255,255,.82)', accent: '#FFFFFF', card: 'rgba(255,255,255,.12)', line: 'rgba(255,255,255,.24)', logo: 'mono', btn: '#FFFFFF', btnFg: '#1A5FE0' },
};
const GOLD = '#FFA800';
const ST = { ok: ["To'landi", '#12B76A', '#E7F8EF'], due: ['Bugun', '#C27C00', '#FFF4DE'], late: ['Kechikdi', '#F04438', '#FDECEA'], wait: ['Kutilmoqda', '#5B6478', '#EEF1F6'], in: ['Omborda', '#12B76A', '#E7F8EF'], sold: ['Sotilgan', '#5B6478', '#EEF1F6'], move: ['Filialga', '#1A5FE0', '#EAF1FF'] };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** **so'z** → urg'u rangi, ##so'z## → oltin, \n → yangi qator */
const rich = (s, accent) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, `<b style="color:${accent}">$1</b>`)
  .replace(/##(.+?)##/g, `<b style="color:${GOLD}">$1</b>`)
  .replace(/\n/g, '<br>');

const pill = (s, label) => `<span class="pill" style="color:${ST[s][1]};background:${ST[s][2]}">${esc(label || ST[s][0])}</span>`;
const demo = '<span class="demo">Demo ma\'lumot</span>';

function block(b, t) {
  switch (b.type) {
    case 'bullets':
      return `<ul class="bul">${b.items.map((it) => {
        const bad = it.icon === 'x';
        return `<li><span class="ic${bad ? ' bad' : ''}" style="color:${bad ? '#FFFFFF' : t.accent}">${icon(it.icon || 'check', { size: 40, width: 2.6 })}</span><span>${rich(it.text, t.accent)}</span></li>`;
      }).join('')}</ul>`;
    case 'chips':
      return `<div class="chips">${b.items.map((c) => `<span>${c.icon ? icon(c.icon, { size: 34, width: 2.2 }) : ''}${esc(c.text)}</span>`).join('')}</div>`;
    case 'num':
      return `<div class="num" style="color:${b.gold ? GOLD : t.accent}">${esc(b.value)}</div>`;
    case 'big':
      return `<div class="big"><div class="v" style="color:${b.gold ? GOLD : t.accent};font-size:${b.size || 230}px">${esc(b.value)}</div>${b.label ? `<div class="l">${rich(b.label, t.accent)}</div>` : ''}</div>`;
    case 'timeline':
      return `<div class="tl">${b.items.map((x, i) => `<div class="tn${i === b.items.length - 1 ? ' g' : ''}"><span>${i + 1}</span><b>${esc(x)}</b></div>`).join('<i></i>')}</div>`;
    case 'card': {
      // oq demo ekran kartasi: sarlavha + qatorlar (chap / summa / holat)
      return `<div class="card${b.tilt ? ' tilt' : ''}"><div class="ch"><span>${esc(b.title)}</span>${b.right ? `<span class="cr">${esc(b.right)}</span>` : ''}</div>
        ${b.rows.map((r) => `<div class="cr2"><span>${esc(r.l)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><span class="amt"${r.gold ? ` style="color:#C27C00"` : ''}>${esc(r.v || '')}</span>${r.s ? pill(r.s, r.st) : '<span></span>'}</div>`).join('')}
        ${b.total ? `<div class="ct"><span>${esc(b.total.l)}</span><b>${esc(b.total.v)}</b></div>` : ''}
        ${demo}</div>`;
    }
    case 'table':
      return `<div class="tbl"><div class="th"><span></span><span>Daftar / Excel</span><span>Savora</span></div>${b.rows.map((r) => `<div class="tr"><span>${esc(r)}</span><span class="no">${icon('x', { size: 34, width: 2.8 })}</span><span class="yes">${icon('check', { size: 34, width: 2.8 })}</span></div>`).join('')}</div>`;
    case 'cards3':
      return `<div class="c3">${b.items.map((c) => `<div class="c${c.hl ? ' hl' : ''}"><div class="h">${esc(c.t)}</div><div class="v"${c.gold ? ` style="color:${GOLD}"` : ''}>${esc(c.v)}</div><div class="d">${esc(c.d)}</div></div>`).join('')}</div>`;
    case 'grid2':
      return `<div class="g2">${b.items.map((c) => `<div><b${c.gold ? ` style="color:${GOLD}"` : ''}>${esc(c.v)}</b><span>${esc(c.l)}</span></div>`).join('')}</div>`;
    case 'tg':
      return `<div class="tg"><div class="tgh"><span class="av">${logoSvg({ h: 40, variant: 'mono', id: 'tg' })}</span><div><b>Savora</b><small>bot</small></div></div>
        <div class="msg">${b.lines.map((l) => `<p>${rich(l, '#0A1530')}</p>`).join('')}<time>${esc(b.time || '09:00')}</time></div>${demo}</div>`;
    case 'calendar':
      return `<div class="cal"><div class="rings"><i></i><i></i></div><div class="m">${esc(b.top)}</div><div class="y">${esc(b.big)}</div></div>`;
    case 'pq':
      return `<div class="pq">${block({ type: 'calendar', top: '1-YANVAR', big: '2027' }, t)}${block({ type: 'grid2', items: b.items }, t)}</div>`;
    case 'timer':
      return `<div class="timer"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="10"/><circle cx="100" cy="100" r="88" fill="none" stroke="${GOLD}" stroke-width="10" stroke-linecap="round" stroke-dasharray="553" stroke-dashoffset="70" transform="rotate(-90 100 100)"/></svg><b>${esc(b.value)}</b><span>${esc(b.label || 'daqiqa')}</span></div>`;
    case 'phone':
      return `<div class="phone-wrap">${(b.tags || []).map((g, i) => `<span class="ftag f${i}">${g.gold ? `<i style="background:${GOLD}"></i>` : '<i></i>'}${esc(g.t)}</span>`).join('')}
        <div class="phone"><div class="scr"><div class="ps">${esc(b.shop)}</div><div class="pl">Bugungi tushum</div><div class="pv">${esc(b.sum)} <small>so'm</small></div>
        ${b.rows.map((r) => `<div class="pr"><span>${esc(r.l)}<small>${esc(r.sub)}</small></span><b>${esc(r.v)}</b></div>`).join('')}<span class="demo d2">Demo ma'lumot</span></div></div></div>`;
    case 'daftar':
      return `<div class="daf"><div class="paper">${b.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>${block({ ...b.card, type: 'card' }, t)}</div>`;
    case 'cta':
      return `<div class="ctab"><div class="lg">${logoSvg({ h: 210, variant: t.logo, id: 'cta' })}</div><div class="bt" style="background:${t.btn};color:${t.btnFg}">Biodagi havola → savora.uz</div>${b.note ? `<div class="cn">${esc(b.note)}</div>` : ''}</div>`;
    case 'spacer':
      return `<div style="height:${b.h || 40}px"></div>`;
    default:
      throw new Error(`Noma'lum blok: ${b.type}`);
  }
}

function page(post, s, i, total) {
  const t = THEMES[post.theme];
  const H = post.type === 'reels' ? 1920 : 1350;
  const safe = post.type === 'reels' ? 285 : 0; // reels muqovasi to'rda markaziy 1350 px ko'rinadi
  const carousel = total > 1;
  const right = carousel && i === 0 ? '<span class="cta">Varaqlang →</span>'
    : carousel && i < total - 1 ? `<span class="cnt">${i + 1}/${total}</span>`
    : `<span class="cta">${esc(s.cta || '14 kun bepul')} →</span>`;
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><style>
@font-face{font-family:Onest;src:url('${font}') format('woff2');font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:${H}px;overflow:hidden}
body{font-family:Onest,system-ui,sans-serif;background:${t.bg};color:${t.fg};position:relative;-webkit-font-smoothing:antialiased}
.ray{position:absolute;width:1000px;height:1000px;border-radius:50%;right:-380px;top:-420px;background:radial-gradient(circle,${t.ray} 0%,transparent 66%)}
.wm{position:absolute;right:-150px;bottom:${safe - 80}px;opacity:${post.theme === 'kok' ? 0.08 : 0.07};transform:rotate(-8deg)}
.wrap{position:absolute;left:0;right:0;top:${safe}px;height:1350px;padding:84px 100px 72px;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:14px;font-weight:800;font-size:34px;letter-spacing:-.02em}
.eyebrow{font-size:22px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;background:rgba(255,255,255,.12);padding:12px 22px;border-radius:999px}
.main{flex:1;display:flex;flex-direction:column;justify-content:${s.align || 'center'};gap:${s.gap || 40}px;padding:34px 0}
h1{font-size:${s.titleSize || 84}px;line-height:1.04;font-weight:800;letter-spacing:-.035em}
.sub{font-size:${s.subSize || 34}px;line-height:1.32;color:${t.mute};font-weight:500}
.foot{display:flex;align-items:center;justify-content:space-between;border-top:2px solid ${t.line};padding-top:28px;font-size:28px;font-weight:700}
.foot .site{color:${t.mute}}
.foot .cta{background:${t.btn};color:${t.btnFg};padding:16px 28px;border-radius:999px}
.foot .cnt{color:${t.mute};font-variant-numeric:tabular-nums}
.note{font-size:22px;color:${t.mute};line-height:1.35}
.demo{font-size:18px;font-weight:600;color:#8A93A6;position:absolute;right:26px;bottom:16px}
.bul{list-style:none;display:flex;flex-direction:column;gap:24px}
.bul li{display:flex;gap:24px;align-items:center;font-size:38px;line-height:1.25;font-weight:600}
.bul .ic{flex:none;width:74px;height:74px;border-radius:22px;background:${t.card};border:1.5px solid ${t.line};display:flex;align-items:center;justify-content:center}
.bul .ic.bad{background:#F04438;border-color:#F04438}
.chips{display:flex;flex-wrap:wrap;gap:16px}
.chips span{display:inline-flex;align-items:center;gap:12px;font-size:30px;font-weight:600;padding:18px 26px;border-radius:999px;background:${t.card};border:1.5px solid ${t.line}}
.chips svg{color:${t.accent}}
.num{font-size:200px;line-height:.82;font-weight:900;letter-spacing:-.06em}
.big .v{line-height:.9;font-weight:900;letter-spacing:-.05em}
.big .l{font-size:40px;font-weight:700;margin-top:18px;line-height:1.2}
.tl{display:flex;align-items:flex-start}
.tl i{flex:1;height:3px;background:rgba(255,255,255,.55);margin-top:54px}
.tn{display:flex;flex-direction:column;align-items:center;gap:14px;width:120px}
.tn span{width:110px;height:110px;border-radius:50%;border:4px solid #fff;display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:800}
.tn.g span{border-color:${GOLD};background:${GOLD};color:#0A1530}
.tn b{font-size:28px;font-weight:700}
.card{position:relative;background:#fff;color:#0A1530;border-radius:34px;padding:30px 34px 44px;box-shadow:0 30px 80px rgba(5,12,40,.35)}
.card.tilt{transform:rotate(2deg)}
.card .ch{display:flex;justify-content:space-between;align-items:center;font-size:30px;font-weight:800;margin-bottom:8px}
.card .cr{font-size:24px;color:#5B6478;font-weight:700}
.card .cr2{display:grid;grid-template-columns:1.3fr 1fr auto;gap:14px;align-items:center;padding:18px 0;border-top:1.5px solid #EDF0F5;font-size:27px;font-weight:600}
.card .cr2 small{display:block;font-size:21px;color:#8A93A6;font-weight:500;margin-top:2px}
.card .amt{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.card .ct{display:flex;justify-content:space-between;padding-top:18px;border-top:2px solid #0A1530;font-size:29px;font-weight:700}
.card .ct b{color:#1A5FE0}
.pill{font-size:21px;font-weight:700;padding:8px 14px;border-radius:999px;text-align:center;white-space:nowrap}
.tbl{display:flex;flex-direction:column;border-radius:30px;overflow:hidden;border:2px solid ${t.line};background:${t.card}}
.tbl .th,.tbl .tr{display:grid;grid-template-columns:1fr 170px 150px;align-items:center;gap:10px;padding:24px 28px}
.tbl .th{font-size:23px;font-weight:700;letter-spacing:.04em;color:${t.mute};text-transform:uppercase}
.tbl .th span:nth-child(n+2),.tbl .no,.tbl .yes{text-align:center;display:flex;justify-content:center}
.tbl .tr{border-top:1.5px solid ${t.line};font-size:31px;font-weight:600;line-height:1.25}
.tbl .no svg,.tbl .yes svg{width:50px;height:50px;padding:9px;border-radius:50%;color:#fff}.tbl .no svg{background:#F04438}.tbl .yes svg{background:#12B76A}
.c3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;align-items:end}
.c3 .c{background:${t.card};border:2px solid ${t.line};border-radius:28px;padding:28px 22px;min-height:330px;display:flex;flex-direction:column;gap:14px}
.c3 .c.hl{border-color:#4FD2FF;background:rgba(79,210,255,.10);min-height:380px}
.c3 .h{font-size:24px;font-weight:700;color:${t.mute};line-height:1.25}
.c3 .v{font-size:36px;font-weight:900;letter-spacing:-.03em;line-height:1.05;margin-top:auto;white-space:nowrap}
.c3 .d{font-size:22px;color:${t.mute};line-height:1.3}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.g2 div{background:${t.card};border:2px solid ${t.line};border-radius:26px;padding:24px 26px}
.g2 b{display:block;font-size:54px;font-weight:900;letter-spacing:-.03em}
.g2 span{font-size:23px;color:${t.mute};font-weight:600}
.cal{width:300px;flex:none;background:#fff;color:#1A5FE0;border-radius:28px;padding:46px 20px 30px;text-align:center;position:relative;box-shadow:0 24px 60px rgba(5,12,40,.3)}
.cal .rings{position:absolute;top:-16px;left:0;right:0;display:flex;justify-content:space-around}
.cal .rings i{width:22px;height:44px;border-radius:12px;background:#0A1530}
.cal .m{font-size:34px;font-weight:800;letter-spacing:.06em}
.cal .y{font-size:96px;font-weight:900;letter-spacing:-.04em;line-height:1;color:#0A1530}
.pq{display:flex;gap:28px;align-items:center}.pq .g2{flex:1}.pq .g2 b{font-size:44px}
.tg{position:relative;background:#E8EEF6;border-radius:34px;padding:26px 26px 44px;color:#0A1530;box-shadow:0 30px 80px rgba(5,12,40,.35)}
.tgh{display:flex;align-items:center;gap:16px;margin-bottom:18px}
.tgh .av{width:64px;height:64px;border-radius:50%;background:#1A5FE0;display:flex;align-items:center;justify-content:center}
.tgh b{display:block;font-size:28px}.tgh small{font-size:20px;color:#5B6478}
.msg{background:#fff;border-radius:8px 28px 28px 28px;padding:26px 30px 20px;font-size:28px;line-height:1.45}
.msg p:first-child{font-weight:800;margin-bottom:10px}
.msg time{display:block;text-align:right;font-size:19px;color:#8A93A6;margin-top:6px}
.timer{position:relative;width:440px;height:440px;align-self:center}
.timer svg{position:absolute;inset:0}
.timer b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:150px;font-weight:900;letter-spacing:-.04em;padding-bottom:34px}
.timer span{position:absolute;left:0;right:0;bottom:118px;text-align:center;font-size:30px;font-weight:700;color:${t.mute}}
.phone-wrap{position:relative;align-self:center;width:620px;height:600px}
.phone{position:absolute;left:150px;top:0;width:320px;height:640px;border-radius:52px;background:#0A1530;border:10px solid #2A3550;box-shadow:0 40px 90px rgba(0,0,0,.45);overflow:hidden}
.scr{position:relative;height:100%;background:#F4F7FC;color:#0A1530;padding:46px 22px}
.ps{font-size:19px;font-weight:700;color:#5B6478}.pl{font-size:17px;color:#8A93A6;margin-top:14px}
.pv{font-size:36px;font-weight:900;letter-spacing:-.03em}.pv small{font-size:17px;color:#8A93A6}
.pr{display:flex;justify-content:space-between;align-items:center;background:#fff;border-radius:16px;padding:12px 14px;margin-top:12px;font-size:16px;font-weight:700}
.pr small{display:block;font-size:13px;color:#8A93A6;font-weight:500}
.pr b{font-size:15px;color:#1A5FE0}
.demo.d2{right:16px;bottom:12px;font-size:13px}
.ftag{position:absolute;display:inline-flex;align-items:center;gap:10px;background:#fff;color:#0A1530;font-size:26px;font-weight:800;padding:14px 22px;border-radius:999px;box-shadow:0 16px 40px rgba(5,12,40,.35);border:3px solid #4FD2FF;z-index:2}
.ftag i{width:14px;height:14px;border-radius:50%;background:#1A5FE0}
.ftag.f0{left:-10px;top:90px}.ftag.f1{right:-20px;top:250px}.ftag.f2{left:10px;top:420px}
.daf{position:relative;height:520px}
.paper{position:absolute;left:-10px;top:30px;width:520px;height:470px;transform:rotate(-7deg);background:#F5F1E6;border-radius:6px;padding:34px 30px;box-shadow:0 20px 50px rgba(0,0,0,.35);
  background-image:linear-gradient(rgba(26,95,224,.16) 1.5px,transparent 1.5px),linear-gradient(90deg,rgba(26,95,224,.16) 1.5px,transparent 1.5px);background-size:28px 28px;
  -webkit-mask-image:linear-gradient(135deg,#000 88%,transparent 88%)}
.paper p{font:italic 600 30px/1.75 'Snell Roundhand','Bradley Hand',cursive;color:rgba(30,40,80,.55);filter:blur(.6px)}
.daf .card{position:absolute;right:0;top:0;width:500px}
.ctab{display:flex;flex-direction:column;align-items:flex-start;gap:34px}
.ctab .bt{font-size:36px;font-weight:800;padding:24px 36px;border-radius:999px}
.ctab .cn{font-size:26px;color:${t.mute}}
</style></head><body>
<div class="ray"></div>
<div class="wm">${logoSvg({ h: 820, variant: t.logo, id: 'w' })}</div>
<div class="wrap">
  <div class="top"><div class="brand">${logoSvg({ h: 54, variant: t.logo, id: 'b' })}Savora</div>${s.eyebrow || post.eyebrow ? `<div class="eyebrow">${esc(s.eyebrow || post.eyebrow)}</div>` : ''}</div>
  <div class="main">
    ${(s.pre || []).map((b) => block(b, t)).join('\n')}
    ${s.title ? `<h1>${rich(s.title, t.accent)}</h1>` : ''}
    ${s.sub ? `<div class="sub">${rich(s.sub, t.accent)}</div>` : ''}
    ${(s.blocks || []).map((b) => block(b, t)).join('\n')}
    ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
  </div>
  <div class="foot"><span class="site">savora.uz</span>${right}</div>
</div>
</body></html>`;
}

const only = process.argv.slice(2);
mkdirSync(tmpDir, { recursive: true });
for (const post of POSTS) {
  if (only.length && !only.includes(String(post.n))) continue;
  const dir = join(outDir, `${post.n}-${post.slug}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const H = post.type === 'reels' ? 1920 : 1350;
  for (const [i, s] of post.slides.entries()) {
    const html = join(tmpDir, `${post.n}-${i}.html`);
    writeFileSync(html, page(post, s, i, post.slides.length));
    const name = post.type === 'reels' ? 'muqova.png' : `${String(i + 1).padStart(2, '0')}.png`;
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=1080,${H}`, '--force-device-scale-factor=1', `--screenshot=${join(dir, name)}`, pathToFileURL(html).href], { stdio: 'ignore' });
    if (post.type === 'reels') {
      // video hali yo'q bo'lsa — shu dizaynni oddiy 4:5 rasm post qilib joylash uchun
      writeFileSync(html, page({ ...post, type: 'image' }, s, 0, 1));
      execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--window-size=1080,1350', '--force-device-scale-factor=1', `--screenshot=${join(dir, 'rasm-varianti.png')}`, pathToFileURL(html).href], { stdio: 'ignore' });
    }
  }
  console.log('✓', `posts/${post.n}-${post.slug}/ (${post.slides.length})`);
}
rmSync(tmpDir, { recursive: true, force: true });
