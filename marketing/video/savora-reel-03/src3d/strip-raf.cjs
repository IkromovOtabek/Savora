// Three.js setAnimationLoop (ishlatilmaydi) ichidagi rAF nomlarini o'chiradi — vaqt faqat hf-seek dan keladi
const fs = require('fs');
const f = 'lib/stage3d.js';
let s = fs.readFileSync(f, 'utf8');
s = s.replace(/requestAnimationFrame/g, '__hfNoRaf').replace(/cancelAnimationFrame/g, '__hfNoCaf');
fs.writeFileSync(f, s);
console.log('rAF:', (s.match(/AnimationFrame/g) || []).length, 'Math.random:', (s.match(/Math\.random/g) || []).length);
