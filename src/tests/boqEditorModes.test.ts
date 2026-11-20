/*
  The BOQ Editor's four old modes are gone (BOQ Playground PR 7b): the Focus
  Editor, Excel, Cards and Plan Takeoff, with the studio's switch that brought
  them back. The BOQ Playground is every studio's BOQ Editor.

  What stays: the Excel view's grid, as the Sheet's full grid
  (components/StudioExcelGrid.tsx), and the plan takeoff in Brief & Site
  (components/TakeoffPanel.tsx, used by ProjectContextCard). Classic Digital,
  the proposal format, is not part of this.
*/
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const GONE = ['InteractiveBoqEditor', 'RoomCard', 'BoqItemCard', 'MarginDeviationIndicator'];

function appFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.') || name === 'dist' || name === 'functions') continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
    }
  };
  for (const d of ['components', 'pages', 'lib', 'hooks', 'contexts', 'services', 'src']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
  out.push(path.join(ROOT, 'App.tsx'));
  return out;
}

describe('the four old modes are gone (PR 7b)', () => {
  it('their components are deleted, and nothing imports them', () => {
    GONE.forEach(n => expect(fs.existsSync(path.join(ROOT, 'components', `${n}.tsx`)), n).toBe(false));
    const importers: string[] = [];
    for (const f of appFiles()) {
      const src = fs.readFileSync(f, 'utf8');
      for (const n of GONE) if (new RegExp(`from ['"][^'"]*/${n}['"]`).test(src)) importers.push(`${path.relative(ROOT, f)} → ${n}`);
    }
    expect(importers).toEqual([]);
  });

  it('the BOQ Editor has no mode switch and reads no studio switch', () => {
    const src = fs.readFileSync(path.join(ROOT, 'components/StudioDashboard.tsx'), 'utf8');
    expect(src).not.toMatch(/setViewMode|viewMode/);
    expect(src).not.toMatch(/TakeoffPanel/);
    expect(src).not.toMatch(/orgData[^;\n]*\.playground\b/);
    expect(src).toMatch(/<PlaygroundScreen/);
  });

  it('no screen reads the studio’s playground switch, and Studio settings no longer offers it', () => {
    const readers = appFiles().filter(f => !/\.test\./.test(f)).filter(f => /orgData[^;\n]*\)?\??\.playground\b/.test(fs.readFileSync(f, 'utf8')));
    expect(readers.map(f => path.relative(ROOT, f))).toEqual([]);
    expect(fs.readFileSync(path.join(ROOT, 'components/studio/StudioSettingsConsole.tsx'), 'utf8')).not.toMatch(/BOQ Playground preview/);
  });

  it('what stays: the full grid in the Sheet, and the takeoff in Brief & Site', () => {
    expect(fs.readFileSync(path.join(ROOT, 'components/StudioDashboard.tsx'), 'utf8')).toMatch(/import StudioExcelGrid from '\.\/StudioExcelGrid'/);
    expect(fs.readFileSync(path.join(ROOT, 'components/ProjectContextCard.tsx'), 'utf8')).toMatch(/import TakeoffPanel from '\.\/TakeoffPanel'/);
  });
});
