import * as THREE from 'three';
import type { ConversationId } from '../../lib/projectConversations';

/*
  THE MAQUETTE (owner, 27 Nov 2026: "3D shapes should be related to the
  conversation we are on, related to interior and architecture practice").

  Each conversation has its own small architectural model, built like a
  studio maquette: matte white "card" pieces with the brand blue drawn along
  their edges, and one or two pieces in the conversation's tint. When a
  conversation opens, its model assembles piece by piece, dropping into
  place; while it is open it turns gently and one part of it moves (a door
  swings, a crane turns, coins flip, a step lights up).

    whole   a room cut open: sofa, rug, table, pendant lamp, a plant
    chat    an arched doorway, its door swinging, two speech bubbles
    money   coin stacks rising like a payment schedule, one coin flipping
    boq     a material sample fan, a tile grid, a stack of planks
    docs    a stack of drawings with a blueprint lifting, rolls, a set square
    design  a lounge chair and ottoman on a turning plinth, an arc lamp
    site    a tower crane turning over a frame going up, bricks, a cone
    plan    a staircase of milestones, a ball hopping up to the flag
    brief   a contoured site, a house on its plateau, a tree, a north arrow

  Palette only: slate for the card, brand blue for the lines, and emerald,
  amber and rose for the accents (DESIGN.md colours).

  Pure three.js, no React: ConversationsBackdrop loads this module lazily, so
  it costs nothing until the Conversations view is open.
*/

export const PALETTE = {
  card: 0xf8fafc, // slate-50
  card2: 0xf1f5f9, // slate-100
  slate200: 0xe2e8f0,
  slate300: 0xcbd5e1,
  slate400: 0x94a3b8,
  slate500: 0x64748b,
  brand: 0x3d52a0,
  emerald: 0x10b981,
  amber: 0xf59e0b,
  rose: 0xf43f5e,
} as const;

/** The conversation's tint (glows and the model's accent). */
export const TINT: Record<ConversationId, number> = {
  whole: PALETTE.brand, chat: PALETTE.brand, money: PALETTE.amber, boq: PALETTE.brand, docs: PALETTE.brand,
  design: PALETTE.rose, site: PALETTE.amber, plan: PALETTE.brand, brief: PALETTE.emerald,
};

export interface Model {
  group: THREE.Group;
  /** The pieces, in the order they drop into place. */
  parts: THREE.Object3D[];
  /** Moves the model's own part; t in seconds. */
  tick: (t: number) => void;
}

/* ───────────── building blocks ───────────── */

const mats = new Map<string, THREE.Material>();
function mat(color: number, opts: { opacity?: number; emissive?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}-${opts.opacity ?? 1}-${opts.emissive ?? 0}`;
  let m = mats.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: 0.82, metalness: 0,
      transparent: opts.opacity !== undefined, opacity: opts.opacity ?? 1,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissive ? 0.6 : 0,
    });
    mats.set(key, m);
  }
  return m;
}
const lineMat = new THREE.LineBasicMaterial({ color: PALETTE.brand, transparent: true, opacity: 0.5 });

/** A piece of card: a mesh with its edges drawn in brand blue. */
function piece(geo: THREE.BufferGeometry, color: number, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], opts: { edges?: boolean; opacity?: number; emissive?: number } = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, opts.emissive !== undefined || opts.opacity !== undefined ? mat(color, opts).clone() : mat(color));
  m.position.set(...at);
  m.rotation.set(...rot);
  if (opts.edges !== false) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), lineMat));
  return m;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 28) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** A group that drops in as one piece. */
function unit(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  return g;
}

function model(parts: THREE.Object3D[], tick: (t: number) => void = () => {}): Model {
  const group = new THREE.Group();
  parts.forEach((p) => group.add(p));
  return { group, parts, tick };
}

const slab = (w: number, d: number, color: number = PALETTE.card2) => piece(box(w, 0.1, d), color, [0, -0.05, 0]);

/* ───────────── the models ───────────── */

function room(tint: number): Model {
  const lamp = unit(
    piece(cyl(0.008, 0.008, 0.62, 6), PALETTE.slate500, [0, -0.31, 0], [0, 0, 0], { edges: false }),
    piece(new THREE.ConeGeometry(0.24, 0.22, 28, 1, true), tint, [0, -0.7, 0]),
    piece(new THREE.SphereGeometry(0.06, 16, 12), PALETTE.amber, [0, -0.76, 0], [0, 0, 0], { edges: false, emissive: PALETTE.amber }),
  );
  lamp.position.set(0.2, 1.62, 0.25);
  const plant = unit(
    piece(cyl(0.13, 0.1, 0.24), PALETTE.slate200, [0, 0.12, 0]),
    piece(new THREE.IcosahedronGeometry(0.24, 0), PALETTE.emerald, [0, 0.46, 0]),
    piece(new THREE.IcosahedronGeometry(0.15, 0), PALETTE.emerald, [0.12, 0.66, 0.04]),
  );
  plant.position.set(1.05, 0, -0.95);
  const sofa = unit(
    piece(box(1.3, 0.24, 0.52), PALETTE.card, [0, 0.2, 0]),
    piece(box(1.3, 0.42, 0.14), PALETTE.card, [0, 0.45, -0.2]),
    piece(box(0.14, 0.34, 0.52), PALETTE.card, [-0.72, 0.25, 0]),
    piece(box(0.14, 0.34, 0.52), PALETTE.card, [0.72, 0.25, 0]),
    piece(box(0.3, 0.26, 0.08), tint, [-0.3, 0.42, -0.1], [-0.2, 0.15, 0]),
  );
  sofa.position.set(-0.25, 0, -0.85);
  const table = unit(
    piece(cyl(0.3, 0.3, 0.05, 32), PALETTE.card, [0, 0.32, 0]),
    piece(cyl(0.04, 0.08, 0.3, 12), PALETTE.slate300, [0, 0.15, 0]),
  );
  table.position.set(0.2, 0, 0.25);
  return model([
    slab(3, 3),
    piece(box(3, 1.7, 0.1), PALETTE.card, [0, 0.85, -1.45]),
    piece(box(0.1, 1.7, 2.9), PALETTE.card, [-1.45, 0.85, 0.05]),
    piece(box(0.9, 0.62, 0.04), PALETTE.brand, [0.55, 1.0, -1.39], [0, 0, 0], { opacity: 0.25 }),
    piece(box(1.7, 0.02, 1.2), tint, [0.15, 0.01, 0.15], [0, 0, 0], { opacity: 0.55 }),
    sofa, table, plant, lamp,
  ], (t) => { lamp.rotation.z = Math.sin(t * 1.3) * 0.12; lamp.rotation.x = Math.cos(t * 0.9) * 0.06; });
}

function doorway(tint: number): Model {
  const door = unit(piece(box(1.02, 1.56, 0.05), tint, [0.51, 0.78, 0], [0, 0, 0], { opacity: 0.85 }));
  door.position.set(-0.51, 0, 0);
  const arch = piece(new THREE.TorusGeometry(0.6, 0.08, 10, 36, Math.PI), PALETTE.card, [0, 1.6, 0]);
  const bubble = (color: number, at: [number, number, number], s = 1) => {
    const g = unit(
      piece(new THREE.CapsuleGeometry(0.16 * s, 0.26 * s, 6, 16), color, [0, 0, 0], [0, 0, Math.PI / 2]),
      piece(new THREE.ConeGeometry(0.07 * s, 0.14 * s, 12), color, [-0.18 * s, -0.16 * s, 0], [0, 0, Math.PI * 0.85]),
    );
    g.position.set(...at);
    return g;
  };
  const b1 = bubble(PALETTE.card, [1.05, 1.9, 0.2]);
  const b2 = bubble(tint, [1.45, 1.35, 0.1], 0.8);
  return model([
    slab(2.8, 1.8),
    piece(box(0.16, 1.6, 0.22), PALETTE.card, [-0.6, 0.8, 0]),
    piece(box(0.16, 1.6, 0.22), PALETTE.card, [0.6, 0.8, 0]),
    arch,
    piece(box(1.04, 0.04, 0.22), PALETTE.slate200, [0, 0.02, 0]),
    door,
    piece(box(0.9, 0.02, 0.5), PALETTE.rose, [0, 0.02, 0.55], [0, 0, 0], { opacity: 0.6 }),
    b1, b2,
  ], (t) => {
    door.rotation.y = -Math.pow(Math.sin(t * 0.7), 2) * 1.2;
    b1.position.y = 1.9 + Math.sin(t * 1.6) * 0.06;
    b2.position.y = 1.35 + Math.sin(t * 1.6 + 1.4) * 0.06;
  });
}

function coins(): Model {
  const coin = () => cyl(0.2, 0.2, 0.05, 32);
  const stacks: THREE.Object3D[] = [];
  const heights = [3, 5, 7, 9, 12];
  heights.forEach((n, i) => {
    const g = new THREE.Group();
    const paid = i < 2;
    for (let k = 0; k < n; k++) g.add(piece(coin(), paid ? PALETTE.amber : PALETTE.card, [0, 0.03 + k * 0.056, 0], [0, 0, 0], { edges: k === n - 1 || k % 3 === 0 }));
    g.position.set(-1.0 + i * 0.5, 0, (i % 2) * 0.18 - 0.09);
    stacks.push(g);
  });
  const flip = piece(coin(), PALETTE.amber, [1.0, 1.15, -0.09]);
  return model([slab(2.8, 1.3), ...stacks, flip], (t) => {
    flip.rotation.x = t * 3.2;
    flip.position.y = 1.0 + Math.abs(Math.sin(t * 1.6)) * 0.35;
  });
}

function samples(tint: number): Model {
  const fan = new THREE.Group();
  const colors = [PALETTE.card, PALETTE.slate200, PALETTE.amber, PALETTE.emerald, tint, PALETTE.rose];
  const blades = colors.map((c, i) => {
    const pivot = new THREE.Group();
    pivot.add(piece(box(0.95, 0.03, 0.26), c, [0.42, i * 0.032, 0]));
    fan.add(pivot);
    return pivot;
  });
  fan.position.set(-0.75, 0.02, 0.35);
  const tiles: THREE.Object3D[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    tiles.push(piece(box(0.28, 0.05, 0.28), (r + c) % 2 ? PALETTE.slate300 : PALETTE.card, [0.55 + c * 0.3, 0.025, -0.15 + r * 0.3]));
  }
  const planks = [0, 1, 2, 3].map((k) => piece(box(1.1, 0.07, 0.2), k % 2 ? PALETTE.amber : PALETTE.card, [-0.4 + k * 0.03, 0.035 + k * 0.072, -0.65], [0, 0.08 * k, 0]));
  return model([slab(2.8, 1.8), ...tiles, ...planks, fan], (t) => {
    const open = (Math.sin(t * 0.8) + 1) / 2;
    blades.forEach((b, i) => { b.rotation.y = -i * 0.22 * open; });
  });
}

function drawings(tint: number): Model {
  const sheets = [0, 1, 2, 3, 4].map((k) => piece(box(1.2, 0.012, 0.85), k === 4 ? PALETTE.card : PALETTE.card2, [-0.25 + k * 0.02, 0.01 + k * 0.014, 0.05 - k * 0.015], [0, (k - 2) * 0.05, 0]));
  const blue = new THREE.Group();
  const top = piece(box(1.2, 0.012, 0.85), tint, [0.6, 0, 0], [0, 0, 0], { opacity: 0.9 });
  blue.add(top);
  const grid: number[] = [];
  for (let i = 1; i < 6; i++) grid.push(i * 0.2, 0.008, -0.42, i * 0.2, 0.008, 0.42);
  for (let i = 1; i < 4; i++) grid.push(0, 0.008, -0.42 + i * 0.21, 1.2, 0.008, -0.42 + i * 0.21);
  const gl = new THREE.BufferGeometry();
  gl.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
  blue.add(new THREE.LineSegments(gl, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })));
  blue.position.set(-0.85, 0.09, 0.0);
  const roll = (color: number, at: [number, number, number]) => piece(cyl(0.08, 0.08, 1.05, 24), color, at, [0, 0.3, Math.PI / 2]);
  const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.7, 0), new THREE.Vector2(0, 0.45)]);
  tri.holes.push(new THREE.Path([new THREE.Vector2(0.12, 0.08), new THREE.Vector2(0.4, 0.08), new THREE.Vector2(0.12, 0.26)]));
  const square = piece(new THREE.ExtrudeGeometry(tri, { depth: 0.02, bevelEnabled: false }), PALETTE.rose, [0.55, 0.12, 0.45], [-Math.PI / 2, 0, 0.4], { opacity: 0.75 });
  return model([
    slab(2.8, 1.8), ...sheets, blue,
    roll(PALETTE.card, [0.75, 0.08, -0.45]), roll(tint, [0.95, 0.08, -0.3]), roll(PALETTE.slate300, [0.86, 0.22, -0.38]),
    square,
  ], (t) => {
    const lift = Math.max(0, Math.sin(t * 0.7));
    blue.rotation.z = lift * 0.55;
    blue.position.y = 0.09 + lift * 0.05;
  });
}

function chair(tint: number): Model {
  const plinth = piece(cyl(1.35, 1.35, 0.1, 64), PALETTE.card2, [0, -0.05, 0]);
  const seat = unit(
    piece(box(0.68, 0.09, 0.6), tint, [0, 0.42, 0.05], [-0.12, 0, 0]),
    piece(box(0.68, 0.66, 0.09), tint, [0, 0.76, -0.27], [-0.32, 0, 0]),
    piece(box(0.08, 0.06, 0.5), PALETTE.slate500, [-0.36, 0.55, 0.0]),
    piece(box(0.08, 0.06, 0.5), PALETTE.slate500, [0.36, 0.55, 0.0]),
    piece(cyl(0.035, 0.035, 0.34, 10), PALETTE.slate500, [0, 0.2, 0]),
    ...[0, 1, 2, 3, 4].map((k) => piece(box(0.42, 0.03, 0.05), PALETTE.slate500, [Math.cos(k * 1.2566) * 0.2, 0.03, Math.sin(k * 1.2566) * 0.2], [0, -k * 1.2566, 0])),
  );
  seat.position.set(-0.3, 0, 0.1);
  seat.rotation.y = 0.5;
  const ottoman = unit(
    piece(box(0.5, 0.1, 0.42), tint, [0, 0.3, 0]),
    piece(cyl(0.03, 0.03, 0.25, 10), PALETTE.slate500, [0, 0.13, 0]),
  );
  ottoman.position.set(0.45, 0, 0.6);
  const lamp = unit(
    piece(cyl(0.18, 0.2, 0.06, 28), PALETTE.slate500, [0, 0.03, 0]),
    piece(new THREE.TorusGeometry(0.75, 0.018, 8, 48, Math.PI * 0.62), PALETTE.slate400, [0.75, 0.05, 0], [0, 0, Math.PI * 0.36], { edges: false }),
    piece(new THREE.SphereGeometry(0.2, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.card, [1.08, 1.12, 0], [Math.PI, 0, 0]),
    piece(new THREE.SphereGeometry(0.06, 16, 12), PALETTE.amber, [1.08, 1.08, 0], [0, 0, 0], { edges: false, emissive: PALETTE.amber }),
  );
  lamp.position.set(-1.15, 0, -0.55);
  lamp.rotation.y = 0.35;
  const swatches = [PALETTE.rose, PALETTE.amber, PALETTE.emerald, PALETTE.brand].map((c, k) => piece(box(0.2, 0.02, 0.32), c, [0.9 + k * 0.05, 0.02 + k * 0.022, -0.6], [0, -0.25 * k, 0]));
  const turntable = unit(seat, ottoman, ...swatches);
  return model([plinth, lamp, turntable], (t) => { turntable.rotation.y = Math.sin(t * 0.35) * 0.5; });
}

function crane(): Model {
  const ground = slab(3, 2, PALETTE.slate200);
  const mast = unit(...[0, 1, 2, 3, 4].map((k) => piece(box(0.16, 0.44, 0.16), PALETTE.amber, [0, 0.22 + k * 0.44, 0])));
  mast.position.set(-0.95, 0, -0.45);
  const jib = new THREE.Group();
  jib.add(piece(box(2.2, 0.08, 0.1), PALETTE.amber, [0.6, 0, 0]));
  jib.add(piece(box(0.4, 0.16, 0.22), PALETTE.slate500, [-0.45, -0.04, 0]));
  jib.add(piece(box(0.1, 0.3, 0.1), PALETTE.amber, [0, 0.18, 0]));
  const cable = piece(cyl(0.006, 0.006, 1, 4), PALETTE.slate500, [1.4, -0.5, 0], [0, 0, 0], { edges: false });
  const hook = piece(box(0.18, 0.1, 0.18), PALETTE.rose, [1.4, -1.02, 0]);
  jib.add(cable, hook);
  jib.position.set(-0.95, 2.25, -0.45);
  const frame: THREE.Object3D[] = [];
  for (let level = 0; level < 3; level++) {
    const y = level * 0.42;
    const floor = unit(
      piece(box(1.1, 0.06, 0.8), PALETTE.card, [0, y + 0.42, 0]),
      ...[[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]].map(([x, z]) => piece(box(0.06, 0.42, 0.06), PALETTE.card, [x, y + 0.21, z])),
    );
    floor.position.set(0.55, 0, 0.05);
    frame.push(floor);
  }
  const bricks = unit(...[0, 1, 2].flatMap((r) => [0, 1].flatMap((c) => [0, 1].map((h) => piece(box(0.2, 0.09, 0.1), PALETTE.rose, [r * 0.21, 0.05 + h * 0.095, c * 0.11])))));
  bricks.position.set(-0.4, 0, 0.6);
  const cone = unit(piece(new THREE.ConeGeometry(0.11, 0.28, 18), PALETTE.amber, [0, 0.14, 0]), piece(box(0.26, 0.03, 0.26), PALETTE.slate500, [0, 0.015, 0]));
  cone.position.set(1.25, 0, 0.75);
  return model([ground, mast, ...frame, bricks, cone, jib], (t) => {
    jib.rotation.y = Math.sin(t * 0.32) * 0.9 - 0.2;
    const drop = (Math.sin(t * 0.9) + 1) * 0.18;
    cable.scale.y = 1 + drop * 1.6;
    cable.position.y = -0.5 - drop * 0.8;
    hook.position.y = -1.02 - drop * 1.6;
  });
}

function stairs(tint: number): Model {
  const steps: THREE.Mesh[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const h = 0.16 * (i + 1);
    const s = piece(box(0.36, h, 0.9), PALETTE.card, [1.1 - i * 0.36, h / 2, 0]);
    s.material = (s.material as THREE.MeshStandardMaterial).clone();
    steps.push(s);
  }
  const flag = unit(
    piece(cyl(0.012, 0.012, 0.6, 6), PALETTE.slate500, [0, 0.3, 0], [0, 0, 0], { edges: false }),
    piece(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.3, 0.1), new THREE.Vector2(0, 0.2)]), { depth: 0.01, bevelEnabled: false }), PALETTE.emerald, [0, 0.38, 0]),
  );
  flag.position.set(1.1 - (n - 1) * 0.36, 0.16 * n, 0.2);
  const ball = piece(new THREE.SphereGeometry(0.09, 20, 14), tint, [0, 0, 0], [0, 0, 0], { edges: false });
  return model([slab(3, 1.4), ...steps, flag, ball], (t) => {
    const f = (t * 0.9) % n;
    const i = Math.floor(f);
    const k = f - i;
    steps.forEach((s, j) => {
      const m = s.material as THREE.MeshStandardMaterial;
      m.color.setHex(j < i ? PALETTE.slate300 : j === i ? tint : PALETTE.card);
    });
    const next = Math.min(i + 1, n - 1);
    const x0 = 1.1 - i * 0.36; const x1 = 1.1 - next * 0.36;
    const y0 = 0.16 * (i + 1); const y1 = 0.16 * (next + 1);
    ball.position.set(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + 0.09 + Math.sin(k * Math.PI) * 0.22, 0.15);
  });
}

function site(tint: number): Model {
  const layers: THREE.Object3D[] = [];
  for (let k = 0; k < 6; k++) {
    const pts: THREE.Vector2[] = [];
    const r = 1.35 - k * 0.2;
    for (let a = 0; a < 40; a++) {
      const th = (a / 40) * Math.PI * 2;
      const wob = 1 + 0.12 * Math.sin(th * 3 + k) + 0.06 * Math.cos(th * 5 - k * 0.7);
      pts.push(new THREE.Vector2(Math.cos(th) * r * wob + k * 0.05, Math.sin(th) * r * 0.75 * wob));
    }
    layers.push(piece(new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.08, bevelEnabled: false, curveSegments: 4 }), k === 5 ? tint : k % 2 ? PALETTE.card2 : PALETTE.card, [0, k * 0.08, 0], [-Math.PI / 2, 0, 0], { opacity: k === 5 ? 0.85 : undefined }));
  }
  const roof = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.22, 0), new THREE.Vector2(0.22, 0), new THREE.Vector2(0, 0.18)]), { depth: 0.34, bevelEnabled: false });
  const house = unit(
    piece(box(0.44, 0.26, 0.34), PALETTE.card, [0, 0.13, 0]),
    piece(roof, PALETTE.slate300, [0, 0.26, -0.17]),
  );
  house.position.set(0.3, 0.48, 0.02);
  const tree = unit(piece(cyl(0.03, 0.04, 0.3, 8), PALETTE.slate500, [0, 0.15, 0]), piece(new THREE.IcosahedronGeometry(0.2, 0), PALETTE.emerald, [0, 0.42, 0]));
  tree.position.set(-0.55, 0.32, 0.35);
  const needle = unit(
    piece(new THREE.ConeGeometry(0.07, 0.32, 3), PALETTE.rose, [0, 0, -0.16], [-Math.PI / 2, 0, 0]),
    piece(new THREE.ConeGeometry(0.07, 0.32, 3), PALETTE.card, [0, 0, 0.16], [Math.PI / 2, 0, 0]),
  );
  needle.position.y = 0.06;
  const compass = unit(piece(cyl(0.3, 0.3, 0.04, 40), PALETTE.card, [0, 0.02, 0]), needle);
  compass.position.set(1.35, 0, 0.85);
  return model([...layers, house, tree, compass], (t) => { needle.rotation.y = Math.sin(t * 0.8) * 0.35 + Math.sin(t * 2.3) * 0.08; });
}

/** How large each model stands, so the flat ones fill the corner as the tall ones do. */
export const SIZE: Record<ConversationId, number> = {
  whole: 1, chat: 1.05, money: 1.3, boq: 1.3, docs: 1.3, design: 1.12, site: 0.95, plan: 1.2, brief: 1.15,
};

function build(conv: ConversationId): Model {
  const tint = TINT[conv];
  switch (conv) {
    case 'chat': return doorway(PALETTE.brand);
    case 'money': return coins();
    case 'boq': return samples(tint);
    case 'docs': return drawings(tint);
    case 'design': return chair(tint);
    case 'site': return crane();
    case 'plan': return stairs(tint);
    case 'brief': return site(tint);
    default: return room(tint);
  }
}

export function buildModel(conv: ConversationId): Model {
  const m = build(conv);
  m.group.scale.setScalar(SIZE[conv] || 1);
  m.group.userData.size = SIZE[conv] || 1;
  return m;
}

/** Frees what a model holds (its geometries; materials are shared and kept). */
export function disposeModel(m: Model) {
  m.group.traverse((o) => {
    const any = o as any;
    if (any.geometry) any.geometry.dispose();
    if (any.material && any.material !== lineMat && ![...mats.values()].includes(any.material)) any.material.dispose?.();
  });
}

/* ───────────── the stage ───────────── */

const ease = (x: number) => { const c = 1.6; const y = x - 1; return 1 + (c + 1) * y * y * y + c * y * y; }; // ease-out-back

export interface Stage {
  show: (conv: ConversationId, assemble: boolean) => void;
  /** Draws one frame; t in seconds. */
  frame: (t: number, still: boolean) => void;
  resize: (w: number, h: number) => void;
  lean: (x: number, y: number) => void;
  dispose: () => void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, PALETTE.slate300, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 6, 4);
  scene.add(sun);

  /* An axonometric view, as an architect draws a model. */
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 50);
  camera.position.set(6, 5, 7);
  camera.lookAt(0, 0.55, 0);

  /* A soft shadow under the model. */
  const sh = document.createElement('canvas');
  sh.width = sh.height = 128;
  const g = sh.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(61, 82, 160, 0.28)');
    grad.addColorStop(1, 'rgba(61, 82, 160, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.12;
  scene.add(shadow);

  const holder = new THREE.Group();
  scene.add(holder);
  let current: { m: Model; born: number; bases: Array<{ o: THREE.Object3D; y: number; s: THREE.Vector3 }> } | null = null;
  let leaving: { m: Model; at: number } | null = null;
  let clock = 0;
  let leanX = 0, leanY = 0, tiltX = 0, tiltY = 0;

  const show = (conv: ConversationId, assemble: boolean) => {
    if (current) {
      if (leaving) { holder.remove(leaving.m.group); disposeModel(leaving.m); }
      leaving = { m: current.m, at: clock };
    }
    const m = buildModel(conv);
    holder.add(m.group);
    const bases = m.parts.map((o) => ({ o, y: o.position.y, s: o.scale.clone() }));
    current = { m, born: assemble ? clock : -100, bases };
  };

  const frame = (t: number, still: boolean) => {
    clock = t;
    if (leaving) {
      const k = Math.min(1, (t - leaving.at) / 0.35);
      leaving.m.group.scale.setScalar((leaving.m.group.userData.size || 1) * (1 - k));
      leaving.m.group.position.y = -k * 0.6;
      if (k >= 1) { holder.remove(leaving.m.group); disposeModel(leaving.m); leaving = null; }
    }
    if (current) {
      /* The pieces drop into place one after another. */
      current.bases.forEach(({ o, y, s }, i) => {
        const k = still ? 1 : Math.min(1, Math.max(0, (t - current!.born - i * 0.09) / 0.6));
        const e = ease(k);
        o.position.y = y + (1 - e) * 1.6;
        o.scale.set(s.x * Math.max(0.001, e), s.y * Math.max(0.001, e), s.z * Math.max(0.001, e));
      });
      if (!still) current.m.tick(t);
    }
    tiltX += (leanX - tiltX) * 0.06;
    tiltY += (leanY - tiltY) * 0.06;
    holder.rotation.y = (still ? 0 : Math.sin(t * 0.18) * 0.28) + tiltX * 0.35;
    holder.rotation.x = tiltY * 0.12;
    holder.position.y = still ? 0 : Math.sin(t * 0.9) * 0.04;
    renderer.render(scene, camera);
  };

  const resize = (w: number, h: number) => {
    renderer.setSize(w, h, false);
    const a = w / Math.max(1, h);
    const v = 2.15;
    camera.left = -v * a; camera.right = v * a; camera.top = v; camera.bottom = -v;
    camera.updateProjectionMatrix();
  };

  return {
    show, frame, resize,
    lean: (x, y) => { leanX = x; leanY = y; },
    dispose: () => {
      if (current) disposeModel(current.m);
      if (leaving) disposeModel(leaving.m);
      renderer.dispose();
    },
  };
}
