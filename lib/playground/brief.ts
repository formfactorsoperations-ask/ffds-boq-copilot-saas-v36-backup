/*
  The brief in the first proposal (BOQ Playground PR B, as in the approved
  mockup): "What you told us" in the client's words, how this proposal answers
  it, their home and style, what design includes, and a timeline to handover;
  and, when others in the family decide too, the proposal on one page.

  Durations come from the project Timeline's programme. Without one, the
  booklet's defaults by configuration, plus the studio's days for civil work
  (Terms & Payment, 12 working days by default). Working days skip Sundays.
*/
import type { BoqItem, CivilScope, Item, ProjectContext, Room, TermsSettings } from '../../types';
import { resolveBoqLine } from '../boqPricing';
import { resolveCivilScope } from '../civilScope';
import { kindOf } from './rooms';
import { basisOfUnit } from '../boqSize';
import { engagementOf } from '../engagement';
import { livedInDays, type RenovationPlan } from '../renovation';

/** The studio's working days for civil work, when the Timeline does not give them. */
export const DEFAULT_CIVIL_DAYS = 12;
export const civilDaysOf = (terms: Pick<TermsSettings, 'civilWorkingDays'> | null | undefined) => {
  const n = Math.round(Number(terms?.civilWorkingDays));
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CIVIL_DAYS;
};

/** The booklet's site days by configuration, when there is no programme. */
export function siteDaysByConfig(config: string | undefined): number {
  const c = (config || '').toLowerCase().replace(/\s+/g, '');
  if (/1-?bhk|studio/.test(c)) return 45;
  if (/2-?bhk/.test(c)) return 60;
  if (/3-?bhk/.test(c)) return 75;
  if (/4-?bhk|duplex|villa/.test(c)) return 90;
  if (/bath/.test(c)) return 25;
  return 48;
}

/** The date `n` working days after `d`, Sundays off. */
export function addWorkingDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  let left = Math.max(0, Math.round(n));
  while (left > 0) {
    x.setDate(x.getDate() + 1);
    if (x.getDay() !== 0) left--;
  }
  return x;
}

export interface TimelineRow { name: string; days: number; start: Date; end: Date; offset: number }
export interface ProposalTimeline {
  rows: TimelineRow[];
  /** Working days in all. */
  total: number;
  handover: Date;
  target: Date | null;
  /** Weeks after the client's target (negative: before it); null without a target. */
  weeksLate: number | null;
  civil: boolean;
  /** Working days of civil work in the site's. */
  civilDays: number;
  /** From the project Timeline, or the defaults. */
  fromTimeline: boolean;
  designDays: number;
  siteDays: number;
  /** A renovation's strip-out, in the site's days: its own row. 0 when there is none (or the Timeline has none). */
  stripOutDays: number;
  /** How much longer the site work takes lived in, in % (0: vacant, or not a renovation). */
  livedInPercent: number;
}

/**
 * From booking (the day the proposal holds until) to the keys: site
 * measurement, layout and design, the Detailed BOQ and agreement, then the
 * work on site, with civil work first when there is any.
 */
export function proposalTimeline(a: {
  start: Date;
  programme?: { designWorkDays?: number; siteWorkDays?: number; sitePhases?: { id: string; durationDays: number }[] } | null;
  config?: string;
  civil: boolean;
  civilDays: number;
  target?: string | null;
  /** A renovation (lib/renovation): its strip-out first, and longer lived in. */
  renovation?: RenovationPlan | null;
}): ProposalTimeline {
  const fromTimeline = !!(a.programme && Number(a.programme.siteWorkDays) > 0);
  const designDays = Number(a.programme?.designWorkDays) > 0 ? Math.round(Number(a.programme!.designWorkDays)) : 14;
  const reno = a.renovation?.renovation ? a.renovation : null;
  /*
    The Timeline's site programme is built from the BOQ, civil work and a
    renovation's strip-out in it; the defaults add them. A Timeline saved before
    renovations were timed has no strip-out: the proposal says what the chart says.
  */
  const stripOutDays = !reno ? 0 : fromTimeline
    ? Math.round(Number(a.programme!.sitePhases?.find(p => p.id === 'exec-strip-out')?.durationDays) || 0)
    : reno.stripOutDays;
  const siteDays = fromTimeline
    ? Math.round(Number(a.programme!.siteWorkDays))
    : livedInDays(siteDaysByConfig(a.config) + (a.civil ? a.civilDays : 0), reno || { livedInPercent: 0 }) + stripOutDays;
  const steps: [string, number][] = [
    ['Site measurement', 6],
    ['Layout and design', designDays],
    ['Detailed BOQ and agreement', 6],
    ...(stripOutDays > 0 ? [['Strip-out and debris removal', stripOutDays] as [string, number]] : []),
    [a.civil ? (stripOutDays > 0 ? 'Civil, then interiors' : 'Civil first, then interiors') : 'Work on site', Math.max(1, siteDays - stripOutDays)],
  ];
  let d = a.start;
  let offset = 0;
  const rows = steps.map(([name, days]) => {
    const r = { name, days, start: d, end: addWorkingDays(d, days), offset };
    d = r.end;
    offset += days;
    return r;
  });
  const t = a.target ? new Date(a.target) : null;
  const target = t && !Number.isNaN(t.getTime()) ? t : null;
  return {
    rows, total: offset, handover: d, target,
    weeksLate: target ? Math.round((d.getTime() - target.getTime()) / (7 * 864e5)) : null,
    civil: a.civil, civilDays: a.civil ? a.civilDays : 0, fromTimeline, designDays, siteDays,
    stripOutDays, livedInPercent: reno && stripOutDays > 0 ? reno.livedInPercent : 0,
  };
}

/* ───────────────────────────── how this proposal answers the brief ───────────────────────────── */

const LIVE = (l: BoqItem) => l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted';
const STORAGE = /wardrobe|cabinet|loft|storage|cupboard|shoe|crockery|vanity/i;

export interface Answer { topic: string; text: string }

/**
 * What the client asked for, answered from the BOQ: closed storage, a kids'
 * room, the bathrooms, the floors, the kitchen. Only what the brief speaks of,
 * in its order; nothing when the brief says nothing.
 */
export function answersTo(brief: string | undefined, boq: BoqItem[], bankMap: Map<string, Item>, rooms: Room[]): Answer[] {
  const b = (brief || '').toLowerCase();
  if (!b.trim()) return [];
  const live = (boq || []).filter(l => LIVE(l) && resolveBoqLine(l, bankMap).billable);
  const nameOf = (l: BoqItem) => resolveBoqLine(l, bankMap).name;
  const roomKind = (name?: string) => {
    const r = rooms.find(x => x.name === name);
    return r ? kindOf(r) : null;
  };
  const out: { at: number; a: Answer }[] = [];
  const at = (re: RegExp) => { const m = b.search(re); return m < 0 ? null : m; };

  const s = at(/storage|wardrobe|cupboard|clutter|closed/);
  if (s !== null) {
    const store = live.filter(l => STORAGE.test(nameOf(l)) && basisOfUnit(resolveBoqLine(l, bankMap).unit) === 'area');
    const sq = Math.round(store.reduce((a, l) => a + (resolveBoqLine(l, bankMap).qty || 0), 0));
    const run = Math.round(live.filter(l => roomKind(l.roomId) === 'kitchen' && basisOfUnit(resolveBoqLine(l, bankMap).unit) === 'length').reduce((a, l) => a + (resolveBoqLine(l, bankMap).qty || 0), 0));
    out.push({ at: s, a: { topic: 'Closed storage', text: store.length ? `${store.length} storage unit${store.length === 1 ? '' : 's'} with about ${sq} sq ft of shutters${run ? `, plus ${run} ft of kitchen cabinets` : ''}.` : 'No storage in this option yet.' } });
  }
  const k = at(/kid|child|son|daughter/);
  if (k !== null) {
    const kidsRooms = rooms.filter(r => /kid|child/i.test(r.name)).map(r => r.name);
    const names = [...new Set(live.filter(l => kidsRooms.includes(String(l.roomId))).map(nameOf))];
    out.push({ at: k, a: { topic: 'A kids’ room that grows', text: names.length ? `${names.join(', ')}.` : 'Not in this option yet.' } });
  }
  const w = at(/bath|toilet|leak|waterproof/);
  if (w !== null) {
    const rebuilt = live.some(l => l.civil && roomKind(l.roomId) === 'toilet');
    out.push({ at: w, a: { topic: 'The bathrooms', text: rebuilt ? 'Rebuilt: waterproofing with a ponding test, new floor and wall tiles, then fittings.' : 'Fittings only for now; the civil work can be added.' } });
  }
  const f = at(/floor/);
  if (f !== null) {
    const floored = [...new Set(live.filter(l => l.civil && /floor/.test(String((l.civil as any).type || ''))).map(l => String(l.roomId)))];
    out.push({ at: f, a: { topic: 'The floors', text: floored.length ? `New flooring in ${floored.join(', ')}.` : 'The existing floors stay; new flooring can be added.' } });
  }
  const kt = at(/kitchen/);
  if (kt !== null) {
    const names = [...new Set(live.filter(l => roomKind(l.roomId) === 'kitchen').map(nameOf))];
    out.push({ at: kt, a: { topic: 'The kitchen', text: names.length ? `${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}.` : 'Not in this option yet.' } });
  }
  return out.sort((x, y) => x.at - y.at).map(x => x.a);
}

/* ───────────────────────────── the home, the style, what design includes ───────────────────────────── */

/** The civil scope as the client reads it, in the mockup's words and order. */
const SCOPE_CHIPS: [keyof CivilScope, string][] = [
  ['bathrooms', 'Bathrooms'], ['flooring', 'Flooring'], ['kitchenCivil', 'Kitchen civil'], ['rewiring', 'Rewiring'],
  ['plumbing', 'Plumbing'], ['falseCeiling', 'False ceiling'], ['painting', 'Painting'],
];

const STATUS: Record<string, string> = {
  raw_shell: 'A raw shell: everything is built new',
  semi_finished: 'Semi-finished: flooring laid, plumbing ready',
  finished: 'A finished flat: a renovation',
};

export interface BriefHome {
  line: string;
  status: string;
  /** The civil scope, each in or out. */
  scope: { label: string; on: boolean }[];
  style: string;
  /** What design includes, and what it does not. */
  deliver: { label: string; on: boolean }[];
}

export function briefHome(ctx: ProjectContext): BriefHome {
  const scope = resolveCivilScope(ctx);
  const ds: any = ctx.designScope || {};
  const visits = Number(ds.visitCount) || 0;
  return {
    line: [ctx.config, Number(ctx.area) ? `${Number(ctx.area).toLocaleString('en-IN')} sq ft` : '', Number(ctx.ceilingHeight) ? `${ctx.ceilingHeight} ft ceilings` : ''].filter(Boolean).join(' · '),
    status: STATUS[String(ctx.propertyStatus)] || '',
    scope: SCOPE_CHIPS.map(([k, label]) => ({ label, on: !!scope[k] })),
    style: String((ctx as any).theme || ''),
    deliver: ctx.designScope ? [
      { label: '3D views of every room', on: !!ds.has3DRenders },
      { label: '2D working drawings', on: !!ds.has2DDrawings },
      { label: 'Furniture and décor selection', on: !!ds.hasFurnitureSelection },
      { label: visits ? `${visits} site visits during the work` : 'Site visits during the work', on: !!ds.hasSiteVisits },
      { label: 'VR walkthrough', on: !!ds.hasVrWalkthrough },
    ] : [],
  };
}

/*
  What the proposal says under its timeline and under its site visits (the
  owner, Nov 2026): the dates are a plan that holds on conditions, and the
  visits are counted. A renovation (a finished flat) is timed like a vacant
  flat for now, so it says so and that its own timeline follows the site
  measurement; renovation timelines of their own come later.
*/
export interface ProposalNotes {
  /** Under "Your timeline", in order. */
  timeline: string[];
  /** Under "What design includes", when site visits are in it. */
  visits: string | null;
  /** A renovation: timed like a vacant flat for now. */
  renovation: boolean;
}

export const TIMELINE_NOTE = 'These dates are a plan, not a promise. They hold when design approvals and payments are made on time, the site is handed over ready for work, and the materials you choose are available. A change to the design or scope after approval, society permissions and work hours, holidays, and delays outside our control move them; we tell you as soon as they do.';
export const RENOVATION_NOTE = 'Your home is a renovation, and this timeline is the one for a vacant flat. A renovation also needs time to take out what is there today, and the work goes more slowly if you live in the home while it is done. We confirm the timeline for your home after the site measurement.';

/** A renovation the Timeline times as one (lib/renovation): what its timeline allows for. */
export function renovationNote(stripOutDays: number, livedInPercent: number): string {
  return `Your home is a renovation. The timeline starts with ${stripOutDays} working day${stripOutDays === 1 ? '' : 's'} to take out what is there today and clear the debris${livedInPercent > 0 ? `, and allows for you living in the home during the work: it goes room by room around you, so the work on site takes about ${livedInPercent}% longer than in a vacant flat` : ''}. We confirm it after the site measurement.`;
}

export function proposalNotes(ctx: ProjectContext, timeline?: Pick<ProposalTimeline, 'stripOutDays' | 'livedInPercent'> | null): ProposalNotes {
  const ds: any = ctx.designScope || {};
  const visits = Number(ds.visitCount) || 0;
  const renovation = ctx.propertyStatus === 'finished';
  const turnkey = engagementOf(ctx) === 'turnkey';
  return {
    /* A renovation timed as one says what its timeline allows for; one on a Timeline made before, that it is a vacant flat's. */
    timeline: [TIMELINE_NOTE, ...(renovation ? [timeline?.stripOutDays ? renovationNote(timeline.stripOutDays, timeline.livedInPercent) : RENOVATION_NOTE] : [])],
    visits: ctx.designScope && ds.hasSiteVisits
      ? [
        `${visits ? `The ${visits} site visit${visits > 1 ? 's are' : ' is'}` : 'Site visits are'} by your designer, planned with you in advance, at the stages the work needs them.`,
        'More visits are on request and may be charged.',
        ...(turnkey ? ['Our site team’s day-to-day supervision of the work is separate and not counted in them.'] : []),
      ].join(' ')
      : null,
    renovation,
  };
}

/** Others decide too: the one-page summary is added (lib/playground/proposal pageOrder). */
export const othersDecide = (hidden: string | null | undefined) => !!hidden && hidden !== 'None';

/** A room's items for the summary: the first three names, "and N more". */
export function roomIncludes(boq: BoqItem[], bankMap: Map<string, Item>, room: string): string {
  const names = [...new Set((boq || []).filter(l => LIVE(l) && l.roomId === room && resolveBoqLine(l, bankMap).billable && !resolveBoqLine(l, bankMap).asActuals).map(l => resolveBoqLine(l, bankMap).name))];
  return names.length ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}` : 'Painting, ceiling and electrical';
}

