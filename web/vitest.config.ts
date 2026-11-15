import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  // tsconfig jsx: preserve (Next) — testlarda .tsx komponentlarni render qilish uchun
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
