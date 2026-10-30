/**
 * The Expo web export loads the bundle as a classic <script>, where any
 * `import.meta` throws "Cannot use 'import.meta' outside a module" and the
 * whole web app renders blank. `zustand/middleware` (persist / devtools) is the
 * known source, so app code must not import it (see src/store/signup.ts).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|js|jsx)$/.test(n) ? [p] : [];
  });
}

describe('web bundle safety', () => {
  it('no app code imports zustand/middleware or uses import.meta', () => {
    const root = join(__dirname, '..');
    const offenders = [...files(join(root, 'app')), ...files(join(root, 'src'))].filter((f) => {
      const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      return /from\s+['"]zustand\/middleware['"]|import\.meta/.test(code);
    });
    expect(offenders).toEqual([]);
  });
});
