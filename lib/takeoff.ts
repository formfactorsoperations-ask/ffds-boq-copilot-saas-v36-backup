/**
 * takeoff.ts — floor-plan geometry to BOQ quantities.
 *
 * Replaces the hardcoded multipliers in services/geminiService.ts, which applied
 * `roomSize × 2.7` for painting and `× 1.5` for false ceiling. Those numbers were
 * calibrated against the SUPER BUILT-UP area of a whole flat but were being applied
 * to the CARPET area of a single room — under-quoting wall painting by about a third.
 *
 * Nothing here calls an AI model. Vision is used once, upstream, to read room
 * dimensions off the drawing; everything below is arithmetic, so the same plan always
 * produces the same quantities.
 *
 * Conventions are studio settings, not constants, because they change the answer by
 * 10–30% and every studio works differently. Each is documented where it is defined.
 */

/* ─────────────────────────────── model ─────────────────────────────── */

export type RoomKind =
  | 'living' | 'dining' | 'bedroom' | 'kitchen' | 'toilet'
  | 'utility' | 'foyer' | 'passage' | 'balcony' | 'other';

/** How the ceiling is treated. Drives both the false-ceiling area and whether the
 *  slab or the false-ceiling surface gets painted. */
export type CeilingDesign =
  | 'none'      // no false ceiling — the slab is painted
  | 'grid'      // flat grid/tile ceiling, no vertical faces
  | 'plain'     // flat soffit with a peripheral drop
  | 'cove'      // plain + a cove return for concealed lighting
  | 'designer'; // cove + a second level, so an extra run of step faces

/** Where a dimension came from. Never inferred — always carried through to the UI. */
export type DimSource = 'read' | 'calculated' | 'assumed' | 'confirmed';

export interface RoomGeometry {
  id: string;
  name: string;
  kind: RoomKind;
  lengthFt: number;
  widthFt: number;
  /** Floor to ceiling. A 2D plan cannot contain this — it comes from the project. */
  heightFt: number;
  doors: number;
  windows: number;
  ceiling: CeilingDesign;
  source: DimSource;
  /** The dimension string as printed on the drawing, kept so the parse can be checked. */
  rawDimension?: string;
  /** True for an L-shaped or irregular room, where 2(L+W) is not the real perimeter. */
  irregular?: boolean;
}

export interface TakeoffConventions {
  /** Deducted from wall painting. Indian standard door 3'×7', window 4'×4'. */
  doorSft: number;
  windowSft: number;

  /** False ceiling geometry. */
  coveDropFt: number;      // peripheral drop / bulkhead face
  coveReturnFt: number;    // cove return that hides the light
  stepFaceFt: number;      // second-level step face
  innerStepFactor: number; // inner step runs this share of the room perimeter
  spotsPerSft: number;     // one light cutout per N sft of soffit

  /** Kitchen and utility. Tiling runs floor-to-backsplash in one continuous band:
   *  under-counter + backsplash. Only the walls carrying the platform are affected. */
  counterHeightFt: number;
  backsplashFt: number;
  overheadHeightFt: number;
  /** An L-shaped platform runs the long wall plus this share of the short wall. */
  platformRunFactor: number;

  /** Toilets: tiled full height, and out of the painting scope entirely. */
  toiletFullHeightTiling: boolean;

  tileWastagePct: number;

  /** Whether the wall behind fitted carpentry is painted. If painting happens before
   *  carpentry goes in, the whole wall is coated and nothing is deducted. Site
   *  practice, not geometry — worth ~30 sft on a kitchen alone, so it is explicit. */
  paintBehindCarpentry: boolean;
}

export const DEFAULT_CONVENTIONS: TakeoffConventions = {
  doorSft: 21,
  windowSft: 16,
  coveDropFt: 0.75,
  coveReturnFt: 0.5,
  stepFaceFt: 0.5,
  innerStepFactor: 0.85,
  spotsPerSft: 30,
  counterHeightFt: 2.75,
  backsplashFt: 2.0,
  overheadHeightFt: 2.25,
  platformRunFactor: 0.6,
  toiletFullHeightTiling: true,
  tileWastagePct: 5,
  // Kitchen overheads sit tight to the wall; most studios do not paint behind them.
  paintBehindCarpentry: false,
};

/* ───────────────────────── classification ───────────────────────── */

const KIND_PATTERNS: [RegExp, RoomKind][] = [
  [/\b(m\.?\s*bed|master\s*bed|bed\s*room|bedroom|bed\b)/i, 'bedroom'],
  [/\b(toilet|bath|wc|powder)/i, 'toilet'],
  [/\b(kitchen|kitch)/i, 'kitchen'],
  [/\b(utility|wash|service)/i, 'utility'],
  [/\b(foyer|entrance|entry|lobby)/i, 'foyer'],
  [/\b(pass|passage|corridor|hall\s*way)/i, 'passage'],
  [/\b(balcony|balc|deck|terrace|sit\s*out)/i, 'balcony'],
  // Living is tested before dining so a combined "Living / Dining" reads as living —
  // which is how the drawing labels it, and it is the larger of the two functions.
  [/\b(living|drawing|hall|lounge)/i, 'living'],
  [/\b(dining|dine)/i, 'dining'],
];

/** Reads the room's kind from its name. A combined "Living / Dining" reads as living. */
export function classifyRoom(name: string): RoomKind {
  for (const [re, kind] of KIND_PATTERNS) if (re.test(name || '')) return kind;
  return 'other';
}

/** Sensible ceiling treatment per room type — a design decision the plan cannot hold,
 *  so it is defaulted rather than demanded, and always overridable. */
export function defaultCeiling(kind: RoomKind): CeilingDesign {
  switch (kind) {
    case 'living': case 'dining': return 'designer';
    case 'bedroom': case 'foyer': return 'cove';
    case 'passage': return 'plain';
    // Toilets, kitchens, utilities and balconies carry no false ceiling by default.
    default: return 'none';
  }
}

/* ───────────────────────────── geometry ───────────────────────────── */

export interface RoomTakeoff {
  room: RoomGeometry;
  areaSft: number;
  perimeterFt: number;
  /** Wall area before any deduction. */
  grossWallSft: number;
  openingsSft: number;
  /** Wall permanently covered by tile — never painted. */
  cladSft: number;
  /** Wall covered by fitted carpentry — deducted only if the studio paints after it. */
  carpentrySft: number;
  wallPaintSft: number;
  /** Slab where there is no false ceiling, otherwise the false-ceiling surface. */
  ceilingPaintSft: number;
  falseCeilingSft: number;
  fcSoffitSft: number;
  fcFacesSft: number;
  profileRft: number;
  coveChannelRft: number;
  lightCutouts: number;
  floorTileSft: number;
  wallTileSft: number;
  skirtingRft: number;
  /** Human-readable working, shown in the BOQ so a quantity is never unexplained. */
  derivation: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The run of wall carrying a kitchen platform or a utility counter. */
function platformRun(r: RoomGeometry, c: TakeoffConventions): number {
  const long = Math.max(r.lengthFt, r.widthFt);
  const short = Math.min(r.lengthFt, r.widthFt);
  // A kitchen platform is typically L-shaped; a utility counter runs one wall.
  return r.kind === 'kitchen' ? long + short * c.platformRunFactor : long;
}

export function computeRoom(r: RoomGeometry, c = DEFAULT_CONVENTIONS): RoomTakeoff {
  const areaSft = r.lengthFt * r.widthFt;
  const perimeterFt = 2 * (r.lengthFt + r.widthFt);
  const grossWallSft = perimeterFt * r.heightFt;
  const openingsSft = r.doors * c.doorSft + r.windows * c.windowSft;
  const netWall = Math.max(0, grossWallSft - openingsSft);

  let cladSft = 0, carpentrySft = 0, wallPaintSft = 0, wallTileSft = 0;
  const bandFt = c.counterHeightFt + c.backsplashFt;   // one continuous tiled band

  if (r.kind === 'toilet') {
    // Tiled full height and out of the painting scope entirely.
    wallTileSft = c.toiletFullHeightTiling
      ? Math.max(0, grossWallSft - r.doors * c.doorSft)
      : perimeterFt * 7 - r.doors * c.doorSft;
    cladSft = wallTileSft;
    wallPaintSft = 0;
  } else if (r.kind === 'kitchen' || r.kind === 'utility') {
    const run = platformRun(r, c);
    wallTileSft = run * bandFt;
    cladSft = wallTileSft;
    carpentrySft = r.kind === 'kitchen' ? run * c.overheadHeightFt : 0;
    const covered = cladSft + (c.paintBehindCarpentry ? 0 : carpentrySft);
    wallPaintSft = Math.max(0, netWall - covered);
  } else {
    wallPaintSft = netWall;
  }

  // ── false ceiling ──
  const d = r.ceiling;
  const hasDrop = d === 'plain' || d === 'cove' || d === 'designer';
  const hasCove = d === 'cove' || d === 'designer';
  const hasStep = d === 'designer';

  const fcSoffitSft = d === 'none' ? 0 : areaSft;
  const fcFacesSft =
    (hasDrop ? perimeterFt * c.coveDropFt : 0) +
    (hasCove ? perimeterFt * c.coveReturnFt : 0) +
    (hasStep ? perimeterFt * c.innerStepFactor * c.stepFaceFt : 0);
  const falseCeilingSft = fcSoffitSft + fcFacesSft;

  const profileRft = (hasDrop ? perimeterFt : 0) + (hasStep ? perimeterFt * c.innerStepFactor : 0);
  const coveChannelRft = hasCove ? perimeterFt : 0;
  const lightCutouts = d === 'none' ? 0 : Math.round(areaSft / c.spotsPerSft) + (hasStep ? 2 : 0);

  /* A false ceiling is puttied and painted, so its whole surface — soffit plus the
     vertical faces — is the paintable area. Where there is none, the slab is painted.
     Toilets are out of the painting scope, so they get neither. */
  const ceilingPaintSft =
    r.kind === 'toilet' ? 0 : (d === 'none' ? areaSft : falseCeilingSft);

  const floorTileSft = areaSft * (1 + c.tileWastagePct / 100);
  const wet = r.kind === 'toilet' || r.kind === 'kitchen' || r.kind === 'utility';
  const skirtingRft = wet ? 0 : Math.max(0, perimeterFt - r.doors * 3);

  const derivation =
    `${round2(r.lengthFt)}′ × ${round2(r.widthFt)}′ · perimeter ${Math.round(perimeterFt)}′ × ${r.heightFt}′` +
    ` = ${Math.round(grossWallSft)} sft` +
    (openingsSft ? ` − ${Math.round(openingsSft)} openings` : '') +
    (cladSft ? ` − ${Math.round(cladSft)} tiled` : '') +
    (!c.paintBehindCarpentry && carpentrySft ? ` − ${Math.round(carpentrySft)} behind carpentry` : '');

  return {
    room: r, areaSft, perimeterFt, grossWallSft, openingsSft, cladSft, carpentrySft,
    wallPaintSft, ceilingPaintSft, falseCeilingSft, fcSoffitSft, fcFacesSft,
    profileRft, coveChannelRft, lightCutouts, floorTileSft, wallTileSft, skirtingRft,
    derivation,
  };
}

/* ───────────────────────────── totals ───────────────────────────── */

export interface TakeoffTotals {
  carpetSft: number;
  wallPaintSft: number;
  ceilingPaintSft: number;
  falseCeilingSft: number;
  fcSoffitSft: number;
  fcFacesSft: number;
  profileRft: number;
  coveChannelRft: number;
  lightCutouts: number;
  floorTileSft: number;
  wallTileSft: number;
  skirtingRft: number;
}

export interface TakeoffIssue {
  roomId?: string;
  severity: 'error' | 'warn' | 'info';
  message: string;
}

export interface TakeoffResult {
  rooms: RoomTakeoff[];
  totals: TakeoffTotals;
  issues: TakeoffIssue[];
  /** Rooms whose dimensions were not read directly and are worth a glance. */
  needsConfirmation: RoomTakeoff[];
  /** Σ room areas against the carpet area on record, as a percentage. */
  reconciliationPct: number | null;
  /** Implied wall-paint multiplier — the studio's old rule of thumb, inverted into a check. */
  impliedRatioVsCarpet: number | null;
}

/** Plausible area bands per room type, used to catch a misread dimension. */
const AREA_BAND: Partial<Record<RoomKind, [number, number]>> = {
  bedroom: [70, 350], toilet: [15, 90], kitchen: [35, 220],
  living: [90, 700], dining: [40, 300], utility: [12, 90],
  foyer: [15, 140], passage: [10, 180], balcony: [12, 200],
};

export function computeTakeoff(
  rooms: RoomGeometry[],
  conventions: TakeoffConventions = DEFAULT_CONVENTIONS,
  statedCarpetSft?: number,
): TakeoffResult {
  const rt = rooms.map(r => computeRoom(r, conventions));
  const sum = (f: (t: RoomTakeoff) => number) => rt.reduce((s, t) => s + f(t), 0);

  const totals: TakeoffTotals = {
    carpetSft: sum(t => t.areaSft),
    wallPaintSft: sum(t => t.wallPaintSft),
    ceilingPaintSft: sum(t => t.ceilingPaintSft),
    falseCeilingSft: sum(t => t.falseCeilingSft),
    fcSoffitSft: sum(t => t.fcSoffitSft),
    fcFacesSft: sum(t => t.fcFacesSft),
    profileRft: sum(t => t.profileRft),
    coveChannelRft: sum(t => t.coveChannelRft),
    lightCutouts: sum(t => t.lightCutouts),
    floorTileSft: sum(t => t.floorTileSft),
    wallTileSft: sum(t => t.wallTileSft),
    skirtingRft: sum(t => t.skirtingRft),
  };

  const issues: TakeoffIssue[] = [];

  // Reconciliation — one misread room breaks the total, which is what makes this work.
  let reconciliationPct: number | null = null;
  if (statedCarpetSft && statedCarpetSft > 0) {
    reconciliationPct = ((totals.carpetSft - statedCarpetSft) / statedCarpetSft) * 100;
    if (Math.abs(reconciliationPct) > 5) {
      issues.push({
        severity: Math.abs(reconciliationPct) > 12 ? 'error' : 'warn',
        message: `Rooms total ${Math.round(totals.carpetSft)} sft against ${Math.round(statedCarpetSft)} sft on record `
          + `(${reconciliationPct > 0 ? '+' : ''}${reconciliationPct.toFixed(1)}%). `
          + `Check any room not read directly from the plan.`,
      });
    }
  }

  rt.forEach(t => {
    const r = t.room;
    const band = AREA_BAND[r.kind];
    if (band && (t.areaSft < band[0] || t.areaSft > band[1])) {
      issues.push({
        roomId: r.id, severity: 'warn',
        message: `${r.name} is ${Math.round(t.areaSft)} sft — outside the usual ${band[0]}–${band[1]} sft for a ${r.kind}.`,
      });
    }
    const long = Math.max(r.lengthFt, r.widthFt), short = Math.min(r.lengthFt, r.widthFt);
    if (short > 0 && long / short > 5 && r.kind !== 'passage' && r.kind !== 'balcony') {
      issues.push({
        roomId: r.id, severity: 'warn',
        message: `${r.name} reads ${round2(r.lengthFt)}′ × ${round2(r.widthFt)}′ — an unusual shape for a ${r.kind}. Likely a misread.`,
      });
    }
    // A misread dimension often yields a room that is plausible on its own but far
    // larger than its siblings of the same type. That comparison catches what the
    // absolute bands cannot — e.g. a 280 sft bedroom next to two 90 sft ones.
    const peers = rt.filter(x => x.room.kind === r.kind && x.room.id !== r.id).map(x => x.areaSft);
    if (peers.length) {
      const median = [...peers].sort((a, b) => a - b)[Math.floor(peers.length / 2)];
      if (median > 0 && t.areaSft > median * 1.8) {
        issues.push({
          roomId: r.id, severity: 'warn',
          message: `${r.name} is ${Math.round(t.areaSft)} sft — ${(t.areaSft / median).toFixed(1)}× the other ${r.kind}s on this plan. Check the dimensions.`,
        });
      }
    }
    if (r.irregular) {
      issues.push({
        roomId: r.id, severity: 'warn',
        message: `${r.name} is not rectangular, so 2(L+W) understates its perimeter. Confirm the wall lengths.`,
      });
    }
    if (r.kind === 'balcony') {
      issues.push({ roomId: r.id, severity: 'info', message: `${r.name} is a balcony — excluded from carpet area.` });
    }
  });

  return {
    rooms: rt, totals, issues,
    needsConfirmation: rt.filter(t => t.room.source !== 'read' && t.room.source !== 'confirmed'),
    reconciliationPct,
    impliedRatioVsCarpet: totals.carpetSft > 0 ? totals.wallPaintSft / totals.carpetSft : null,
  };
}

/* ─────────────────────── BOQ quantity lookup ─────────────────────── */

/** How a bank item is measured. Set once per item; replaces matching item names. */
export type MeasureBasis =
  | 'wallPaint' | 'ceilingPaint' | 'falseCeiling' | 'floorTile' | 'wallTile'
  | 'skirting' | 'profile' | 'coveChannel' | 'lightPoint' | 'carpetArea' | 'count' | 'lump';

/** Guesses the basis from an item's name and unit — a migration aid, so existing bank
 *  items work before anyone has set the field. Explicit basis always wins. */
export function inferBasis(name: string, unit?: string): MeasureBasis | null {
  const n = (name || '').toLowerCase();
  if (/false\s*ceil|pop\s*ceil|gypsum|grid\s*ceil|cove\s*ceil/.test(n)) return 'falseCeiling';
  if (/ceiling\s*paint|paint.*ceiling|ceiling\s*emulsion/.test(n)) return 'ceilingPaint';
  if (/wall\s*paint|plastic\s*emulsion|tractor|royale|luxe\s*emulsion|acrylic\s*emulsion|paint|putty|primer|distemper/.test(n)) return 'wallPaint';
  if (/dado|wall\s*til|backsplash|kitchen\s*dado|toilet\s*dado|bathroom\s*til/.test(n)) return 'wallTile';
  if (/floor\s*til|flooring|vitrified|marble|granite\s*floor|wooden\s*floor|laminate\s*floor|tiles\s*laying/.test(n)) return 'floorTile';
  if (/skirt/.test(n)) return 'skirting';
  if (/profile|cornice|moulding|groove/.test(n)) return 'profile';
  if (/cove\s*light|led\s*strip|cove\s*channel|strip\s*light/.test(n)) return 'coveChannel';
  if (/light\s*point|spot|downlight|cob\s*light|ceiling\s*light/.test(n)) return 'lightPoint';
  if (/carpet\s*area|floor\s*area|deep\s*cleaning|general\s*cleaning|pest\s*control/.test(n)) return 'carpetArea';
  if ((unit || '').toLowerCase() === 'lump') return 'lump';
  return null;
}

/** Quantity for one item in one room. Returns null when geometry cannot answer —
 *  the caller then falls back to whatever it does today. */
export function quantityFor(
  basis: MeasureBasis,
  t: RoomTakeoff,
): { qty: number; unit: string; derivation: string } | null {
  const q = (n: number, unit: string, d: string) =>
    ({ qty: Math.round(n * 100) / 100, unit, derivation: d });

  switch (basis) {
    case 'wallPaint':    return q(t.wallPaintSft, 'sft', t.derivation);
    case 'ceilingPaint': return q(t.ceilingPaintSft, 'sft',
      t.room.ceiling === 'none' ? `slab ${Math.round(t.areaSft)} sft` : `false-ceiling surface ${Math.round(t.falseCeilingSft)} sft`);
    case 'falseCeiling': return q(t.falseCeilingSft, 'sft',
      `${Math.round(t.fcSoffitSft)} soffit + ${Math.round(t.fcFacesSft)} faces (${t.room.ceiling})`);
    case 'floorTile':    return q(t.floorTileSft, 'sft', `${Math.round(t.areaSft)} sft + wastage`);
    case 'wallTile':     return q(t.wallTileSft, 'sft', `${Math.round(t.wallTileSft)} sft tiled band`);
    case 'skirting':     return q(t.skirtingRft, 'rft', `perimeter ${Math.round(t.perimeterFt)}′ less doors`);
    case 'profile':      return q(t.profileRft, 'rft', `${Math.round(t.profileRft)} rft of shaped edge`);
    case 'coveChannel':  return q(t.coveChannelRft, 'rft', `cove run ${Math.round(t.coveChannelRft)} rft`);
    case 'lightPoint':   return q(t.lightCutouts, 'nos', `1 per ${Math.round(t.areaSft / Math.max(1, t.lightCutouts))} sft`);
    case 'carpetArea':   return q(t.areaSft, 'sft', `room area`);
    case 'count': case 'lump': return null;
    default: return null;
  }
}

/** Fallback when a room has no dimensions: the studio's old ratios, clearly labelled.
 *  Kept so nothing regresses on projects that predate plan takeoff. */
export function ratioFallback(basis: MeasureBasis, roomAreaSft: number): { qty: number; derivation: string } | null {
  if (!roomAreaSft) return null;
  switch (basis) {
    case 'wallPaint':    return { qty: round2(roomAreaSft * 2.7), derivation: 'rule of thumb 2.7× room area — no dimensions on file' };
    case 'ceilingPaint': return { qty: round2(roomAreaSft * 1.3), derivation: 'rule of thumb 1.3× room area — no dimensions on file' };
    case 'falseCeiling': return { qty: round2(roomAreaSft * 1.5), derivation: 'rule of thumb 1.5× room area — no dimensions on file' };
    case 'floorTile':    return { qty: round2(roomAreaSft * 1.05), derivation: 'room area + 5% wastage' };
    default: return null;
  }
}

/* ─────────────────────── BOQ Bulk Takeoff Sync ─────────────────────── */

export interface SyncTakeoffItemDetail {
  itemId: string;
  itemName: string;
  roomName: string;
  oldQty: number;
  newQty: number;
  unit: string;
  basis: MeasureBasis;
  derivation: string;
}

export interface SyncTakeoffResult<T = any> {
  updatedItems: T[];
  matchedCount: number;
  details: SyncTakeoffItemDetail[];
}

/**
 * Synchronizes calculated takeoff room and project quantities across an entire BOQ line-item array.
 */
export function syncTakeoffToBoqItems<T extends { id?: string; bankId?: string; qty: number; roomId?: string; name?: string; rationale?: string }>(
  items: T[],
  rooms: RoomGeometry[],
  bank: Array<{ id: string; name: string; unit?: string }>,
  conventions: TakeoffConventions = DEFAULT_CONVENTIONS,
  statedCarpetSft?: number
): SyncTakeoffResult<T> {
  const takeoffResult = computeTakeoff(rooms, conventions, statedCarpetSft);
  const roomMap = new Map<string, RoomTakeoff>();
  takeoffResult.rooms.forEach(rt => {
    roomMap.set(rt.room.id, rt);
    roomMap.set(rt.room.name.toLowerCase().trim(), rt);
  });

  const bankMap = new Map<string, { id: string; name: string; unit?: string }>();
  bank.forEach(b => bankMap.set(b.id, b));

  let matchedCount = 0;
  const details: SyncTakeoffItemDetail[] = [];

  const updatedItems = items.map(item => {
    const bankItem = item.bankId ? bankMap.get(item.bankId) : undefined;
    const itemName = item.name || bankItem?.name || '';
    const itemUnit = bankItem?.unit || 'sft';
    const basis = inferBasis(itemName, itemUnit);

    if (!basis) return item;

    // 1. Room-level item
    let targetRoomTakeoff: RoomTakeoff | undefined;
    if (item.roomId) {
      targetRoomTakeoff = roomMap.get(item.roomId) || roomMap.get(item.roomId.toLowerCase().trim());
    }

    if (targetRoomTakeoff) {
      const qRes = quantityFor(basis, targetRoomTakeoff);
      if (qRes && qRes.qty > 0 && Math.abs(qRes.qty - item.qty) > 0.01) {
        matchedCount++;
        details.push({
          itemId: item.id || '',
          itemName,
          roomName: targetRoomTakeoff.room.name,
          oldQty: item.qty,
          newQty: qRes.qty,
          unit: qRes.unit,
          basis,
          derivation: qRes.derivation
        });
        return {
          ...item,
          qty: qRes.qty,
          rationale: `Plan Takeoff: ${qRes.derivation}`
        };
      }
    } else {
      // 2. Project-level item without specific roomId — map from project totals
      let totalQty: number | null = null;
      let unit = itemUnit;
      let note = '';

      switch (basis) {
        case 'wallPaint':
          totalQty = Math.round(takeoffResult.totals.wallPaintSft);
          unit = 'sft';
          note = `Total Wall Paint across ${rooms.length} rooms`;
          break;
        case 'ceilingPaint':
          totalQty = Math.round(takeoffResult.totals.ceilingPaintSft);
          unit = 'sft';
          note = `Total Ceiling Paint across ${rooms.length} rooms`;
          break;
        case 'falseCeiling':
          totalQty = Math.round(takeoffResult.totals.falseCeilingSft);
          unit = 'sft';
          note = `Total False Ceiling across ${rooms.length} rooms`;
          break;
        case 'floorTile':
          totalQty = Math.round(takeoffResult.totals.floorTileSft);
          unit = 'sft';
          note = `Total Floor Tiling (+5% wastage) across ${rooms.length} rooms`;
          break;
        case 'wallTile':
          totalQty = Math.round(takeoffResult.totals.wallTileSft);
          unit = 'sft';
          note = `Total Wall / Dado Tiling across ${rooms.length} rooms`;
          break;
        case 'skirting':
          totalQty = Math.round(takeoffResult.totals.skirtingRft);
          unit = 'rft';
          note = `Total Skirting run across ${rooms.length} rooms`;
          break;
        case 'profile':
          totalQty = Math.round(takeoffResult.totals.profileRft);
          unit = 'rft';
          note = `Total Profile run across ${rooms.length} rooms`;
          break;
        case 'coveChannel':
          totalQty = Math.round(takeoffResult.totals.coveChannelRft);
          unit = 'rft';
          note = `Total Cove Lighting Channel across ${rooms.length} rooms`;
          break;
        case 'lightPoint':
          totalQty = takeoffResult.totals.lightCutouts;
          unit = 'nos';
          note = `Total Spot & Light Cutouts across ${rooms.length} rooms`;
          break;
        case 'carpetArea':
          totalQty = Math.round(takeoffResult.totals.carpetSft);
          unit = 'sft';
          note = `Total Floor Area across ${rooms.length} rooms`;
          break;
        default:
          break;
      }

      if (totalQty != null && totalQty > 0 && Math.abs(totalQty - item.qty) > 0.01) {
        matchedCount++;
        details.push({
          itemId: item.id || '',
          itemName,
          roomName: 'Project Total',
          oldQty: item.qty,
          newQty: totalQty,
          unit,
          basis,
          derivation: note
        });
        return {
          ...item,
          qty: totalQty,
          rationale: `Plan Takeoff: ${note}`
        };
      }
    }

    return item;
  });

  return { updatedItems, matchedCount, details };
}
