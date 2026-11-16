/*
  Every stylesheet a component imports must also be imported by src/index.css.

  The deploy build (build.js) bundles the app with esbuild, whose CSS output is
  dist/assets/index.css, and then writes dist/assets/index.css again from
  src/index.css with the Tailwind CLI. A stylesheet that only a component
  imports is lost in that second step: the project sidebar shipped with no
  styles at all on 16 Nov 2026 because components/projectNav/projectSidebar.css
  was imported by its component and not by src/index.css.
*/
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SKIP = new Set(['node_modules', 'dist', '.git', 'functions', 'zz_preview']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/* src/index.css and everything it @imports, all the way down. */
function reachable(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file) || !fs.existsSync(file)) return seen;
  seen.add(file);
  const css = fs.readFileSync(file, 'utf8');
  for (const m of css.matchAll(/@import\s+["']([^"']+\.css)["']/g)) reachable(path.resolve(path.dirname(file), m[1]), seen);
  return seen;
}

describe('stylesheets survive the deploy build', () => {
  it('every stylesheet imported in code is imported by src/index.css too', () => {
    const shipped = reachable(path.join(ROOT, 'src', 'index.css'));
    const missing: string[] = [];
    for (const file of walk(ROOT)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/import\s+["']([^"']+\.css)["']/g)) {
        if (!m[1].startsWith('.')) continue;
        const css = path.resolve(path.dirname(file), m[1]);
        if (!shipped.has(css)) missing.push(`${path.relative(ROOT, file)} → ${path.relative(ROOT, css)}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
