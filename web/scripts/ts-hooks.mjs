/**
 * Node ESM yuklagich (faqat dev skriptlari uchun): `lib/*.ts` kodini skriptlardan to'g'ridan-to'g'ri
 * chaqirish — mavjud biznes mantiqini (do'kon yaratish, rollar, ombor) takrorlamaslik uchun.
 *   - `@/x` → web/x (tsconfig paths), kengaytmasiz import → .ts / .tsx / .js / index.ts;
 *   - .ts/.tsx → TypeScript `transpileModule` (faqat tip olib tashlanadi, tekshiruv yo'q);
 *   - .json → `export default` (import atributisiz).
 * Ulash: `import { register } from 'node:module'; register('./ts-hooks.mjs', import.meta.url);`
 */
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'];

function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

/** Fayl yo'li → mavjud fayl (kengaytma va index bilan) */
function probe(base) {
  if (isFile(base)) return base;
  for (const e of EXTS) if (isFile(base + e)) return base + e;
  for (const e of EXTS) if (isFile(path.join(base, 'index' + e))) return path.join(base, 'index' + e);
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let target = null;
  if (specifier.startsWith('@/')) target = path.join(ROOT, specifier.slice(2));
  else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const parent = fileURLToPath(context.parentURL);
    if (/\.(ts|tsx)$/.test(parent)) target = path.resolve(path.dirname(parent), specifier);
  }
  if (target) {
    const found = probe(target);
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    // CommonJS paket ichki yo'li (masalan `next/server`) — ESM kengaytmani o'zi qo'shmaydi
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && !specifier.startsWith('.') && !/\.[cm]?js$/.test(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw e;
  }
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && /\.(ts|tsx)$/.test(url)) {
    const file = fileURLToPath(url);
    const out = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        sourceMap: false,
      },
    });
    return { format: 'module', source: out.outputText, shortCircuit: true };
  }
  if (url.startsWith('file:') && url.endsWith('.json') && !context.importAttributes?.type) {
    return { format: 'module', source: `export default ${readFileSync(fileURLToPath(url), 'utf8')};`, shortCircuit: true };
  }
  return nextLoad(url, context);
}
