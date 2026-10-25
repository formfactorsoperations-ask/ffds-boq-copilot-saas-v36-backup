/**
 * Reading and showing a number the studio types.
 *
 * Every number box in the BOQ editor parsed each keystroke straight into the
 * line and redrew itself from the result. Emptying a box therefore showed "0"
 * (so 2.5 became "02.5"), and a box whose figure is worked out from others
 * fought the typing outright: the Excel view's Cost is material + labour, so
 * clearing it showed the labour, and typing 3200 after that wrote a material
 * cost of ₹80,02,400. These two helpers are what NumberField uses instead.
 */

export type ParsedNumber =
  | { kind: 'number'; value: number }
  | { kind: 'empty' }
  /** Half-typed: "-", ".", "12." — not wrong, just not finished. */
  | { kind: 'partial' }
  | { kind: 'invalid' };

/** Reads "3,200", "₹ 3200", "12.5%", ".6", "-4" the way a person means them. */
export function parseNumberInput(text: string): ParsedNumber {
  const t = (text ?? '').toString().replace(/[\s,₹%]/g, '');
  if (t === '') return { kind: 'empty' };
  if (t === '-' || t === '.' || t === '-.' || /\.$/.test(t) && /^-?\d*\.$/.test(t)) return { kind: 'partial' };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return { kind: 'invalid' };
  const value = Number(t);
  return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'invalid' };
}

/** 3200 → "3200", 41.8333 → "41.83", 2.50 → "2.5", null → "". */
export function formatNumberInput(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '';
  const f = 10 ** decimals;
  return String(Math.round(Number(value) * f) / f);
}

/**
 * A new unit cost, split between material and labour in the line's own ratio.
 *
 * The Excel view's Cost used to put the whole change on material and floor it
 * at zero, so any cost under the labour was silently raised back to it. A
 * line with no cost yet takes `fallbackRatio` (material share), else all
 * material. The two halves always add back to exactly the cost typed.
 */
export function splitUnitCost(total: number, materials: number, labor: number, fallbackRatio?: number): { materials: number; labor: number } {
  const t = Math.max(0, Number(total) || 0);
  const m = Math.max(0, Number(materials) || 0);
  const l = Math.max(0, Number(labor) || 0);
  const ratio = m + l > 0 ? m / (m + l) : (fallbackRatio ?? 1);
  const mat = Math.round(t * ratio * 100) / 100;
  return { materials: mat, labor: Math.round((t - mat) * 100) / 100 };
}
