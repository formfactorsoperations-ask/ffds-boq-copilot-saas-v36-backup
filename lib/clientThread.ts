/*
  ONE CLIENT'S THREAD: everything StudioDesk already knows about a client, in
  date order (DESIGN.md "Clients: conversations", approved 25 Nov 2026).

  It is not live chat. Nothing here is stored: the thread is worked out from
  records the studio already keeps, and a WhatsApp reply appears only once
  someone logs it on the Ops Desk follow-up log.

    - What the studio sent: a follow-up logged as a reminder (a WhatsApp opened
      from StudioDesk, a call, an email).
    - What the client said: a reply, a promise or no answer logged by the team,
      a chat or call captured with its mood, and a message they wrote in their
      portal.
    - What happened: the enquiry, the proposal going out, visits and meetings
      done, minutes shared, invoices and payments, drawings signed off, the
      client's own actions in their portal, and portal access given or taken.
    - Milestones as stickers: Agreement signed (gold), Unpaid · n days (rose)
      and No reply in n days (amber).

  A client with several projects gets one thread, each entry tagged with its
  project. Where amounts are hidden the money arrives without them
  (lib/clientMoney withoutAmounts), so a payment reads "Paid a stage" with no
  figure. Portal visits (lib/portalVisits) add "First opened the portal" and
  one card a day listing the tabs the client opened; a Viewer's screen passes
  none, so they see none.

  Pure, so the tests run it.
*/
import type { FollowUp } from './opsDesk';
import type { ClientMoney } from './clientMoney';
import type { VisitRequest } from './clientCare';
import type { DesignMeeting } from './designMeeting';
import { heardFromClient, moodOf } from './clientCare';
import { dueAtOf, CHASE_AFTER_DAYS, QUIET_AFTER_DAYS } from './clientNextMove';
import { lineText } from './clientList';
import { normEmail } from './clientContacts';
import { formatINR } from './utils';
import { TAB_LABEL, tabLabel, type PortalVisit } from './portalVisits';

/** Where an entry came from: its chip, by DESIGN.md's colours. */
export type ThreadSource = 'sent' | 'proposals' | 'portal' | 'payments' | 'design' | 'site' | 'team';

export const SOURCE_LABEL: Record<ThreadSource, string> = {
  sent: 'Sent from StudioDesk',
  proposals: 'Proposals',
  portal: 'Client portal',
  payments: 'Payments',
  design: 'Design Desk',
  site: 'Site & meetings',
  team: 'Logged by the team',
};

export interface ThreadEntry {
  id: string;
  at: number;
  /** sent: the studio's bubble (right); said: the client's words (left); event: a card; sticker: a milestone, centred. */
  kind: 'sent' | 'said' | 'event' | 'sticker';
  /** Who did it: the studio's entries sit on the right, the client's on the left. */
  side: 'studio' | 'client';
  text: string;
  /** A second line: the question asked, the rooms signed off. */
  detail?: string | null;
  /** "Opened in WhatsApp · logged", "Asha · from a call". */
  meta?: string | null;
  source?: ThreadSource;
  /** The template a message went out on, as its chip. */
  template?: string | null;
  /** A sticker's colour. */
  tone?: 'gold' | 'bad' | 'warn';
  projectId: string;
  /** Set only when the client has more than one project. */
  projectName?: string | null;
}

export interface ThreadProject {
  id: string;
  name: string;
  context: any;
}

/** What one client's thread is built from, loaded once when the client is opened. */
export interface ThreadRecords {
  followUps: FollowUp[];
  visits: VisitRequest[];
  /** Minutes, each with the project they belong to. */
  moms: Array<Record<string, any> & { projectId: string }>;
  meetings: Array<Pick<DesignMeeting, 'id' | 'projectId' | 'rooms' | 'closedAt' | 'confirmation' | 'approval' | 'state'>>;
  /** When each project's lead came in, where the project was opened from one. */
  leadCreatedAt: Record<string, number>;
}

export const EMPTY_RECORDS: ThreadRecords = { followUps: [], visits: [], moms: [], meetings: [], leadCreatedAt: {} };

export interface ThreadInput {
  clientName: string;
  projects: ThreadProject[];
  /** Each project's money as the client sees it, already without amounts where they are hidden. */
  money: Record<string, ClientMoney | null>;
  records: ThreadRecords;
  /** Portal visits on the client's projects; left out for a Viewer. */
  portalVisits?: PortalVisit[];
  now: number;
}

const DAY = 24 * 60 * 60 * 1000;
const CHANNEL_WORDS: Record<string, string> = { whatsapp: 'WhatsApp', call: 'a call', email: 'email', meeting: 'a meeting', other: 'the team' };
const DOC_LABEL: Record<string, string> = {
  terms_docket: 'the Terms Docket', payment_schedule: 'the payment schedule', execution_agreement: 'the Execution Agreement',
  onboarding_kit: 'the onboarding kit', handover_docket: 'the handover docket', snag_list: 'the snag list',
  detailed_boq: 'the detailed BOQ', scope_revision: 'a scope revision',
};
/* Signed through their own sign-off records (the stickers), so their issue signatures are not listed twice. */
const SIGNED_BY_SIGNOFF = new Set(['terms_docket', 'execution_agreement', 'handover_docket']);
const ASSUMED_GATE = new Set(['legacy', 'auto-sync-journey']);

/** A time from a number (ms), an ISO string or a YYYY-MM-DD day (taken at noon in India). */
export function msOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00+05:30` : v);
  return Number.isFinite(t) ? t : null;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const docLabel = (kind: string) => DOC_LABEL[kind] || 'a document';
const visitWord = (k: string) => (k === 'site_visit' ? 'Site visit' : k === 'measurement' ? 'Measurement' : 'Meeting');

/** One project's entries. */
function projectEntries(p: ThreadProject, i: ThreadInput, tag: string | null): ThreadEntry[] {
  const out: ThreadEntry[] = [];
  const ctx = p.context || {};
  const add = (e: Omit<ThreadEntry, 'projectId' | 'projectName'>) => {
    if (e.at > 0) out.push({ ...e, projectId: p.id, projectName: tag });
  };

  /* The enquiry, when the project was opened from a lead. */
  const lead = i.records.leadCreatedAt[p.id];
  if (lead) add({ id: `enq-${p.id}`, at: lead, kind: 'event', side: 'client', text: 'Enquiry received', source: 'team' });

  /* The proposal going out: each send, or the day the status said so. */
  const sends: any[] = Array.isArray(ctx.proposal?.sends) ? ctx.proposal.sends : [];
  sends.forEach((s, n) => add({
    id: `prop-${p.id}-${n}`, at: msOf(s?.at) || 0, kind: 'event', side: 'studio', source: 'proposals',
    text: s?.via === 'whatsapp' ? 'Proposal sent on WhatsApp' : s?.via === 'download' ? 'Proposal sent as a download' : 'Proposal sent',
  }));
  if (!sends.length && msOf(ctx.proposalSentAt)) {
    add({ id: `prop-${p.id}`, at: msOf(ctx.proposalSentAt)!, kind: 'event', side: 'studio', source: 'proposals', text: 'Proposal sent' });
  }

  /* Signed: the terms, the agreement and the handover, as stickers. A dispute is the client's own action. */
  const signoff = (keys: string[]) => keys.map((k) => ctx[k]).find((r) => r && (r.status === 'signed' || r.status === 'disputed'));
  const signs: Array<[string[], string, string]> = [
    [['termsSignoff', 'designAgreementSignoff'], 'Design terms signed', 'the design terms'],
    [['executionSignoff', 'executionAgreementSignoff', 'contractSignoff'], 'Agreement signed', 'the agreement'],
    [['handoverSignoff', 'handoverDocketSignoff'], 'Handover signed', 'the handover'],
  ];
  for (const [keys, label, what] of signs) {
    const r = signoff(keys);
    if (r?.status === 'signed' && msOf(r.signedAt)) {
      add({ id: `sign-${p.id}-${keys[0]}`, at: msOf(r.signedAt)!, kind: 'sticker', side: 'client', text: label, tone: 'gold' });
    } else if (r?.status === 'disputed' && msOf(r.disputedAt)) {
      add({ id: `disp-${p.id}-${keys[0]}`, at: msOf(r.disputedAt)!, kind: 'event', side: 'client', source: 'portal', text: `Disputed ${what}`, detail: r.disputeReason || null });
    } else if (keys[0] === 'executionSignoff') {
      const g = ctx.lifecycle?.gates?.contractSigned;
      if (g?.done && msOf(g.at) && !ASSUMED_GATE.has(String(g.reference || ''))) {
        add({ id: `sign-${p.id}-gate`, at: msOf(g.at)!, kind: 'sticker', side: 'client', text: label, tone: 'gold' });
      }
    }
  }

  /* Money: invoices raised and stages paid, with the figure only where amounts are shown. */
  for (const m of i.money[p.id]?.milestones || []) {
    const fig = m.owed != null && m.owed > 0 ? ` · ${formatINR(m.owed)}` : '';
    const inv = msOf(m.invoiceDate);
    if (inv) add({ id: `inv-${p.id}-${m.id}`, at: inv, kind: 'event', side: 'studio', source: 'payments', text: `Invoice raised · ${m.name}${fig}`, detail: m.invoiceNumber || null });
    if (m.status === 'paid' || m.status === 'received') {
      const paid = msOf(m.paidDate);
      if (paid) add({ id: `paid-${p.id}-${m.id}`, at: paid, kind: 'event', side: 'client', source: 'payments', text: `Paid a stage · ${m.name}${fig}` });
      else if (inv) add({ id: `paid-${p.id}-${m.id}`, at: inv + 1, kind: 'event', side: 'client', source: 'payments', text: `Paid a stage · ${m.name}${fig}`, meta: 'Day of payment not recorded' });
    }
  }

  /* What the client did in their portal (submitClientAction). Their own messages are their words. */
  for (const msg of (ctx.clientMessages || []) as any[]) {
    add({
      id: `cm-${p.id}-${msg?.id}`, at: msOf(msg?.sentAt) || 0, kind: 'said', side: 'client', source: 'portal',
      text: String(msg?.text || '').trim(), meta: `${i.clientName} · from the portal${msg?.aboutLabel ? ` · about ${msg.aboutLabel}` : ''}`,
    });
  }
  for (const q of (ctx.documents?.queries || []) as any[]) {
    add({
      id: `q-${p.id}-${q?.id}`, at: msOf(q?.raisedAt) || 0, kind: 'event', side: 'client', source: 'portal',
      text: `Asked about ${q?.clauseRef ? `clause ${q.clauseRef} of ` : ''}${docLabel(q?.documentKind)}`, detail: q?.question || null,
    });
  }
  for (const d of (ctx.documents?.issues || []) as any[]) {
    const what = docLabel(d?.kind);
    if (d?.clientSignature && !SIGNED_BY_SIGNOFF.has(d.kind)) {
      add({ id: `ia-${p.id}-${d.id}`, at: msOf(d.clientSignature.signedAt) || 0, kind: 'event', side: 'client', source: 'portal', text: `Approved ${what}` });
    }
    if (d?.changesRequested) {
      add({ id: `ic-${p.id}-${d.id}`, at: msOf(d.changesRequested.at) || 0, kind: 'event', side: 'client', source: 'portal', text: `Asked for changes to ${what}`, detail: d.changesRequested.message || null });
    }
    /* Downloads, one entry a day for each document. */
    const days = new Map<string, number>();
    for (const dl of (d?.clientDownloads || []) as any[]) {
      const t = msOf(dl?.at);
      if (!t) continue;
      const key = new Date(t + 5.5 * 3600000).toISOString().slice(0, 10);
      days.set(key, Math.max(days.get(key) || 0, t));
    }
    for (const [key, t] of days) add({ id: `dl-${p.id}-${d.id}-${key}`, at: t, kind: 'event', side: 'client', source: 'portal', text: `Downloaded ${what}` });
  }
  for (const s of (ctx.materialSelections || []) as any[]) {
    const name = String(s?.itemName || 'a finish');
    if (msOf(s?.clientConfirmedAt)) add({ id: `sc-${p.id}-${s.id}`, at: msOf(s.clientConfirmedAt)!, kind: 'event', side: 'client', source: 'portal', text: `Confirmed ${name}` });
    if (msOf(s?.changeRequestedAt)) add({ id: `sq-${p.id}-${s.id}`, at: msOf(s.changeRequestedAt)!, kind: 'event', side: 'client', source: 'portal', text: `Asked to change ${name}`, detail: s.changeReason || null });
  }

  /* Portal access: the link issued, and each person given or taken off it. */
  const issued = msOf(ctx.portalAccess?.issuedAt);
  if (issued) add({ id: `pl-${p.id}`, at: issued, kind: 'event', side: 'studio', source: 'portal', text: 'Portal link issued' });
  const names = new Map<string, string>();
  if (ctx.clientEmail) names.set(normEmail(String(ctx.clientEmail).split(',')[0]), String(ctx.clientName || ''));
  for (const c of (ctx.clientContacts || []) as any[]) if (c?.email) names.set(normEmail(c.email), String(c.name || ''));
  for (const [email, mark] of Object.entries((ctx.clientPortal || {}) as Record<string, any>)) {
    const who = names.get(email) || email;
    if (msOf(mark?.issuedAt)) add({ id: `pa-${p.id}-${email}`, at: msOf(mark.issuedAt)!, kind: 'event', side: 'studio', source: 'portal', text: `Portal access given · ${who}` });
    if (msOf(mark?.revokedAt)) add({ id: `pr-${p.id}-${email}`, at: msOf(mark.revokedAt)!, kind: 'event', side: 'studio', source: 'portal', text: `Portal access removed · ${who}` });
  }
  return out;
}

/** The follow-up log: what was sent, what the client said, what the team noted. */
function followUpEntry(f: FollowUp, clientName: string, tag: string | null): ThreadEntry {
  const text = lineText(f.note) || (f.outcome === 'no_answer' ? 'No answer' : '');
  const base = { id: `f-${f.id}`, at: f.at, projectId: f.projectId, projectName: tag };
  if (f.outcome === 'reminded') {
    return {
      ...base, kind: 'sent', side: 'studio', source: 'sent', text,
      meta: f.channel === 'whatsapp' ? 'Opened in WhatsApp · logged' : `Logged · ${CHANNEL_WORDS[f.channel] || 'the team'}`,
      template: f.subject?.label || null,
    };
  }
  if (f.outcome === 'no_answer' || heardFromClient(f)) {
    const mood = moodOf(f.note);
    const from = /^Call:/.test(String(f.note || '')) ? 'a call' : CHANNEL_WORDS[f.channel] || 'the team';
    return {
      ...base, kind: 'said', side: 'client', source: 'team',
      text: f.outcome === 'no_answer' ? (text && text !== 'No answer' ? `No answer · ${text}` : 'No answer') : text,
      meta: `${clientName} · from ${from}${mood ? ` · Mood: ${mood}` : ''} · logged by ${f.byName || 'the team'}`,
    };
  }
  return { ...base, kind: 'event', side: 'studio', source: 'team', text, meta: `Logged by ${f.byName || 'the team'}` };
}

export function buildThread(i: ThreadInput): ThreadEntry[] {
  const multi = i.projects.length > 1;
  const tagOf = new Map(i.projects.map((p) => [p.id, multi ? p.name : null]));
  const mine = new Set(i.projects.map((p) => p.id));
  const out: ThreadEntry[] = [];

  for (const p of i.projects) out.push(...projectEntries(p, i, tagOf.get(p.id) ?? null));
  for (const f of i.records.followUps) if (mine.has(f.projectId)) out.push(followUpEntry(f, i.clientName, tagOf.get(f.projectId) ?? null));

  /* Visits and meetings done. */
  for (const v of i.records.visits) {
    if (!mine.has(v.projectId) || v.status !== 'done') continue;
    const doneAt = [...(v.history || [])].reverse().find((h) => h.status === 'done')?.at
      || msOf(v.slot?.date ? `${v.slot.date}T${v.slot.time || '12:00'}:00+05:30` : null) || v.updatedAt;
    out.push({
      id: `v-${v.id}`, at: doneAt || 0, kind: 'event', side: 'studio', source: 'site',
      text: `${visitWord(v.kind)} done`, detail: v.purpose || null, projectId: v.projectId, projectName: tagOf.get(v.projectId) ?? null,
    });
  }
  /* Minutes shared, and the client confirming them. */
  for (const m of i.records.moms) {
    if (!mine.has(m.projectId)) continue;
    const title = m.meetingTitle || m.momRef || 'the meeting';
    const tag = tagOf.get(m.projectId) ?? null;
    const shared = msOf(m.sharedAt) || msOf(m.sentAt);
    if (shared) out.push({ id: `ms-${m.id}`, at: shared, kind: 'event', side: 'studio', source: 'site', text: `Minutes shared · ${title}`, projectId: m.projectId, projectName: tag });
    if (msOf(m.acknowledgedAt)) out.push({ id: `ma-${m.id}`, at: msOf(m.acknowledgedAt)!, kind: 'event', side: 'client', source: 'portal', text: `Confirmed the minutes · ${title}`, projectId: m.projectId, projectName: tag });
  }
  /* Design Desk: the meeting held, its record confirmed, the drawings signed off. */
  for (const m of i.records.meetings) {
    if (!mine.has(m.projectId)) continue;
    const tag = tagOf.get(m.projectId) ?? null;
    const agreed = (m.rooms || []).filter((r) => r.outcome === 'agreed').map((r) => r.room);
    const rooms = (m.rooms || []).map((r) => r.room).join(', ');
    if (m.closedAt) out.push({ id: `dm-${m.id}`, at: m.closedAt, kind: 'event', side: 'studio', source: 'design', text: 'Design meeting held', detail: rooms || null, projectId: m.projectId, projectName: tag });
    if (m.confirmation?.at) out.push({ id: `dc-${m.id}`, at: m.confirmation.at, kind: 'event', side: 'client', source: 'design', text: 'Confirmed the meeting record', detail: m.confirmation.via === 'portal' ? 'In their portal' : 'Signed in the studio', projectId: m.projectId, projectName: tag });
    const a = m.approval;
    if (a?.answeredAt && (a.status === 'approved' || a.status === 'deemed' || a.status === 'changes')) {
      out.push({
        id: `da-${m.id}`, at: a.answeredAt, kind: 'event', side: 'client', source: 'design',
        text: a.status === 'approved' ? `Signed off the drawings${agreed.length ? ` · ${agreed.join(', ')}` : ''}`
          : a.status === 'deemed' ? 'Drawings taken as signed off' : 'Asked for changes to the drawings',
        detail: a.note || null, projectId: m.projectId, projectName: tag,
      });
    }
  }

  /* Portal visits: when they first opened it, and one card a day with the tabs they opened. */
  for (const v of i.portalVisits || []) {
    if (!mine.has(v.projectId)) continue;
    const tag = tagOf.get(v.projectId) ?? null;
    if (v.firstAt) out.push({ id: `pf-${v.projectId}-${v.uid}`, at: v.firstAt, kind: 'event', side: 'client', source: 'portal', text: 'First opened the portal', meta: v.email || null, projectId: v.projectId, projectName: tag });
    const days = new Map<string, { at: number; tabs: Set<string>; n: number }>();
    for (const s of v.recent || []) {
      const key = new Date(s.at + 5.5 * 3600000).toISOString().slice(0, 10);
      const d = days.get(key) || { at: 0, tabs: new Set<string>(), n: 0 };
      d.at = Math.max(d.at, s.at);
      d.n += 1;
      (s.tabs || []).forEach((t) => d.tabs.add(t));
      days.set(key, d);
    }
    for (const [key, d] of days) {
      /* In the portal's own order. */
      const order = Object.keys(TAB_LABEL);
      const tabs = [...d.tabs].sort((x, y) => order.indexOf(x) - order.indexOf(y)).map(tabLabel);
      out.push({
        id: `pv-${v.projectId}-${v.uid}-${key}`, at: d.at, kind: 'event', side: 'client', source: 'portal',
        text: `On the portal · ${tabs.join(', ')}`, meta: d.n > 1 ? `${d.n} visits` : null, projectId: v.projectId, projectName: tag,
      });
    }
  }

  const sorted = out.filter((e) => e.at > 0 && (e.text || e.kind === 'sticker')).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

  /* Unpaid: one sticker for the longest-unpaid invoice past the chase line. */
  let worst = 0;
  let worstProject = '';
  for (const p of i.projects) {
    for (const m of i.money[p.id]?.milestones || []) {
      if (m.status !== 'invoiced' || m.disputed) continue;
      const due = dueAtOf(m);
      const days = due == null ? 0 : Math.floor((i.now - due) / DAY);
      if (days > worst) { worst = days; worstProject = p.id; }
    }
  }
  if (worst > CHASE_AFTER_DAYS) {
    sorted.push({ id: 'unpaid', at: i.now, kind: 'sticker', side: 'client', text: `Unpaid · ${plural(worst, 'day')}`, tone: 'bad', projectId: worstProject, projectName: tagOf.get(worstProject) ?? null });
  }

  /* No reply: the last word was ours, 10 days or more ago. The client's portal actions count as a reply. */
  const lastWord = [...sorted].reverse().find((e) => e.kind === 'sent' || e.kind === 'said' || (e.side === 'client' && e.kind === 'event'));
  if (lastWord?.kind === 'sent') {
    const days = Math.floor((i.now - lastWord.at) / DAY);
    if (days >= QUIET_AFTER_DAYS) {
      sorted.push({ id: 'noreply', at: i.now + 1, kind: 'sticker', side: 'client', text: `No reply in ${plural(days, 'day')}`, tone: 'warn', projectId: lastWord.projectId, projectName: lastWord.projectName });
    }
  }
  return sorted;
}

export type DayGroup = 'Earlier' | 'This week' | 'Yesterday' | 'Today';

const istDay = (t: number) => Math.floor((t + 5.5 * 3600000) / DAY);

/** Today, Yesterday, This week (the five days before), or Earlier: in India's time. */
export function dayGroupOf(at: number, now: number): DayGroup {
  const d = istDay(now) - istDay(at);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return 'This week';
  return 'Earlier';
}

/** The thread in its day groups, in order, each group once. */
export function groupThread(entries: ThreadEntry[], now: number): Array<{ group: DayGroup; entries: ThreadEntry[] }> {
  const out: Array<{ group: DayGroup; entries: ThreadEntry[] }> = [];
  for (const e of entries) {
    const g = dayGroupOf(e.at, now);
    const last = out[out.length - 1];
    if (last && last.group === g) last.entries.push(e);
    else out.push({ group: g, entries: [e] });
  }
  return out;
}
