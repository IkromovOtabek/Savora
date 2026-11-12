import localFont from 'next/font/local';

/**
 * Shriftlar loyiha ichida (app/fonts/*.woff2) — build Google Fonts'ga so'rov yubormaydi
 * (prod serverda Google noto'g'ri CSS qaytarib, next/font/google build'ni yiqitgan edi).
 * Fayllar va unicode-range'lar Google'ning subset'lari bilan bir xil — ilgari next/font/google shularni yuklardi.
 * next/font/local bitta chaqiruvda har faylga alohida unicode-range bermaydi, shuning uchun har subset —
 * alohida chaqiruv; globals.css (--font-sans) ularni ketma-ket ulaydi va brauzer har harf uchun kerakli faylni oladi.
 * Next.js shrift parametrlarida faqat literal qabul qiladi — unicode-range qatorlari shuning uchun takrorlangan.
 * Manba va litsenziya: app/fonts/README.md
 */

// Plus Jakarta Sans — asosiy shrift (geometrik, Gilroy uslubida), variable 400–800
const jakarta = localFont({
  src: './fonts/plus-jakarta-sans-latin.woff2',
  weight: '400 800',
  variable: '--font-jakarta',
  display: 'swap',
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }],
});
const jakartaExt = localFont({
  src: './fonts/plus-jakarta-sans-latin-ext.woff2',
  weight: '400 800',
  variable: '--font-jakarta-ext',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
});

// Onest — kirill harflari uchun (variable 100–900)
const onest = localFont({
  src: './fonts/onest-cyrillic.woff2',
  weight: '100 900',
  variable: '--font-onest',
  display: 'swap',
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' }],
});
const onestLatin = localFont({
  src: './fonts/onest-latin.woff2',
  weight: '100 900',
  variable: '--font-onest-latin',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }],
});

/** <html> klassi — barcha shrift o'zgaruvchilari (--font-jakarta, --font-jakarta-ext, --font-onest, --font-onest-latin) */
export const fontVariables = [jakarta, jakartaExt, onest, onestLatin].map((f) => f.variable).join(' ');
