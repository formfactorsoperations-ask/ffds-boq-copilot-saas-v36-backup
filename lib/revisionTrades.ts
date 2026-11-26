import type { Item } from '../types';
import { nameSimilarity, norm, type SignedLine } from './scopeRevision';
import { lineLook } from './offers';

/*
  THE TRADE OF A LINE IN A SCOPE REVISION.

  A revision imported from an Excel brings its lines as text: a name, a unit,
  a quantity and a rate. A line paired with a signed line keeps that line's
  item, so its trade (Carpentry, Painting, Civil...) comes with it. But every
  line in a room "Compared as a whole", and every line new in the revision,
  became a custom line with no item and no category, and "Where the money
  goes" filed it under Others → Other. On Palacia that was ₹9.88L of the
  ₹16.2L revised BOQ: wardrobes, beds, tiling, all as "Other".

  So a revision line's trade is, in order:
  1. what the studio set on the line in Revision Studio;
  2. the trade of the signed line it revises;
  3. the trade of a signed line with the same name, anywhere in the signed BOQ
     (the same name first, then a close one);
  4. the trade of a rate-bank item with the same name;
  5. a guess from the name (a bed is carpentry, wall tiles are civil);
  6. none: the room decides, as before.
  The studio can always change it, line by line, before it is issued.
*/

/** The trades a studio picks from, beside the rate bank's own categories. */
export const COMMON_TRADES = [
  'Carpentry', 'False ceiling', 'Painting', 'Electrical', 'Plumbing', 'HVAC', 'Civil', 'Glass & mirrors', 'Site services', 'Decor & loose items',
];

const GUESS: [RegExp, string][] = [
  [/false ceiling|\bpop\b|gypsum|grid ceiling/i, 'False ceiling'],
  [/debris|floor protection|protection|cleaning|disposal|scaffold/i, 'Site services'],
  [/paint|putty|texture|polish|wallpaper/i, 'Painting'],
  [/electric|wiring|\bpoints?\b|switch|light(ing)?\b|fan\b|db box|mcb/i, 'Electrical'],
  [/plumb|sanitary|cp fitting|fixture|geyser|drain|bbc/i, 'Plumbing'],
  [/\bac\b|hvac|air ?con|duct/i, 'HVAC'],
  [/tile|tiling|floor|demoli|waterproof|granite|marble|plaster|masonry|civil|brick|niche|grout|skirting|cladding/i, 'Civil'],
  [/glass|mirror|shower partition|partition/i, 'Glass & mirrors'],
  [/wardrobe|bed\b|storage|cabinet|shel(f|ves)|panel|vanity|crockery|study|\btv\b|console|shoe rack|mandir|dresser|headboard|loft|kitchen|book|platform|seating|unit\b|drawer|pelmet|ledge|door|frame|counter|table/i, 'Carpentry'],
];

/** A trade guessed from a line's name; empty when nothing fits. */
export function tradeFromName(name: string): string {
  const n = String(name || '');
  for (const [re, trade] of GUESS) if (re.test(n)) return trade;
  return '';
}

export interface TradeLookup {
  signed: SignedLine[];
  /** The signed BOQ's lines, for a custom signed line's own category. */
  signedBoq: any[];
  bankMap: Map<string, Item>;
}

/** The category a signed line carries, as the BOQ Editor shows it. */
function signedCat(s: SignedLine, look: TradeLookup, byId: Map<string, any>): string {
  const original = byId.get(s.lineId);
  const item = look.bankMap.get(s.bankId || original?.bankId);
  return (lineLook(original || { name: s.name }, item)?.cat || '').trim();
}

/** A lookup by name, made once per draft. */
export function tradeFinder(look: TradeLookup) {
  const byId = new Map((look.signedBoq || []).map((b: any, i: number) => [String(b.id || `line-${i}`), b]));
  const signedById = new Map(look.signed.map(s => [s.lineId, s]));
  const named = look.signed.map(s => ({ s, key: norm(s.name), cat: signedCat(s, look, byId) })).filter(x => x.cat);
  const bank = Array.from(look.bankMap.values()).map(i => ({ key: norm(i.name), cat: (i.cat || '').trim() })).filter(x => x.cat);
  return (line: { name: string; cat?: string | null; signedLineId?: string | null }): { cat: string; from: 'set' | 'signed' | 'same name' | 'bank' | 'guess' | 'none' } => {
    const own = (line.cat || '').trim();
    if (own) return { cat: own, from: 'set' };
    const s = line.signedLineId ? signedById.get(line.signedLineId) : undefined;
    if (s) { const c = signedCat(s, look, byId); if (c) return { cat: c, from: 'signed' }; }
    const key = norm(line.name);
    if (key) {
      const same = named.find(x => x.key === key) || named.find(x => nameSimilarity(x.s.name, line.name) >= 0.8);
      if (same) return { cat: same.cat, from: 'same name' };
      const b = bank.find(x => x.key === key);
      if (b) return { cat: b.cat, from: 'bank' };
    }
    const g = tradeFromName(line.name);
    return g ? { cat: g, from: 'guess' } : { cat: '', from: 'none' };
  };
}

/** The trades to pick from: the common ones, then the rate bank's own categories. */
export function tradeChoices(bankMap: Map<string, Item>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  [...COMMON_TRADES, ...Array.from(bankMap.values()).map(i => (i.cat || '').trim()).sort((a, b) => a.localeCompare(b))].forEach(t => {
    const k = t.toLowerCase();
    if (t && !seen.has(k)) { seen.add(k); out.push(t); }
  });
  return out;
}
