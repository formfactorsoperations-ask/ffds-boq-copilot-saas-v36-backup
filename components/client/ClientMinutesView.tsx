import React, { useMemo, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { FileText, Check, Send, X, Loader2, CheckCircle2, RotateCcw, Download } from '@/lib/lucide-shim';
import { db } from '../../services/firebaseClient';
import { clientView, cleanCorrections, correctionText, fmtShortDay, type ClientLine, type CorrectionLine } from '../../lib/minutes';
import { downloadElementAsPdf, pdfFilename } from '../../lib/documentPdf';
import { MinutesDocument } from '../minutes/MinutesDocument';
import { Chip, IconChip, EYEBROW, BRAND_EYEBROW, input, btnPri, btnSec } from '../minutes/MinutesBits';
import '../projectHeader/projectHeader.css';

/*
  THE CLIENT PORTAL: MINUTES TO CONFIRM (mockup 6).

  The client confirms in one tap, or marks the exact line that is wrong and
  says why. A correction lands back on Client Relations' desk, who answers it
  with a revision. What the client may write is fixed by the database rules:
  the confirmation (who and when), or the correction and its lines.
*/

interface Props {
  mom: any;
  studioName: string;
  projectName: string;
  clientName: string;
  studioId?: string;
  projectId?: string;
  onClose: () => void;
  onChanged: (m: any) => void;
}

export default function ClientMinutesView({ mom, studioName, projectName, clientName, studioId, projectId, onClose, onChanged }: Props) {
  const view = useMemo(() => clientView(mom.topics, studioName, fmtShortDay), [mom.topics, studioName]);
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [fair, setFair] = useState(false);
  const [name, setName] = useState(clientName || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const confirmed = mom.status === 'acknowledged';
  const asked = mom.status === 'correction_requested';
  const canAct = mom.status === 'finalised' || mom.status === 'shared';
  const count = Object.keys(fixes).length;
  const meetingDay = mom.meetingDate ? new Date(mom.meetingDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '';
  const write = async (updates: any) => {
    if (!studioId || !projectId) throw new Error('This page cannot reach your studio just now.');
    await updateDoc(doc(db, `organizations/${studioId}/projects/${projectId}/moms`, mom.id), updates);
    onChanged({ ...mom, ...updates });
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await write({ status: 'acknowledged', acknowledgedBy: name.trim(), acknowledgedAt: Date.now(), ackChannel: 'client_portal' });
    } catch (e: any) {
      setError('Your confirmation did not reach the studio. Check your connection and try again.');
    } finally { setBusy(false); }
  };
  const sendFixes = async () => {
    const all: ClientLine[] = [...view.agreed, ...view.next, ...view.notes];
    const lines: CorrectionLine[] = cleanCorrections(Object.entries(fixes).map(([lineId, text]) => ({
      lineId, ref: all.find((l) => l.lineId === lineId)?.ref || '', text: String(text),
    })), mom.topics);
    if (!lines.length) return;
    setBusy(true);
    setError(null);
    try {
      await write({ status: 'correction_requested', correctionRequest: { text: correctionText(lines), by: name.trim() || clientName || 'Client', at: Date.now(), lines } });
    } catch {
      setError('Your correction did not reach the studio. Check your connection and try again.');
    } finally { setBusy(false); }
  };

  /* A plain function, not a component: the correction box keeps its focus as you type. */
  const row = (l: ClientLine, i: number) => {
    const marked = fixes[l.lineId];
    const editing = open === l.lineId;
    return (
      <div key={l.lineId} className={`px-4 sm:px-6 py-3 hud-row-in ${marked || editing ? 'bg-amber-50/60' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
        <div className="flex items-start gap-3">
          <span className="text-[11px] font-bold text-slate-500 w-7 tabular-nums mt-0.5 shrink-0">{l.ref}</span>
          <div className="flex-1 min-w-0"><p className="text-sm text-slate-800">{l.text}</p>{l.owner && <p className="text-[11px] text-slate-500 mt-0.5">{l.owner}</p>}</div>
          {marked && !editing ? (
            <button type="button" onClick={() => { setOpen(l.lineId); setDraft(marked); }}><Chip tone="amber">Correction</Chip></button>
          ) : canAct && !editing ? (
            <button type="button" className="text-xs font-bold text-slate-500 hover:text-[#3D52A0] shrink-0" onClick={() => { setOpen(l.lineId); setDraft(''); }}>Not quite right?</button>
          ) : null}
        </div>
        {editing && (
          <div className="ml-10 mt-2">
            <textarea autoFocus className={`${input} min-h-[64px]`} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`What is wrong with ${l.ref}`}
              placeholder="What should it say? For example: the handle finish is antique brass, not black." />
            <div className="flex gap-2 mt-2">
              <button type="button" className={`${btnSec} !py-1.5 !text-xs`} onClick={() => {
                setOpen(null);
                if (!draft.trim()) setFixes((f) => { const n = { ...f }; delete n[l.lineId]; return n; });
              }}>{marked ? 'Keep as it was' : 'Cancel'}</button>
              {marked && <button type="button" className={`${btnSec} !py-1.5 !text-xs`} onClick={() => { setFixes((f) => { const n = { ...f }; delete n[l.lineId]; return n; }); setOpen(null); }}>Remove correction</button>}
              <button type="button" className={`${btnPri} !py-1.5 !text-xs`} disabled={!draft.trim()} onClick={() => { setFixes((f) => ({ ...f, [l.lineId]: draft.trim() })); setOpen(null); }}>{marked ? 'Update correction' : 'Add correction'}</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Minutes to confirm">
      <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="phd-pop relative w-full max-w-3xl bg-white sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-full sm:max-h-[92vh]">
        <div className="px-4 sm:px-6 py-5 border-b border-slate-100 flex items-start gap-4">
          <IconChip icon={FileText} />
          <div className="flex-1 min-w-0">
            <p className={BRAND_EYEBROW}>{confirmed ? 'Minutes · confirmed' : asked ? 'Minutes · correction sent' : `Minutes to confirm · from ${studioName}`}</p>
            <h3 className="text-lg font-bold text-slate-800">{mom.meetingTitle || 'Meeting'}{meetingDay ? ` · ${meetingDay}` : ''}</h3>
            <p className="text-xs text-slate-500">
              {mom.momRef}{(mom.rev || 0) > 0 ? ` · revision ${mom.rev + 1}` : ''}{mom.approvedBy?.name ? ` · approved by ${mom.approvedBy.name}` : ''} ·{' '}
              <button type="button" className="text-[#3D52A0] font-bold inline-flex items-center gap-1" disabled={downloading} onClick={async () => {
                if (!pdfRef.current) return;
                setDownloading(true);
                try {
                  await downloadElementAsPdf(pdfRef.current, {
                    filename: pdfFilename(mom.momRef, projectName, 'Minutes') + '.pdf', title: `${mom.momRef} · ${mom.meetingTitle || 'Meeting'}`,
                    studioName, ribbon: { label: confirmed ? 'Confirmed' : 'Approved · issued', tone: confirmed ? 'signed' : 'issued' },
                  });
                } finally { setDownloading(false); }
              }}>{downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}Download PDF</button>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-xl grid place-items-center text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {confirmed && (
            <div className="mx-4 sm:mx-6 mt-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-2 text-sm text-emerald-900">
              <CheckCircle2 className="w-4 h-4" />Confirmed by <b>{mom.acknowledgedBy || clientName}</b>{mom.acknowledgedAt ? ` on ${new Date(mom.acknowledgedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}.
            </div>
          )}
          {asked && (
            <div className="mx-4 sm:mx-6 mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
              <p className="font-bold flex items-center gap-2"><RotateCcw className="w-4 h-4" />Your correction is with {studioName}</p>
              <p className="text-xs mt-1">They will send revised minutes with the change marked. Until then these stand as you read them here.</p>
            </div>
          )}
          {(mom.rev || 0) > 0 && mom.revisionNote && <p className="mx-4 sm:mx-6 mt-4 text-xs text-slate-700 rounded-lg bg-[#3D52A0]/5 border border-[#3D52A0]/20 px-3 py-2"><b>What changed:</b> {mom.revisionNote}</p>}
          {mom.summary && <p className="px-4 sm:px-6 pt-4 text-sm text-slate-700 leading-relaxed"><span className={EYEBROW}>In brief · </span>{mom.summary}</p>}
          {view.agreed.length > 0 && (<>
            <p className={`${EYEBROW} px-4 sm:px-6 pt-5 pb-1`}>What we agreed</p>
            <div className="divide-y divide-slate-100">{view.agreed.map((l, i) => row(l, i))}</div>
          </>)}
          {view.next.length > 0 && (<>
            <p className={`${EYEBROW} px-4 sm:px-6 pt-5 pb-1`}>Next steps</p>
            <div className="divide-y divide-slate-100">{view.next.map((l, i) => row(l, i))}</div>
          </>)}
          {view.notes.length > 0 && (<>
            <p className={`${EYEBROW} px-4 sm:px-6 pt-5 pb-1`}>Also noted</p>
            <div className="divide-y divide-slate-100">{view.notes.map((l, i) => row({ ...l, ref: '' }, i))}</div>
          </>)}
          <div className="h-4" />
        </div>

        {canAct && (
          <div className="bg-slate-50 border-t border-slate-100 px-4 sm:px-6 py-4 space-y-3">
            {count === 0 && (
              <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={fair} onChange={(e) => setFair(e.target.checked)} className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-[#3D52A0]" />
                These minutes are a fair record of our meeting.
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <input className={`${input} sm:max-w-[220px]`} value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" placeholder="Your name" />
              <p className="text-xs text-slate-600 flex-1 min-w-[160px]">{count ? `${count} correction${count === 1 ? '' : 's'} will go to ${studioName}. The rest stands as written.` : 'Or tap “Not quite right?” on any line.'}</p>
              {count ? (
                <button type="button" className={btnPri} disabled={busy || !name.trim()} onClick={sendFixes}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send {count} correction{count === 1 ? '' : 's'}
                </button>
              ) : (
                <button type="button" className={btnPri} disabled={busy || !fair || !name.trim()} onClick={confirm}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Confirm as {name.trim() || 'you'}
                </button>
              )}
            </div>
            {error && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
          </div>
        )}
      </div>
      <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
        <MinutesDocument ref={pdfRef} studio={{ name: studioName }} projectName={projectName} clientName={clientName} momRef={mom.momRef} rev={mom.rev}
          meeting={{ title: mom.meetingTitle || 'Meeting', type: mom.meetingType, date: Number(mom.meetingDate) || Date.now(), end: mom.meetingEnd, venue: mom.venue }}
          content={{ topics: mom.topics || [], summary: mom.summary, carried: mom.carried, nextMeeting: mom.nextMeeting, attendees: (mom.attendees || []).filter((a: any) => a.side !== 'vendor'), revisionNote: mom.revisionNote }}
          preparedBy={mom.preparedBy} approvedBy={mom.approvedBy}
          confirmedBy={confirmed && mom.acknowledgedAt ? { name: mom.acknowledgedBy || clientName, at: mom.acknowledgedAt } : null}
          issuedAt={mom.sentAt || mom.approvedBy?.at || null} />
      </div>
    </div>
  );
}
