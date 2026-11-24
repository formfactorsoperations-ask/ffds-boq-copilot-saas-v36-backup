import React from 'react';

/**
 * HOME: THE STUDIO IN BLUEPRINT (DESIGN.md → "Home stories" → "The scene behind Home").
 *
 * A 3D room behind Home, drawn on one canvas: a floor grid that runs to the
 * horizon, a floor plan whose walls stand up out of it (doors swinging, a
 * stair), the five Home materials turning in the air as swatches, and dust in
 * the light. The camera sways on its own, leans towards the pointer and walks
 * into the plan as you scroll down the page.
 *
 * No 3D library: a pinhole camera and a few hundred lines are all it needs,
 * so nothing is added to the bundle or to package.json. The canvas sits under
 * Home's content, takes no pointer events and is hidden from screen readers.
 * It draws one still frame under prefers-reduced-motion, and stops drawing
 * when the tab is hidden or Home is scrolled out of view.
 *
 * Colours are Home's own materials only (components/home/homeStyles.ts):
 * indigo (the brand), periwinkle, navy, brass, rose and sage, at low strength
 * so the page stays milky white.
 */

type V3 = [number, number, number];
type Seg = { a: V3; b: V3; c: string; w: number; o: number };

const INDIGO = '61, 82, 160';
const PERI = '123, 147, 230';
const NAVY = '30, 42, 90';
const BRASS = '181, 148, 91';
const ROSE = '180, 67, 106';
const SAGE = '14, 124, 90';
const SWATCHES = [INDIGO, PERI, BRASS, ROSE, SAGE];

/** A small seeded random, so the room is the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const WALL_H = 3;

/** The floor plan: walls as [x1, z1, x2, z2] on the floor, in metres. */
const WALLS: [number, number, number, number][] = [
  // the outer shell
  [-16, 10, -3, 10], [1, 10, 16, 10], [16, 10, 16, 46], [16, 46, -16, 46], [-16, 46, -16, 10],
  // the studio floor, split into rooms
  [-16, 24, -6, 24], [-2, 24, 4, 24], [-4, 10, -4, 18], [-4, 21, -4, 34],
  [6, 24, 16, 24], [6, 24, 6, 30], [6, 33, 6, 46], [-16, 34, -9, 34], [-6, 34, 6, 34],
];

/** Doors: hinge, radius, start angle and sweep (radians), drawn as an arc and a leaf on the floor. */
const DOORS: [number, number, number, number, number][] = [
  [-3, 10, 4, 0, Math.PI / 2], [-6, 24, 4, Math.PI, -Math.PI / 2], [-4, 18, 3, -Math.PI / 2, Math.PI / 2],
  [6, 30, 3, Math.PI / 2, Math.PI / 2], [-9, 34, 3, 0, Math.PI / 2],
];

function buildRoom(): Seg[] {
  const out: Seg[] = [];
  // The floor grid: two metres a square, out to the horizon. Cut into short pieces so each
  // piece fades with its own distance (a long line would take the fog of its middle).
  const STEP = 6;
  for (let x = -40; x <= 40; x += 2) {
    const major = x % 10 === 0;
    for (let z = -10; z < 90; z += STEP) out.push({ a: [x, 0, z], b: [x, 0, z + STEP], c: INDIGO, w: major ? 1 : 0.6, o: major ? 0.2 : 0.1 });
  }
  for (let z = -10; z <= 90; z += 2) {
    const major = z % 10 === 0;
    for (let x = -40; x < 40; x += STEP) out.push({ a: [x, 0, z], b: [x + STEP, 0, z], c: INDIGO, w: major ? 1 : 0.6, o: major ? 0.2 : 0.1 });
  }
  // Walls: a foot and a head line, and an upright at each end.
  for (const [x1, z1, x2, z2] of WALLS) {
    out.push({ a: [x1, 0, z1], b: [x2, 0, z2], c: INDIGO, w: 1.6, o: 0.55 });
    out.push({ a: [x1, WALL_H, z1], b: [x2, WALL_H, z2], c: PERI, w: 1.1, o: 0.45 });
    out.push({ a: [x1, 0, z1], b: [x1, WALL_H, z1], c: PERI, w: 1, o: 0.28 });
    out.push({ a: [x2, 0, z2], b: [x2, WALL_H, z2], c: PERI, w: 1, o: 0.28 });
  }
  // Doors swinging open, in brass.
  for (const [hx, hz, r, a0, sweep] of DOORS) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t0 = a0 + (sweep * i) / n, t1 = a0 + (sweep * (i + 1)) / n;
      out.push({ a: [hx + r * Math.cos(t0), 0.01, hz + r * Math.sin(t0)], b: [hx + r * Math.cos(t1), 0.01, hz + r * Math.sin(t1)], c: BRASS, w: 1, o: 0.4 });
    }
    const te = a0 + sweep;
    out.push({ a: [hx, 0, hz], b: [hx + r * Math.cos(te), 0, hz + r * Math.sin(te)], c: BRASS, w: 1.4, o: 0.5 });
    out.push({ a: [hx + r * Math.cos(te), 0, hz + r * Math.sin(te)], b: [hx + r * Math.cos(te), 2.2, hz + r * Math.sin(te)], c: BRASS, w: 1, o: 0.32 });
  }
  // A stair climbing to a mezzanine at the back.
  for (let i = 0; i < 10; i++) {
    const y = i * 0.3, z = 36 + i * 0.9;
    out.push({ a: [9, y, z], b: [14, y, z], c: NAVY, w: 1, o: 0.3 });
    out.push({ a: [9, y + 0.3, z], b: [14, y + 0.3, z], c: NAVY, w: 1, o: 0.3 });
    out.push({ a: [9, y + 0.3, z], b: [9, y + 0.3, z + 0.9], c: NAVY, w: 1, o: 0.22 });
    out.push({ a: [14, y + 0.3, z], b: [14, y + 0.3, z + 0.9], c: NAVY, w: 1, o: 0.22 });
  }
  // Furniture as plain boxes: a long table, a sofa, a counter.
  const box = (x: number, z: number, w: number, d: number, h: number, c: string) => {
    const p: V3[] = [[x, 0, z], [x + w, 0, z], [x + w, 0, z + d], [x, 0, z + d]];
    for (let i = 0; i < 4; i++) {
      const a = p[i], b = p[(i + 1) % 4];
      out.push({ a, b, c, w: 1, o: 0.3 });
      out.push({ a: [a[0], h, a[2]], b: [b[0], h, b[2]], c, w: 1, o: 0.34 });
      out.push({ a, b: [a[0], h, a[2]], c, w: 0.8, o: 0.22 });
    }
  };
  box(-13, 14, 7, 2.4, 0.75, INDIGO);
  box(-12, 28, 5, 1.8, 0.8, ROSE);
  box(8, 14, 6, 1.2, 1, SAGE);
  box(-1, 38, 4, 4, 0.45, BRASS);
  return out;
}

type Swatch = { p: V3; s: number; rx: number; ry: number; vx: number; vy: number; c: string; bob: number };
type Mote = { p: V3; v: number; ph: number };

export default function HomeScene3D() {
  const box = React.useRef<HTMLDivElement | null>(null);
  const canvas = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const el = canvas.current, holder = box.current;
    if (!el || !holder) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    const still = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const small = window.matchMedia?.('(max-width: 767px)')?.matches ?? false;
    const rand = rng(704);
    const room = buildRoom();
    const swatches: Swatch[] = Array.from({ length: small ? 8 : 14 }, (_, i) => ({
      p: [-18 + rand() * 36, 1.2 + rand() * 4.5, 6 + rand() * 46],
      s: 0.7 + rand() * 0.9,
      rx: rand() * Math.PI * 2, ry: rand() * Math.PI * 2,
      vx: (rand() - 0.5) * 0.5, vy: (rand() - 0.5) * 0.6,
      c: SWATCHES[i % SWATCHES.length], bob: rand() * Math.PI * 2,
    }));
    const motes: Mote[] = Array.from({ length: small ? 60 : 140 }, () => ({
      p: [-24 + rand() * 48, rand() * 10, -2 + rand() * 60], v: 0.08 + rand() * 0.2, ph: rand() * Math.PI * 2,
    }));

    let W = 0, H = 0, dpr = 1;
    const size = () => {
      const r = el.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      el.width = Math.round(W * dpr); el.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    // The camera, eased towards where the pointer and the scroll want it.
    const cam = { x: 0, y: 5.5, z: -5, yaw: 0, pitch: -0.24 };
    const want = { px: 0, py: 0, depth: 0 };
    const ease = { px: 0, py: 0, depth: 0 };

    const NEAR = 0.4, FOG = 70;
    let f = 1, cx = 0, cy = 0, cyw = 1, syw = 0, cp = 1, sp = 0;
    const view = (p: V3): V3 => {
      const dx = p[0] - cam.x, dy = p[1] - cam.y, dz = p[2] - cam.z;
      const x1 = cyw * dx - syw * dz, z1 = syw * dx + cyw * dz;
      const y2 = cp * dy - sp * z1, z2 = sp * dy + cp * z1;
      return [x1, y2, z2];
    };
    const fog = (z: number) => Math.max(0, Math.min(1, 1 - (z - NEAR) / FOG));

    // Lines are gathered into one path per colour, width and strength (in steps of 0.02), then
    // stroked once each: a few dozen strokes a frame rather than one for every line.
    const batches = new Map<string, Path2D>();
    const line = (a: V3, b: V3, c: string, w: number, o: number) => {
      let A = view(a), B = view(b);
      if (A[2] < NEAR && B[2] < NEAR) return;
      // Clip to the near plane so lines that pass behind the camera still draw in front of it.
      if (A[2] < NEAR || B[2] < NEAR) {
        const t = (NEAR - A[2]) / (B[2] - A[2]);
        const P: V3 = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, NEAR];
        if (A[2] < NEAR) A = P; else B = P;
      }
      const alpha = Math.round(o * fog((A[2] + B[2]) / 2) * 50) / 50;
      if (alpha < 0.02) return;
      const key = `${c}|${w}|${alpha}`;
      let path = batches.get(key);
      if (!path) { path = new Path2D(); batches.set(key, path); }
      path.moveTo(cx + (f * A[0]) / A[2], cy - (f * A[1]) / A[2]);
      path.lineTo(cx + (f * B[0]) / B[2], cy - (f * B[1]) / B[2]);
    };
    const strokeAll = () => {
      for (const [key, path] of batches) {
        const [c, w, alpha] = key.split('|');
        ctx.strokeStyle = `rgba(${c}, ${alpha})`;
        ctx.lineWidth = Number(w);
        ctx.stroke(path);
      }
      batches.clear();
    };

    const draw = (t: number) => {
      const s = t / 1000;
      ease.px += (want.px - ease.px) * 0.05;
      ease.py += (want.py - ease.py) * 0.05;
      ease.depth += (want.depth - ease.depth) * 0.06;
      const sway = still ? 0 : Math.sin(s * 0.11) * 0.06;
      cam.x = ease.px * 2.4 + Math.sin(s * 0.07) * (still ? 0 : 1.2);
      cam.y = 5.5 - ease.depth * 1.5 - ease.py * 1.2;
      cam.z = -5 + ease.depth * 22;
      cam.yaw = sway + ease.px * 0.08;
      cam.pitch = -0.24 + ease.depth * 0.06 + ease.py * 0.04;
      cyw = Math.cos(-cam.yaw); syw = Math.sin(-cam.yaw);
      cp = Math.cos(cam.pitch); sp = Math.sin(cam.pitch);
      f = Math.max(W, H) * 0.62; cx = W / 2; cy = H * 0.45;

      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';

      for (const g of room) line(g.a, g.b, g.c, g.w, g.o);
      strokeAll();

      // The materials, turning in the air.
      for (const w of swatches) {
        const rx = w.rx + (still ? 0 : s * w.vx), ry = w.ry + (still ? 0 : s * w.vy);
        const yb = w.p[1] + (still ? 0 : Math.sin(s * 0.6 + w.bob) * 0.35);
        const h = w.s / 2;
        const corners: V3[] = [[-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0]].map(([x, y]) => {
          const y1 = y * Math.cos(rx), z1 = y * Math.sin(rx);
          const x2 = x * Math.cos(ry) + z1 * Math.sin(ry), z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
          return [w.p[0] + x2, yb + y1, w.p[2] + z2] as V3;
        });
        const pts = corners.map(view);
        if (pts.some((q) => q[2] < NEAR)) continue;
        // Fades as it drifts close, so no swatch fills the screen as the camera walks past it.
        const depth = (pts[0][2] + pts[2][2]) / 2, a = fog(depth) * Math.min(1, (depth - NEAR) / 8);
        if (a < 0.02) continue;
        // Brighter when it faces the camera, so the turn reads as a turn.
        const ux = pts[1][0] - pts[0][0], uy = pts[1][1] - pts[0][1], vx = pts[3][0] - pts[0][0], vy = pts[3][1] - pts[0][1];
        const facing = Math.min(1, Math.abs(ux * vy - uy * vx) / (w.s * w.s) * 1.2);
        ctx.beginPath();
        pts.forEach((q, i) => { const X = cx + (f * q[0]) / q[2], Y = cy - (f * q[1]) / q[2]; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
        ctx.closePath();
        ctx.fillStyle = `rgba(${w.c}, ${(a * (0.08 + facing * 0.16)).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${w.c}, ${(a * 0.45).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Dust in the light.
      for (const m of motes) {
        const y = still ? m.p[1] : (m.p[1] + s * m.v) % 10;
        const x = m.p[0] + (still ? 0 : Math.sin(s * 0.3 + m.ph) * 0.4);
        const q = view([x, y, m.p[2]]);
        if (q[2] < NEAR) continue;
        const a = fog(q[2]) * 0.4;
        const r = Math.max(0.6, Math.min(2.4, 14 / q[2]));
        ctx.fillStyle = `rgba(${m.ph > 4.5 ? BRASS : INDIGO}, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(cx + (f * q[0]) / q[2], cy - (f * q[1]) / q[2], r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // How far down Home the reader is, 0 at the top and 1 at the foot.
    const readScroll = () => {
      const r = holder.getBoundingClientRect();
      const run = Math.max(1, r.height - window.innerHeight);
      want.depth = Math.max(0, Math.min(1, -r.top / run));
    };

    if (still) {
      draw(0);
      const ro = new ResizeObserver(() => { size(); draw(0); });
      ro.observe(el);
      return () => ro.disconnect();
    }

    // Thirty frames a second is plenty for a room that drifts, and halves the work.
    let raf = 0, onScreen = true, last = -1e9;
    const loop = (t: number) => {
      raf = 0;
      if (!onScreen || document.hidden) return;
      if (t - last >= 32) { last = t; readScroll(); draw(t); }
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(loop); };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      want.px = e.clientX / window.innerWidth - 0.5;
      want.py = e.clientY / window.innerHeight - 0.5;
    };
    const io = new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; start(); });
    io.observe(holder);
    const ro = new ResizeObserver(() => size());
    ro.observe(el);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', start);
    start();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', start);
    };
  }, []);

  return (
    <div ref={box} aria-hidden className="absolute inset-0 -z-10 pointer-events-none">
      {/* Fixed to the window, so the room stays in view while Home scrolls past it. Sticky
          would not stick: the app shell's overflow-x-hidden makes it a scroll box that never scrolls.
          The top bar (Header, z-[100]) and the mobile bar (solid white) both sit above it. */}
      <canvas ref={canvas} className="fixed inset-0 block w-full h-full" />
    </div>
  );
}
