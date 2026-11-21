// Three.js ichidagi Math.random (faqat UUID uchun) — urug'li PRNG bilan almashtiriladi: render to'liq deterministik
export const __hfRandom = (function () { var a = 1234567; return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
