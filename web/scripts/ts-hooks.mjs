/**
 * Dev skriptlari uchun TypeScript yuklagich: `lib/*.ts` kodini skriptdan to'g'ridan-to'g'ri chaqirish —
 * mavjud biznes mantiqini (do'kon yaratish, rollar, restoran amallari) takrorlamaslik uchun.
 *   - `@/x` → web/x (tsconfig paths), kengaytmasiz nisbiy import → .ts / .tsx / .js / index.ts;
 *   - .ts/.tsx → TypeScript `transpileModule` → CommonJS (faqat tiplar olib tashlanadi, tekshiruv yo'q;
 *     CommonJS — mongoose kabi CJS paketlarning nomli eksportlari ishlashi uchun);
 *   - `next/server` kabi kengaytmasiz paket ichki yo'li → `.js`.
 * Node ≥ 22.15 (`module.registerHooks`, sinxron — `import` va `require` ikkalasiga ham).
 * Ishlatish: `import { registerTsHooks } from './ts-hooks.mjs'; registerTsHooks(); await import('../lib/x.ts')`.
 */
import { readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTS = ['.ts', '.tsx', '.js', '.json'];

function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

/** Fayl yo'li → mavjud fayl (kengaytma va index bilan) */
function probe(base) {
  if (isFile(base)) return base;
  for (const e of EXTS) if (isFile(base + e)) return base + e;
  for (const e of EXTS) if (isFile(path.join(base, `index${e}`))) return path.join(base, `index${e}`);
  return null;
}

function resolve(specifier, context, nextResolve) {
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
    return nextResolve(specifier, context);
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && !specifier.startsWith('.') && !/\.[cm]?js$/.test(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw e;
  }
}

function load(url, context, nextLoad) {
  if (url.startsWith('file:') && /\.(ts|tsx)$/.test(url)) {
    const file = fileURLToPath(url);
    const out = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        sourceMap: false,
      },
    });
    // __importStar faqat «o'z» xususiyatlarni ko'chiradi — mongoose kabi prototipdagi (ConnectionStates)
    // eksportlar yo'qoladi; o'rniga prototip zanjirini saqlaydigan yordamchi
    const source = out.outputText.replace('(this && this.__importStar) ||', 'globalThis.__savoraImportStar ||');
    return { format: 'commonjs', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}

globalThis.__savoraImportStar = (mod) => {
  if (mod && mod.__esModule) return mod;
  const ns = Object.create(mod && (typeof mod === 'object' || typeof mod === 'function') ? mod : null);
  Object.defineProperty(ns, 'default', { value: mod, enumerable: true });
  return ns;
};

let registered = false;
export function registerTsHooks() {
  if (registered) return;
  registered = true;
  registerHooks({ resolve, load });
}
