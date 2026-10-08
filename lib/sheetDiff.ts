/*
  SPOT THE CHANGES between two versions of a sheet.

  Both pages are drawn at the same size (unturned), compared pixel by pixel,
  and the differences grouped into a few boxes the Design Head can see at a
  glance. Boxes are fractions of the page, like review marks, so they sit on
  the same spot at any zoom or rotation.

  It finds where the ink moved, not what the change means: a moved shutter
  line and a new dimension both show as a box. A sheet whose size changed, or
  where most of the page differs, is reported as such rather than boxed.
*/

export interface ChangeBox { x: number; y: number; w: number; h: number }

export type SheetDiff =
  | { kind: 'boxes'; boxes: ChangeBox[] }
  | { kind: 'same' }
  | { kind: 'mostly' }
  | { kind: 'size' };

const lum = (d: Uint8ClampedArray, i: number) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;

export function diffSheets(
  a: { data: Uint8ClampedArray; width: number; height: number },
  b: { data: Uint8ClampedArray; width: number; height: number },
  opts: { maxBoxes?: number; threshold?: number } = {},
): SheetDiff {
  if (Math.abs(a.width - b.width) > 1 || Math.abs(a.height - b.height) > 1) return { kind: 'size' };
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const threshold = opts.threshold ?? 60;
  const cell = Math.max(4, Math.round(w / 90));
  const gw = Math.ceil(w / cell);
  const gh = Math.ceil(h / cell);
  const count = new Uint16Array(gw * gh);

  for (let y = 0; y < h; y++) {
    const ra = y * a.width * 4;
    const rb = y * b.width * 4;
    const gy = Math.floor(y / cell) * gw;
    for (let x = 0; x < w; x++) {
      if (Math.abs(lum(a.data, ra + x * 4) - lum(b.data, rb + x * 4)) > threshold) count[gy + Math.floor(x / cell)]++;
    }
  }

  /* A cell counts when a few of its pixels changed; a stray anti-aliased pixel does not. */
  const minHits = Math.max(2, Math.round(cell * cell * 0.02));
  const hot = new Uint8Array(gw * gh);
  let hotCells = 0;
  for (let i = 0; i < hot.length; i++) if (count[i] >= minHits) { hot[i] = 1; hotCells++; }
  if (!hotCells) return { kind: 'same' };
  if (hotCells > hot.length * 0.45) return { kind: 'mostly' };

  /* Grow each changed cell by one, so the parts of one change join into one box. */
  const grown = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    if (!hot[gy * gw + gx]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = gx + dx, ny = gy + dy;
      if (nx >= 0 && ny >= 0 && nx < gw && ny < gh) grown[ny * gw + nx] = 1;
    }
  }

  const seen = new Uint8Array(gw * gh);
  const boxes: (ChangeBox & { cells: number })[] = [];
  const stack: number[] = [];
  for (let start = 0; start < grown.length; start++) {
    if (!grown[start] || seen[start]) continue;
    let x0 = gw, y0 = gh, x1 = -1, y1 = -1, cells = 0;
    stack.push(start); seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const gx = i % gw, gy = (i - gx) / gw;
      if (hot[i]) cells++;
      x0 = Math.min(x0, gx); y0 = Math.min(y0, gy); x1 = Math.max(x1, gx); y1 = Math.max(y1, gy);
      for (const n of [i - 1, i + 1, i - gw, i + gw]) {
        if (n < 0 || n >= grown.length || seen[n] || !grown[n]) continue;
        if ((n === i - 1 && gx === 0) || (n === i + 1 && gx === gw - 1)) continue;
        seen[n] = 1; stack.push(n);
      }
    }
    if (!cells) continue;
    boxes.push({ x: (x0 * cell) / w, y: (y0 * cell) / h, w: Math.min(1, ((x1 + 1) * cell) / w) - (x0 * cell) / w, h: Math.min(1, ((y1 + 1) * cell) / h) - (y0 * cell) / h, cells });
  }

  const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
  const top = boxes.sort((p, q) => q.cells - p.cells).slice(0, opts.maxBoxes ?? 8)
    .sort((p, q) => p.y - q.y || p.x - q.x)
    .map(({ x, y, w: bw, h: bh }) => ({ x: round(x), y: round(y), w: round(bw), h: round(bh) }));
  return { kind: 'boxes', boxes: top };
}
