import React, { useMemo, useState } from 'react';
import { Send, Check, X, MessageCircle, Mail, Loader2, Pen, Image as ImageIcon, SkipForward, Undo2, ShieldCheck, FileText } from '@/lib/lucide-shim';
import { approvalStage, approvalAt } from '../../lib/designMeeting';
import { draftDigest, DIGEST_STATUS_LABEL, BODY_MAX, type Digest, type DigestStatus } from '../../lib/fridayDigest';
import { logFollowUp } from '../../services/opsDeskService';
import { saveDigest, markSentOnWhatsApp, emailDigest } from '../../services/digestService';
import { useDesk, fmtDay, fmtWhen, waLink, dialable, type DeskClient } from './DeskBits';
import { Band, Tiles } from './Od2Bits';

/*
  FRIDAY DIGEST (Ops Desk 2.1; the owner's choices, 11 Nov 2026). One short
  update a week for each client, built on the week's Weekly Pulse when there
  is one, otherwise drafted from what was recorded (lib/fridayDigest.ts). The
  person who looks after the client reads it, edits it and sends it for
  approval; a lead approves it or sends it back with a note; once approved it
  goes on WhatsApp (a person presses send) or by email from the studio's
  address. Its words cannot change after approval, and nothing about money
  goes in.
*/

const TONE: Record<DigestStatus | 'new', string> = {
  new: 'brand', draft: 'brand', returned: 'warn', pending_review: 'warn', approved: 'good', sent: 'good', skipped: '',
};

export const FridayDigest: React.FC<{ week: string; digests: Record<string, Digest>; focus?: string | null; onSaved: (d: Digest) => void }> = ({ week, digests, focus, onSaved }) => {
  const d = useDesk();
  /* Clients whose work is under way: from design to before handover is complete. */
  const list = d.clients.filter((c) => c.phase.index >= 1 && !c.phase.complete);
  const [pick, setPick] = useState<string>(() => (focus && list.some((c) => c.id === focus) ? focus : list[0]?.id || ''));
  const statusOf = (id: string): DigestStatus | 'new' => digests[id]?.status || 'new';
  const count = (ss: (DigestStatus | 'new')[]) => list.filter((c) => ss.includes(statusOf(c.id))).length;
  const chosen = list.find((c) => c.id === pick) || null;

  return (
    <>
      <Band eyebrow={`Friday digest · ${fmtDay(week)}`} title={`${list.length} client${list.length === 1 ? '' : 's'}, one short update each`}
        sub="Drafted from the week’s Weekly Pulse, site updates, approvals and decisions. You check it, a lead approves it, then it goes on WhatsApp or by email. No amounts, ever.">
        <Tiles tiles={[
          { count: count(['new', 'draft', 'returned']), title: 'To write', sub: 'Drafted, not sent for approval' },
          { count: count(['pending_review']), title: 'Awaiting approval', sub: d.isLead ? 'Waiting on you' : 'With a lead', alarm: d.isLead && count(['pending_review']) > 0 },
          { count: count(['approved']), title: 'Approved', sub: 'Ready to send' },
          { count: count(['sent']), title: 'Sent', sub: 'This week' },
        ]} />
      </Band>
      {!list.length ? <div className="od-lockbox"><Send /><b>No client in design or on site</b><span>Updates are for projects from design to handover.</span></div> : (
        <div className="grid gap-5 grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] items-start">
          <div className="flex flex-col gap-1.5" role="list">
            {list.map((c) => {
              const st = statusOf(c.id);
              return (
                <button key={c.id} type="button" role="listitem" onClick={() => setPick(c.id)}
                  className={`flex items-center gap-2.5 text-left px-3 py-2.5 rounded-2xl border bg-white transition-shadow ${pick === c.id ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/15' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <span className="min-w-0 flex-1"><b className="block text-sm truncate">{c.name}</b><small className="text-[11px] text-slate-500 truncate block">{c.client}</small></span>
                  <span className={`od-chip ${TONE[st]}`}>{st === 'new' ? 'To write' : DIGEST_STATUS_LABEL[st]}</span>
                </button>
              );
            })}
          </div>
          {chosen && <Editor key={`${chosen.id}:${digests[chosen.id]?.updatedAt || 0}`} c={chosen} week={week} saved={digests[chosen.id] || null} onSaved={onSaved} />}
        </div>
      )}
    </>
  );
};

const Editor: React.FC<{ c: DeskClient; week: string; saved: Digest | null; onSaved: (d: Digest) => void }> = ({ c, week, saved, onSaved }) => {
  const d = useDesk();
  const p = d.projects.find((x) => x.id === c.id)!;
  const raw = p.raw || {};
  const draft = useMemo(() => draftDigest({
    week, projectName: c.name, client: c.client, ctx: raw.context || {},
    siteUpdates: raw.activeProject?.executionData?.updates || raw.siteWork?.updates || [],
    approvals: (d.approvals || []).filter((i) => i.projectId === c.id).map((i) => ({
      sheets: i.sheets, stage: approvalStage({ approval: i.approval, confirmation: i.confirmation as any }, d.now), approvedAt: approvalAt({ approval: i.approval, confirmation: i.confirmation as any }),
    })),
    decisions: d.decisions[c.id] || [], visits: d.visits.filter((v) => v.projectId === c.id), progress: c.progress,
    sender: d.me.name, studio: d.studioName,
  }), [week, c, raw, d]);
  const status: DigestStatus | 'new' = saved?.status || 'new';
  const [body, setBody] = useState(saved?.body || draft.body);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const editable = d.canWrite && (status === 'new' || status === 'draft' || status === 'returned' || status === 'skipped' || (status === 'pending_review' && d.isLead));
  const photos = saved?.photos || draft.photos;
  const phone = c.phone || raw.context?.clientPhone || '';
  const email = p.clientEmail;

  const record = (st: DigestStatus, extra: Partial<Digest> = {}): Digest => ({
    tenantId: d.tenantId, projectId: c.id, projectName: c.name, week, status: st, subject: saved?.subject || draft.subject, body: body.trim().slice(0, BODY_MAX),
    photos, sources: saved?.sources || draft.sources,
    preparedBy: saved?.preparedBy || d.me.email, preparedByName: saved?.preparedByName || d.me.name, preparedAt: saved?.preparedAt || Date.now(),
    reviewNote: saved?.reviewNote ?? null, approvedBy: null, approvedByName: null, approvedAt: null, sentAt: null, sentBy: null, sentVia: null,
    updatedAt: Date.now(), ...extra,
  });
  const run = async (label: string, f: () => Promise<Digest | void>, ok: string) => {
    setBusy(label); setErr(null); setDone(null);
    try { const r = await f(); if (r) onSaved(r); setDone(ok); } catch (e: any) {
      setErr(e?.code === 'permission-denied' || /permission/i.test(String(e?.message)) ? 'You cannot do that on this project.' : String(e?.message || 'That was not saved. Try again.').slice(0, 200));
    } finally { setBusy(null); }
  };

  const toReview = () => run('review', () => saveDigest(record('pending_review', { reviewNote: null })), 'Sent for approval.');
  const saveDraft = () => run('save', () => saveDigest(record('draft')), 'Saved.');
  const skip = () => run('skip', () => saveDigest(record('skipped')), 'Skipped this week.');
  const approve = () => run('approve', async () => {
    let cur = saved;
    if (!cur || cur.status !== 'pending_review' || cur.body !== body.trim()) cur = await saveDigest(record('pending_review'));
    return saveDigest({ ...cur, status: 'approved', body: body.trim().slice(0, BODY_MAX), approvedBy: d.me.email, approvedByName: d.me.name, approvedAt: Date.now() });
  }, 'Approved. It can be sent now.');
  const sendBack = () => run('return', () => saveDigest({ ...record('returned'), reviewNote: note.trim().slice(0, 500) || 'Please take another look.' }), 'Sent back with your note.');
  const whatsapp = () => run('wa', async () => {
    if (!saved) return;
    const text = `${saved.body}${saved.photos.length ? `\n\n${saved.photos.join('\n')}` : ''}`;
    window.open(waLink(phone, text), '_blank', 'noopener');
    const r = await markSentOnWhatsApp(saved, d.me.email);
    await logFollowUp({ tenantId: d.tenantId, projectId: c.id, projectName: c.name, me: d.me, channel: 'whatsapp', outcome: 'info', note: `Friday update for the week of ${week} sent on WhatsApp.`, subject: null, next: null }).catch(() => undefined);
    d.act.refresh();
    return r;
  }, 'Marked sent on WhatsApp and logged.');
  const byEmail = () => run('email', async () => {
    if (!saved) return;
    const r = await emailDigest(saved);
    d.act.refresh();
    setDone(r.sandbox ? 'Email simulated: the studio’s email service is not set up yet.' : `Emailed to ${r.to.join(', ')}.`);
    return { ...saved, status: 'sent', sentVia: 'email', sentAt: Date.now(), sentBy: d.me.email };
  }, 'Emailed.');

  return (
    <section className="od-card flex flex-col gap-4 od-rise">
      <div className="od-ch !mb-0">
        <span className="od-tile"><FileText /></span>
        <div className="min-w-0"><h3>{c.name}</h3><p>{c.client} · {status === 'new' ? 'Not written yet' : DIGEST_STATUS_LABEL[status]}{saved?.approvedByName ? ` · approved by ${saved.approvedByName}` : ''}{saved?.sentAt ? ` · sent ${saved.sentVia === 'email' ? 'by email' : 'on WhatsApp'} ${fmtWhen(saved.sentAt)}` : ''}</p></div>
      </div>
      <div className="flex flex-wrap gap-1.5">{(saved?.sources || draft.sources).map((s) => <span key={s} className="od-chip brand">{s}</span>)}{draft.quiet && !saved && <span className="od-chip warn">Quiet week</span>}</div>
      {status === 'returned' && saved?.reviewNote && <div className="rounded-xl bg-amber-50 text-amber-800 px-3 py-2.5 text-sm"><b>Sent back:</b> {saved.reviewNote}</div>}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="rounded-3xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#3D52A0] text-white"><MessageCircle className="w-4 h-4" /><b className="text-sm">{c.client || 'The client'}</b><small className="ml-auto text-[11px] text-white/80">As it will read</small></div>
          <div className="p-4 bg-slate-50 min-h-[220px]">
            <div className="max-w-[460px] rounded-2xl rounded-bl-md bg-white border border-slate-200 shadow-sm px-3.5 py-3 text-sm text-slate-700 whitespace-pre-line">{body || ' '}</div>
            {photos.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{photos.map((src, i) => <a key={src} href={src} target="_blank" rel="noopener noreferrer" className="od-chip"><ImageIcon />Photo {i + 1}</a>)}</div>}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {editable ? (
            <label className="flex flex-col gap-1.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">The update <em className="not-italic font-semibold normal-case tracking-normal text-slate-400">· edit freely, no amounts</em></span>
              <textarea className="od-field min-h-[260px] leading-relaxed" value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} /></label>
          ) : (
            <p className="text-xs text-slate-500 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">{status === 'pending_review' ? 'With a lead for approval. It can be edited again if they send it back.' : status === 'approved' ? 'Approved. Its words are fixed now; send it below.' : status === 'sent' ? 'Sent this week.' : 'Only the person who looks after this client, or a lead, writes it.'}</p>
          )}
          {d.isLead && status === 'pending_review' && (
            <label className="flex flex-col gap-1.5"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">A note, if you send it back</span>
              <input className="od-field" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Say when the laminate arrives" /></label>
          )}
          {err && <p className="text-xs text-rose-700">{err}</p>}
          {done && <p className="text-xs text-emerald-700">{done}</p>}
          <div className="od-acts !mt-0">
            {(status === 'new' || status === 'draft' || status === 'returned' || status === 'skipped') && d.canWrite && (
              <>
                {d.isLead
                  ? <button type="button" className="od-btn pri" disabled={!!busy || !body.trim()} onClick={approve}>{busy === 'approve' ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Approve</button>
                  : <button type="button" className="od-btn pri" disabled={!!busy || !body.trim()} onClick={toReview}>{busy === 'review' ? <Loader2 className="animate-spin" /> : <Send />}Send for approval</button>}
                <button type="button" className="od-btn" disabled={!!busy || !body.trim()} onClick={saveDraft}><Pen />Save draft</button>
                {status !== 'skipped' && <button type="button" className="od-btn ghost" disabled={!!busy} onClick={skip}><SkipForward />Skip this week</button>}
                {body !== draft.body && <button type="button" className="od-btn ghost" onClick={() => setBody(draft.body)}><Undo2 />Draft again</button>}
              </>
            )}
            {status === 'pending_review' && d.isLead && (
              <>
                <button type="button" className="od-btn pri" disabled={!!busy || !body.trim()} onClick={approve}>{busy === 'approve' ? <Loader2 className="animate-spin" /> : <Check />}Approve</button>
                <button type="button" className="od-btn" disabled={!!busy} onClick={sendBack}><X />Send back with the note</button>
              </>
            )}
            {status === 'approved' && d.canWrite && (
              <>
                <button type="button" className="od-btn pri" disabled={!!busy || !dialable(phone)} title={dialable(phone) ? 'Opens WhatsApp with the update ready; it is marked sent and logged' : 'No phone number on this client'} onClick={whatsapp}>{busy === 'wa' ? <Loader2 className="animate-spin" /> : <MessageCircle />}Send on WhatsApp</button>
                <button type="button" className="od-btn" disabled={!!busy || !email} title={email ? `To ${email}` : 'No email address on this client'} onClick={byEmail}>{busy === 'email' ? <Loader2 className="animate-spin" /> : <Mail />}Send by email</button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
