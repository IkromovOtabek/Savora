// Reels №03 «Sohangizga moslashadi» — 3D sahna (Three.js). Har kadr faqat vaqt t dan chiziladi (render(t) sof funksiya).
// Yig'ish: npm run build3d  →  lib/stage3d.js (IIFE, window.SavoraStage)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { ICONS } from './icons.js';
import { LOGO } from './brand.js';

const W = 1080;
const H = 1920;

// ---------- yordamchilar
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = (a, b, x) => a + (b - a) * x;
const E = {
  p2io: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  p3io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  p2in: (x) => x * x,
  p3in: (x) => x * x * x,
  p2out: (x) => 1 - (1 - x) * (1 - x),
  p3out: (x) => 1 - Math.pow(1 - x, 3),
  expoOut: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
};
function springVal(tau, zeta, w) {
  if (tau <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * tau) * (Math.cos(wd * tau) + ((zeta * w) / wd) * Math.sin(wd * tau));
}
function wobble(tau, amp, zeta = 0.45, w = 20) {
  if (tau <= 0) return 0;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return amp * Math.exp(-zeta * w * tau) * Math.sin(wd * tau);
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- vaqt jadvali (HTML sahnalar bilan bir xil raqamlar — SPEC.md)
// [boshlanish, davomiylik, tebranish]; har biri kubni oldinga 90° ag'daradi
const TIPS = [
  [0.1, 0.28, 0.04], [0.42, 0.28, 0.04], [0.72, 0.28, 0.04], [1.0, 0.3, 0.04], [1.32, 0.32, 0.05], [1.68, 0.38, 0.1],
  [7.3, 0.46, 0.08], [9.7, 0.46, 0.08], [12.5, 0.46, 0.08], [14.8, 0.46, 0.08],
  [17.1, 0.3, 0.05], [17.45, 0.3, 0.05], [17.8, 0.3, 0.06],
];
// m-qadamda old yuzda turadigan ikonka
const SEQ = ['phone', 'pill', 'shirt', 'utensils', 'hammer', 'car', 'LOGO', 'phone', 'pill', 'shirt', 'utensils', 'hammer', 'car', 'sofa', 'store', 'store', 'store'];
// 14 yo'nalish — web/lib/businessTypes.ts tartibida
const ALL14 = ['store', 'phone', 'tv', 'sofa', 'shirt', 'basket', 'hammer', 'sparkles', 'pill', 'car', 'box', 'utensils', 'wrench', 'building'];

const T_BURST = 18.2;
const T_END = 21.2;
const LOGO_Y = 1.33;

// ---------- teksturalar
const TEX = 512;
function svgImage(inner) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${TEX}" height="${TEX}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return img.decode().then(() => img);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawLogo(ctx, size) {
  // lenta-S, viewBox 6 2 222 298 → markazda, balandligi size
  const s = size / 298;
  ctx.save();
  ctx.translate(TEX / 2 - (6 + 111) * s, TEX / 2 - (2 + 149) * s);
  ctx.scale(s, s);
  ctx.fillStyle = '#fff';
  for (const d of [LOGO.a, LOGO.b, ...LOGO.bars]) ctx.fill(new Path2D(d));
  ctx.restore();
}
function makeFace(img, kind) {
  // emissive: qora fon + oq ikonka; bump: o'rta kulrang + ariqcha + bo'rtma ikonka
  const em = document.createElement('canvas');
  em.width = em.height = TEX;
  const e = em.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, TEX, TEX);
  const bu = document.createElement('canvas');
  bu.width = bu.height = TEX;
  const b = bu.getContext('2d');
  b.fillStyle = '#808080';
  b.fillRect(0, 0, TEX, TEX);
  b.strokeStyle = '#3a3a3a';
  b.lineWidth = 7;
  roundRect(b, 44, 44, TEX - 88, TEX - 88, 70);
  b.stroke();
  const ICON = 300;
  if (kind === 'icon') {
    e.drawImage(img, (TEX - ICON) / 2, (TEX - ICON) / 2, ICON, ICON);
    b.filter = 'blur(3px)';
    b.drawImage(img, (TEX - ICON) / 2, (TEX - ICON) / 2, ICON, ICON);
    b.filter = 'none';
  } else if (kind === 'logo') {
    drawLogo(e, 300);
    b.filter = 'blur(3px)';
    drawLogo(b, 300);
    b.filter = 'none';
  }
  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  const emissive = mk(em, true);
  const bump = mk(bu, false);
  // orqa yuz (-z) uchun 180° burilgan nusxa
  const rot = (t) => {
    const c = t.clone();
    c.center.set(0.5, 0.5);
    c.rotation = Math.PI;
    c.needsUpdate = true;
    return c;
  };
  return { emissive, bump, emissiveR: rot(emissive), bumpR: rot(bump) };
}
function contactTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(16,32,80,0.55)');
  g.addColorStop(0.45, 'rgba(16,32,80,0.22)');
  g.addColorStop(1, 'rgba(16,32,80,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 3D logo (vertex rangli gradient — LOGO_COLORS.color)
const GRADS = {
  a: { p1: [0, 0], p2: [0.35, 1], stops: [[0, '#2CC3FF'], [0.55, '#1F86F7'], [1, '#1F5BE6']] },
  b: { p1: [0.15, 0], p2: [0.55, 1], stops: [[0, '#2AA2FF'], [0.5, '#2566F0'], [1, '#2238D6']] },
  bars: { p1: [0, 0], p2: [0, 1], stops: [[0, '#2BB6FF'], [1, '#1D5CE8']] },
};
function gradColor(g, u, v, out) {
  const dx = g.p2[0] - g.p1[0];
  const dy = g.p2[1] - g.p1[1];
  const k = clamp01(((u - g.p1[0]) * dx + (v - g.p1[1]) * dy) / (dx * dx + dy * dy));
  let i = 0;
  while (i < g.stops.length - 2 && k > g.stops[i + 1][0]) i++;
  const [k0, c0] = g.stops[i];
  const [k1, c1] = g.stops[i + 1];
  const a = new THREE.Color(c0);
  const b = new THREE.Color(c1);
  return out.copy(a).lerp(b, clamp01((k - k0) / (k1 - k0)));
}
function logoGroup() {
  const loader = new SVGLoader();
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 });
  const parts = [
    ['a', [LOGO.a]],
    ['b', [LOGO.b]],
    ['bars', LOGO.bars],
  ];
  const scale = 1.05 / 298;
  for (const [key, ds] of parts) {
    for (const d of ds) {
      const data = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
      const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
      const geo = new THREE.ExtrudeGeometry(shapes, { depth: 22, bevelEnabled: true, bevelThickness: 5, bevelSize: 3, bevelSegments: 4, curveSegments: 28 });
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      const cols = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const u = (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
        const v = (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
        gradColor(GRADS[key], u, v, c);
        if (Math.abs(nor.getZ(i)) < 0.6) c.multiplyScalar(0.62); // qalinlik — to'qroq yon devor
        cols[i * 3] = c.r;
        cols[i * 3 + 1] = c.g;
        cols[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.rotateX(Math.PI); // SVG y pastga → 3D y yuqoriga (aylanish, o'ralish tartibi saqlanadi)
      geo.translate(-(6 + 111), 2 + 149, 11);
      geo.scale(scale, scale, scale);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      group.add(mesh);
    }
  }
  return group;
}

// ---------- sahna
const S = {};

async function mount(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;

  const camera = new THREE.PerspectiveCamera(26, W / H, 0.1, 100);

  const key = new THREE.DirectionalLight(0xfff1e2, 2.3);
  key.position.set(-4, 7.5, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 });
  key.shadow.bias = -0.0004;
  key.shadow.radius = 14;
  key.shadow.blurSamples = 20;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 1.7);
  rim.position.set(5, 3, -5);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb7c5e2, 0.55));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.13 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const contactTex = contactTexture();
  const contact = (size) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.003;
    scene.add(m);
    return m;
  };

  // teksturalar
  const names = [...new Set([...SEQ.filter((n) => n !== 'LOGO'), ...ALL14])];
  const faces = {};
  await Promise.all(names.map((n) => svgImage(ICONS[n]).then((img) => (faces[n] = makeFace(img, 'icon')))));
  faces.LOGO = makeFace(null, 'logo');
  faces.blank = makeFace(null, 'blank');

  // asosiy kub
  const BLUE = new THREE.Color('#1F63E6');
  const GREY = new THREE.Color('#AEB4BF');
  const heroMats = Array.from({ length: 6 }, () =>
    new THREE.MeshPhysicalMaterial({
      color: BLUE.clone(), roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12,
      emissive: 0xffffff, emissiveMap: faces.blank.emissive, emissiveIntensity: 0.95,
      bumpMap: faces.blank.bump, bumpScale: 1.6,
    }),
  );
  const hero = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 6, 0.14), heroMats);
  hero.castShadow = true;
  const heroPivot = new THREE.Group();
  heroPivot.add(hero);
  scene.add(heroPivot);
  const heroContact = contact(1.9);

  // 14 kichik kub
  const smallGeo = new RoundedBoxGeometry(0.36, 0.36, 0.36, 4, 0.065);
  const sideMat = new THREE.MeshPhysicalMaterial({ color: BLUE.clone(), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, emissive: 0xffffff, emissiveMap: faces.blank.emissive, emissiveIntensity: 0.9, bumpMap: faces.blank.bump, bumpScale: 1.2 });
  const rnd = mulberry32(20261121);
  const rows = [4, 3, 4, 3];
  const small = [];
  let idx = 0;
  rows.forEach((n, r) => {
    for (let c = 0; c < n; c++) {
      const name = ALL14[idx];
      const front = sideMat.clone();
      front.emissiveMap = faces[name].emissive;
      front.bumpMap = faces[name].bump;
      const mesh = new THREE.Mesh(smallGeo, [sideMat, sideMat, sideMat, sideMat, front, sideMat]);
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      const a = rnd() * Math.PI * 2;
      const rad = 1.1 + rnd() * 0.7;
      small.push({
        mesh,
        slot: new THREE.Vector3((c - (n - 1) / 2) * 0.46, 1.1 + 0.69 - r * 0.46, 0),
        burst: new THREE.Vector3(Math.cos(a) * rad, 1.05 + Math.sin(a) * rad * 0.85, 0.9 + rnd() * 1.1),
        spin: new THREE.Vector3((rnd() - 0.5) * 9, (rnd() - 0.5) * 9, (rnd() - 0.5) * 9),
        order: idx,
        contact: contact(0.8),
      });
      idx++;
    }
  });

  const logo = logoGroup();
  logo.visible = false;
  scene.add(logo);
  const logoContact = contact(2.2);

  Object.assign(S, { renderer, scene, camera, key, floor, hero, heroPivot, heroMats, heroContact, faces, small, logo, logoContact, BLUE, GREY });
  renderer.compile(scene, camera);
  S.ready = true;
}

// ---------- kub holati t da
function heroState(t) {
  let kBase = 0;
  let wob = 0;
  let hop = 0;
  for (const [s, d, amp] of TIPS) {
    const x = seg(t, s, s + d);
    kBase += E.p2io(x);
    wob += wobble(t - (s + d), amp);
    if (x > 0 && x < 1) {
      const phi = E.p2io(x) * (Math.PI / 2);
      hop += (Math.SQRT1_2 * Math.sin(Math.PI / 4 + phi) - 0.5) + 0.05 * Math.sin(Math.PI * x);
    }
  }
  return { kBase, k: kBase + wob, hop };
}

const C4 = [4, 2, 5, 3]; // old, tepa, orqa, past (RoundedBoxGeometry guruh tartibi)
const tmpC = new THREE.Color();

function render(t) {
  if (!S.ready) return;
  const { camera, hero, heroPivot, heroMats, faces } = S;

  // --- kamera
  const pull = E.p2io(seg(t, 1.95, 2.85));
  let cz = lerp(7.6, 10.8, pull);
  let cy = lerp(1.55, 2.1, pull);
  let ly = lerp(0.2, -0.02, pull);
  cz = lerp(cz, 10.5, E.p2io(seg(t, 7.3, 17.1)));
  const pb = E.p2io(seg(t, T_BURST, T_BURST + 0.75));
  cz = lerp(cz, 12.6, pb);
  cy = lerp(cy, 2.5, pb);
  ly = lerp(ly, 0.08, pb);
  const pe = E.p2io(seg(t, T_END + 0.1, T_END + 0.9));
  cz = lerp(cz, 9.4, pe);
  cy = lerp(cy, 1.9, pe);
  ly = lerp(ly, 0.6, pe);
  camera.position.set(0, cy, cz);
  camera.lookAt(0, ly, 0);

  // --- asosiy kub
  const st = heroState(t);
  const kInt = Math.floor(st.kBase + 1e-4);
  for (let j = 0; j < 4; j++) {
    let m = kInt - 1 + ((((j - (kInt - 1)) % 4) + 4) % 4);
    m = Math.max(0, Math.min(SEQ.length - 1, m));
    // reveal aylanishida orqa yuz ham logo — keyingi sohalar oldindan ko'rinmasin
    const jBack = (((kInt + 2) % 4) + 4) % 4;
    const name = j === jBack && t > 4.8 && t < 6.3 ? 'LOGO' : SEQ[m];
    const f = faces[name];
    const g = C4[j];
    // orqa (-z) yuz va reveal'dagi teskari logo 180° burilgan nusxani oladi
    const back = (g === 5) !== (name === 'LOGO' && j === jBack && SEQ[m] !== 'LOGO');
    heroMats[g].emissiveMap = back ? f.emissiveR : f.emissive;
    heroMats[g].bumpMap = back ? f.bumpR : f.bump;
    heroMats[g].userData.isLogo = name === 'LOGO';
  }
  // kulrang shablon (2.4–4.95) va qaytish
  const grey = seg(t, 2.4, 2.75) * (1 - seg(t, 4.95, 5.35));
  tmpC.copy(S.BLUE).lerp(S.GREY, grey);
  const logoVis = seg(t, 5.15, 5.55);
  for (let g = 0; g < 6; g++) {
    const mat = heroMats[g];
    mat.color.copy(tmpC);
    mat.roughness = lerp(0.32, 0.55, grey);
    mat.clearcoat = lerp(1, 0.3, grey);
    const vis = mat.userData.isLogo ? logoVis : 1 - grey;
    mat.emissiveIntensity = (g === 0 || g === 1 ? 0.9 : 0.95) * vis;
    mat.bumpScale = g === 0 || g === 1 ? 1.6 : 1.6 * (mat.userData.isLogo ? logoVis : 1 - grey * 0.6);
  }
  if (!heroMats[0].userData.blankSet) {
    heroMats[0].emissiveMap = heroMats[1].emissiveMap = faces.blank.emissive;
    heroMats[0].bumpMap = heroMats[1].bumpMap = faces.blank.bump;
    heroMats[0].userData.blankSet = true;
  }
  // reveal: sakrash + 360° aylanish (5.0–5.72), qo'nishda siqilish
  const rx = seg(t, 5.0, 5.72);
  const revealHop = 4 * 0.95 * rx * (1 - rx);
  const revealSpin = Math.PI * 2 * E.p2io(rx);
  const squash = wobble(t - 5.72, 0.1, 0.5, 18) + wobble(t - 2.06, 0.05, 0.5, 18);
  // shablonda chiplar urilganda «yelka qisish»
  const shrug = wobble(t - 3.05, 0.05) + wobble(t - 3.55, 0.05) + wobble(t - 4.05, 0.06);

  // payoff: kub kattalashib, yorilib ketadi
  const ant = E.p2out(seg(t, T_BURST, T_BURST + 0.14));
  const pop = E.p3in(seg(t, T_BURST + 0.14, T_BURST + 0.24));
  const heroScale = (1 + 0.12 * ant) * (1 - pop);
  heroPivot.visible = heroScale > 0.002;

  const yaw = -0.46 + revealSpin;
  heroPivot.position.set(0, 0.5 + st.hop + revealHop + 0.12 * ant, 0);
  heroPivot.rotation.set(0, yaw, shrug);
  hero.rotation.set((st.k * Math.PI) / 2, 0, 0);
  heroPivot.scale.set(heroScale * (1 + squash * 0.5), heroScale * (1 - squash), heroScale * (1 + squash * 0.5));
  const lift = st.hop + revealHop;
  S.heroContact.visible = heroPivot.visible;
  S.heroContact.material.opacity = clamp01(1 - lift * 1.1) * (1 - pop);
  S.heroContact.scale.setScalar(1 + lift * 0.6);

  // --- 14 kub
  for (const c of S.small) {
    const { mesh, slot, burst, spin, order } = c;
    const tb0 = T_BURST + 0.2;
    const tb1 = tb0 + 0.24;
    const ts = tb1 + 0.05 * order;
    const te = T_END + 0.03 * (13 - order);
    let vis = t >= tb0 && t < te + 0.42;
    const pos = new THREE.Vector3();
    let sc = 1;
    let rotAmt = 1;
    if (t < tb1) {
      const x = E.p3out(seg(t, tb0, tb1));
      pos.set(0, 0.6, 0).lerp(burst, x);
      sc = lerp(0.25, 1, x);
    } else if (t < te) {
      const x = E.expoOut(seg(t, ts, ts + 0.62));
      pos.copy(burst).lerp(slot, x);
      rotAmt = 1 - x;
    } else {
      const x = E.p3in(seg(t, te, te + 0.42));
      pos.copy(slot).lerp(new THREE.Vector3(0, LOGO_Y, 0.2), x);
      sc = lerp(1, 0.2, x);
      rotAmt = 0;
      if (x >= 1) vis = false;
    }
    const settle = wobble(t - (ts + 0.3), 0.08, 0.45, 16);
    mesh.visible = vis;
    mesh.position.copy(pos);
    mesh.scale.setScalar(sc);
    mesh.rotation.set(spin.x * rotAmt + settle, -0.22 + spin.y * rotAmt, spin.z * rotAmt);
    c.contact.visible = false; // kublar havoda — kontakt soya yo'q
  }

  // --- 3D logo
  const tl0 = T_END + 0.32;
  const lv = t >= tl0;
  S.logo.visible = lv;
  S.logoContact.visible = lv;
  if (lv) {
    const sp = springVal(t - tl0, 0.62, 9);
    const rs = springVal(t - tl0, 0.72, 7.5);
    S.logo.scale.setScalar(lerp(0.5, 1, sp));
    S.logo.position.set(0, LOGO_Y + 0.1 * (1 - sp), 0);
    S.logo.rotation.set(0.06 * (1 - rs), -1.75 * (1 - rs), 0);
    S.logoContact.visible = false; // logo havoda turadi
  }
  // kalit nuri asta suriladi — yaltiroq logodan o'tadi (obyekt emas, yorug'lik harakatlanadi)
  const sweep = E.p2io(seg(t, T_END + 1.2, T_END + 5.2));
  S.key.position.set(lerp(-4, 3.5, sweep), 7.5, 6);
  // payoff va end card'da pol soyasi so'nadi (havodagi devor va logo ostida dog' qolmasin)
  // kub sakraganda pol soyasi xiralashadi
  S.floor.material.opacity = 0.13 * (1 - seg(t, T_BURST + 0.1, T_BURST + 0.6)) * clamp01(1 - lift * 1.4);

  S.renderer.render(S.scene, camera);
}

function project(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(S.camera);
  return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
}

window.SavoraStage = { mount, render, project, state: S };
