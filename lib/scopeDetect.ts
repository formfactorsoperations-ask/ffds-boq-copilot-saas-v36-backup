/*
  Deciding, from the BOQ, what the proposal may tell a client is included.

  These answers are printed in a document the client signs — the "What is
  included" cards and Annexure A's Exclusions — so a wrong answer is not a
  cosmetic bug. Substring matching over free-text item names produced three
  kinds of wrong answer on a live project:

    'tall'    matched  "ins(tall)ation of sanitary ware"      -> claimed a tall unit
    'counter' matched  "washbasin counter" (a bathroom line)  -> claimed a kitchen counter
    'counter' matched  "demolish kitchen counter"             -> read a removal as a supply
    'wall'    matched  "kitchen - plastering wall"            -> read plaster as a cabinet

  So matching here is whole-word, scoped to the area the component belongs to,
  and blind to lines that remove something or that disclaim supplying it.

  Where the evidence is ambiguous the answer is **no**. Over-claiming inclusion
  promises work that was never priced; under-claiming is visible to the studio,
  who can correct it in the proposal, which is editable.
*/

export interface ScopeItem {
  name?: string;
  cat?: string;
  roomId?: string;
}

/** Whole-word match, tolerating a plural 's'. 'tall' must not hit 'installation'. */
export const hasWord = (text: string, term: string): boolean => {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}(s|es)?([^a-z0-9]|$)`, 'i').test(text);
};

export const hasAnyWord = (text: string, terms: string[]): boolean =>
  terms.some((t) => hasWord(text, t));

/** A line that takes something out is not a line that supplies it. */
export const isRemoval = (name: string): boolean =>
  /\b(demolish|demolition|dismantl\w*|removal|remove|breaking|debris|chipping)\b/i.test(name);

/** "…excludes only the platform stone/quartz" — the material is named, not supplied. */
export const disclaimsSupply = (name: string): boolean =>
  /\bexclude\w*\b/i.test(name);

/**
 * 'below counter', 'under counter', 'from counter' name a position, not a
 * countertop. Without this, a run of base cabinets reads as a counter.
 */
export const isPositionalCounter = (name: string): boolean =>
  /\b(below|under|from|above|beneath)\s+(the\s+)?counter\b/i.test(name);

/** Does this line belong to the area a component lives in? */
export const inArea = (item: ScopeItem, keys: string[]): boolean => {
  if (keys.length === 0) return true;
  const hay = `${item.roomId || ''} ${item.cat || ''} ${item.name || ''}`.toLowerCase();
  return keys.some((k) => hay.includes(k));
};

export interface ScopeRule {
  /** Area keywords the line must belong to; empty means anywhere. */
  area?: string[];
  /** Any one of these words, matched whole. */
  any: string[];
  /** Or the line's trade category is one of these. */
  catAny?: string[];
  /** Drop lines whose name only mentions the term as a position. */
  notPositional?: boolean;
  /** Drop lines that explicitly exclude what they mention. */
  needsSupply?: boolean;
}

const BATH = ['bath', 'toilet', 'powder', 'washroom', 'wc'];

/*
  One table, so every include/exclude statement in the proposal is governed by
  the same rules and a change is made in one place.
*/
export const SCOPE_RULES: Record<string, ScopeRule> = {
  kitchenBaseWall: { area: ['kitchen'], any: ['base unit', 'wall unit', 'cabinet', 'carcass', 'base & wall'] },
  kitchenShutters: { area: ['kitchen'], any: ['shutter'] },
  kitchenCounter: {
    area: ['kitchen'],
    any: ['countertop', 'worktop', 'counter', 'granite', 'quartz'],
    notPositional: true,
    needsSupply: true,
  },
  kitchenTallUnit: { area: ['kitchen'], any: ['tall unit', 'tall', 'pantry', 'larder'] },
  /* A kitchen loft is its own component — overhead storage above the wall
     units. Distinct from the wardrobe lofts in the bedrooms, which the
     unscoped `lofts` rule below answers for. */
  kitchenLoft: { area: ['kitchen'], any: ['loft', 'overhead storage'] },
  kitchenAccessories: {
    area: ['kitchen'],
    any: ['basket', 'tandem', 'pull out', 'pullout', 'cutlery', 'accessory', 'hardware'],
  },

  // 'wardobe' is the rate bank's spelling. Matching only the correct one made
  // this false on a project carrying three of them, and the proposal then
  // priced the wardrobes and excluded them on the same document.
  wardrobes: { any: ['wardrobe', 'wardobe'] },
  lofts: { any: ['loft', 'overhead storage'] },
  beds: { any: ['bed', 'headboard', 'cot'] },
  study: { any: ['study', 'study unit', 'desk', 'writing table'] },

  vanity: { area: BATH, any: ['vanity', 'basin cabinet'] },
  mirrorUnit: { area: BATH, any: ['mirror', 'looking glass'] },
  bathroomStorage: { area: BATH, any: ['storage', 'shelf', 'rack'] },

  /*
    These feed the Exclusions list rather than the component cards.

    Two of them were dangerous as substrings. 'fitting' matched this project's
    "SANITARY FITTINGS" and "CP FITTINGS" — plumbing lines — and would have
    dropped the electrical-fittings exclusion from a signed document. And a
    bare 'ac' matches surf(ac)e, pl(ac)ing, b(ac)k: whole-word matching is the
    only reason it is safe to keep.
  */
  electricalFittings: {
    any: ['fixture', 'chandelier', 'pendant', 'switchgear', 'light fitting', 'electrical fitting'],
  },
  looseFurniture: {
    any: ['sofa', 'dining table', 'dining set', 'chair', 'recliner', 'loose furniture'],
  },
  whiteGoods: {
    any: ['hob', 'chimney', 'microwave', 'refrigerator', 'appliance', 'ac', 'air conditioner', 'television', 'washing machine'],
  },
  decor: {
    any: ['wallpaper', 'curtain', 'blind', 'decor', 'soft furnishing', 'mattress'],
  },
  plumbing: {
    catAny: ['plumbing'],
    any: ['plumbing', 'sanitary', 'faucet', 'diverter', 'toilet', 'commode', 'basin', 'sink', 'tap'],
  },
  flooring: {
    catAny: ['flooring', 'tile', 'tiling'],
    any: ['flooring', 'tile', 'marble', 'granite', 'stone work'],
  },
};

/** Is the component named by `rule` supplied anywhere in `items`? */
export const detectScope = (items: ScopeItem[], rule: ScopeRule): boolean =>
  (items || []).some((i) => {
    const name = (i.name || '').toLowerCase();
    if (!name) return false;
    if (isRemoval(name)) return false;
    if (rule.needsSupply && disclaimsSupply(name)) return false;
    if (rule.notPositional && isPositionalCounter(name)) return false;
    if (!inArea(i, rule.area || [])) return false;
    if (rule.catAny && hasAnyWord((i.cat || '').toLowerCase(), rule.catAny)) return true;
    return hasAnyWord(name, rule.any);
  });

/** Human names, for a warning a studio has to act on. */
export const SCOPE_LABELS: Record<string, string> = {
  kitchenBaseWall: 'kitchen base & wall units',
  kitchenShutters: 'kitchen shutters',
  kitchenCounter: 'kitchen counter',
  kitchenTallUnit: 'kitchen tall unit',
  kitchenLoft: 'kitchen loft',
  kitchenAccessories: 'kitchen accessories',
  wardrobes: 'wardrobes',
  lofts: 'lofts',
  beds: 'beds',
  study: 'study units',
  vanity: 'bathroom vanity',
  mirrorUnit: 'bathroom mirror unit',
  bathroomStorage: 'bathroom storage',
  electricalFittings: 'electrical fittings',
  looseFurniture: 'loose furniture',
  whiteGoods: 'white goods',
  decor: 'decor',
  plumbing: 'plumbing',
  flooring: 'flooring',
};

export interface ScopeContradiction {
  key: string;
  label: string;
  evidence: string[];
}

/*
  Second opinion on every exclusion.

  The strict rules decide what the proposal states, and they say "not
  included" when the evidence is thin. That is the safe direction — except
  when it is wrong, because then the booklet prices a thing on one page and
  excludes it on another. That is exactly what shipped: three wardrobes worth
  about Rs 3.8 lakh, quoted and excluded in the same document.

  This relaxes one dimension and one only: matching is substring rather than
  whole-word, which is where the wardrobe case failed ("WARDOBE" is not the
  word "wardrobe"). The area scoping, the removal filter and the positional
  'below counter' rule all still apply — dropping those made the guard report
  a bedroom loft as a missing kitchen loft and kitchen storage as missing
  bathroom storage, and a warning that is usually wrong is a warning nobody
  reads.

  It decides nothing; it asks the studio to look, and is never shown to a
  client.
*/
export const findScopeContradictions = (
  items: ScopeItem[],
  scopes: Record<string, boolean>,
): ScopeContradiction[] => {
  const out: ScopeContradiction[] = [];

  Object.entries(SCOPE_RULES).forEach(([key, rule]) => {
    if (scopes[key]) return; // the document already says it is included

    const evidence = (items || [])
      .filter((i) => {
        const name = (i.name || '').toLowerCase();
        if (!name || isRemoval(name)) return false;
        // A line that says "excludes only the platform stone" agrees with the
        // exclusion rather than contradicting it. Warning about it is noise.
        if (rule.needsSupply && disclaimsSupply(name)) return false;
        if (rule.notPositional && isPositionalCounter(name)) return false;
        if (!inArea(i, rule.area || [])) return false;
        // The one relaxation, and the only one: substring rather than
        // whole-word, so a misspelling in the rate bank still raises the
        // question. Every other filter the strict rule applies still applies.
        return rule.any.some((t) => name.includes(t.toLowerCase()));
      })
      .map((i) => i.name || '')
      .filter((n, idx, arr) => arr.indexOf(n) === idx)
      .slice(0, 4);

    if (evidence.length) {
      out.push({ key, label: SCOPE_LABELS[key] || key, evidence });
    }
  });

  return out;
};

/** Evaluate every rule at once. */
export const detectAllScopes = (items: ScopeItem[]): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  Object.entries(SCOPE_RULES).forEach(([key, rule]) => {
    out[key] = detectScope(items, rule);
  });

  /*
    Shutters come with the units.

    A base or wall unit is quoted complete — a carcass without its shutters is
    not something anyone supplies. Listing "shutters" as an exclusion beside
    cabinets that are being built reads, to a client, as though they are being
    handed open boxes. So the shutters follow the units unless the BOQ
    separately says otherwise.
  */
  if (out.kitchenBaseWall) out.kitchenShutters = true;

  return out;
};
