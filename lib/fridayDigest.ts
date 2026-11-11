/*
  THE FRIDAY DIGEST (Ops Desk 2.1, owner's choices, 11 Nov 2026).

  Every client gets one short update a week. It is built on the project's
  Weekly Pulse when that week has one (Site Ops), and otherwise drafted from
  what was recorded that week: site updates, drawings the client approved,
  decisions they signed, what they still owe us, and what is coming. It is
  written from the records only, in fixed wording, so nothing is made up, and
  nothing about money goes in: every line is passed through the amount mask,
  and payment asks are left out.

  A person writes it, a lead approves it, and only then can it be sent, on
  WhatsApp (a person presses send) or by email from the studio's address
  (functions/src/fridayDigest.ts, which refuses one that is not approved).

  Stored at projects/{projectId}/digests/{week}, the week being the Friday's
  date. Pure, so the app, the server and the tests share it.
*/
import { maskAmounts } from './opsAccess';
import { clientEmails } from './clientContacts';
import type { QueueItem } from './opsDesk';

export type DigestStatus = 'draft' | 'pending_review' | 'returned' | 'approved' | 'sent' | 'skipped';
export const DIGEST_STATUS_LABEL: Record<DigestStatus, string> = {
  draft: 'Draft', pending_review: 'Awaiting approval', returned: 'Sent back', approved: 'Approved', sent: 'Sent', skipped: 'Skipped this week',
};

export interface Digest {
  tenantId: string;
  projectId: string;
  projectName: string;
  /** The Friday of the week it covers, YYYY-MM-DD (India). */
  week: string;
  status: DigestStatus;
  subject: string;
  body: string;
  /** Links to the week's photos (https only), shown under the message. */
  photos: string[];
  /** Where the draft came from, for the person checking it. */
  sources: string[];
  preparedBy: string;
  preparedByName: string;
  preparedAt: number;
  reviewNote?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: number | null;
  sentAt?: number | null;
  sentBy?: string | null;
  sentVia?: 'email' | 'whatsapp' | null;
  updatedAt: number;
}

export const BODY_MAX = 6000;
export const PHOTO_MAX = 12;

/* ── The week ────────────────────────────────────────────────────────────── */

const IST = 5.5 * 3600000;
const DAY = 86400000;
const keyOf = (ms: number) => new Date(ms + IST).toISOString().slice(0, 10);
const startOf = (key: string) => new Date(`${key}T00:00:00+05:30`).getTime();

/** This week's Friday: Monday to Sunday all belong to the Friday between them. */
export function digestWeekOf(now: number): string {
  const today = keyOf(now);
  const dow = new Date(`${today}T12:00:00+05:30`).getUTCDay(); // 0 Sunday
  const toFriday = dow === 0 ? -2 : 5 - dow;
  return keyOf(startOf(today) + toFriday * DAY + 12 * 3600000);
}

/** The days the update covers: Saturday before the Friday to the end of the Friday. */
export function weekWindow(week: string): { from: number; to: number } {
  return { from: startOf(week) - 6 * DAY, to: startOf(week) + DAY - 1 };
}

/* ── Drafting ────────────────────────────────────────────────────────────── */

const ms = (v: any): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
};
const clean = (s: any, max = 220) => maskAmounts(String(s ?? '').replace(/\s+/g, ' ').trim()).slice(0, max);
const firstOf = (client: string) => String(client || '').split(/\s*(?:&|,| and )\s*/)[0].trim() || 'there';
const day = (t: number) => new Date(t).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const dateOnly = (key: string) => new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
const WAITING = new Set(['notified', 'drawing_pending', 'drawing_sent']);

export interface DigestInput {
  week: string;
  projectName: string;
  client: string;
  /** The project's context: siteUpdates, weeklyReports, status, targetHandoverDate, journeySummary. */
  ctx: any;
  /** The site team's updates, where this person may see them (executionData.updates or the ops copy's siteWork). */
  siteUpdates?: any[];
  /** Drawings shown to the client, and their approval. */
  approvals?: { sheets: { room: string; name: string }[]; stage: string; approvedAt: number | null }[];
  decisions?: any[];
  visits?: { purpose: string; slot: { date: string; time: string } | null; status: string }[];
  /** How far along, out of 100, when known. */
  progress?: number | null;
  sender: string;
  studio: string;
}

export interface Drafted { subject: string; body: string; photos: string[]; sources: string[]; quiet: boolean; done: string[]; next: string[]; asks: string[] }

/** The week's Weekly Pulse report, when Site Ops wrote one for it. */
export function pulseFor(ctx: any, week: string): any | null {
  const { from, to } = weekWindow(week);
  const list: any[] = Array.isArray(ctx?.weeklyReports) ? ctx.weeklyReports : [];
  return list.filter((r) => { const t = ms(r?.weekOf); return t != null && t >= from - 2 * DAY && t <= to; })
    .sort((a, b) => (ms(b.weekOf) || 0) - (ms(a.weekOf) || 0))[0] || null;
}

const lines = (text: any) => String(text || '').split(/\n+|(?<=\.)\s+(?=[A-Z])/).map((l) => clean(l.replace(/^[\s•\-*\d.)]+/, ''))).filter((l) => l.length > 2);

export function draftDigest(i: DigestInput): Drafted {
  const { from, to } = weekWindow(i.week);
  const inWeek = (t: number | null) => t != null && t >= from && t <= to;
  const sources: string[] = [];
  const pulse = pulseFor(i.ctx, i.week);
  let done: string[] = [];
  let next: string[] = [];
  let photos: string[] = [];

  if (pulse) {
    sources.push(`Weekly Pulse, week ${pulse.weekNumber ?? ''}`.trim());
    done = lines(pulse.thisWeek).slice(0, 6);
    next = lines(pulse.nextWeek).slice(0, 5);
    photos = (Array.isArray(pulse.photos) ? pulse.photos : []).filter((p: any) => typeof p === 'string' && /^https:\/\//.test(p));
  }

  /* Site updates recorded this week, from the project's timeline and the site team. */
  const site = [
    ...(Array.isArray(i.ctx?.siteUpdates) ? i.ctx.siteUpdates : []).filter((u: any) => (u?.type || 'site') === 'site').map((u: any) => ({ t: ms(u?.date), text: u?.title || u?.description, pics: u?.images })),
    ...(i.siteUpdates || []).map((u: any) => ({ t: ms(u?.date ?? u?.at ?? u?.createdAt), text: u?.text || u?.title || u?.note || u?.description, pics: u?.images || u?.photos || u?.photoUrls })),
  ].filter((u) => inWeek(u.t) && u.text);
  if (site.length) sources.push(`${site.length} site update${site.length === 1 ? '' : 's'}`);
  if (!pulse) done.push(...site.sort((a, b) => (a.t || 0) - (b.t || 0)).map((u) => clean(u.text)).slice(0, 6));
  photos.push(...site.flatMap((u) => (Array.isArray(u.pics) ? u.pics : [])).filter((p: any) => typeof p === 'string' && /^https:\/\//.test(p)));

  /* Drawings the client approved this week. */
  const approvedNow = (i.approvals || []).filter((a) => a.stage === 'approved' && inWeek(a.approvedAt));
  if (approvedNow.length) {
    sources.push('Drawings for approval');
    done.push(...approvedNow.map((a) => `Your approval of ${a.sheets.length === 1 ? clean(`${a.sheets[0].room} – ${a.sheets[0].name}`) : `${a.sheets.length} drawings`} is recorded, thank you`));
  }
  /* Decisions they signed this week. */
  const signed = (i.decisions || []).filter((d) => String(d?.status) === 'signed' && inWeek(ms(d?.signoff?.respondedAt) ?? ms(d?.respondedAt) ?? ms(d?.updatedAt)));
  if (signed.length) { sources.push('Decisions'); done.push(...signed.map((d) => `Agreed: ${clean(d.decisionText || d.title)}`)); }

  /* Coming up: meetings and visits in the next week. */
  const soon = (i.visits || []).filter((v) => v.slot?.date && v.status !== 'cancelled' && v.status !== 'done' && startOf(v.slot.date) > to && startOf(v.slot.date) <= to + 7 * DAY)
    .sort((a, b) => `${a.slot!.date}${a.slot!.time}`.localeCompare(`${b.slot!.date}${b.slot!.time}`));
  if (soon.length) sources.push('Meetings & visits');
  next.push(...soon.map((v) => clean(`${v.purpose || 'Meeting'} on ${day(startOf(v.slot!.date) + 12 * 3600000)}${v.slot!.time ? ` at ${clock(v.slot!.time)}` : ''}`)));

  /* What the client still owes us: decisions and approvals, never payments. */
  const asks = uniq([
    ...(pulse && Array.isArray(pulse.asks) ? pulse.asks.filter((a: any) => a?.kind !== 'payment').map((a: any) => clean(a.label)) : []),
    ...(i.decisions || []).filter((d) => WAITING.has(String(d?.status))).map((d) => `Your choice on ${clean(d.decisionText || d.title, 140)}`),
    ...(i.approvals || []).filter((a) => a.stage === 'sent' || a.stage === 'overdue').map((a) => `Your written approval of ${a.sheets.length} drawing${a.sheets.length === 1 ? '' : 's'}, by replying to our email`),
  ]).slice(0, 5);

  done = uniq(done).slice(0, 7);
  next = uniq(next).slice(0, 6);
  photos = uniq(photos).slice(0, PHOTO_MAX);
  const quiet = !done.length && !next.length && !asks.length;

  const handover = i.ctx?.targetHandoverDate && /^\d{4}-\d{2}-\d{2}/.test(i.ctx.targetHandoverDate) ? dateOnly(String(i.ctx.targetHandoverDate).slice(0, 10)) : null;
  const where = [i.progress != null ? `${Math.round(i.progress)}% done` : '', handover && i.ctx?.status !== 'completed' ? `handover ${handover}` : ''].filter(Boolean).join(' · ');
  const bullet = (xs: string[]) => xs.map((x) => `• ${x}`).join('\n');
  const parts = [
    `Hi ${firstOf(i.client)}, here is how ${i.projectName} moved this week.`,
    where,
    done.length ? `Done this week\n${bullet(done)}` : quiet ? 'A quieter week on our side; the work goes on as planned.' : '',
    next.length ? `Next week\n${bullet(next)}` : '',
    asks.length ? `From you\n${bullet(asks)}` : '',
    photos.length ? `Photos from this week: ${photos.length}` : '',
    `${i.sender}${i.studio ? `, ${i.studio}` : ''}`,
  ].filter(Boolean);
  return {
    subject: `${i.projectName}: your update for the week of ${dateOnly(i.week)}`.slice(0, 200),
    body: parts.join('\n\n').slice(0, BODY_MAX),
    photos, sources: sources.length ? sources : ['Nothing recorded this week'], quiet, done, next, asks,
  };
}

const clock = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

/* ── Sending ─────────────────────────────────────────────────────────────── */

/** The email: the approved text, with the photos as links, escaped. Money is masked again, in case. */
export function digestEmail(d: Pick<Digest, 'subject' | 'body' | 'photos'>, studio: string): { subject: string; html: string; text: string } {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const body = maskAmounts(d.body);
  const photos = (d.photos || []).filter((p) => /^https:\/\//.test(p)).slice(0, PHOTO_MAX);
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1E293B;max-width:560px">${esc(body).replace(/\n/g, '<br>')}${photos.length ? `<p style="margin-top:16px">${photos.map((p, n) => `<a href="${esc(p)}">Photo ${n + 1}</a>`).join(' · ')}</p>` : ''}<p style="margin-top:24px;color:#64748B;font-size:12px">${esc(studio || '')}</p></div>`;
  const text = `${body}${photos.length ? `\n\n${photos.map((p, n) => `Photo ${n + 1}: ${p}`).join('\n')}` : ''}`;
  return { subject: maskAmounts(d.subject || 'Your weekly update').slice(0, 200), html, text };
}

/** The client's email addresses, from the project. */
export const digestRecipients = (ctx: any): string[] => clientEmails(ctx).slice(0, 10);

/* ── On the Today list ───────────────────────────────────────────────────── */

/**
 * What the digest asks of this person today. A lead: each update waiting for
 * approval. Everyone who writes them: one sent back, one approved and not yet
 * sent, and from Thursday to Sunday one line for the updates still to write.
 */
export function digestQueue(i: {
  projects: { id: string; name: string; inWork: boolean }[]; digests: Record<string, Pick<Digest, 'status' | 'preparedByName' | 'reviewNote'>>;
  isLead: boolean; canWrite: boolean; week: string; now: number;
}): QueueItem[] {
  const today = new Date(i.now + IST).toISOString().slice(0, 10);
  const dow = new Date(`${today}T12:00:00+05:30`).getUTCDay();
  const out: QueueItem[] = [];
  const work = i.projects.filter((p) => p.inWork);
  for (const p of work) {
    const d = i.digests[p.id];
    const base = { group: 'today' as const, kind: 'digest' as const, projectId: p.id, projectName: p.name, due: today, ref: p.id };
    if (d?.status === 'pending_review' && i.isLead) out.push({ ...base, id: `dg:approve:${p.id}`, title: `Approve the Friday update: ${p.name}`, detail: `Written by ${d.preparedByName || 'the team'}` });
    if (!i.canWrite) continue;
    if (d?.status === 'returned') out.push({ ...base, id: `dg:returned:${p.id}`, title: `Friday update sent back: ${p.name}`, detail: d.reviewNote || 'A lead sent it back with a note' });
    if (d?.status === 'approved') out.push({ ...base, id: `dg:send:${p.id}`, title: `Send the Friday update: ${p.name}`, detail: 'Approved; send it on WhatsApp or by email' });
  }
  const toWrite = work.filter((p) => !i.digests[p.id] || i.digests[p.id].status === 'draft').length;
  if (i.canWrite && toWrite && (dow === 4 || dow === 5 || dow === 6 || dow === 0)) {
    out.push({ id: `dg:write:${i.week}`, group: 'today', kind: 'digest', projectId: '', projectName: 'Friday digest', title: `Write this week’s Friday updates`, detail: `${toWrite} client${toWrite === 1 ? '' : 's'} still to write`, due: today, ref: '' });
  }
  return out;
}
