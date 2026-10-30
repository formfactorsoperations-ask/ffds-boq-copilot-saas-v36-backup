import React, { useState } from 'react';
import { Check, CheckCircle2, Loader2, AlertTriangle, Undo2, ShieldCheck, Lock, MessageSquareText } from '@/lib/lucide-shim';
import type { DocumentIssue } from '../../types';
import { clientTotals, netExecution, totalsNote } from '../../lib/scopeTotals';
import { workbookForIssue, downloadWorkbook } from '../../lib/scopeWorkbook';
import { ApprovalRecordButton } from '../documents/ApprovalRecordSheet';
import { agreedViaPhrase } from '../../lib/scopeAgreement';
import { CHANGE_NOTE_MIN, CHANGE_NOTE_MAX, CHANGE_TOPICS, ScopeChangeTopic, isSentBack, topicLabels } from '../../lib/scopeChangeRequest';

/*
  APPROVE IN THE PORTAL — the whole Scope Revision (or the first Detailed BOQ)
  at once.

  The client reads the Excel wherever they like; here they see the same totals
  and the changed items, download the Excel, tick one box with their name and
  approve. The server records the approval against their login (see the
  approveIssue action), so nothing on this card can fake who or when.

  A Scope Revision they do not agree with is sent back instead, with their
  note (lib/scopeChangeRequest): recorded the same way, and changing nothing in
  force. The approved scope and the payments stay as they are until the studio
  sends a new version and the client approves that.
*/

/* The portal listens for this and records it for the studio (client sessions only). */
export const reportDownload = (issueId: string, format: 'excel' | 'record') => {
  try { window.dispatchEvent(new CustomEvent('scope-document-downloaded', { detail: { issueId, format } })); } catch { /* ignore */ }
};

const inr = (n: number) => `${Math.round(Number(n) || 0) < 0 ? '−' : ''}₹${Math.abs(Math.round(Number(n) || 0)).toLocaleString('en-IN')}`;
const sgn = (n: number) => {
  const r = Math.round(n);
  return r === 0 ? '₹0' : `${r > 0 ? '+' : '−'}₹${Math.abs(r).toLocaleString('en-IN')}`;
};
const day = (t?: number | string | null) =>
  t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const TAG: Record<string, { t: string; c: string }> = {
  NEW: { t: 'New', c: 'bg-emerald-50 text-emerald-800' },
  SIZE: { t: 'Quantity', c: 'bg-[#E8ECFB] text-[#2C3C78]' },
  RATE: { t: 'Rate', c: 'bg-amber-50 text-amber-800' },
  'SIZE + RATE': { t: 'Qty and rate', c: 'bg-amber-50 text-amber-800' },
  REDESIGNED: { t: 'Redesigned', c: 'bg-violet-50 text-violet-800' },
  REMOVED: { t: 'Removed', c: 'bg-rose-50 text-rose-800' },
};

interface Props {
  issue: DocumentIssue;
  studioName: string;
  studioAddress?: string | null;
  defaultName?: string;
  onApprove: (issueId: string, name: string, contentHash: string) => Promise<void>;
  /* Sending a Scope Revision back for changes. Absent: the card offers approval only. */
  onRequestChanges?: (issueId: string, input: { name: string; message: string; topics: ScopeChangeTopic[] }, contentHash: string) => Promise<void>;
  /* The earlier version of this revision the client sent back, which this one answers. */
  previous?: DocumentIssue | null;
  onSeeChanges?: () => void;
}

const when = (t?: string | number | null) =>
  t ? new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

export default function ScopeApprovalCard({ issue, studioName, studioAddress, defaultName, onApprove, onRequestChanges, previous, onSeeChanges }: Props) {
  const s: any = issue.snapshot || {};
  const revision = issue.kind === 'scope_revision';
  const before = revision ? Number(s.v1?.total) || 0 : null;
  const after = revision ? Number(s.v2?.total) || 0 : Number(s.total) || 0;
  const rows = clientTotals(before ?? after, after, s.clientTotals);
  /* With a discount, the figures to lead with are after it: what the client is actually charged. */
  const net = netExecution(rows);
  const nb = net.before;
  const na = net.after;
  const changed: { room: string; name: string; tag: string; change: number }[] = revision
    ? (s.rooms || []).flatMap((r: any) =>
        r.asSection
          ? [{ room: r.name, name: 'Whole room, compared as a section', tag: 'SECTION', change: r.change }]
          : (r.lines || []).map((l: any) => ({ room: r.name, name: l.now || l.name, tag: l.tag, change: l.change })))
    : [];
  /* Agreed with the studio and recorded by them counts too: nothing for the client to do. */
  const agreed = !issue.clientSignature && issue.recordedApproval ? issue.recordedApproval : null;
  const approved = !!(issue.clientSignature || agreed);
  const d: any = issue.clientSignature || {};
  /* Sent back for changes: with the studio, and not theirs to approve any more. */
  const sentBack = revision && isSentBack(issue) ? issue.changesRequested! : null;
  const canSendBack = revision && !!onRequestChanges;
  const asked = previous?.changesRequested || null;

  const [ack, setAck] = useState(false);
  const [name, setName] = useState(defaultName && defaultName !== 'Client' && defaultName !== 'Valued Client' ? defaultName : '');
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [mode, setMode] = useState<'approve' | 'changes'>('approve');
  const [note, setNote] = useState('');
  const [topics, setTopics] = useState<ScopeChangeTopic[]>([]);

  const download = async () => {
    setDl(true);
    try {
      const { buf, filename } = await workbookForIssue(issue, studioName);
      downloadWorkbook(buf, filename);
      reportDownload(issue.id, 'excel');
    } catch (e) {
      console.error(e);
      setError('The Excel could not be made just now. Please try again.');
    } finally {
      setDl(false);
    }
  };

  const approve = async () => {
    if (!ack || name.trim().length < 2) {
      setError(!ack ? 'Tick the box to confirm you have reviewed it.' : 'Type your name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onApprove(issue.id, name.trim(), issue.contentHash);
    } catch (e: any) {
      setError(e?.message || 'Your approval could not be recorded. Please try again, or tell your studio.');
    } finally {
      setBusy(false);
    }
  };

  const sendBack = async () => {
    if (note.trim().length < CHANGE_NOTE_MIN || name.trim().length < 2) {
      setError(note.trim().length < CHANGE_NOTE_MIN ? 'Tell the studio what you would like changed.' : 'Type your name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRequestChanges!(issue.id, { name: name.trim(), message: note.trim(), topics }, issue.contentHash);
    } catch (e: any) {
      setError(e?.message || 'Your request could not be sent. Please try again, or tell your studio.');
    } finally {
      setBusy(false);
    }
  };

  const title = revision ? `Scope Revision ${s.number ?? issue.version}` : `Detailed BOQ v${s.version ?? issue.version}`;
  const shown = showAll ? changed : changed.slice(0, 6);

  return (
    <section className={`rounded-3xl border bg-white shadow-2xs overflow-hidden ${approved ? 'border-emerald-200' : sentBack ? 'border-amber-200' : 'border-[#3D52A0]/30'}`} aria-labelledby={`approve-${issue.id}`}>
      <div className="px-5 sm:px-6 pt-5 pb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">{agreed ? 'Agreed' : approved ? 'Approved' : sentBack ? 'With the studio for changes' : 'For your approval'}</div>
          <h3 id={`approve-${issue.id}`} className="text-[19px] font-bold tracking-tight text-slate-900 mt-0.5">{title}</h3>
        </div>
        <span className="text-[12px] text-slate-500">{issue.reference} · issued {day(issue.issuedAt)}</span>
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-5">
        <div className={`grid gap-2.5 ${revision ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {(revision
            ? [[net.discounted ? 'Current, after discount' : 'Current', inr(nb), ''], [net.discounted ? 'Revised, after discount' : 'Revised', inr(na), ''], ['Change', sgn(na - nb), na - nb > 0.5 ? 'text-rose-700' : na - nb < -0.5 ? 'text-emerald-700' : '']]
            : [[net.discounted ? 'Your BOQ, after discount' : 'Your BOQ', inr(na), ''], ['Items', String(s.lineCount ?? ''), '']]
          ).map(([k, v, c]) => (
            <div key={k} className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{k}</div>
              <div className={`text-[20px] font-extrabold tabular-nums ${c || 'text-slate-900'}`}>{v}</div>
            </div>
          ))}
        </div>

        {rows.length > 1 && (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-[12.5px] tabular-nums min-w-[420px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="text-left font-bold pb-1"></th>
                  {revision && <th className="text-right font-bold pb-1 pl-4">Signed</th>}
                  <th className="text-right font-bold pb-1 pl-4">{revision ? 'Revised' : 'Amount'}</th>
                  {revision && <th className="text-right font-bold pb-1 pl-4">Change</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.key} className={r.key === 'total' ? 'font-bold text-slate-900' : 'text-slate-600'}>
                    <td className="py-1.5 pr-2">{r.label}</td>
                    {revision && <td className="py-1.5 pl-4 text-right whitespace-nowrap">{inr(r.before)}</td>}
                    <td className="py-1.5 pl-4 text-right whitespace-nowrap">{inr(r.after)}</td>
                    {revision && <td className="py-1.5 pl-4 text-right whitespace-nowrap">{sgn(r.change)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11.5px] text-slate-500 -mt-2">{totalsNote(s.clientTotals, revision)}</p>

        {changed.length > 0 && (
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            {shown.map((c, i) => (
              <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 items-center px-3.5 py-2.5 border-b border-slate-100 last:border-b-0 text-[13px]">
                <span className={`text-[9.5px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded ${TAG[c.tag]?.c || 'bg-slate-100 text-slate-600'}`}>{TAG[c.tag]?.t || 'Section'}</span>
                <div className="min-w-0"><div className="text-slate-900 font-semibold truncate">{c.name}</div><div className="text-[11.5px] text-slate-500">{c.room}</div></div>
                <span className={`font-bold tabular-nums ${c.change > 0.5 ? 'text-rose-700' : c.change < -0.5 ? 'text-emerald-700' : 'text-slate-400'}`}>{sgn(c.change)}</span>
              </div>
            ))}
            {changed.length > 6 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full px-3.5 py-2 text-[12px] font-bold text-[#3D52A0] hover:bg-slate-50 text-left cursor-pointer">
                {showAll ? 'Show fewer' : `Show all ${changed.length} changes`}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={download} disabled={dl} className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-[12.5px] font-bold text-slate-800 hover:bg-slate-50 cursor-pointer flex items-center gap-2">
            {dl ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="w-5 h-5 rounded bg-[#107C41] text-white text-[10px] font-extrabold grid place-items-center">X</span>}
            Download Excel (full BOQ)
          </button>
          {onSeeChanges && revision && (
            <button type="button" onClick={onSeeChanges} className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">See what changed, room by room</button>
          )}
          {approved && <ApprovalRecordButton issue={issue} studioName={studioName} studioAddress={studioAddress} />}
        </div>

        {approved ? (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3.5 text-[13px] text-emerald-900 flex gap-2.5">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-700" />
            <div>
              {agreed
                ? <b>Agreed with {studioName}{agreedViaPhrase(agreed.how) ? ` ${agreedViaPhrase(agreed.how)}` : ''} on {day(agreed.approvedAt)}. Nothing for you to sign.</b>
                : <b>Approved by {d.signatoryName || 'you'}{d.signedAt ? ` on ${new Date(d.signedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}.</b>}
              <div className="text-emerald-800 mt-0.5">{revision ? 'The revised BOQ is your scope once the studio applies it, and your payment schedule follows.' : 'This BOQ is your scope.'}</div>
            </div>
          </div>
        ) : sentBack ? (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-4 text-sm text-slate-700 space-y-3">
            <div className="flex gap-2.5">
              <Undo2 className="w-5 h-5 shrink-0 text-amber-700" />
              <div>
                <div className="font-bold text-slate-800">You sent this back for changes{sentBack.at ? ` on ${when(sentBack.at)}` : ''}.</div>
                <div className="text-xs text-slate-500 mt-0.5">{studioName} is revising it and will send you a new version to approve.</div>
              </div>
            </div>
            <blockquote className="rounded-xl bg-white border border-amber-200 px-3.5 py-3">
              {topicLabels(sentBack.topics).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {topicLabels(sentBack.topics).map((t) => <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">{t}</span>)}
                </div>
              )}
              <p className="text-sm text-slate-800 whitespace-pre-line">{sentBack.message}</p>
              <footer className="text-[11px] text-slate-500 mt-1.5">{sentBack.name}{sentBack.email ? ` · ${sentBack.email}` : ''}{sentBack.via === 'studio_device' ? ' · taken in person by the studio' : ''}</footer>
            </blockquote>
            <div className="flex gap-2 text-xs text-slate-600">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-700" />
              <span>Until you approve a new version, the BOQ you approved{before ? ` (${inr(before)})` : ''} stays your scope. Work and payments continue on it, and nothing in this revision is built or billed.</span>
            </div>
            <p className="text-[11px] text-slate-500">Changed your mind? Tell {studioName}: they can send this version to you again to approve.</p>
          </div>
        ) : (
          <div className="rounded-2xl border-[1.5px] border-[#3D52A0] bg-[#F8F9FE] p-4 space-y-3">
            {asked && (
              <div className="rounded-xl bg-white border border-slate-200 px-3.5 py-2.5 text-xs text-slate-600 flex gap-2">
                <MessageSquareText className="w-4 h-4 shrink-0 text-[#3D52A0]" />
                <span>This version answers the changes you asked for{asked.at ? ` on ${day(asked.at)}` : ''}: <span className="text-slate-800">“{asked.message.length > 180 ? `${asked.message.slice(0, 180)}…` : asked.message}”</span></span>
              </div>
            )}
            {canSendBack && (
              <div className="inline-flex p-1 rounded-xl bg-slate-100" role="tablist" aria-label="Your decision">
                {([['approve', 'Approve'], ['changes', 'Ask for changes']] as const).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setError(null); }}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-bold cursor-pointer transition-colors ${mode === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {mode === 'approve' || !canSendBack ? (
              <div key="approve" className="space-y-3 hud-swap">
                <label className="flex items-start gap-2.5 text-[13.5px] text-slate-800 cursor-pointer">
                  <input type="checkbox" checked={ack} onChange={(e) => { setAck(e.target.checked); setError(null); }} className="mt-0.5 w-[18px] h-[18px] accent-[#3D52A0] shrink-0" />
                  <span>
                    I have reviewed {revision ? `the revised BOQ (v${s.v2?.version}, ${inr(after)}${net.discounted ? `, ${inr(na)} after my discount,` : ''} before design fee and GST)` : `the BOQ (${inr(after)}${net.discounted ? `, ${inr(na)} after my discount,` : ''} before design fee and GST)`} and approve it as my project's scope.
                  </span>
                </label>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid gap-1 text-[12px] text-slate-500">
                    Your name
                    <input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} autoComplete="name" className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-[14px] text-slate-900 w-[260px] max-w-full outline-none focus:ring-2 focus:ring-[#3D52A0]/30" />
                  </label>
                  <button type="button" onClick={approve} disabled={busy} className="px-4 py-2.5 rounded-xl bg-[#3D52A0] hover:bg-[#334486] disabled:opacity-60 text-white text-[13px] font-bold cursor-pointer flex items-center gap-2">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {revision ? 'Approve revision' : 'Approve BOQ'}
                  </button>
                </div>
                {error && <p role="alert" className="text-[12.5px] text-rose-800 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-px" />{error}</p>}
                <p className="text-[11.5px] text-slate-500">Recorded with your name, your portal login, the time and the document's fingerprint. No signature drawing needed.</p>
              </div>
            ) : (
              <div key="changes" className="space-y-3 hud-swap">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">What is it about?</div>
                  <div className="flex flex-wrap gap-1.5">
                    {CHANGE_TOPICS.map((t) => {
                      const on = topics.includes(t.value);
                      return (
                        <button key={t.value} type="button" aria-pressed={on}
                          onClick={() => setTopics((cur) => (on ? cur.filter((x) => x !== t.value) : [...cur, t.value]))}
                          className={`px-3 py-1.5 rounded-full border text-xs font-bold cursor-pointer transition-colors ${on ? 'bg-[#3D52A0]/10 text-[#3D52A0] border-[#3D52A0]/30' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">What would you like changed?</span>
                  <textarea value={note} onChange={(e) => { setNote(e.target.value.slice(0, CHANGE_NOTE_MAX)); setError(null); }} rows={4}
                    placeholder="For example: keep the master bedroom wardrobe as it was in the version I approved, and recheck the living room false ceiling area."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0] resize-y" />
                </label>
                <ul className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100 text-xs text-slate-600">
                  <li className="flex gap-2 px-3.5 py-2.5"><ShieldCheck className="w-4 h-4 shrink-0 text-emerald-700" /><span><b className="text-slate-800">Nothing you have approved changes.</b> The BOQ you approved{before ? ` (${inr(before)})` : ''} stays your scope, and work and payments continue on it.</span></li>
                  <li className="flex gap-2 px-3.5 py-2.5"><Undo2 className="w-4 h-4 shrink-0 text-[#3D52A0]" /><span>{studioName} revises it and sends you a complete new version to approve. A revision is approved or sent back as a whole, not item by item.</span></li>
                  <li className="flex gap-2 px-3.5 py-2.5"><Lock className="w-4 h-4 shrink-0 text-slate-400" /><span>Once sent back, this version can no longer be approved. Your note is recorded with your name, your portal login, the time and the document's fingerprint, and shared with {studioName}.</span></li>
                </ul>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Your name</span>
                    <input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} autoComplete="name" className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 w-[260px] max-w-full outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]" />
                  </label>
                  <button type="button" onClick={sendBack} disabled={busy} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-50 cursor-pointer flex items-center gap-2">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} Send back to {studioName}
                  </button>
                </div>
                {error && <p role="alert" className="text-xs text-rose-700 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}


/** The Excel of an issued scope document, as the client gets it. */
export function ExcelDownloadButton({ issue, studioName, label = 'Excel', className }: { issue: DocumentIssue; studioName: string; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true);
        try { const { buf, filename } = await workbookForIssue(issue, studioName); downloadWorkbook(buf, filename); reportDownload(issue.id, 'excel'); }
        catch (e) { console.error(e); alert('The Excel could not be made just now. Please try again.'); }
        finally { setBusy(false); }
      }}
      className={className || 'px-3 py-2 rounded-xl border border-slate-200 bg-white text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5'}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="w-4 h-4 rounded-[3px] bg-[#107C41] text-white text-[9px] font-extrabold grid place-items-center">X</span>}
      {label}
    </button>
  );
}
