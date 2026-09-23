/**
 * Reading a date the way somebody types it.
 *
 * A calendar is the right control for looking at a month. It is the wrong one
 * for a date you already know: dating twelve legacy invoices off the paperwork
 * in front of you is twelve navigations to a month you could have typed in six
 * characters.
 *
 * So the field takes typing too. Day-first throughout, because 3/7 is the third
 * of July to everyone who will use this, and a parser that quietly reads it as
 * the seventh of March on a payment schedule is worse than one that refuses.
 * Anything not understood returns null and the field says so rather than
 * guessing — a wrong date here reaches the client's portal and the forecast.
 */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const at = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = at(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d: Date, n: number) => { const x = at(d); x.setMonth(x.getMonth() + n); return x; };

/** 00–69 is this century, 70–99 the last. Four digits are taken as given. */
function year(raw: string): number {
  const n = Number(raw);
  if (raw.length === 4) return n;
  return n <= 69 ? 2000 + n : 1900 + n;
}

/*
  The whole word has to be a prefix of the month, not just its first three
  letters. Matching on a truncation let "month" find "monday" and turned
  "last month" into last Monday.
*/
const monthIndex = (word: string): number =>
  word.length >= 3 ? MONTHS.findIndex(m => m.startsWith(word)) : -1;

/** A real date, or null when the parts do not make one (31 Feb, month 13). */
function build(y: number, m: number, d: number): Date | null {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const date = new Date(y, m, d);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d ? date : null;
}

export function parseDateInput(raw: string, anchor: Date = new Date()): string | null {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  const today = at(anchor);

  // ── the words people actually use ─────────────────────────────────────
  if (s === 'today' || s === 'now') return iso(today);
  if (s === 'tomorrow' || s === 'tmrw') return iso(addDays(today, 1));
  if (s === 'yesterday') return iso(addDays(today, -1));
  if (s === 'eom' || s === 'end of month') return iso(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  if (s === 'som' || s === 'start of month') return iso(new Date(today.getFullYear(), today.getMonth(), 1));

  // ── offsets: +6w, -3d, in 2 weeks, 3 months ago ───────────────────────
  const unit = (u: string): 'd' | 'w' | 'm' | 'y' | null =>
    u.startsWith('d') ? 'd' : u.startsWith('w') ? 'w' : u.startsWith('mo') || u === 'm' ? 'm'
      : u.startsWith('y') ? 'y' : null;
  const shift = (n: number, u: 'd' | 'w' | 'm' | 'y') =>
    u === 'd' ? addDays(today, n) : u === 'w' ? addDays(today, n * 7)
      : u === 'm' ? addMonths(today, n) : addMonths(today, n * 12);

  let m: RegExpMatchArray | null;
  if ((m = s.match(/^([+-])\s*(\d+)\s*([a-z]+)$/))) {
    const u = unit(m[3]);
    if (u) return iso(shift((m[1] === '-' ? -1 : 1) * Number(m[2]), u));
  }
  if ((m = s.match(/^in (\d+) ([a-z]+)$/))) {
    const u = unit(m[2]);
    if (u) return iso(shift(Number(m[1]), u));
  }
  if ((m = s.match(/^(\d+) ([a-z]+) ago$/))) {
    const u = unit(m[2]);
    if (u) return iso(shift(-Number(m[1]), u));
  }

  // ── next / last friday, next month ────────────────────────────────────
  if ((m = s.match(/^(next|last|this) ([a-z]+)$/))) {
    const [, dir, word] = m;
    const wd = word.length >= 3 ? WEEKDAYS.findIndex(w => w.startsWith(word)) : -1;
    if (wd >= 0) {
      const diff = wd - today.getDay();
      if (dir === 'next') return iso(addDays(today, diff > 0 ? diff : diff + 7));
      if (dir === 'last') return iso(addDays(today, diff < 0 ? diff : diff - 7));
      return iso(addDays(today, diff));            // "this friday"
    }
    if (word === 'week') return iso(addDays(today, dir === 'last' ? -7 : dir === 'next' ? 7 : 0));
    if (word === 'month') return iso(addMonths(today, dir === 'last' ? -1 : dir === 'next' ? 1 : 0));
    if (word === 'year') return iso(addMonths(today, dir === 'last' ? -12 : dir === 'next' ? 12 : 0));
  }

  // ── end of march, end of mar 2024 ─────────────────────────────────────
  if ((m = s.match(/^end of ([a-z]+)(?: (\d{2,4}))?$/))) {
    const mi = monthIndex(m[1]);
    if (mi >= 0) return iso(new Date(m[2] ? year(m[2]) : today.getFullYear(), mi + 1, 0));
  }

  // ── 23/7/24, 23-07-2024, 2024-07-23 ───────────────────────────────────
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
    const d = build(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d ? iso(d) : null;
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/))) {
    /* Day first. 3/7 is the third of July, not the seventh of March. */
    const d = build(m[3] ? year(m[3]) : today.getFullYear(), Number(m[2]) - 1, Number(m[1]));
    return d ? iso(d) : null;
  }

  // ── 23 jul 24 · jul 23 2024 · 23 july ─────────────────────────────────
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)(?:,? (\d{2,4}))?$/))) {
    const mi = monthIndex(m[2]);
    if (mi >= 0) {
      const d = build(m[3] ? year(m[3]) : today.getFullYear(), mi, Number(m[1]));
      return d ? iso(d) : null;
    }
  }
  if ((m = s.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{2,4}))?$/))) {
    const mi = monthIndex(m[1]);
    if (mi >= 0) {
      const d = build(m[3] ? year(m[3]) : today.getFullYear(), mi, Number(m[2]));
      return d ? iso(d) : null;
    }
  }

  // ── mar 2023 · march → the first of that month ────────────────────────
  if ((m = s.match(/^([a-z]+)(?: (\d{4}))?$/))) {
    const mi = monthIndex(m[1]);
    if (mi >= 0) return iso(new Date(m[2] ? Number(m[2]) : today.getFullYear(), mi, 1));
  }

  // ── a bare day number, meaning this month ─────────────────────────────
  if ((m = s.match(/^(\d{1,2})$/))) {
    const d = build(today.getFullYear(), today.getMonth(), Number(m[1]));
    return d ? iso(d) : null;
  }

  return null;
}

/** What the parser understood, for the hint under the box. */
export function describeParsed(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
