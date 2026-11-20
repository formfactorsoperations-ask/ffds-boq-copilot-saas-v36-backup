/*
  Brief & Site, read first (owner's choice, option C of the brief redesign).

  The screen opens as a read of the brief rather than a form: the client's
  words, how the studio read them into the civil scope, the home as facts, the
  client's floor plan and the rooms. These are the pure parts behind it, so the
  screen only lays them out (components/brief/BriefReadView).

  The floor plan comes first in what is missing: the studio does not go ahead
  without the client's plan.
*/
import type { ProjectContext, CivilScope } from '../types';
import { CIVIL_SCOPE_FIELDS, DEFAULT_CIVIL_SCOPE, resolveCivilScope, suggestScopeFromBrief } from './civilScope';
import { realRooms } from './scopeBuckets';
import { isPdfSheet, dataUrlOf } from './playground/planSheet';

/** The parts of the brief a gap is fixed in: one of the form's parts, or the floor plan. */
export type BriefGapPart = 'plan' | 'client' | 'site' | 'brief' | 'classification' | 'home' | 'fees' | 'rooms';

export interface BriefGap {
  key: string;
  label: string;
  part: BriefGapPart;
  /** Needed before the studio goes ahead; the rest only make the brief whole. */
  required: boolean;
}

/** The client's floor plan: the one given with the brief, else one uploaded under the BOQ. */
export interface ClientPlan {
  url: string;
  pdf: boolean;
  /** Where it came from, in the words the screen uses. */
  from: 'brief' | 'boq';
}

export function clientPlanOf(ctx: Partial<ProjectContext>): ClientPlan | null {
  const c = ctx as any;
  const pdfOf = (url: string) => isPdfSheet({ source: 'brief', imageUrl: url });
  if (c.floorplanImageUrl) return { url: c.floorplanImageUrl, pdf: pdfOf(c.floorplanImageUrl), from: 'brief' };
  if (c.floorplanImage) {
    const url = dataUrlOf(c.floorplanImage);
    return { url, pdf: pdfOf(url), from: 'brief' };
  }
  if (c.planSheet?.source === 'upload' && c.planSheet.imageUrl) {
    return { url: c.planSheet.imageUrl, pdf: pdfOf(c.planSheet.imageUrl), from: 'boq' };
  }
  return null;
}

const filled = (v: unknown) => typeof v === 'string' ? v.trim().length > 0 : v != null;

/** What the brief does not have yet, the floor plan first. */
export function briefGaps(ctx: Partial<ProjectContext>): BriefGap[] {
  const c = ctx as any;
  const classified = typeof c.isDummy === 'boolean' || c.projectCategory === 'actual' || c.projectCategory === 'dummy';
  const checks: [boolean, BriefGap][] = [
    [!!clientPlanOf(ctx), { key: 'plan', label: 'Floor plan', part: 'plan', required: true }],
    [filled(c.clientName), { key: 'clientName', label: 'Client name', part: 'client', required: true }],
    [filled(c.clientPhone), { key: 'clientPhone', label: 'Phone', part: 'client', required: true }],
    [Number(c.area) > 0, { key: 'area', label: 'Area', part: 'home', required: true }],
    [filled(c.config), { key: 'config', label: 'Configuration', part: 'home', required: true }],
    [String(c.clientBrief || '').trim().length >= 8, { key: 'brief', label: 'The client’s requirement', part: 'brief', required: true }],
    [filled(c.clientEmail), { key: 'clientEmail', label: 'Email', part: 'client', required: false }],
    [filled(c.location), { key: 'location', label: 'Site location', part: 'client', required: false }],
    [filled(c.propertyStatus), { key: 'propertyStatus', label: 'Site state', part: 'site', required: false }],
    [filled(c.theme), { key: 'theme', label: 'Style', part: 'home', required: false }],
    [realRooms(c.rooms).length > 0, { key: 'rooms', label: 'Rooms', part: 'rooms', required: false }],
    [classified, { key: 'classification', label: 'Actual or dummy', part: 'classification', required: false }],
  ];
  return checks.filter(([ok]) => !ok).map(([, gap]) => gap);
}

/** How much of the brief is in: the checks briefGaps makes, as done of total. */
export function briefCompleteness(ctx: Partial<ProjectContext>): { done: number; total: number; pct: number } {
  const total = 12;
  const done = total - briefGaps(ctx).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

export interface ScopeReading {
  key: keyof CivilScope;
  label: string;
  on: boolean;
  /** Why it is the way it is. */
  why: { kind: 'brief'; quote: string } | { kind: 'site' } | { kind: 'hand' } | { kind: 'default' };
  /** The brief says the opposite and the studio has not applied it. */
  briefDisagrees?: string;
}

/**
 * Each civil switch, and why it is on or off: the brief's own words where they
 * led to it, else the site state, else the studio's hand.
 */
export function readScope(ctx: Partial<ProjectContext>): ScopeReading[] {
  const live = resolveCivilScope(ctx);
  const status = (ctx as any).propertyStatus as keyof typeof DEFAULT_CIVIL_SCOPE | undefined;
  const fromSite = status ? DEFAULT_CIVIL_SCOPE[status] : null;
  const said = new Map(suggestScopeFromBrief(ctx.clientBrief).map(s => [s.key, s]));
  return CIVIL_SCOPE_FIELDS.map(f => {
    const on = !!live[f.key];
    const s = said.get(f.key);
    const why: ScopeReading['why'] = s && s.value === on ? { kind: 'brief', quote: s.quote }
      : fromSite && !!fromSite[f.key] === on ? { kind: 'site' }
      : ctx.civilScope ? { kind: 'hand' }
      : { kind: 'default' };
    return { key: f.key, label: f.label, on, why, ...(s && s.value !== on ? { briefDisagrees: s.quote } : {}) };
  });
}

/** The rooms' total floor area, against the area on record. */
export function roomsArea(ctx: Partial<ProjectContext>): { count: number; sqft: number; area: number } {
  const rooms = realRooms(ctx.rooms);
  return {
    count: rooms.length,
    sqft: Math.round(rooms.reduce((a, r) => a + (Number(r.size) || 0), 0)),
    area: Number(ctx.area) || 0,
  };
}
