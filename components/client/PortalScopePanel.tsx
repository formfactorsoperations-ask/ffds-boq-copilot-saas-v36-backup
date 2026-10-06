import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, FileText, PenLine, Check, ArrowRight, Download } from '@/lib/lucide-shim';
import { ClientDocumentKind, DocumentIssue, ProjectContext } from '../../types';
import { isVisibleToClient } from '../../lib/clientVisibility';
import { issueIsApproved } from '../../services/documentIssueEngine';
import type { ScopeRevisionSnapshot, ScopeChangeRoom } from '../../lib/scopeDocuments';
import type { DetailedBoqSnapshot } from '../../lib/detailedBoq';
import ScopeApprovalCard, { ExcelDownloadButton } from './ScopeApprovalCard';
import { ApprovalRecordButton } from '../documents/ApprovalRecordSheet';

/**
 * YOUR SCOPE — the client's view of the scope as documents.
 *
 * Reads only what the studio published: Detailed BOQ issues and Scope Revision
 * issues in the portal projection. Every figure is the frozen figure in those
 * documents, so this page cannot disagree with what the client signs. Reading
 * and signing happen in the reading room, like every other document.
 */

interface Props {
  context: ProjectContext;
  onOpenDocument: (kind: ClientDocumentKind, issueId?: string) => void;
  /*
    One-click approval in the portal (the Excel-first flow). When given, a
    Scope Revision or a Detailed BOQ issued for signature is approved here
    instead of being signed in the reading room.
  */
  onApproveIssue?: (issueId: string, name: string, contentHash: string) => Promise<void>;
  studioName?: string;
  studioAddress?: string | null;
  clientName?: string;
}

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const inr2 = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sgn = (n: number) => {
  const r = Math.round(n);
  return r === 0 ? '₹0' : `${r > 0 ? '+' : '−'}₹${Math.abs(r).toLocaleString('en-IN')}`;
};
const day = (t?: number | string | null) => (t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const lakh = (n: number) => `₹${+(n / 1e5).toFixed(1)} L`;

const TAG_TONE: Record<string, string> = {
  NEW: 'bg-sky-50 text-sky-800 border-sky-200',
  REMOVED: 'bg-rose-50 text-rose-800 border-rose-200',
  REDESIGNED: 'bg-violet-50 text-violet-800 border-violet-200',
};

export default function PortalScopePanel({ context, onOpenDocument, onApproveIssue, studioName = 'Studio', studioAddress, clientName }: Props) {
  const [view, setView] = useState<'hub' | 'changes'>('hub');
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const issues = (context.documents?.issues || []).filter(i => !i.withdrawnAt && isVisibleToClient(i as any));
  const boqs = issues.filter(i => i.kind === 'detailed_boq').sort((a, b) => b.version - a.version);
  const revisions = issues.filter(i => i.kind === 'scope_revision').sort((a, b) => b.version - a.version);
  /* A revision the client agreed to with the studio (recorded) is not waiting on them. */
  const pending = revisions.find(r => !r.clientSignature && !r.recordedApproval) || null;
  const doneLabel = (r: { clientSignature?: any; recordedApproval?: any }) =>
    r.recordedApproval && !r.clientSignature
      ? `agreed ${day(r.recordedApproval.approvedAt)}`
      : `${approveHere || r.clientSignature?.signatureType === 'portal_approval' ? 'approved' : 'signed'} ${day(r.clientSignature?.signedAt)}`;
  const inForce = boqs.find(issueIsApproved) || null;
  const latestRevision = pending || revisions[0] || null;
  const rev: ScopeRevisionSnapshot | null = latestRevision?.snapshot?.v2 ? latestRevision.snapshot : null;
  /* A first Detailed BOQ issued for the client's approval. */
  const pendingBoq = boqs.find(b => !issueIsApproved(b) && !(b as any).supersededAt && b.snapshot?.approval?.mode === 'for_signature') || null;
  const approveHere = !!onApproveIssue;
  const ask = approveHere ? 'approval' : 'signature';
  const goApprove = (id: string) => {
    if (!approveHere) { onOpenDocument('scope_revision', id); return; }
    setView('hub');
    setTimeout(() => document.getElementById(`approve-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  if (!boqs.length && !revisions.length) return null;

  // ── What changed ───────────────────────────────────────────────────────
  if (view === 'changes' && rev) {
    const newRoom = rev.rooms.find(r => r.isNew);
    const pct = rev.v1.total > 0 ? (rev.change / rev.v1.total) * 100 : 0;
    const steps = rev.bridge;
    let run = rev.v1.total;
    const bars = steps.map(p => {
      const from = run;
      run += p.value;
      return { ...p, from, to: run };
    });
    const values = [rev.v1.total, rev.v2.total, ...bars.flatMap(b => [b.from, b.to])];
    const lo = Math.floor((Math.min(...values) * 0.94) / 1e5) * 1e5;
    const hi = Math.ceil((Math.max(...values) * 1.01) / 1e5) * 1e5;
    const X = (v: number) => ((v - lo) / (hi - lo)) * 100;
    const hovered = bars.find(b => b.key === hover);

    const RoomBody: React.FC<{ r: ScopeChangeRoom }> = ({ r }) => (
      <div className="px-3 pb-3">
        {r.note && <p className="text-[12px] text-slate-600 italic px-1 pb-2">{r.note}</p>}
        {r.asSection ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['before', 'after'] as const).map(side => (
              <div key={side}>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  <span>{side === 'before' ? 'Signed' : 'Revised'}</span>
                  <span className="tabular-nums">{inr(side === 'before' ? r.v1 : r.v2)}</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {r.asSection![side].map((x, i) => (
                    <li key={i} className="flex justify-between gap-3 py-1.5 text-[12px] text-slate-600">
                      <span>{x.name}</span><b className="text-slate-900 tabular-nums whitespace-nowrap">{inr(x.amount)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {r.lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 py-2 text-[12.5px] items-start">
                <div className="col-span-12 sm:col-span-6">
                  <span className="font-semibold text-slate-800">{l.name}</span>
                  <span className={`ml-2 text-[9.5px] font-bold uppercase tracking-wide border rounded px-1.5 py-0.5 ${TAG_TONE[l.tag] || 'bg-amber-50 text-amber-800 border-amber-200'}`}>{l.tag.toLowerCase()}</span>
                  {l.was && <div className="text-[11px] text-slate-500 mt-0.5">Was: {l.was}</div>}
                </div>
                <div className="col-span-4 sm:col-span-2 text-slate-500 tabular-nums">{l.q1 ? +l.q1.toFixed(2) : '—'} → {l.q2 ? +l.q2.toFixed(2) : '—'} {l.unit}</div>
                <div className="col-span-4 sm:col-span-2 text-right text-slate-500 tabular-nums">{l.a1 ? inr(l.a1) : '—'} → {l.a2 ? inr(l.a2) : '—'}</div>
                <div className={`col-span-4 sm:col-span-2 text-right font-bold tabular-nums ${l.change > 0.5 ? 'text-rose-700' : l.change < -0.5 ? 'text-emerald-700' : 'text-slate-400'}`}>{sgn(l.change)}</div>
              </div>
            ))}
            {!r.lines.length && <div className="py-2 text-[12px] text-slate-400">No changes in this room.</div>}
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-4 pb-20">
        <button onClick={() => setView('hub')} className="text-[12.5px] font-bold text-[#3D52A0] flex items-center gap-1 cursor-pointer"><ChevronLeft className="w-4 h-4" /> Your scope</button>

        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">Scope revision {rev.number} · v{rev.v2.version - 1} → v{rev.v2.version}</div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">How your scope changed</h2>
            <p className="text-[13.5px] text-slate-600 mt-2 leading-relaxed">
              Your revised BOQ is <b className="text-slate-900">{sgn(rev.change)}</b> against the version you approved{rev.v1.approvedOn ? ` on ${day(rev.v1.approvedOn)}` : ''}.
              {rev.summary ? ` ${rev.summary}` : ''}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {pending && <span className="text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800">Awaiting your signature</span>}
              <span className="text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-slate-200 text-slate-600">Rates fixed at issue</span>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-2">
            {[
              { t: `Detailed BOQ · v${rev.v2.version - 1}`, s: `${rev.v1.reference}${rev.v1.approvedOn ? ` · approved ${day(rev.v1.approvedOn)}` : ''}`, v: rev.v1.total, hl: false },
              { t: `Detailed BOQ · v${rev.v2.version} (revised)`, s: `${rev.v2.reference} · issued ${day(rev.issuedOn)}`, v: rev.v2.total, hl: true },
            ].map(d => (
              <div key={d.t} className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 ${d.hl ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
                <FileText className="w-4 h-4 text-[#3D52A0] shrink-0" />
                <div className="flex-1 min-w-0"><div className="text-[13px] font-bold text-slate-900">{d.t}</div><div className="text-[11px] text-slate-500 truncate">{d.s}</div></div>
                <div className="text-[14px] font-extrabold tabular-nums text-slate-900">{inr(d.v)}</div>
              </div>
            ))}
            <p className="text-[11px] text-slate-500 px-1">Execution scope, before the design fee and GST. Both versions are priced on the same basis.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { k: `v${rev.v2.version - 1} · approved`, v: inr(rev.v1.total), s: day(rev.v1.approvedOn) },
            { k: `v${rev.v2.version} · revised`, v: inr(rev.v2.total), s: day(rev.issuedOn) },
            { k: 'Change', v: sgn(rev.change), s: `${pct >= 0 ? '' : '−'}${Math.abs(pct).toFixed(1)}% ${pct >= 0 ? 'above' : 'below'} v${rev.v2.version - 1}`, hl: true },
            newRoom ? { k: 'New room', v: inr(newRoom.v2), s: newRoom.name } : { k: 'Rooms', v: String(rev.rooms.length), s: 'in the revised scope' },
          ].map((c: any) => (
            <div key={c.k} className={`rounded-2xl border px-4 py-3.5 ${c.hl ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{c.k}</div>
              <div className={`text-xl font-extrabold tabular-nums mt-0.5 ${c.hl ? 'text-amber-800' : 'text-slate-900'}`}>{c.v}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 truncate">{c.s}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs p-5 sm:p-6">
          <h3 className="text-lg font-bold tracking-tight text-slate-900">Where the change comes from</h3>
          <p className="text-[12.5px] text-slate-500 mt-0.5">The whole difference, in parts that add up exactly. Point at one to see what is in it.</p>
          <div className="mt-4 space-y-1.5">
            {[{ key: 'v1', label: `Approved v${rev.v2.version - 1}`, from: lo, to: rev.v1.total, value: rev.v1.total, total: true } as any, ...bars, { key: 'v2', label: `Revised v${rev.v2.version}`, from: lo, to: rev.v2.total, value: rev.v2.total, total: true }].map((b: any) => {
              const a = Math.min(X(b.from), X(b.to));
              const w = Math.max(0.6, Math.abs(X(b.to) - X(b.from)));
              const tone = b.total ? 'bg-[#3D52A0]' : b.value >= 0 ? 'bg-amber-600/80' : 'bg-emerald-600/80';
              return (
                <div key={b.key} className="grid grid-cols-12 gap-3 items-center" onMouseEnter={() => !b.total && setHover(b.key)} onMouseLeave={() => setHover(null)}>
                  <div className={`col-span-4 sm:col-span-3 text-[12.5px] ${b.total ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{b.label}</div>
                  <div className="col-span-5 sm:col-span-7 h-4 rounded-md bg-slate-100 relative overflow-hidden">
                    <div className={`absolute top-0 bottom-0 rounded-md ${tone} ${hover && hover !== b.key && !b.total ? 'opacity-40' : ''}`} style={{ left: `${a}%`, width: `${w}%` }} />
                  </div>
                  <div className={`col-span-3 sm:col-span-2 text-right text-[12.5px] font-bold tabular-nums ${b.total ? 'text-slate-900' : b.value >= 0 ? 'text-amber-800' : 'text-emerald-700'}`}>{b.total ? inr(b.value) : sgn(b.value)}</div>
                </div>
              );
            })}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4 sm:col-span-3" />
              <div className="col-span-5 sm:col-span-7 flex justify-between text-[10.5px] text-slate-400"><span>{lakh(lo)} — the scale starts here, not at zero</span><span>{lakh(hi)}</span></div>
            </div>
          </div>
          <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-[12.5px] text-slate-600 min-h-[44px]">
            {hovered ? <><b className="text-slate-900">{hovered.label}:</b> {hovered.sub}</> : 'Point at a part.'}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs p-5 sm:p-6">
          <h3 className="text-lg font-bold tracking-tight text-slate-900">Room by room</h3>
          <p className="text-[12.5px] text-slate-500 mt-0.5">Open a room for the items that changed, before and after. The full revised BOQ is in the document.</p>
          <div className="mt-3 divide-y divide-slate-100">
            {rev.rooms.map(r => {
              const isOpen = openRoom === r.name;
              return (
                <div key={r.name}>
                  <button onClick={() => setOpenRoom(isOpen ? null : r.name)} className="w-full grid grid-cols-12 gap-2 items-center py-3 px-1 text-left cursor-pointer hover:bg-slate-50/70 rounded-xl">
                    <div className="col-span-12 sm:col-span-6 flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-bold text-slate-900">{r.name}</span>
                      {r.isNew && <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-sky-50 border border-sky-200 text-sky-800">New room</span>}
                      {r.formerly && <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-slate-50 border border-slate-200 text-slate-500">was {r.formerly}</span>}
                      {r.asSection && <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-violet-50 border border-violet-200 text-violet-800">Compared as a section</span>}
                    </div>
                    <div className="col-span-4 sm:col-span-2 text-right text-[12.5px] text-slate-500 tabular-nums">{inr(r.v1)}</div>
                    <div className="col-span-4 sm:col-span-2 text-right text-[12.5px] font-bold text-slate-900 tabular-nums">{inr(r.v2)}</div>
                    <div className={`col-span-3 sm:col-span-1 text-right text-[12.5px] font-bold tabular-nums ${r.change > 0.5 ? 'text-rose-700' : r.change < -0.5 ? 'text-emerald-700' : 'text-slate-400'}`}>{sgn(r.change)}</div>
                    <ChevronDown className={`col-span-1 w-4 h-4 text-slate-400 justify-self-end transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && <RoomBody r={r} />}
                </div>
              );
            })}
          </div>
        </div>

        {latestRevision && (
          <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-slate-900">Scope revision {rev.number} · {sgn(rev.change)} · {pending ? `awaiting your ${ask}` : doneLabel(latestRevision as any)}</div>
                <div className="text-[11.5px] text-slate-500">{pending ? `Nothing in the revised BOQ is built until you ${approveHere ? 'approve' : 'sign'} it.` : 'The revised BOQ is your scope.'}</div>
              </div>
              {approveHere
                ? <ExcelDownloadButton issue={latestRevision} studioName={studioName} label="Download Excel" />
                : <button onClick={() => onOpenDocument('scope_revision', latestRevision.id)} className="px-3.5 py-2 rounded-xl border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"><FileText className="w-4 h-4" /> View the document</button>}
              {pending && <button onClick={() => goApprove(pending.id)} className="px-4 py-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] text-white text-[12.5px] font-bold cursor-pointer flex items-center gap-1.5"><PenLine className="w-4 h-4" /> {approveHere ? 'Review & approve' : 'Review & sign'}</button>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Your scope ─────────────────────────────────────────────────────────
  const inForceSnap: DetailedBoqSnapshot | null = inForce?.snapshot?.rooms ? inForce.snapshot : null;
  const chain = [
    ...boqs.slice().reverse().map(b => ({ id: b.id, label: `v${b.version} ${issueIsApproved(b) ? 'approved' : 'issued'}`, sub: `${day((b.recordedApproval?.approvedAt) || (b.clientSignature as any)?.signedAt || b.issuedAt)} · ${lakh(b.snapshot?.total || 0)}`, state: issueIsApproved(b) ? 'done' : 'now' })),
    ...(pending && rev ? [{ id: 'pending', label: `v${rev.v2.version} issued`, sub: `${day(rev.issuedOn)} · ${lakh(rev.v2.total)}`, state: 'now' }] : []),
  ];

  const DocRow: React.FC<{ tag: string; title: string; sub: string; pill?: { t: string; tone: string }; actions: React.ReactNode; muted?: boolean }> = ({ tag, title, sub, pill, actions, muted }) => (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3.5 ${muted ? 'bg-slate-50/60 border-slate-200' : 'bg-white border-slate-200'}`}>
      <span className="w-9 h-11 rounded-md border border-slate-200 bg-white grid place-items-end pb-1 text-[8px] font-extrabold text-[#3D52A0] shrink-0">{tag}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-bold text-slate-900">{title}</div>
        <div className="text-[11.5px] text-slate-500">{sub}</div>
        {pill && <span className={`inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${pill.tone}`}>{pill.t}</span>}
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  );

  return (
    <div className="space-y-4" id="your-scope">
      <div>
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">Your scope</div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">The scope you are building</h2>
        <p className="text-[13px] text-slate-600 mt-1 max-w-2xl">Every version of your Bill of Quantities, as a document you can read and keep. The one you approve is the scope your agreement is priced on.</p>
      </div>

      {approveHere && pending && (
        <ScopeApprovalCard issue={pending} studioName={studioName} studioAddress={studioAddress} defaultName={clientName}
          onApprove={onApproveIssue!} onSeeChanges={() => setView('changes')} />
      )}
      {approveHere && pendingBoq && (
        <ScopeApprovalCard issue={pendingBoq} studioName={studioName} studioAddress={studioAddress} defaultName={clientName} onApprove={onApproveIssue!} />
      )}
      {approveHere && !pending && latestRevision && ((latestRevision.clientSignature as any)?.signatureType === 'portal_approval' || (!latestRevision.clientSignature && latestRevision.recordedApproval)) && (
        <ScopeApprovalCard issue={latestRevision} studioName={studioName} studioAddress={studioAddress} onApprove={onApproveIssue!} onSeeChanges={() => setView('changes')} />
      )}

      {!approveHere && pending && rev && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50/50 px-5 py-4">
          <span className="w-11 h-11 rounded-xl bg-white border border-amber-200 grid place-items-center text-amber-800"><PenLine className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-slate-900">Your revised BOQ is ready for your signature</div>
            <div className="text-[12.5px] text-slate-600">Scope revision {rev.number} · {sgn(rev.change)} against the version you approved{rev.v1.approvedOn ? ` on ${day(rev.v1.approvedOn)}` : ''} · issued {day(rev.issuedOn)}</div>
          </div>
          <button onClick={() => setView('changes')} className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">See what changed</button>
          <button onClick={() => onOpenDocument('scope_revision', pending.id)} className="px-4 py-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] text-white text-[12.5px] font-bold cursor-pointer">Review & sign</button>
        </div>
      )}

      <div className="space-y-2">
        {pending && rev && (
          <>
            <DocRow tag="BOQ" title={`Detailed BOQ · v${rev.v2.version} (revised)`} sub={`${rev.v2.reference} · issued ${day(rev.issuedOn)} · ${rev.v2.rooms.length} rooms · ${inr(rev.v2.total)}`}
              pill={{ t: `Awaiting your ${ask}`, tone: 'bg-amber-50 border-amber-200 text-amber-800' }}
              actions={<button onClick={() => goApprove(pending.id)} className="px-3.5 py-2 rounded-xl bg-[#3D52A0] text-white text-[12px] font-bold cursor-pointer">{approveHere ? 'Review & approve' : 'Review & sign'}</button>} />
            <DocRow tag="Δ" title={`Scope revision statement · v${rev.v2.version - 1} → v${rev.v2.version}`} sub="What changed, room by room, and why · issued with the revised BOQ"
              actions={<button onClick={() => setView('changes')} className="px-3.5 py-2 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1">Open <ArrowRight className="w-3.5 h-3.5" /></button>} />
          </>
        )}
        {boqs.map(b => {
          const approved = issueIsApproved(b);
          const superseded = !!b.supersededAt || (inForce && inForce.id !== b.id && approved);
          return (
            <DocRow key={b.id} tag="BOQ" muted={!!superseded}
              title={`Detailed BOQ · v${b.version}`}
              sub={`${b.reference} · ${b.recordedApproval ? `approved ${day(b.recordedApproval.approvedAt)}` : b.signedVia ? `${approveHere ? 'approved' : 'signed'} with its scope revision` : b.clientSignature ? `${(b.clientSignature as any).signatureType === 'portal_approval' ? 'approved' : 'signed'} ${day((b.clientSignature as any).signedAt)}` : `issued ${day(b.issuedAt)}`} · ${inr(b.snapshot?.total || 0)}`}
              pill={superseded ? { t: 'Superseded', tone: 'bg-slate-100 border-slate-200 text-slate-500' }
                : approved ? { t: pending ? `In force until v${rev?.v2.version} is ${approveHere ? 'approved' : 'signed'}` : 'In force', tone: 'bg-emerald-50 border-emerald-200 text-emerald-700' }
                : { t: `Awaiting your ${ask}`, tone: 'bg-amber-50 border-amber-200 text-amber-800' }}
              actions={
                approved || superseded
                  ? <>
                      {(b.clientSignature as any)?.signatureType === 'portal_approval' && <ApprovalRecordButton issue={b} studioName={studioName} studioAddress={studioAddress} />}
                      {approveHere
                        ? <ExcelDownloadButton issue={b} studioName={studioName} />
                        : <button onClick={() => onOpenDocument('detailed_boq', b.id)} className="px-3 py-2 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Open</button>}
                    </>
                  : approveHere
                    ? <button onClick={() => goApprove(b.id)} className="px-3.5 py-2 rounded-xl bg-[#3D52A0] text-white text-[12px] font-bold cursor-pointer">Review & approve</button>
                    : <button onClick={() => onOpenDocument('detailed_boq', b.id)} className="px-3.5 py-2 rounded-xl bg-[#3D52A0] text-white text-[12px] font-bold cursor-pointer">Review & sign</button>
              } />
          );
        })}
        {!pending && revisions.map(r => (
          <DocRow key={r.id} tag="Δ" muted title={`Scope revision ${r.snapshot?.number || r.version} · ${r.reference}`} sub={`${r.clientSignature || r.recordedApproval ? doneLabel(r as any).replace(/^./, c => c.toUpperCase()) : `Issued ${day(r.issuedAt)}`} · ${sgn(r.snapshot?.change || 0)}`}
            actions={<>
              <button onClick={() => setView('changes')} className="px-3 py-2 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">What changed</button>
              {approveHere
                ? <>
                    {((r.clientSignature as any)?.signatureType === 'portal_approval' || (!r.clientSignature && r.recordedApproval)) && <ApprovalRecordButton issue={r} studioName={studioName} studioAddress={studioAddress} />}
                    <ExcelDownloadButton issue={r} studioName={studioName} />
                  </>
                : <button onClick={() => onOpenDocument('scope_revision', r.id)} className="px-3 py-2 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">Open</button>}
            </>} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-200/80 shadow-2xs p-5">
          <h3 className="text-lg font-bold tracking-tight text-slate-900">How your scope has moved</h3>
          <p className="text-[12px] text-slate-500">Each version stays on record. Nothing is replaced until you sign.</p>
          <div className="flex items-start mt-4 overflow-x-auto">
            {[...chain, { id: 'agreement', label: 'Agreement', sub: 'priced on the signed BOQ', state: 'later' }].map((n, i, all) => (
              <React.Fragment key={n.id}>
                <div className="flex flex-col items-center text-center min-w-[120px]">
                  <span className={`w-8 h-8 rounded-full grid place-items-center border-2 ${n.state === 'done' ? 'border-[#3D52A0] text-[#3D52A0] bg-white' : n.state === 'now' ? 'border-amber-500 text-amber-700 bg-amber-50' : 'border-slate-200 text-slate-300 bg-white'}`}>
                    {n.state === 'done' ? <Check className="w-4 h-4" /> : n.state === 'now' ? <PenLine className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                  </span>
                  <div className={`text-[12px] font-bold mt-1.5 ${n.state === 'later' ? 'text-slate-400' : 'text-slate-800'}`}>{n.label}</div>
                  <div className="text-[10.5px] text-slate-400">{n.sub}</div>
                </div>
                {i < all.length - 1 && <div className={`flex-1 min-w-[24px] h-0 mt-4 border-t-2 ${all[i + 1].state === 'later' ? 'border-slate-200' : 'border-dashed border-amber-300'}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>
        {inForceSnap && inForce && (
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/80 shadow-2xs p-5">
            <h3 className="text-lg font-bold tracking-tight text-slate-900">In force today</h3>
            <p className="text-[12px] text-slate-500">{pending ? `Until you sign v${rev?.v2.version}, this is your scope.` : 'This is your scope.'}</p>
            <dl className="mt-3 divide-y divide-slate-100 text-[12.5px]">
              {[
                ['Version', `Detailed BOQ v${inForce.version}`],
                ['Approved', day(inForce.recordedApproval?.approvedAt || (inForce.clientSignature as any)?.signedAt || inForce.issuedAt)],
                ['Execution scope', inr2(inForceSnap.total)],
                ['Rooms', String(inForceSnap.rooms.length)],
                ['Items', String(inForceSnap.lineCount)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2"><dt className="text-slate-500">{k}</dt><dd className="font-bold text-slate-900 tabular-nums">{v}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
