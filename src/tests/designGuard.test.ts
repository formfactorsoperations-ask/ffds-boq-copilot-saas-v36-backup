/*
  The design guard (DESIGN.md "Screen kit", standardisation PR 2).

  Counts four DESIGN.md rule breaks in every app file:
    halfPx      a half-pixel size, text-[12.5px]
    tinyPx      text under the scale, text-[6px] to text-[9px]
    offPalette  a Tailwind colour outside brand, slate, rose, amber and emerald
                (sky, blue, indigo, teal, purple, orange, green, gray...)
    mono        a font of its own: font-mono, font-['...'], fontFamily

  The counts on 16 Nov 2026 are in designGuard.baseline.json. A file may only
  go down. New files start at zero. So a screen can be cleaned up a piece at a
  time, and nothing new adds to the debt.

  After cleaning a file up, lower its numbers:
    UPDATE_DESIGN_BASELINE=1 npx vitest run src/tests/designGuard.test.ts

  Design Desk (components/drawingReview) keeps its own colours by the owner's
  choice, so its colours are not counted; the other rules still apply.
*/
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const BASELINE = path.join(__dirname, 'designGuard.baseline.json');

export const RULES = {
  halfPx: /\btext-\[\d+\.\d+px\]/g,
  tinyPx: /\btext-\[[6-9]px\]/g,
  offPalette: /\b(?:bg|text|border|from|to|via|ring|fill|stroke|shadow|outline|divide|placeholder|decoration|accent|caret)-(?:sky|blue|indigo|teal|cyan|purple|violet|fuchsia|pink|orange|lime|green|yellow|gray|zinc|neutral|stone)-\d{2,3}\b/g,
  mono: /\bfont-mono\b|\bfont-\['[^']+'\]|\bfontFamily\b/g,
} as const;
type Rule = keyof typeof RULES;
type Counts = Partial<Record<Rule, number>>;

const OWN_COLOURS = [`components${path.sep}drawingReview${path.sep}`];

function appFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(name) && !/\.test\.|\.d\.ts$/.test(name)) out.push(p);
    }
  };
  for (const d of ['components', 'pages']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
  out.push(path.join(ROOT, 'App.tsx'));
  return out.sort();
}

function count(file: string): Counts {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const c: Counts = {};
  for (const [rule, re] of Object.entries(RULES) as [Rule, RegExp][]) {
    if (rule === 'offPalette' && OWN_COLOURS.some((d) => rel.startsWith(d))) continue;
    const n = (src.match(re) || []).length;
    if (n) c[rule] = n;
  }
  return c;
}

/** Where a rule is broken in a file, for the failure message. */
function where(file: string, rule: Rule): string {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const hits: string[] = [];
  lines.forEach((l, i) => { if (l.match(new RegExp(RULES[rule].source))) hits.push(`${i + 1}: ${l.match(new RegExp(RULES[rule].source))![0]}`); });
  return hits.slice(0, 5).join(', ');
}

describe('design guard', () => {
  const now: Record<string, Counts> = {};
  for (const f of appFiles()) {
    const c = count(f);
    if (Object.keys(c).length) now[path.relative(ROOT, f).split(path.sep).join('/')] = c;
  }

  if (process.env.UPDATE_DESIGN_BASELINE) {
    fs.writeFileSync(BASELINE, JSON.stringify(now, null, 2) + '\n');
  }
  const base: Record<string, Counts> = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

  it('adds no new rule breaks to any file', () => {
    const worse: string[] = [];
    for (const [file, c] of Object.entries(now)) {
      for (const [rule, n] of Object.entries(c) as [Rule, number][]) {
        const allowed = base[file]?.[rule] || 0;
        if (n > allowed) worse.push(`${file}: ${rule} ${allowed} → ${n} (${where(path.join(ROOT, file), rule)})`);
      }
    }
    expect(worse, 'Use the screen kit (components/ui/kit) and the scale in DESIGN.md instead').toEqual([]);
  });

  it('has its baseline lowered when a file is cleaned up', () => {
    const better: string[] = [];
    for (const [file, c] of Object.entries(base)) {
      for (const [rule, n] of Object.entries(c) as [Rule, number][]) {
        const got = now[file]?.[rule] || 0;
        if (got < n) better.push(`${file}: ${rule} ${n} → ${got}`);
      }
    }
    expect(better, 'Run UPDATE_DESIGN_BASELINE=1 npx vitest run src/tests/designGuard.test.ts so these cannot creep back').toEqual([]);
  });

  it('keeps the screen kit itself clean', () => {
    expect(now['components/ui/kit.tsx']).toBeUndefined();
  });

  it('keeps the BOQ Playground at zero (PR 7): its screens and the Material specs it reads', () => {
    const dirty = Object.keys(now).filter(f => f.startsWith('components/playground/') || f.startsWith('components/materialSpecs/'));
    expect(dirty.map(f => `${f}: ${JSON.stringify(now[f])}`)).toEqual([]);
  });
});
