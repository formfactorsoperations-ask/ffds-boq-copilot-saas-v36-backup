import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Send, Check, Loader2, RotateCcw, Download, Clock, FileText, ShieldCheck, X } from '@/lib/lucide-shim';
import { db } from '../../services/firebaseClient';
import { useOrg } from '../../contexts/OrgContext';
import { primaryRole } from '../../lib/roles';
import { opsSettingsOf } from '../../lib/opsDesk';
import { getAi } from '../../services/aiClient';
import { FLASH_MODEL } from '../../constants/aiModels';
import { sendMomEmail } from '../../services/emailService';
import { buildWhatsAppURL } from '../../lib/whatsappUtils';
import { publicAppOrigin } from '../../lib/publicUrl';
import { downloadElementAsPdf, elementPdfFile, pdfFilename } from '../../lib/documentPdf';
import {
  allLines, flowStep, statusChip, isMinutesLead, fullTrail, mergePrivate, templateById, isLogOnly,
  type MinutesContent, type ReviewNote, type PrivatePart,
} from '../../lib/minutes';
import {
  watchMinutes, saveContent, sendForApproval, returnWithNotes, approve, markSent, startRevision, notesToTopics,
  waitingForApproval, watchPrivate, saveToLog, type Me, type WaitingMinutes,
} from '../../services/minutesService';
import MinutesComposer, { type PersonOption } from './MinutesComposer';
import MinutesReview, { type QueueRow } from './MinutesReview';
import MinutesSendSheet, { type SendChoice } from './MinutesSendSheet';
import { MinutesDocument } from './MinutesDocument';
import { MinutesShell, Panel, Trail, Chip, btnPri, btnSec, BRAND_EYEBROW } from './MinutesBits';

/*
  THE NEW MINUTES, END TO END (lib/minutes.ts).

  One screen that shows each person the step that is theirs:

    being written        the composer (Client Relations, or a lead writing
                         them when Client Relations is away)
    with the Ops Director  the review, for a lead; read-only for the writer
    approved             the send sheet
    sent / confirmed     the minutes as issued, and their record
    correction asked     the client's corrections, and "Start revision"

  Opened through MomReviewModal when the studio has turned the new flow on in
  Studio settings → Ops Desk.
*/

export interface ClientContact { name?: string | null; emails?: string[]; phone?: string | null }

interface Props {
  mom: any;
  projectId: string;
  studioId: string;
  projectName?: string;
  client?: ClientContact | null;
  onClose: () => void;
}

const content = (m: any): MinutesContent => {
  const src = m?.revisionStage ? m.pendingRevision || {} : m || {};
  return {
    topics: src.topics || [], summary: src.summary ?? null, carried: src.carried || [],
    nextMeeting: src.nextMeeting ?? null, attendees: src.attendees || [], revisionNote: src.revisionNote ?? null,
  };
};

export default function MinutesWorkspace(props: Props) {
  const { orgData, currentRole, currentRoles, currentUserAuth, teamMembers } = useOrg() as any;
  const roles: string[] = currentRoles?.length ? currentRoles : [currentRole];
  const lead = isMinutesLead(roles);
  const team: any[] = (orgData?.team || teamMembers || []) as any[];
  const myEmail = String(currentUserAuth?.email || '').toLowerCase();
  const meRow = team.find((t) => String(t?.email || '').toLowerCase() === myEmail);
  const me: Me = { email: myEmail, name: meRow?.name || currentUserAuth?.displayName || myEmail, role: meRow?.title || primaryRole(roles) || null };
  const studioName: string = orgData?.orgName || 'Studio';

  const [at, setAt] = useState({ projectId: props.projectId, projectName: props.projectName || '', mom: props.mom });
  const [mom, setMom] = useState<any>(props.mom);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState<MinutesContent | null>(null);
  const [queue, setQueue] = useState<WaitingMinutes[]>([]);
  const [visit, setVisit] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMom(at.mom);
    setEditing(false);
    return watchMinutes(props.studioId, at.projectId, at.mom.id, setMom, () => undefined);
  }, [props.studioId, at.projectId, at.mom.id]);

  /*
    The studio's own lines, kept beside the minutes (lib/minutes splitPrivate).
    Nothing is edited until they have loaded, or saving would drop them.
  */
  const [priv, setPriv] = useState<{ part: PrivatePart | null; loaded: boolean }>({ part: null, loaded: false });
  useEffect(() => {
    setPriv({ part: null, loaded: false });
    return watchPrivate(props.studioId, at.projectId, at.mom.id, (part) => setPriv({ part, loaded: true }));
  }, [props.studioId, at.projectId, at.mom.id]);

  /* The meeting the minutes came from: its people carry their emails. */
  useEffect(() => {
    let live = true;
    setVisit(null);
    if (!mom?.meetingId || String(mom.meetingId).startsWith('ops-')) return;
    getDoc(doc(db, `organizations/${props.studioId}/projects/${at.projectId}/siteVisits`, String(mom.meetingId)))
      .then((s) => { if (live && s.exists()) setVisit(s.data()); }).catch(() => undefined);
    return () => { live = false; };
  }, [props.studioId, at.projectId, mom?.meetingId]);

  const reviewing = lead && (mom?.status === 'pending_review' || mom?.revisionStage === 'pending_review');
  useEffect(() => {
    if (!lead || !orgData?.tenantId) return;
    waitingForApproval(orgData.tenantId).then(setQueue).catch(() => setQueue([]));
  }, [lead, orgData?.tenantId, mom?.status, mom?.revisionStage]);

  const c = useMemo(() => {
    const x = content(mom);
    return { ...x, topics: mergePrivate(x.topics, priv.part) };
  }, [mom, priv.part]);
  const template = templateById(mom?.template);
  const logOnly = isLogOnly(mom?.meetingType);
  const revising = !!mom?.revisionStage;
  const reviewer = useMemo(() => {
    const od = team.find((t) => [t?.role, ...(t?.roles || [])].includes('Ops Director'));
    return String(od?.name || '').split(' ')[0] || 'the Ops Director';
  }, [team]);
  const chip = statusChip(mom || {}, reviewer);
  const step = flowStep(mom || {});
  const corrections = (mom?.correctionRequest?.lines || []) as any[];
  const approveOpts = { projectName: at.projectName || mom?.reviewProjectName || '', followUps: opsSettingsOf(orgData).minutesFollowUps };

  /* Who can own an action: the people in the room, the studio, and the client. */
  const people: PersonOption[] = useMemo(() => {
    const out: PersonOption[] = [];
    for (const a of c.attendees || []) if (['client', 'ffds', 'vendor'].includes(a.side)) out.push({ name: a.name, side: a.side as any, role: a.role || null });
    for (const p of visit?.people || []) if (p?.name && ['client', 'ffds', 'vendor'].includes(p.side)) out.push({ name: p.name, side: p.side, email: p.email || null, role: p.role || null });
    if (props.client?.name) out.push({ name: props.client.name, side: 'client' });
    for (const t of team) if (t?.name && String(t.role) !== 'Client') out.push({ name: t.name, side: 'ffds', email: t.email || null, role: t.title || t.role || null });
    out.push({ name: 'Site team', side: 'ffds' });
    return out;
  }, [c.attendees, visit, props.client?.name, team]);

  const clientEmails = useMemo(() => {
    const set = new Set<string>();
    for (const p of visit?.people || []) if (p?.side === 'client' && p?.email) set.add(String(p.email).trim());
    for (const e of props.client?.emails || []) if (e) set.add(e.trim());
    return [...set];
  }, [visit, props.client?.emails]);
  const studioCc = useMemo(() => {
    const set = new Set<string>();
    for (const p of visit?.people || []) if (p?.side === 'ffds' && p?.email) set.add(String(p.email).trim());
    if (mom?.approvedBy?.email) set.add(mom.approvedBy.email);
    if (myEmail) set.delete(myEmail);
    return [...set].filter((e) => !clientEmails.includes(e));
  }, [visit, mom?.approvedBy?.email, myEmail, clientEmails]);

  const meeting = {
    title: mom?.meetingTitle || 'Meeting', type: mom?.meetingType || 'client_meeting',
    date: Number(mom?.meetingDate) || Date.now(), end: mom?.meetingEnd ?? null, venue: mom?.venue || visit?.location || null,
  };
  const clientName = props.client?.name || (c.attendees || []).filter((a) => a.side === 'client').map((a) => a.name).join(' & ');

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e: any) {
      console.error(e);
      setError(e?.code === 'permission-denied' ? 'You cannot do that on these minutes.' : e?.message || 'That did not go through. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  const writeBrief = async (x: MinutesContent) => {
    const facts = allLines(x.topics).filter(({ line }) => line.text.trim())
      .map(({ line, topic }) => `${topic.title || 'Topic'} · ${line.kind}: ${line.text}${line.owner?.name ? ` (${line.owner.name})` : ''}`).join('\n');
    if (!facts) return '';
    const res = await getAi().models.generateContent({
      model: FLASH_MODEL,
      contents: [{ role: 'user', parts: [{ text: `Write "in brief" for these meeting minutes: two plain sentences a homeowner would understand, what was agreed and what happens next. Only these facts; no dates or amounts that are not here. Return only the two sentences.\n\n${facts}` }] }],
      config: { temperature: 0.3 },
    });
    return String(res.text || '').replace(/^["\s]+|["\s]+$/g, '');
  };

  const docProps = (x: MinutesContent, draft: boolean) => ({
    studio: { name: studioName, logo: orgData?.orgLogo || null, email: orgData?.contactEmail || null, phone: orgData?.contactPhone || null },
    projectName: at.projectName || mom?.reviewProjectName || '',
    clientName,
    momRef: mom?.momRef || '',
    rev: Number(mom?.rev || 0) + (revising ? 1 : 0),
    meeting,
    content: x,
    preparedBy: mom?.preparedBy || null,
    approvedBy: draft ? null : mom?.approvedBy || null,
    confirmedBy: mom?.status === 'acknowledged' && mom?.acknowledgedAt ? { name: mom.acknowledgedBy || clientName, at: mom.acknowledgedAt } : null,
    issuedAt: mom?.sentAt || mom?.approvedBy?.at || null,
    draft,
    designReview: mom?.designReview || null,
  });
  const pdfOpts = (draft: boolean) => ({
    filename: pdfFilename(mom?.momRef, at.projectName, 'Minutes') + '.pdf',
    title: `${mom?.momRef || 'Minutes'} · ${meeting.title}`,
    studioName,
    contactEmail: orgData?.contactEmail || undefined,
    ribbon: draft ? { label: 'Draft', tone: 'draft' as const } : { label: 'Approved · issued', tone: 'issued' as const },
  });

  const onSend = async (choice: SendChoice) => {
    const portalUrl = publicAppOrigin();
    // WhatsApp first, while the click still counts as the person's own: a window opened later is blocked.
    const mobileShare = typeof navigator !== 'undefined' && !!(navigator as any).canShare && /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (choice.whatsapp.on && !mobileShare) window.open(buildWhatsAppURL(choice.whatsapp.phone, choice.whatsapp.message), '_blank', 'noopener');
    if (!pdfRef.current) throw new Error('The PDF is not ready yet. Try again in a moment.');
    const opts = pdfOpts(false);
    const file = await elementPdfFile(pdfRef.current, opts);
    if (choice.email.on) {
      const res = await sendMomEmail({
        to: choice.email.to, cc: choice.email.cc, subject: choice.email.subject, body: choice.email.body,
        pdf: { filename: opts.filename, base64: file.base64 },
        cta: { url: portalUrl, heading: 'Confirm the minutes in your portal', label: 'Open your portal', note: 'Or mark any line that is not as you remember it.' },
        context: `You are receiving this because you are the client on ${at.projectName || 'this project'}.`,
      });
      if (!res?.success) throw new Error(res?.error || 'The email did not go. Nothing was sent; try again.');
    }
    if (choice.whatsapp.on && mobileShare) {
      try {
        const f = new File([file.blob], opts.filename, { type: 'application/pdf' });
        await (navigator as any).share({ files: [f], text: choice.whatsapp.message });
      } catch {
        window.open(buildWhatsAppURL(choice.whatsapp.phone, choice.whatsapp.message), '_blank', 'noopener');
      }
    }
    await markSent(props.studioId, at.projectId, mom, me,
      ['Portal', choice.whatsapp.on ? 'WhatsApp' : '', choice.email.on ? 'email' : ''].filter(Boolean),
      choice.email.on ? choice.email.to : [], null);
    setSending(false);
  };

  /* ── which screen ── */
  const title = <>{meeting.title} <span className="text-slate-400 font-semibold text-base">{mom?.momRef}</span></>;
  const eyebrow = `Minutes · ${at.projectName || mom?.reviewProjectName || 'Project'}`;
  const hidden = (
    <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
      <MinutesDocument ref={pdfRef} {...docProps(c, !['finalised', 'shared', 'acknowledged', 'correction_requested'].includes(mom?.status) || revising)} />
    </div>
  );
  const errorBar = error && (
    <div className="mx-4 sm:mx-5 mt-4 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-center gap-2" role="alert">
      <span className="flex-1">{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
  const preview = previewing && (
    <PdfPreview onClose={() => setPreviewing(null)} opts={pdfOpts(mom?.status === 'draft' || mom?.status === 'pending_review' || revising)}>
      <MinutesDocument {...docProps(previewing, mom?.status === 'draft' || mom?.status === 'pending_review' || revising)} />
    </PdfPreview>
  );

  if (!mom) return null;

  if (reviewing && !editing) {
    const rows: QueueRow[] = (queue.length ? queue : [{ id: mom.id, projectId: at.projectId, projectName: at.projectName, status: 'pending_review', meetingTitle: mom.meetingTitle, momRef: mom.momRef, raw: mom }])
      .map((q) => ({
        key: `${q.projectId}:${q.id}`, projectName: q.projectName || 'Project', title: `${q.meetingTitle || 'Meeting'} · ${q.momRef || ''}`,
        who: q.raw?.preparedBy?.name || q.raw?.reviewRequestedBy || '', when: q.raw?.reviewRequestedAt ? new Date(q.raw.reviewRequestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '',
        chip: q.raw?.revisionStage ? <Chip tone="rose">Revision</Chip> : (q.raw?.trail || []).some((t: any) => t.step === 'returned') ? <Chip tone="brand">Sent again</Chip> : <Chip tone="amber">New</Chip>,
        on: q.id === mom.id, onOpen: () => setAt({ projectId: q.projectId, projectName: q.projectName, mom: q.raw }),
      }));
    return (
      <MinutesShell label="Approve minutes" eyebrow="Ops Desk · Minutes to approve" title={title} step={step} onClose={props.onClose}>
        {errorBar}
        <MinutesReview key={mom.id} content={c} me={me} queue={rows}
          before={mergePrivate(revising ? mom.topics : mom.reviewedTopics || [], priv.part)}
          corrections={revising ? corrections : undefined}
          revisionNumber={revising ? Number(mom.rev || 0) + 1 : null}
          designReview={mom.designReview || null}
          writtenBy={mom.preparedBy?.name || mom.reviewRequestedBy || 'Client Relations'}
          sentAt={mom.reviewRequestedAt || null}
          carriedFrom={(c.carried || [])[0]?.ref || null}
          onEdit={() => setEditing(true)}
          onReturn={(notes: ReviewNote[]) => returnWithNotes(props.studioId, at.projectId, mom, notes, me)}
          onApprove={async (myself) => {
            await approve(props.studioId, at.projectId, mom, me, null, approveOpts);
            if (myself) setSending(true);
          }} />
        {hidden}{preview}
      </MinutesShell>
    );
  }

  const canWrite = mom.status === 'draft' || mom.revisionStage === 'draft' || (lead && editing);
  if (canWrite || mom.status === 'pending_review' || mom.revisionStage === 'pending_review') {
    const ro = !canWrite;
    if (!priv.loaded) {
      return (
        <MinutesShell label="Write minutes" eyebrow={eyebrow} title={title} step={step} onClose={props.onClose}>
          <p className="p-6 text-sm text-slate-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-[#3D52A0]" />Opening the minutes…</p>
        </MinutesShell>
      );
    }
    const ready = (x: MinutesContent, ok: boolean) => logOnly ? (
      /* Internal and vendor meetings: no approval, never sent to the client. */
      <button type="button" className={btnPri} disabled={!ok || busy || ro} onClick={() => guard(async () => {
        await saveToLog(props.studioId, at.projectId, mom, x, me);
        setEditing(false);
      })}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Save to the log</button>
    ) : lead ? (
      <>
        <button type="button" className={btnPri} disabled={!ok || busy || ro} onClick={() => guard(async () => {
          await approve(props.studioId, at.projectId, mom, me, x, approveOpts);
          setEditing(false);
          setSending(true);
        })}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Approve &amp; send</button>
      </>
    ) : (
      <button type="button" className={btnPri} disabled={!ok || busy || ro} onClick={() => guard(async () => {
        await sendForApproval(props.studioId, at.projectId, mom, x, me, { projectName: at.projectName });
      })}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{ro ? `With ${reviewer}` : 'Send for approval'}</button>
    );
    return (
      <MinutesShell label="Write minutes" eyebrow={eyebrow} title={title} step={step} onClose={props.onClose}>
        {errorBar}
        <MinutesComposer key={`${mom.id}:${mom.revisionStage || ''}:${ro}`}
          initial={c} meeting={meeting} people={people} readOnly={ro}
          kinds={template?.kinds} logOnly={logOnly} designReview={mom.designReview || null}
          readOnlyNote={ro ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 hud-panel-in">
              <b>With {reviewer} for approval</b>{mom.reviewRequestedAt ? ` since ${new Date(mom.reviewRequestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}. You can read them; changes wait until they come back.
            </div>
          ) : undefined}
          reviewNotes={mom.reviewNotes || []}
          corrections={revising ? corrections : undefined}
          revision={revising ? { number: Number(mom.rev || 0) + 1 } : null}
          initialNotes={!revising && !allLines(mom.topics).length ? mom.rawNotes || '' : ''}
          onSave={(x) => saveContent(props.studioId, at.projectId, mom.id, x, revising)}
          onNotesToPoints={(notes) => notesToTopics({
            projectName: at.projectName, meetingDate: meeting.date, rawNotes: notes,
            knownAttendees: people.map((x) => `${x.name} (${x.side === 'ffds' ? 'studio' : x.side})`).join(', '),
          })}
          onWriteBrief={writeBrief}
          onPreview={(x) => setPreviewing(x)}
          primary={ready} />
        {hidden}{preview}
        {sending && sendSheet()}
      </MinutesShell>
    );
  }

  /* Approved, sent, confirmed, or a correction asked: the minutes as issued. */
  function sendSheet() {
    return (
      <MinutesSendSheet momRef={mom.momRef} rev={mom.rev} clientName={clientName} clientPhone={props.client?.phone || null}
        clientEmails={clientEmails} studioCc={studioCc} studioName={studioName} senderName={me.name} portalUrl={publicAppOrigin()}
        meetingTitle={meeting.title} content={c} approvedBy={mom.approvedBy} trail={fullTrail(mom)}
        onSend={onSend} onPreview={() => setPreviewing(c)} onClose={() => setSending(false)} />
    );
  }

  const waitingDays = mom.status === 'shared' && mom.sentAt ? Math.floor((Date.now() - mom.sentAt) / 86400000) : null;
  return (
    <MinutesShell label="Minutes" eyebrow={eyebrow} title={title} step={step} onClose={props.onClose}>
      {errorBar}
      <div className="grid gap-5 p-4 sm:p-5 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 overflow-x-auto hud-panel-in">
          <MinutesDocument {...docProps(c, false)} />
        </div>
        <div className="space-y-5 min-w-0">
          <Panel icon={ShieldCheck} title={chip.label} blurb={
            mom.status === 'finalised' && logOnly ? 'Saved to the project log. Internal and vendor minutes are never sent to the client.'
            : mom.status === 'finalised' ? 'Approved. Send them to the client: the portal always, WhatsApp and email with the PDF.'
              : mom.status === 'shared' ? `Waiting for the client to confirm${waitingDays ? ` · ${waitingDays} day${waitingDays === 1 ? '' : 's'}` : ''}.`
                : mom.status === 'acknowledged' ? `Confirmed by ${mom.acknowledgedBy || 'the client'}.`
                  : 'The client asked to correct the lines below. Answer with a revision; they keep these minutes until it is sent.'
          } right={<Chip tone={chip.tone}>{chip.label}</Chip>}>
            {mom.status === 'correction_requested' && (
              <ul className="space-y-2 mb-3">
                {(corrections.length ? corrections : [{ lineId: '', ref: '', text: mom.correctionRequest?.text || '' }]).map((k: any, i: number) => (
                  <li key={i} className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-900"><b>{k.ref || 'The client'}:</b> {k.text}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {mom.status === 'finalised' && !logOnly && <button type="button" className={btnPri} onClick={() => setSending(true)}><Send className="w-4 h-4" />Send to the client</button>}
              {mom.status === 'shared' && <button type="button" className={btnSec} onClick={() => setSending(true)}><Send className="w-4 h-4" />Send again</button>}
              {mom.status === 'correction_requested' && (
                <button type="button" className={btnPri} disabled={busy} onClick={() => guard(async () => { await startRevision(props.studioId, at.projectId, mom, me); })}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}Start revision {Number(mom.rev || 0) + 1}
                </button>
              )}
              <button type="button" className={btnSec} onClick={() => setPreviewing(c)}><FileText className="w-4 h-4" />PDF</button>
            </div>
          </Panel>
          <Panel icon={Clock} title="What happened to these minutes" blurb="Newest first">
            <Trail trail={fullTrail(mom)} waiting={mom.status === 'shared' ? 'Waiting for the client' : null} />
          </Panel>
        </div>
      </div>
      {hidden}{preview}
      {sending && sendSheet()}
    </MinutesShell>
  );
}

/** The PDF on screen, with a download. */
function PdfPreview({ children, opts, onClose }: { children: React.ReactElement; opts: any; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[320] flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="PDF preview">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-[860px] bg-white sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-full sm:max-h-[94vh]">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center gap-3">
          <div className="flex-1"><p className={BRAND_EYEBROW}>Preview</p><h3 className="text-lg font-bold text-slate-800">{opts.title}</h3></div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-xl grid place-items-center text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 p-4 sm:p-6"><div className="mx-auto w-fit bg-white shadow-xl p-6">{React.cloneElement(children, { ref } as any)}</div></div>
        <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 flex justify-end gap-3">
          <button type="button" className={btnSec} onClick={onClose}>Close</button>
          <button type="button" className={btnPri} disabled={busy} onClick={async () => {
            if (!ref.current) return;
            setBusy(true);
            try { await downloadElementAsPdf(ref.current, opts); } finally { setBusy(false); }
          }}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Download PDF</button>
        </div>
      </div>
    </div>
  );
}

