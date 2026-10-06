import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, FileSpreadsheet, Plus, FileText, PenLine, X, Check, AlertTriangle, Search, Repeat2, Trash2, Undo2,
  Eye, Play, ShieldCheck, Layers, Percent, ListChecks, MessageSquareText, Pencil, Upload, Sparkles, Mail, Loader2,
} from 'lucide-react';
import { DocumentIssue, FinancialConfig, Item, ProjectContext, ProposalTier } from '../../types';
import { buildBankMap, boqTotal } from '../../lib/boqPricing';
import {
  buildDetailedBoqSnapshot, detailedBoqReference, displayName, freezeBoqLines, isFrozen, normaliseUnit, pricingDrift, recordReadiness,
} from '../../lib/detailedBoq';
import {
  ParsedSheet, RevisionLine, RevisionResult, RevisionSettings, ScopeRevisionRecord, SignedLine,
  buildRevisedBoq, computeRevision, defaultSettings, internalCostsFor, parseRevisionSheet, pickClientSheet, proposeRoomMap,
  roomDisplayName, signedLinesFrom,
} from '../../lib/scopeRevision';
import {
  ScopeDraft, DraftLine, addCustom, addFromBank, bankSellRate, buildBoqFromDraft, draftMargin, draftOfRecord, draftSettings,
  mergeExcel, removeLine, renameRoom, replaceWithBank, restoreLine, revisionFromDraft, setBasis, startDraft, updateLine,
} from '../../lib/scopeDraft';
import { buildScopeRevisionSnapshot, scopeRevisionReference, ScopeRevisionSnapshot } from '../../lib/scopeDocuments';
import { detailedBoqForTier, detailedBoqVersion as vOf, isApprovedIssue } from '../../lib/scopeFlow';
import { issueDocument, signIssue, resolveDocumentState } from '../../services/documentIssueEngine';
import { buildMaterialSections } from '../../services/documentReleaseEngine';
import { isVisibleToClient, publish } from '../../lib/clientVisibility';
import { scheduleForRevision, withRevisedSchedule } from '../../lib/paymentScheduleRevision';
import { id as generateId } from '../../lib/utils';
import DocumentRenderer from '../documents/DocumentRenderer';
import ScopeRevisionSheet from '../documents/ScopeRevisionSheet';
import DocumentReadingRoom from '../client/DocumentReadingRoom';
import { useOrg } from '../../contexts/OrgContext';
import { seesStudioFinance } from '../../lib/roleAccess';
import { useMomScopeQueue, MomScopeItem } from '../../hooks/useMomScopeQueue';
import MeetingScopeInbox from './MeetingScopeInbox';
import ClientTotalsPicker from './ClientTotalsPicker';
import { ApprovalRecordButton } from '../documents/ApprovalRecordSheet';
import { ClientTotalsOptions, clientTotals, defaultTotalsOptions, totalsNote } from '../../lib/scopeTotals';
import { workbookForIssue, downloadWorkbook, toBase64, buildRevisionWorkbook, revisionWorkbookName } from '../../lib/scopeWorkbook';
import { sendScopeEmail } from '../../services/emailService';
import { publicAppOrigin } from '../../lib/publicUrl';
import { AGREED_VIA, AgreedVia, agreedViaPhrase, approvalLabel, approvalOf, recordAgreement } from '../../lib/scopeAgreement';

/**
 * SCOPE REVISION — one screen for changing a signed scope.
 *
 * Replaces the Revision Workbench and the seven-step wizard on projects with
 * signed scope on. A revision is a draft of the signed BOQ: change it by hand
 * (quantities, rates, items from the bank, custom items, removals), import a
 * revised Excel into it, or both. The rail keeps the running total, the six-part
 * breakdown, the studio-only margin and what still needs checking. Issuing
 * stages the Scope Revision document for the client; the scope changes only
 * when they sign and the studio applies it.
 */

interface Props {
  tiers: ProposalTier[];
  approvedTierId?: string;
  bank: Item[];
  projectContext: ProjectContext;
  setProjectContext: (fn: (prev: ProjectContext) => ProjectContext) => void;
  setTiers?: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
  setActiveTierId?: (id: string | null) => void;
  onMakeRehearsalCopy?: () => Promise<string | null>;
  currentUser: string;
  orgName?: string;
  /** For the cost and scope items finalised minutes have queued. */
  studioId?: string;
  projectId?: string;
  /** Rewrites the client's portal copy (services/portalRelease), so a sent document is there. */
  onReleasePortal?: (ctx: ProjectContext) => Promise<any>;
}

// ── Formatting ─────────────────────────────────────────────────────────────
const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const inr2 = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sgn = (n: number) => {
  const r = Math.round(n);
  return r === 0 ? '₹0' : `${r > 0 ? '+' : '−'}₹${Math.abs(r).toLocaleString('en-IN')}`;
};
const pct = (b: number) => `${+(b * 100).toFixed(1)}%`;
const num = (n: number) => String(+(+n).toFixed(3));
const day = (t?: number | string | null) => (t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const shortDay = (t?: number | null) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const isoDay = (t: number) => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const tone = (n: number) => (n > 0.5 ? 'text-rose-700' : n < -0.5 ? 'text-emerald-700' : 'text-slate-400');

const TAG: Record<string, [string, string] | undefined> = {
  qty: ['Size', 'bg-amber-50 text-amber-800 border-amber-200'],
  rate: ['Rate', 'bg-amber-50 text-amber-800 border-amber-200'],
  qty_rate: ['Size + rate', 'bg-amber-50 text-amber-800 border-amber-200'],
  redesign: ['Redesigned', 'bg-violet-50 text-violet-800 border-violet-200'],
  new: ['New', 'bg-sky-50 text-sky-800 border-sky-200'],
  removed: ['Removed', 'bg-rose-50 text-rose-700 border-rose-200'],
};
const UNITS = ['sq ft', 'r ft', 'nos', 'lump sum', 'sq m', 'points', 'set'];
const BRIDGE: [keyof RevisionResult['bridge'], string][] = [
  ['new', 'New items'], ['qty', 'Quantities'], ['redesign', 'Redesigned'], ['section', 'Sections'], ['removed', 'Removed'], ['rate', 'Rates'],
];

type Filter = 'changed' | 'all' | 'new' | 'removed' | 'excel' | 'edit';

// ── Motion helpers ─────────────────────────────────────────────────────────
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A number that eases to its new value instead of jumping. */
function useTween(value: number, ms = 480): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (reducedMotion() || current.current === value) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const v = from + (value - from) * (1 - Math.pow(1 - p, 3));
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

const Tween: React.FC<{ value: number; format: (n: number) => string; className?: string }> = ({ value, format, className }) => {
  const v = useTween(value);
  return <span className={className}>{format(v)}</span>;
};

/** A small duotone tile with depth — the screen's icons. */
const Ic3: React.FC<{ icon: React.ElementType; tint?: 'indigo' | 'gold' | 'green' | 'rose' | 'slate'; size?: 'sm' | 'md' }> = ({ icon: Icon, tint = 'indigo', size = 'md' }) => (
  <span className={`sw-ic3 sw-ic3-${tint} ${size === 'sm' ? 'w-7 h-7 rounded-lg' : 'w-10 h-10 rounded-xl'} grid place-items-center shrink-0`}>
    <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-[18px] h-[18px]'} strokeWidth={2.2} />
  </span>
);

const STYLE = `
.sw-ic3{position:relative;color:#fff;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 -2px 0 rgba(0,0,0,.14) inset,0 6px 14px -6px var(--sw-glow),0 2px 4px -2px rgba(15,23,42,.25);transform:perspective(300px) rotateX(8deg);transition:transform .25s ease}
.sw-ic3:hover{transform:perspective(300px) rotateX(0) translateY(-1px)}
.sw-ic3-indigo{background:linear-gradient(150deg,#6d80d6 0%,#3D52A0 55%,#2c3c7c 100%);--sw-glow:rgba(61,82,160,.55)}
.sw-ic3-gold{background:linear-gradient(150deg,#f2c46b 0%,#d69a2d 55%,#a8721b 100%);--sw-glow:rgba(214,154,45,.55)}
.sw-ic3-green{background:linear-gradient(150deg,#6fd0a3 0%,#1f9d6b 55%,#157650 100%);--sw-glow:rgba(31,157,107,.5)}
.sw-ic3-rose{background:linear-gradient(150deg,#f59aa8 0%,#d9445d 55%,#a82f44 100%);--sw-glow:rgba(217,68,93,.5)}
.sw-ic3-slate{background:linear-gradient(150deg,#a3adbf 0%,#64748b 55%,#475569 100%);--sw-glow:rgba(71,85,105,.45)}
@keyframes sw-pulse{0%{box-shadow:0 0 0 0 rgba(61,82,160,.45)}100%{box-shadow:0 0 0 7px rgba(61,82,160,0)}}
.sw-pulse{animation:sw-pulse 1.8s ease-out infinite}
@keyframes sw-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.sw-in{animation:sw-in .25s ease-out}
.sw-tilt{transition:transform .3s ease,box-shadow .3s ease}
.sw-tilt:hover{transform:translateY(-1px);box-shadow:0 10px 30px -18px rgba(30,41,90,.45)}
.sw-bar{transition:width .6s cubic-bezier(.2,.8,.2,1)}
.sw-num::-webkit-outer-spin-button,.sw-num::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.sw-num{-moz-appearance:textfield}
@media (prefers-reduced-motion: reduce){.sw-pulse,.sw-in{animation:none}.sw-ic3,.sw-tilt,.sw-bar{transition:none}}
`;

/** Qty / rate input: commits on blur or Enter, so typing does not save every keystroke. */
const NumCell: React.FC<{ value: number; changed: boolean; disabled?: boolean; onCommit: (n: number) => void; label: string }> = ({ value, changed, disabled, onCommit, label }) => {
  const [text, setText] = useState(num(value));
  useEffect(() => setText(num(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) { setText(num(value)); return; }
    if (Math.abs(n - value) > 1e-9) onCommit(n);
  };
  return (
    <input
      aria-label={label}
      type="number"
      step="any"
      disabled={disabled}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setText(num(value)); (e.target as HTMLInputElement).blur(); } }}
      className={`sw-num w-[88px] text-right tabular-nums text-[13px] font-semibold rounded-lg px-2.5 py-1.5 border outline-none transition-colors focus:ring-2 focus:ring-[#3D52A0]/25 disabled:bg-transparent disabled:border-transparent disabled:text-slate-700 ${changed ? 'border-[#3D52A0]/45 bg-[#3D52A0]/[0.06] text-slate-900' : 'border-slate-200 bg-white text-slate-800'}`}
    />
  );
};

const Note: React.FC<{ tone: 'ok' | 'warn' | 'block' | 'info'; children: React.ReactNode }> = ({ tone: t, children }) => (
  <div className={`rounded-xl px-3 py-2 text-[12px] leading-relaxed border ${
    t === 'block' ? 'bg-rose-50 border-rose-200 text-rose-900'
      : t === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-900'
        : t === 'ok' ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
          : 'bg-slate-50 border-slate-200 text-slate-700'}`}>{children}</div>
);

const Modal: React.FC<{ onClose: () => void; wide?: boolean; children: React.ReactNode }> = ({ onClose, wide, children }) => (
  <motion.div
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-[2px] flex items-start justify-center p-3 sm:p-8 overflow-y-auto"
    onClick={onClose}
  >
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className={`bg-white rounded-3xl shadow-2xl w-full ${wide ? 'max-w-[860px]' : 'max-w-[760px]'} my-4 relative`}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </motion.div>
  </motion.div>
);

// ═══════════════════════════════════════════════════════════════════════════

export default function ScopeWorkspace({
  tiers, approvedTierId, bank, projectContext: ctx, setProjectContext, setTiers, setActiveTierId,
  onMakeRehearsalCopy, currentUser, orgName, studioId, projectId, onReleasePortal,
}: Props) {
  const bankMap = useMemo(() => buildBankMap(bank, ctx.adHocItems), [bank, ctx.adHocItems]);
  const momQueue = useMomScopeQueue(studioId, projectId);
  const isReal = !ctx.isDummy && ctx.projectCategory !== 'dummy';
  const baseTier = tiers.find(t => t.id === approvedTierId) || null;
  const v1 = baseTier ? detailedBoqForTier(ctx, baseTier.id) : null;
  const v1Approved = !!v1 && isApprovedIssue(v1);
  const revisions = (ctx.scopeRevisions || []).slice().sort((a, b) => b.number - a.number);
  const open = revisions.find(r => r.status === 'draft' || r.status === 'issued' || r.status === 'signed') || null;
  const nextNumber = (revisions[0]?.number || 0) + 1;
  const issueById = (id?: string | null) => (ctx.documents?.issues || []).find(i => i.id === id) || null;

  const [message, setMessage] = useState<{ tone: 'ok' | 'block'; text: string } | null>(null);
  const [previewIssue, setPreviewIssue] = useState<DocumentIssue | null>(null);
  const [signFor, setSignFor] = useState<{ id: string; kind: 'detailed_boq' | 'scope_revision' } | null>(null);
  const [copying, setCopying] = useState<'idle' | 'busy' | string>('idle');
  const flash = (t: 'ok' | 'block', text: string) => {
    setMessage({ tone: t, text });
    window.setTimeout(() => setMessage(null), 8000);
  };

  // ── Sending to the client: publish, update their portal, email the Excel ──
  const [sending, setSending] = useState<string | null>(null);
  const studioName = orgName || 'Studio';
  const portalLink = () => {
    const token = (ctx as any).portalAccess?.token;
    return token ? `${publicAppOrigin()}/?portal=${token}` : publicAppOrigin();
  };
  const publishIssue = (issueId: string) => (prev: ProjectContext): ProjectContext =>
    prev.documents
      ? { ...prev, documents: { ...prev.documents, issues: prev.documents.issues.map(i => (i.id === issueId ? { ...i, clientVisibility: publish(currentUser) } : i)) } }
      : prev;
  const markSent = (issueId: string, to: string[]) => (prev: ProjectContext): ProjectContext =>
    prev.documents
      ? { ...prev, documents: { ...prev.documents, issues: prev.documents.issues.map(i => {
          if (i.id !== issueId) return i;
          /* A portal-only resend keeps the record of who was emailed before. */
          const sentTo = Array.from(new Set([...((i as any).sentTo || []), ...to]));
          return { ...i, sentAt: Date.now(), sentTo, releasedVia: (sentTo.length ? ['portal', 'email'] : ['portal']) as ('portal' | 'email')[] };
        }) } }
      : prev;

  /* A revision is measured against the Detailed BOQ it revises: the client must be able to see that one too. */
  const withBase = (issueId: string) => (prev: ProjectContext): ProjectContext => {
    const issue = prev.documents?.issues.find(i => i.id === issueId);
    const baseRef = issue?.kind === 'scope_revision' ? (issue.snapshot as any)?.v1?.reference : null;
    const base = baseRef ? prev.documents!.issues.find(i => i.kind === 'detailed_boq' && i.reference === baseRef && !i.withdrawnAt) : null;
    const withRev = publishIssue(issueId)(prev);
    return base && !isVisibleToClient(base as any) ? publishIssue(base.id)(withRev) : withRev;
  };

  const sendToClient = async (issueId: string, to: string[], cc: string[], base?: ProjectContext): Promise<{ ok: boolean; error?: string }> => {
    const next = withBase(issueId)(base || ctx);
    const issue = next.documents?.issues.find(i => i.id === issueId);
    if (!issue) return { ok: false, error: 'That document could not be found.' };
    if (!onReleasePortal) return { ok: false, error: "This screen cannot update the client's portal." };
    setSending(issueId);
    try {
      setProjectContext(withBase(issueId));
      await onReleasePortal(next);
      if (to.length) {
        const s: any = issue.snapshot;
        const revision = issue.kind === 'scope_revision';
        const before = revision ? Number(s.v1?.total) || 0 : null;
        const after = revision ? Number(s.v2?.total) || 0 : Number(s.total) || 0;
        const rows = clientTotals(before ?? after, after, s.clientTotals);
        const changed = revision ? (s.rooms || []).reduce((n: number, r: any) => n + (r.asSection ? 1 : (r.lines || []).length), 0) : 0;
        const first = String(ctx.clientName || '').trim().split(/\s+/)[0];
        const { buf, filename } = await workbookForIssue(issue, studioName);
        const signer = /@/.test(currentUser) ? studioName : `${currentUser}\n${studioName}`;
        /* Agreed already and recorded by the studio: the email is for their records, not a request. */
        const agreed = issue.recordedApproval;
        const agreedLine = agreed
          ? `As agreed${agreedViaPhrase(agreed.how) ? ` ${agreedViaPhrase(agreed.how)}` : ''} on ${new Date(agreed.approvedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}, `
          : '';
        const res = await sendScopeEmail({
          to,
          cc,
          subject: agreed
            ? `Your ${revision ? 'revised ' : ''}BOQ, as agreed: ${s.projectName}`
            : revision ? `Your revised BOQ is ready: ${s.projectName}` : `Your BOQ for approval: ${s.projectName}`,
          greeting: first ? `Dear ${first},` : 'Hello,',
          intro: agreed
            ? `${agreedLine}we have updated your BOQ for ${s.projectName}.${revision ? ` ${changed} item${changed === 1 ? '' : 's'} changed.` : ''} The full ${revision ? 'revised ' : ''}BOQ is attached as an Excel file for your records. There is nothing for you to sign.`
            : revision
            ? `We have updated your BOQ for ${s.projectName}. ${changed} item${changed === 1 ? '' : 's'} changed, and the full revised BOQ is attached as an Excel file.`
            : `Your detailed BOQ for ${s.projectName} is ready for your approval. It is attached as an Excel file, with every item and its specification.`,
          figures: revision
            ? [['Current', inr(before || 0), ''], ['Revised', inr(after), ''], ['Change', sgn(after - (before || 0)), after - (before || 0) > 0.5 ? 'up' : after - (before || 0) < -0.5 ? 'down' : '']]
            : [['Your BOQ', inr(after), ''], ['Items', String(s.lineCount ?? ''), '']],
          totals: rows.length > 1 ? rows.map(r => ({ label: r.label, value: revision ? `${inr(r.after)} (${sgn(r.change)})` : inr(r.after), strong: r.key === 'total' })) : undefined,
          note: totalsNote(s.clientTotals, revision),
          studioNote: revision ? s.summary || undefined : undefined,
          xlsx: { filename, base64: toBase64(buf) },
          cta: { url: portalLink(), label: agreed ? 'See it in your portal' : 'Review and approve in your portal' },
          signOff: `Warm regards,\n${signer}`,
          context: `Sent for ${s.projectName} · ${issue.reference}. You're receiving this as a client of ${studioName}.`,
        });
        if (!res.success) throw new Error(`The portal is updated, but the email was not sent: ${res.error || 'refused'}.`);
      }
      setProjectContext(markSent(issueId, to));
      flash('ok', issue.recordedApproval
        ? `${issue.reference} is recorded as agreed and is in the client's portal${to.length ? `; the Excel was emailed to ${to.join(', ')} for their records` : ''}. There is nothing for them to sign. Apply it when ready.`
        : `${issue.reference} is in the client's portal${to.length ? ` and emailed to ${to.join(', ')}` : ''}. It is approved there in one step.`);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    } finally {
      setSending(null);
    }
  };

  /*
    The client agreed to an issued revision without approving it in the portal
    (in a meeting, on a call, on WhatsApp): the studio records it, the portal
    shows it as agreed, and the Excel can still go to them for their records.
  */
  const recordAgreementFor = async (issueId: string, a: { approvedAt: number; how: AgreedVia; note: string }, to: string[], cc: string[], base?: ProjectContext) => {
    const agreement = recordAgreement(issueId, { ...a, recordedBy: currentUser });
    setProjectContext(agreement);
    return sendToClient(issueId, to, cc, agreement(base || ctx));
  };

  // ── Record the scope in force ─────────────────────────────────────────
  const [recordMode,setRecordMode] = useState<'recorded' | 'for_signature'>('recorded');
  const [v1Totals, setV1Totals] = useState<ClientTotalsOptions>(() => defaultTotalsOptions(ctx));
  const [approvedOn, setApprovedOn] = useState(isoDay(ctx.proposalAcceptance?.at || ctx.designApprovedAt || Date.now()));
  const [approvalNote, setApprovalNote] = useState('Approved as part of the accepted proposal package.');
  const [checksAccepted, setChecksAccepted] = useState(false);
  const baseTotal = baseTier ? boqTotal(baseTier.boq, bankMap) : 0;
  const recordChecks = useMemo(
    () => (baseTier && !v1 ? recordReadiness(baseTier.boq, bankMap, ctx.financials?.approvedExecutionValue) : []),
    [baseTier, v1, bankMap, ctx.financials?.approvedExecutionValue]
  );
  const recordBlocked = recordChecks.some(c => c.level === 'block') || (recordChecks.some(c => c.confirm) && !checksAccepted);

  const recordV1 = () => {
    if (!baseTier || !setTiers || recordBlocked) return;
    const at = Date.now();
    const frozenBoq = freezeBoqLines(baseTier.boq, bankMap, at);
    const drift = pricingDrift(baseTier.boq, frozenBoq, bankMap);
    if (drift.maxLine > 0.005 || drift.total > 0.005) {
      flash('block', `Freezing would move the price by ${inr2(drift.total)}. Nothing was changed.`);
      return;
    }
    const version = 1 + (ctx.documents?.issues || []).filter(i => i.kind === 'detailed_boq').reduce((m, i) => Math.max(m, vOf(i)), 0);
    const reference = detailedBoqReference(ctx, version);
    const approvedAt = new Date(`${approvedOn}T12:00:00`).getTime();
    const snapshot = buildDetailedBoqSnapshot({
      context: ctx,
      tier: { id: baseTier.id, boq: frozenBoq },
      bankMap,
      version,
      reference,
      approval: recordMode === 'recorded'
        ? { mode: 'recorded', approvedOn: approvedAt, note: approvalNote.trim() || 'Approved by the client; recorded by the studio.' }
        : { mode: 'for_signature' },
      org: { orgName: orgName || null },
    });
    if (Math.abs(snapshot.total - baseTotal) > 0.01) {
      flash('block', `The document totals ${inr2(snapshot.total)} but the BOQ prices to ${inr2(baseTotal)}. Nothing was changed.`);
      return;
    }
    setTiers(prev => prev.map(t => (t.id === baseTier.id ? { ...t, boq: frozenBoq } : t)));
    /* For the client's approval, the totals they will see are part of the issued document. */
    const issued = recordMode === 'recorded' ? snapshot : { ...snapshot, clientTotals: v1Totals };
    setProjectContext(prev => {
      const next = issueDocument('detailed_boq', issued, {
        issuedBy: currentUser,
        reference,
        materialSections: recordMode === 'recorded' ? [] : buildMaterialSections('detailed_boq', issued),
      })(prev);
      if (recordMode !== 'recorded') return next;
      /* Approved already, so it is the client's scope: published with the record. */
      const issues = next.documents!.issues.map((i, idx, all) =>
        idx === all.length - 1 ? { ...i, recordedApproval: { approvedAt, recordedBy: currentUser, recordedAt: at, note: approvalNote.trim() }, clientVisibility: publish(currentUser) } : i
      );
      const recorded = { ...next, documents: { ...next.documents!, issues } };
      if (onReleasePortal) {
        onReleasePortal(recorded).catch(e => flash('block', `Recorded, but the client's portal was not updated: ${e?.message || e}. Send it from Client Portal.`));
      }
      return recorded;
    });
    flash('ok', `${reference} ${recordMode === 'recorded' ? 'recorded' : 'staged for the client\'s approval'} at ${inr2(snapshot.total)}. Its rates are frozen and the version is now read-only.${recordMode === 'recorded' ? '' : ' Send it to the client below.'}`);
  };

  // ── Revisions ─────────────────────────────────────────────────────────
  const saveRecord = (rec: ScopeRevisionRecord) => {
    const stamped = { ...rec, updatedAt: Date.now() };
    setProjectContext(prev => {
      const list = prev.scopeRevisions || [];
      return { ...prev, scopeRevisions: list.some(r => r.id === stamped.id) ? list.map(r => (r.id === stamped.id ? stamped : r)) : [...list, stamped] };
    });
  };

  const startRevision = () => {
    if (!baseTier || !v1Approved) return;
    const signed = signedLinesFrom(baseTier.boq, bankMap);
    const draft = startDraft(signed, baseTier.boq, bankMap);
    const now = Date.now();
    saveRecord({
      id: `srev-${generateId()}`,
      number: nextNumber,
      status: 'draft',
      createdAt: now,
      createdBy: currentUser,
      updatedAt: now,
      baseTierId: baseTier.id,
      source: { fileName: '', sheetName: '', importedAt: now, lineCount: 0, listTotal: 0 },
      imported: [],
      settings: draftSettings(draft),
      draft,
    });
  };

  const apply = (rec: ScopeRevisionRecord) => {
    const issue = issueById(rec.issueId);
    const base = tiers.find(t => t.id === rec.baseTierId);
    if (!(issue?.clientSignature || issue?.recordedApproval) || !base || !setTiers) return;
    const at = Date.now();
    const signed = signedLinesFrom(base.boq, bankMap);
    let result: RevisionResult;
    let revisedBoq: any[];
    if (rec.draft) {
      result = revisionFromDraft(signed, rec.draft);
      revisedBoq = buildBoqFromDraft(base.boq, signed, rec.draft, bankMap, rec.number, at);
    } else {
      result = computeRevision(signed, rec.imported, rec.settings);
      revisedBoq = buildRevisedBoq(result, base.boq, bankMap, rec.settings, rec.number, at, rec.internalCosts || {});
    }
    const signedTotal = issue.snapshot?.v2?.total ?? 0;
    const priced = boqTotal(revisedBoq, bankMap);
    if (Math.abs(priced - signedTotal) > 0.01) {
      flash('block', `The signed revision totals ${inr2(signedTotal)}, but rebuilding it now gives ${inr2(priced)} — the signed BOQ has been edited since. Nothing was applied.`);
      return;
    }
    const tierId = rec.v2TierId || `tier_${at.toString(36)}`;
    const newTier: ProposalTier = {
      id: tierId,
      name: `Detailed BOQ v${issue.snapshot.v2.version} · Scope Revision ${rec.number}`,
      timestamp: at,
      parentTierId: base.id,
      lifecycleTag: 'Current contract',
      projectContext: { ...ctx },
      boq: revisedBoq,
      summary: { ...base.summary, totalSell: priced, itemCount: revisedBoq.filter((b: any) => b.qty > 0).length },
    };
    const v2Snapshot = { ...issue.snapshot.v2, tierId, approval: { mode: 'via_revision', revisionReference: issue.reference } };

    setTiers(prev => prev.map(t => (t.id === base.id ? { ...t, lifecycleTag: 'Superseded' as const } : t)).concat(newTier));
    setProjectContext(prev => {
      const withBoq = issueDocument('detailed_boq', v2Snapshot, { issuedBy: currentUser, reference: v2Snapshot.reference, materialSections: [] })(prev);
      const issues = withBoq.documents!.issues;
      const created = issues[issues.length - 1];
      const stamped = issues.map(i => (i.id === created.id ? { ...i, signedVia: issue.id, clientVisibility: publish(currentUser) } : i));
      const fin: FinancialConfig = (prev.financials || {}) as FinancialConfig;
      const snapshots = fin.paymentSnapshots || [];
      /* The client's schedule was issued on the old value: stage the next
         version on the new one, for the studio to release as usual. */
      const designValue = fin.approvedDesignValue ?? (prev as any).engagement?.designFee ?? 0;
      const nextSchedule = scheduleForRevision(prev, {
        executionValue: priced,
        designValue,
        note: `Re-issued for Scope Revision ${rec.number} (${issue.reference}): execution scope ₹${Math.round(fin.approvedExecutionValue ?? result.v1Total).toLocaleString('en-IN')} → ₹${Math.round(priced).toLocaleString('en-IN')}.`,
        issuedBy: currentUser,
        id: `ps_sr${rec.number}_${at.toString(36)}`,
        at,
      });
      return {
        ...withBoq,
        ...(nextSchedule ? { paymentSchedules: withRevisedSchedule(prev, nextSchedule) } : {}),
        documents: { ...withBoq.documents!, issues: stamped },
        approvedTierId: tierId,
        financials: {
          ...fin,
          approvedExecutionValue: priced,
          paymentSnapshots: snapshots.some(s => s.tierId === base.id) ? snapshots : [...snapshots, {
            tierId: base.id,
            tierName: base.name,
            timestamp: at,
            approvedExecutionValue: fin.approvedExecutionValue ?? result.v1Total,
            approvedDesignValue: fin.approvedDesignValue ?? 0,
            milestones: prev.paymentMilestones || [],
            billablePercent: fin.billablePercent,
            executionGstEnabled: fin.executionGstEnabled,
          } as any],
          paymentRevisions: [...(fin.paymentRevisions || []), {
            id: `sr-${rec.number}-${at}`,
            date: new Date(at).toISOString(),
            previousExecutionValue: fin.approvedExecutionValue ?? result.v1Total,
            newExecutionValue: priced,
            previousDesignValue: fin.approvedDesignValue ?? 0,
            newDesignValue: fin.approvedDesignValue ?? 0,
            reason: `Scope Revision ${rec.number} signed (${issue.reference})`,
          } as any],
        },
        scopeRevisions: (prev.scopeRevisions || []).map(r => (r.id === rec.id
          ? { ...r, status: 'applied', appliedAt: at, appliedBy: currentUser, appliedTierId: tierId, detailedIssueId: created.id, updatedAt: at }
          : r)),
      };
    });
    setActiveTierId?.(tierId);
    flash('ok', `Scope Revision ${rec.number} applied. ${v2Snapshot.reference} is the scope in force at ${inr2(priced)}. The next Payment Schedule version is staged as a draft — release it from Documents for the client to confirm.`);
  };

  const withdraw = (rec: ScopeRevisionRecord) => {
    const at = Date.now();
    setProjectContext(prev => ({
      ...prev,
      documents: prev.documents
        ? { ...prev.documents, issues: prev.documents.issues.map(i => (i.id === rec.issueId ? { ...i, withdrawnAt: at, withdrawnReason: 'Withdrawn by the studio before signature' } : i)) }
        : prev.documents,
      scopeRevisions: (prev.scopeRevisions || []).map(r => (r.id === rec.id ? { ...r, status: 'draft', issueId: null, updatedAt: at } : r)),
    }));
  };

  const discard = (rec: ScopeRevisionRecord) => {
    setProjectContext(prev => ({
      ...prev,
      scopeRevisions: (prev.scopeRevisions || []).map(r => (r.id === rec.id ? { ...r, status: 'withdrawn', withdrawnAt: Date.now(), updatedAt: Date.now() } : r)),
    }));
  };

  const switchOff = () => setProjectContext(prev => ({ ...prev, scopeFlow: prev.scopeFlow ? { ...prev.scopeFlow, enabled: false } : undefined }));

  const makeCopy = async () => {
    if (!onMakeRehearsalCopy) return;
    setCopying('busy');
    try {
      const name = await onMakeRehearsalCopy();
      setCopying(name || 'idle');
    } catch (e: any) {
      setCopying('idle');
      flash('block', `The copy could not be saved: ${e?.message || e}`);
    }
  };

  const stateOf = (issue: DocumentIssue | null): string => {
    if (!issue) return 'Not issued';
    if (issue.clientSignature) return `Signed ${day((issue.clientSignature as any).signedAt)}`;
    if (issue.recordedApproval) return `Agreed ${day(issue.recordedApproval.approvedAt)} (recorded)`;
    if (!isVisibleToClient(issue as any)) return 'Staged — not in their portal yet';
    const st = resolveDocumentState(ctx, issue.kind);
    return st === 'viewed' ? 'Opened by the client' : st === 'queried' ? 'The client has a question' : 'In the client’s portal';
  };

  // ── Render ────────────────────────────────────────────────────────────
  const openBase = open ? tiers.find(t => t.id === open.baseTierId) || null : null;

  return (
    <div className="space-y-4">
      <style>{STYLE}</style>

      {/* Plain, not a motion element: an exit animation here held up the app's
          own tab transition, and the next tab never mounted. */}
      {message && (
        <div className={`sw-in rounded-2xl px-4 py-3 text-[12.5px] border flex items-start gap-2 ${message.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
          {message.tone === 'ok' ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span className="flex-1">{message.text}</span>
          <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {open && openBase && v1 ? (
        <React.Fragment key={open.id}><RevisionEditor
          rec={open}
          base={openBase}
          v1={detailedBoqForTier(ctx, openBase.id) || v1}
          issue={issueById(open.issueId)}
          bank={bank}
          bankMap={bankMap}
          ctx={ctx}
          setProjectContext={setProjectContext}
          saveRecord={saveRecord}
          currentUser={currentUser}
          orgName={orgName}
          onApply={() => apply(open)}
          onWithdraw={() => withdraw(open)}
          onDiscard={() => discard(open)}
          onSign={id => setSignFor({ id, kind: 'scope_revision' })}
          onOpenIssue={setPreviewIssue}
          stateOf={stateOf}
          momQueue={momQueue}
          onSendToClient={sendToClient}
          onRecordAgreement={recordAgreementFor}
          sendingId={sending}
        /></React.Fragment>
      ) : (
        <>
          <MeetingScopeInbox
            items={momQueue.items}
            hint={v1Approved ? `Start Scope Revision ${nextNumber} to add them.` : 'Record the signed scope first, then start a revision to add them.'}
            onDismiss={it => momQueue.dismiss(it, currentUser)}
          />

          {/* The scope in force, or recording it */}
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 sw-tilt">
            {!baseTier && (
              <div className="flex items-start gap-4">
                <Ic3 icon={ShieldCheck} tint="slate" />
                <div className="flex-1">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">Signed scope</div>
                  <h2 className="text-[22px] font-bold tracking-tight text-slate-900 mt-0.5">No approved version yet</h2>
                  <p className="text-[13px] text-slate-600 mt-1 max-w-2xl">Build the BOQ in the BOQ Editor and approve a version in Versions. Once approved, it is recorded here as the Detailed BOQ — the scope the client agreed — and from then on it changes only through a signed Scope Revision.</p>
                </div>
              </div>
            )}

            {baseTier && !v1 && (
              <div className="flex flex-col lg:flex-row gap-5">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <Ic3 icon={FileText} />
                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">Signed scope · step 1</div>
                      <h2 className="text-[22px] font-bold tracking-tight text-slate-900 mt-0.5">Record {baseTier.name} as Detailed BOQ v1</h2>
                      <p className="text-[13px] text-slate-600 mt-1 max-w-2xl">
                        {inr2(baseTotal)}. Its rates are frozen onto the lines first, so a later rate-bank edit can never move it; the check below refuses if freezing would change the price. After this the version is read-only.
                      </p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {([
                        ['recorded', 'The client already approved it', 'Recorded as approved on a date, without asking them to sign again.'],
                        ['for_signature', 'Ask the client to approve it', 'Sent as an Excel with a portal link; it is the scope in force once they approve it there.'],
                      ] as const).map(([k, t, d]) => (
                        <label key={k} className={`rounded-xl border px-3.5 py-2.5 cursor-pointer transition-colors ${recordMode === k ? 'border-[#3D52A0] bg-[#3D52A0]/[0.05]' : 'border-slate-200 hover:border-slate-300'}`}>
                          <div className="flex items-center gap-2 text-[13px] font-bold text-slate-900"><input type="radio" checked={recordMode === k} onChange={() => setRecordMode(k)} /> {t}</div>
                          <div className="text-[12px] text-slate-500 mt-0.5 pl-5">{d}</div>
                        </label>
                      ))}
                    </div>
                    {recordMode === 'for_signature' && (
                      <ClientTotalsPicker value={v1Totals} onChange={setV1Totals} before={null} after={baseTotal} />
                    )}
                    {recordMode === 'recorded' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input type="date" value={approvedOn} onChange={e => setApprovedOn(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-[13px]" />
                        <input value={approvalNote} onChange={e => setApprovalNote(e.target.value)} className="sm:col-span-2 border border-slate-200 rounded-xl px-3 py-2 text-[13px]" />
                      </div>
                    )}
                    {recordChecks.length > 0 && (
                      <div className="space-y-1.5">
                        {recordChecks.map((c, i) => <Note key={i} tone={c.level === 'block' ? 'block' : 'warn'}>{c.text}</Note>)}
                        {recordChecks.some(c => c.confirm) && !recordChecks.some(c => c.level === 'block') && (
                          <label className="flex items-start gap-2 text-[12px] text-slate-700 cursor-pointer">
                            <input type="checkbox" className="mt-0.5" checked={checksAccepted} onChange={e => setChecksAccepted(e.target.checked)} />
                            <span>I have checked these, and this is the scope to record.</span>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex lg:flex-col gap-2 lg:items-end shrink-0">
                  <button onClick={recordV1} disabled={!setTiers || recordBlocked} className="px-4 py-2.5 rounded-xl bg-[#3D52A0] hover:bg-[#334486] disabled:bg-slate-300 text-white text-[12.5px] font-bold cursor-pointer flex items-center gap-1.5 shadow-sm">
                    <Lock className="w-4 h-4" /> {recordMode === 'recorded' ? 'Freeze rates & record' : 'Freeze rates & stage for approval'}
                  </button>
                  {!revisions.length && <button onClick={switchOff} className="px-3 py-2 rounded-xl text-[12px] font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">Switch signed scope off</button>}
                </div>
              </div>
            )}

            {baseTier && v1 && (
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <Ic3 icon={Lock} tint={v1Approved ? 'indigo' : 'gold'} />
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">Scope in force</div>
                    <h2 className="text-[20px] font-bold tracking-tight text-slate-900 mt-0.5">
                      Detailed BOQ v{vOf(v1)} {v1Approved ? 'is the agreed scope, so it is read-only' : 'is waiting for the client’s signature'}
                    </h2>
                    <p className="text-[12.5px] text-slate-600 mt-1">
                      {v1.recordedApproval ? `Approved ${day(v1.recordedApproval.approvedAt)}` : v1.signedVia ? 'Approved with its scope revision' : stateOf(v1)} · {v1.reference} · <b className="text-slate-800">{inr2(v1.snapshot?.total)}</b>
                      {isFrozen(baseTier.boq, bankMap) ? ' · rates frozen' : ' · some rates still follow the bank'}.
                      {v1Approved && ' To change it, start a revision: the client approves the change (or you record that they agreed) before anything moves, and the payment schedule follows.'}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      <button onClick={() => setPreviewIssue(v1)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Open v{vOf(v1)}</button>
                      {!v1Approved && <button onClick={() => setSignFor({ id: v1.id, kind: 'detailed_boq' })} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1"><PenLine className="w-3.5 h-3.5" /> Client signing on this device</button>}
                    </div>
                    {v1.recordedApproval && !isVisibleToClient(v1 as any) && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 flex flex-wrap items-center gap-3 text-[12.5px] text-amber-900">
                        <span className="flex-1 min-w-[220px]">The client cannot see v{vOf(v1)} in their portal yet, so their scope there reads as not frozen.</span>
                        <button
                          onClick={async () => {
                            const next = publishIssue(v1.id)(ctx);
                            setProjectContext(publishIssue(v1.id));
                            try { if (onReleasePortal) await onReleasePortal(next); flash('ok', `${v1.reference} is in the client's portal as their approved scope.`); }
                            catch (e: any) { flash('block', `Published, but the portal was not updated: ${e?.message || e}.`); }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#3D52A0] hover:bg-[#334486] text-white text-[12px] font-bold cursor-pointer"
                        >Publish to client portal</button>
                      </div>
                    )}
                    {(!v1Approved || (v1.clientSignature as any)?.signatureType === 'portal_approval') && !v1.recordedApproval && (
                      <ClientSendPanel issue={v1} defaultTo={ctx.clientEmail || ''} studioName={studioName} sending={sending === v1.id}
                        onSend={(to, cc) => sendToClient(v1.id, to, cc)} />
                    )}
                  </div>
                </div>
                <button
                  onClick={startRevision}
                  disabled={!v1Approved}
                  title={v1Approved ? '' : 'The Detailed BOQ must be approved or signed first'}
                  className="px-4 py-2.5 rounded-xl bg-[#3D52A0] hover:bg-[#334486] disabled:bg-slate-300 text-white text-[12.5px] font-bold cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0 self-start md:self-center"
                ><Plus className="w-4 h-4" /> Start Scope Revision {nextNumber}</button>
              </div>
            )}
          </div>

          {isReal && !ctx.rehearsalOf && onMakeRehearsalCopy && (
            <div className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200/80 px-4 py-3">
              <div className="text-[12.5px] text-slate-600">{copying !== 'idle' && copying !== 'busy' ? <>Saved “{copying}” as a dummy project with no client email, phone or portal access. Open it from Projects to rehearse.</> : 'A live client project. Rehearse a revision on a copy first if you like — the copy never reaches the client.'}</div>
              <button onClick={makeCopy} disabled={copying === 'busy'} className="px-3 py-2 rounded-xl border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0">{copying === 'busy' ? 'Copying…' : 'Make a rehearsal copy'}</button>
            </div>
          )}

          {revisions.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs p-5">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-2">Scope revisions</div>
              <div className="divide-y divide-slate-100">
                {revisions.map(rec => {
                  const issue = issueById(rec.issueId);
                  const applied = rec.status === 'applied';
                  return (
                    <div key={rec.id} className="py-2.5 flex flex-wrap items-center gap-3">
                      <Ic3 icon={applied ? Check : rec.status === 'withdrawn' ? X : FileText} tint={applied ? 'green' : rec.status === 'withdrawn' ? 'slate' : 'indigo'} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-slate-900">Scope Revision {rec.number}{rec.reference && <span className="font-medium text-slate-500"> · {rec.reference}</span>}</div>
                        <div className="text-[12px] text-slate-500">
                          {rec.v2Total ? `Revised to ${inr2(rec.v2Total)}` : 'Not issued'}
                          {applied ? ` · applied ${day(rec.appliedAt)}` : rec.status === 'withdrawn' ? ' · discarded' : issue?.recordedApproval ? ' · agreed (recorded), ready to apply' : issue?.clientSignature ? ' · approved, ready to apply' : ''}
                          {rec.source?.fileName ? ` · ${rec.source.fileName}` : ''}
                        </div>
                      </div>
                      {issue && <button onClick={() => setPreviewIssue(issue)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Open</button>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {previewIssue && (
          <Modal onClose={() => setPreviewIssue(null)} wide>
            <button onClick={() => setPreviewIssue(null)} className="absolute right-3 top-3 p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer z-10"><X className="w-5 h-5" /></button>
            <DocumentRenderer issue={previewIssue} surface="studio" studioName={orgName} />
          </Modal>
        )}
      </AnimatePresence>

      {signFor && (
        <DocumentReadingRoom
          kind={signFor.kind}
          issueId={signFor.id}
          projectData={{ id: 'studio-device', lastModified: Date.now(), context: ctx, tiers } as any}
          onClose={() => setSignFor(null)}
          onSignComplete={docket => {
            setProjectContext(signIssue(signFor.id, { ...docket, issueId: signFor.id, surface: 'studio_device' }));
            setSignFor(null);
            flash('ok', 'Signed on this device. The signature and its reading evidence are on the document.');
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The revision draft
// ═══════════════════════════════════════════════════════════════════════════

interface EditorProps {
  rec: ScopeRevisionRecord;
  base: ProposalTier;
  v1: DocumentIssue;
  issue: DocumentIssue | null;
  bank: Item[];
  bankMap: Map<string, Item>;
  ctx: ProjectContext;
  setProjectContext: (fn: (prev: ProjectContext) => ProjectContext) => void;
  saveRecord: (rec: ScopeRevisionRecord) => void;
  currentUser: string;
  orgName?: string;
  onApply: () => void;
  onWithdraw: () => void;
  onDiscard: () => void;
  onSign: (issueId: string) => void;
  onOpenIssue: (i: DocumentIssue) => void;
  stateOf: (i: DocumentIssue | null) => string;
  momQueue?: ReturnType<typeof useMomScopeQueue>;
  onSendToClient?: (issueId: string, to: string[], cc: string[], base?: ProjectContext) => Promise<{ ok: boolean; error?: string }>;
  onRecordAgreement?: RecordAgreementFn;
  sendingId?: string | null;
}

type RecordAgreementFn = (issueId: string, a: { approvedAt: number; how: AgreedVia; note: string }, to: string[], cc: string[], base?: ProjectContext) => Promise<{ ok: boolean; error?: string }>;

function RevisionEditor({
  rec, base, v1, issue, bank, bankMap, ctx, setProjectContext, saveRecord, currentUser, orgName,
  onApply, onWithdraw, onDiscard, onSign, onOpenIssue, stateOf, momQueue, onSendToClient, onRecordAgreement, sendingId,
}: EditorProps) {
  const [totalsOpts, setTotalsOpts] = useState<ClientTotalsOptions>(() => defaultTotalsOptions(ctx));
  const [issueTo, setIssueTo] = useState(ctx.clientEmail || '');
  const [issueCc, setIssueCc] = useState('');
  /* Ask for approval in the portal, or record an agreement the client has already given. */
  const [approvalMode, setApprovalMode] = useState<'portal' | 'recorded'>('portal');
  const [agreement, setAgreement] = useState<AgreementDraft>(() => newAgreementDraft());
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [previewXl, setPreviewXl] = useState(false);
  const signed: SignedLine[] = useMemo(() => signedLinesFrom(base.boq, bankMap), [base.boq, bankMap]);
  const draft: ScopeDraft = useMemo(() => draftOfRecord(rec, signed, base.boq, bankMap), [rec, signed, base.boq, bankMap]);
  const result = useMemo(() => revisionFromDraft(signed, draft), [signed, draft]);
  const margin = useMemo(() => draftMargin(signed, draft, result), [signed, draft, result]);
  // The "Studio only" margin panel is studio finance (lib/roleAccess).
  const finance = seesStudioFinance(useOrg().currentRole);
  const editable = rec.status === 'draft';
  /* Approved either way: in the portal, signed, or agreed and recorded by the studio. */
  const signedByClient = !!(issue?.clientSignature || issue?.recordedApproval);
  const approval = approvalOf(issue);
  const stage = rec.status === 'draft' ? 0 : signedByClient ? 2 : 1;

  const [filter, setFilter] = useState<Filter>('changed');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState<{ room: string; replace?: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [preview, setPreview] = useState<ScopeRevisionSnapshot | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [newRoom, setNewRoom] = useState<string | null>(null);
  const [extraRooms, setExtraRooms] = useState<string[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const save = (next: ScopeDraft) => {
    if (!editable) return;
    saveRecord({ ...rec, draft: next, settings: draftSettings(next) });
  };

  const byId = useMemo(() => new Map(draft.lines.map(l => [l.id, l])), [draft.lines]);
  const excelLabel = draft.excel ? `${shortDay(draft.excel.importedAt)} Excel` : 'Excel';

  // ── Filtering ─────────────────────────────────────────────────────────
  const allLines = result.rooms.flatMap(r => r.lines.map(l => ({ l, room: r, d: byId.get(l.id) })));
  /* A room compared as a whole has no line-by-line kinds: its lines count as
     changed only when the room's total moved, and never as "new". */
  const stillRoom = (r: { compareAsSection: boolean; after: number; before: number }) => r.compareAsSection && Math.abs(r.after - r.before) < 0.5;
  const isChanged = (x: { l: RevisionLine; room: typeof result.rooms[number] }) => (x.room.compareAsSection ? !stillRoom(x.room) : x.l.kind !== 'same');
  const counts = {
    changed: allLines.filter(isChanged).length,
    all: allLines.length,
    new: allLines.filter(x => x.l.kind === 'new' && !x.room.compareAsSection).length,
    removed: allLines.filter(x => x.l.kind === 'removed').length,
    excel: allLines.filter(x => x.d?.source === 'excel' && isChanged(x)).length,
    edit: allLines.filter(x => x.d?.source === 'edit').length,
  };
  const q = query.trim().toLowerCase();
  const visible = (l: RevisionLine, d?: DraftLine) => {
    if (q && !`${l.imported?.name || ''} ${l.signed?.name || ''}`.toLowerCase().includes(q)) return false;
    switch (filter) {
      case 'new': return l.kind === 'new';
      case 'removed': return l.kind === 'removed';
      case 'excel': return d?.source === 'excel' && l.kind !== 'same';
      case 'edit': return d?.source === 'edit';
      default: return true;
    }
  };

  // ── Checks ────────────────────────────────────────────────────────────
  const checks = useMemo(() => {
    const out: { level: 'ok' | 'warn' | 'block'; text: string }[] = [];
    const changedAny = allLines.some(x => x.l.kind !== 'same') || result.rooms.some(r => r.compareAsSection && Math.abs(r.after - r.before) > 0.005);
    if (!changedAny) out.push({ level: 'block', text: 'Nothing has changed from the signed scope yet.' });
    if (Math.abs(result.bridgeGap) > 0.01) out.push({ level: 'block', text: `The six parts do not add up to the change (off by ${result.bridgeGap.toFixed(2)}).` });
    else if (changedAny) out.push({ level: 'ok', text: 'The six parts add up to the change exactly.' });
    const noRate = draft.lines.filter(l => !l.removed && !l.heldReason && l.qty > 0 && !(l.rate > 0));
    if (noRate.length) out.push({ level: 'block', text: `${noRate.length} line${noRate.length === 1 ? ' has' : 's have'} a quantity but no rate.` });
    const nameless = draft.lines.filter(l => !l.removed && !l.name.trim());
    if (nameless.length) out.push({ level: 'block', text: `${nameless.length} line${nameless.length === 1 ? ' has' : 's have'} no name.` });
    const ex = draft.excel;
    if (ex && ex.statedTotal != null && Math.abs(ex.statedTotal - ex.listTotal) > 1) {
      out.push({ level: 'warn', text: `The Excel’s own total is ${inr(ex.statedTotal)}, but its lines add up to ${inr(ex.listTotal)}. Check the sheet for lines its total leaves out.` });
    }
    const weak = allLines.filter(x => x.l.kind === 'redesign' && x.d?.source === 'excel' && x.l.score < 0.6);
    if (weak.length) out.push({ level: 'warn', text: `${weak.length} redesign pair${weak.length === 1 ? ' was' : 's were'} matched on a weak name likeness — check them.` });
    if (result.zeroImported.length) out.push({ level: 'ok', text: `${result.zeroImported.length} Excel line${result.zeroImported.length === 1 ? ' is' : 's are'} at zero, removed, to be confirmed or as-actuals, and will be listed as not in scope.` });
    const edits = draft.lines.filter(l => l.source === 'edit').length;
    if (edits && ex) out.push({ level: 'ok', text: `${edits} hand edit${edits === 1 ? '' : 's'} on top of the Excel.` });
    if (!draft.summary.trim()) out.push({ level: 'warn', text: 'There is no note to the client yet.' });
    return out;
  }, [allLines, result, draft]);
  const blocked = checks.some(c => c.level === 'block');

  // ── Documents ─────────────────────────────────────────────────────────
  const buildDocs = () => {
    const reference = scopeRevisionReference(ctx, v1.reference, rec.number);
    const v2TierId = rec.v2TierId || `tier_${generateId()}`;
    const settings: RevisionSettings = draftSettings(draft);
    const revisedBoq = buildBoqFromDraft(base.boq, signed, draft, bankMap, rec.number, Date.now());
    const formerly: Record<string, string> = {};
    result.rooms.forEach(r => { if (r.signedRoom && r.signedRoom !== r.name) formerly[r.name] = r.signedRoom; });
    const v2 = buildDetailedBoqSnapshot({
      context: ctx,
      tier: { id: v2TierId, boq: revisedBoq },
      bankMap,
      version: vOf(v1) + 1,
      reference: detailedBoqReference(ctx, vOf(v1) + 1),
      approval: { mode: 'via_revision', revisionReference: reference },
      org: { orgName: orgName || null },
      formerly,
      replaces: { reference: v1.reference, total: v1.snapshot?.total || result.v1Total },
    });
    const snapshot = buildScopeRevisionSnapshot({
      context: ctx,
      number: rec.number,
      reference,
      result,
      settings,
      v1: {
        reference: v1.reference,
        total: v1.snapshot?.total ?? result.v1Total,
        approvedOn: v1.recordedApproval?.approvedAt || (v1.clientSignature as any)?.signedAt || null,
        fingerprint: v1.contentHash,
      },
      v2,
      issuedBy: currentUser,
      org: { orgName: orgName || null },
      signed,
    });
    return { reference, v2TierId, snapshot, drift: Math.abs(v2.total - result.v2Total) };
  };

  const doIssue = async (send: boolean) => {
    const built = buildDocs();
    if (built.drift > 0.01 || blocked) return;
    const toList = splitEmails(issueTo);
    const ccList = splitEmails(issueCc);
    const bad = [...toList, ...ccList].find(e => !EMAIL_RX.test(e));
    const recorded = approvalMode === 'recorded';
    if ((send || (recorded && agreement.email)) && bad) { setIssueError(`"${bad}" is not an email address.`); return; }
    if (recorded && !agreementValid(agreement)) { setIssueError('Give the date the client agreed (today or earlier).'); return; }
    /* The totals the client will see are part of the issued document, so they share its fingerprint. */
    const snapshot = { ...built.snapshot, clientTotals: totalsOpts };
    const materialSections = buildMaterialSections('scope_revision', snapshot);
    const issueUpd = issueDocument('scope_revision', snapshot, { issuedBy: currentUser, reference: built.reference, materialSections });
    const full = (prev: ProjectContext): ProjectContext => {
      const withIssue = issueUpd(prev);
      const issued = withIssue.documents!.issues[withIssue.documents!.issues.length - 1];
      const nextRecord: ScopeRevisionRecord = {
        ...rec,
        draft,
        settings: draftSettings(draft),
        status: 'issued',
        updatedAt: Date.now(),
        issueId: issued.id,
        reference: built.reference,
        v2Reference: built.snapshot.v2.reference,
        v2Total: built.snapshot.v2.total,
        v2TierId: built.v2TierId,
      };
      return { ...withIssue, scopeRevisions: (withIssue.scopeRevisions || []).map(r => (r.id === rec.id ? nextRecord : r)) };
    };
    const issuedId = issueUpd(ctx).documents!.issues.slice(-1)[0].id;
    setProjectContext(full);
    if (recorded && onRecordAgreement) {
      setIssuing(true);
      setIssueError(null);
      const r = await onRecordAgreement(issuedId, agreementOf(agreement), agreement.email ? toList : [], agreement.email ? ccList : [], full(ctx));
      setIssuing(false);
      if (r.ok) setIssueOpen(false);
      else setIssueError(`Issued and recorded as agreed, but: ${r.error}. You can send it again from the revision.`);
      return;
    }
    if (!send || !onSendToClient) { setIssueOpen(false); return; }
    setIssuing(true);
    setIssueError(null);
    const r = await onSendToClient(issuedId, toList, ccList, full(ctx));
    setIssuing(false);
    if (r.ok) setIssueOpen(false);
    else setIssueError(`Issued, but not sent: ${r.error}. You can send it again from the revision.`);
  };

  // ── Rooms, in order, plus rooms the studio has just added ────────────
  const rooms = result.rooms.slice();
  extraRooms.filter(n => !rooms.some(r => r.name === n)).forEach(n => rooms.push({ name: n, section: null, signedRoom: null, compareAsSection: false, before: 0, after: 0, lines: [] }));
  const quiet = filter === 'changed' && !q ? rooms.filter(r => (r.compareAsSection ? stillRoom(r) : r.lines.length > 0 && r.lines.every(l => l.kind === 'same')) && !extraRooms.includes(r.name)) : [];
  const shown = rooms.filter(r => !quiet.includes(r));

  const signedByRoom = (room: string | null) => signed.filter(s => s.room === room);
  const newLineBasisDelta = useMemo(() => {
    if (!draft.excel || draft.excel.basisDetected === 1) return null;
    const other = draft.basis === 1 ? draft.excel.basisDetected : 1;
    return { other, total: revisionFromDraft(signed, setBasis(draft, other)).v2Total };
  }, [draft, signed]);

  const changePct = result.v1Total > 0 ? (result.change / result.v1Total) * 100 : 0;
  const maxBridge = Math.max(1, ...BRIDGE.map(([k]) => Math.abs(result.bridge[k])));

  /*
    A cost or scope item from a meeting, into this draft: a lump-sum line at
    no rate, in the room the studio picks. Issuing is blocked while any line
    has a quantity but no rate, so it cannot reach the client unpriced; Replace
    names and prices it properly.
  */
  const addFromMeeting = async (it: MomScopeItem, room: string) => {
    const where = room || 'Additional work';
    const added = addCustom(draft, where, {
      name: it.text.trim().replace(/\.$/, ''),
      unit: 'lump sum',
      qty: 1,
      rate: 0,
      description: `Raised at ${it.momRef}${it.momRev ? ` Rev ${it.momRev}` : ''} (${it.ref}).`,
    });
    const line = added.lines[added.lines.length - 1];
    const next = { ...added, lines: added.lines.map(l => (l.id === line.id ? { ...l, editNote: `From ${it.momRef} · ${it.ref} · needs a rate` } : l)) };
    await momQueue!.markAdded(it, `Scope Revision ${rec.number}`, { revisionId: rec.id, lineId: line.id });
    save(next);
  };

  return (
    <div className="space-y-4">
      {momQueue && (
        <MeetingScopeInbox
          items={momQueue.items}
          rooms={editable ? rooms.map(r => r.name) : undefined}
          addLabel="Add to draft"
          hint={editable ? 'Each is added at no rate. Price it before issuing.' : `Scope Revision ${rec.number} is with the client. These go into the next one.`}
          onAdd={editable ? addFromMeeting : undefined}
          onDismiss={it => momQueue.dismiss(it, currentUser)}
        />
      )}
      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs px-5 sm:px-6 py-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">Scope revision {rec.number} · {['Draft', 'Issued', approval?.kind === 'recorded' ? 'Agreed' : 'Approved'][stage]}</div>
            <h2 className="text-[26px] leading-tight font-bold tracking-tight text-slate-900 mt-1">Revising Detailed BOQ v{vOf(v1)}</h2>
            <p className="text-[12.5px] text-slate-500 mt-1">
              Scope in force <b className="text-slate-800">{inr2(result.v1Total)}</b> · {v1.recordedApproval ? `approved ${day(v1.recordedApproval.approvedAt)}` : v1.clientSignature ? 'signed' : 'approved with its revision'} · {v1.reference} · started {day(rec.createdAt)}
            </p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {['Draft', 'Issued', 'Approved', 'Applied'].map((s, i) => (
                <React.Fragment key={s}>
                  {i > 0 && <span className={`h-px w-7 ${i <= stage ? 'bg-[#3D52A0]' : 'bg-slate-200'}`} />}
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                    <span className={`w-5 h-5 rounded-full grid place-items-center text-[10.5px] font-extrabold ${i < stage ? 'bg-emerald-600 text-white' : i === stage ? 'bg-[#3D52A0] text-white sw-pulse' : 'border border-slate-300 text-slate-400'}`}>{i < stage ? <Check className="w-3 h-3" /> : i + 1}</span>
                    <span className={i === stage ? 'text-slate-900' : 'text-slate-400'}>{s}</span>
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {editable && (
              <>
                <button onClick={() => setImportOpen(true)} className="px-3.5 py-2 rounded-xl border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4" /> Import Excel</button>
                <button onClick={() => setPicker({ room: shown[0]?.name || rooms[0]?.name || 'Others' })} className="px-3.5 py-2 rounded-xl border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add item</button>
              </>
            )}
            {editable
              ? <button onClick={() => setPreview(buildDocs().snapshot)} className="px-3.5 py-2 rounded-xl border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"><FileText className="w-4 h-4" /> Preview document</button>
              : issue && <button onClick={() => onOpenIssue(issue)} className="px-3.5 py-2 rounded-xl border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"><Eye className="w-4 h-4" /> Open document</button>}
            {editable && (
              <button onClick={() => setIssueOpen(true)} disabled={blocked} title={blocked ? checks.find(c => c.level === 'block')?.text : ''} className="px-4 py-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] disabled:bg-slate-300 text-white text-[12.5px] font-bold cursor-pointer flex items-center gap-1.5 shadow-sm"><PenLine className="w-4 h-4" /> Issue to client</button>
            )}
            {rec.status === 'issued' && !signedByClient && issue && (
              <>
                <button onClick={() => onSign(issue.id)} className="px-3.5 py-2 rounded-xl border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"><PenLine className="w-4 h-4" /> Client signing on this device</button>
                <button onClick={onWithdraw} className="px-3.5 py-2 rounded-xl text-[12.5px] font-bold text-slate-500 hover:bg-slate-100 cursor-pointer flex items-center gap-1.5"><Undo2 className="w-4 h-4" /> Withdraw & edit</button>
              </>
            )}
            {signedByClient && rec.status === 'issued' && (
              <button onClick={onApply} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12.5px] font-bold cursor-pointer flex items-center gap-1.5 shadow-sm"><Check className="w-4 h-4" /> Apply approved revision</button>
            )}
          </div>
        </div>
        {!editable && (
          <div className={`mt-4 rounded-xl px-3.5 py-2.5 text-[12.5px] border flex items-start gap-2 ${signedByClient ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-[#3D52A0]/[0.05] border-[#3D52A0]/20 text-slate-700'}`}>
            {signedByClient ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <Lock className="w-4 h-4 mt-0.5 shrink-0 text-[#3D52A0]" />}
            <span>
              {signedByClient
                ? <>{approval?.kind === 'recorded'
                    ? <>{approvalLabel(approval)} on {day(approval.at)}{approval.recordedBy ? `, recorded by ${approval.recordedBy}` : ''}.</>
                    : <>{approval ? approvalLabel(approval) : 'Signed'} by {approval?.name || 'the client'} {day(approval?.at)}.</>} Apply it to make Detailed BOQ v{vOf(v1) + 1} the scope in force; the Payment Schedule’s next version is staged for them to confirm.</>
                : <>Issued as {rec.reference} · {stateOf(issue)}. The draft is locked while it is with the client. Withdraw it to change anything.</>}
            </span>
          </div>
        )}
        {!editable && issue && onSendToClient && (
          <ClientSendPanel issue={issue} defaultTo={ctx.clientEmail || ''} studioName={orgName || 'Studio'} sending={sendingId === issue.id}
            onSend={(to, cc) => onSendToClient(issue.id, to, cc)}
            onRecord={onRecordAgreement && issue.kind === 'scope_revision' ? (a, to, cc) => onRecordAgreement(issue.id, a, to, cc) : undefined} />
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-4 items-start">
        {/* ── Rooms ───────────────────────────────────────────────────── */}
        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap bg-slate-200/60 p-1 rounded-xl">
              {([['changed', 'Changed'], ['all', 'All'], ['new', 'New'], ['removed', 'Removed'], ...(draft.excel ? [['excel', 'From Excel']] : []), ['edit', 'Edited by you']] as [Filter, string][]).map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k)} className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition-colors ${filter === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
                  {label} <span className="text-[10.5px] font-semibold text-slate-400 ml-0.5">{counts[k]}</span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search items" className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-[#3D52A0]/20" />
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 ml-auto">
              {draft.excel && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> From the {excelLabel}</span>}
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#3D52A0]" /> Edited by you</span>
            </div>
          </div>

          {shown.map(room => {
            const lines = room.lines.filter(l => visible(l, byId.get(l.id)));
            const hiddenSame = filter === 'changed' && !showAll[room.name] ? lines.filter(l => l.kind === 'same') : [];
            const rows = lines.filter(l => !hiddenSame.includes(l));
            if (!rows.length && !hiddenSame.length && !room.compareAsSection && (q || filter !== 'changed' && filter !== 'all') && !extraRooms.includes(room.name)) return null;
            const change = room.after - room.before;
            return (
              <div key={room.name} className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden sw-tilt">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50/70 border-b border-slate-100">
                  {renaming === room.name ? (
                    <input
                      autoFocus
                      defaultValue={room.name}
                      onBlur={e => { save(renameRoom(draft, room.name, e.target.value)); setRenaming(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }}
                      className="border border-slate-300 rounded-lg px-2 py-1 text-[14px] font-bold"
                    />
                  ) : (
                    <button onClick={() => editable && setRenaming(room.name)} className={`text-[15px] font-bold text-slate-900 flex items-center gap-1.5 group ${editable ? 'cursor-text' : 'cursor-default'}`}>
                      {room.name}{editable && <Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </button>
                  )}
                  {room.signedRoom && room.signedRoom !== room.name && <span className="text-[10.5px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5">was {room.signedRoom}</span>}
                  {!room.signedRoom && <span className="text-[10.5px] font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">New room</span>}
                  {room.compareAsSection && <span className="text-[10.5px] font-bold text-violet-800 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">Compared as a whole</span>}
                  <div className="ml-auto flex items-center gap-3 text-[12.5px] tabular-nums">
                    <span className="text-slate-400">{inr(room.before)}</span><span className="text-slate-300">→</span>
                    <b className="text-slate-900">{inr(room.after)}</b>
                    <b className={`${tone(change)} min-w-[72px] text-right`}>{Math.abs(change) >= 0.5 ? sgn(change) : ''}</b>
                    {room.signedRoom && editable && (
                      <label className="flex items-center gap-1 text-[11.5px] font-semibold text-slate-500 cursor-pointer" title="Compare this room’s totals instead of line by line — for a room itemised differently in the revision">
                        <input type="checkbox" checked={room.compareAsSection} onChange={e => save({ ...draft, sectionCompare: e.target.checked ? [...draft.sectionCompare, room.name] : draft.sectionCompare.filter(x => x !== room.name) })} /> Whole section
                      </label>
                    )}
                    {editable && <button onClick={() => setNoteFor(noteFor === room.name ? null : room.name)} title="A line for the client about this room" className={`p-1 rounded-md cursor-pointer ${draft.roomNotes[room.name] ? 'text-[#3D52A0]' : 'text-slate-400 hover:text-slate-700'}`}><MessageSquareText className="w-4 h-4" /></button>}
                    {editable && !room.compareAsSection && <button onClick={() => setPicker({ room: room.name })} className="text-[12px] font-bold text-[#3D52A0] hover:underline cursor-pointer">+ Add item</button>}
                  </div>
                </div>
                {(noteFor === room.name || (draft.roomNotes[room.name] && !editable)) && (
                  <div className="px-4 py-2 border-b border-slate-100 bg-[#3D52A0]/[0.03]">
                    <input
                      disabled={!editable}
                      defaultValue={draft.roomNotes[room.name] || ''}
                      onBlur={e => { if ((draft.roomNotes[room.name] || '') !== e.target.value) save({ ...draft, roomNotes: { ...draft.roomNotes, [room.name]: e.target.value } }); }}
                      placeholder={room.compareAsSection ? 'Why this section is compared as a whole' : 'What changed here, in the client’s words'}
                      className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-slate-400"
                    />
                  </div>
                )}

                {room.compareAsSection ? (
                  <div className="grid md:grid-cols-2 text-[12.5px]">
                    <div className="p-4 md:border-r border-slate-100">
                      <div className="flex justify-between text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-2"><span>Signed</span><span>{inr(room.before)}</span></div>
                      {signedByRoom(room.signedRoom).map(s => <div key={s.lineId} className="flex justify-between gap-3 py-1 text-slate-600"><span>{displayName(s.name)}</span><span className="tabular-nums">{inr(s.amount)}</span></div>)}
                    </div>
                    <div className="p-4">
                      <div className="flex justify-between text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-2"><span>Revised{draft.excel ? ` · ${excelLabel}` : ''}</span><span>{inr(room.after)}</span></div>
                      {room.lines.map(l => <div key={l.id} className="flex justify-between gap-3 py-1 border-b border-slate-50 last:border-0 text-slate-700"><span>{displayName(l.imported?.name)}</span><span className="tabular-nums">{inr(l.amount2)}</span></div>)}
                    </div>
                    <div className="md:col-span-2 px-4 py-2 text-[11.5px] text-slate-500 border-t border-slate-100 bg-slate-50/50">Itemised differently in the revision, so the client sees the section totals side by side rather than every line as new. Untick “Whole section” to edit it line by line.</div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-[12.5px]">
                      <thead>
                        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                          <th className="text-left font-bold px-4 py-2">Item</th>
                          <th className="text-right font-bold px-2 py-2 w-[110px]">Qty</th>
                          <th className="text-right font-bold px-2 py-2 w-[110px]">Rate (net)</th>
                          <th className="text-right font-bold px-2 py-2 w-[110px]">Amount</th>
                          <th className="text-right font-bold px-2 py-2 w-[96px]">Change</th>
                          <th className="w-[70px]" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map(l => (
                          <LineRow
                            key={l.id}
                            l={l}
                            d={byId.get(l.id)}
                            editable={editable}
                            excelLabel={excelLabel}
                            onQty={(d, n) => save(updateLine(draft, d.id, { qty: n, removed: false }, d.signedLineId ? `Quantity ${num(signed.find(s => s.lineId === d.signedLineId)?.qty ?? d.qty)} → ${num(n)}` : 'Edited by you'))}
                            onRate={(d, n) => save(updateLine(draft, d.id, { rate: n, basisLocked: true }, 'Rate changed by you'))}
                            onRemove={d => save(removeLine(draft, d.id))}
                            onRestore={d => save(restoreLine(draft, d.id, signed))}
                            onReplace={d => setPicker({ room: room.name, replace: d.id })}
                          />
                        ))}
                        {!rows.length && !hiddenSame.length && <tr><td colSpan={6} className="px-4 py-3 text-[12px] text-slate-400">No items yet. Add one from the bank or as a custom item.</td></tr>}
                      </tbody>
                    </table>
                    {hiddenSame.length > 0 && (
                      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 text-[11.5px] text-slate-500">
                        <span>{hiddenSame.length} unchanged item{hiddenSame.length === 1 ? '' : 's'} hidden</span>
                        <button onClick={() => setShowAll({ ...showAll, [room.name]: true })} className="font-bold text-slate-700 hover:text-[#3D52A0] cursor-pointer">Show all</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {result.zeroImported.length > 0 && (filter === 'all' || filter === 'changed' || filter === 'excel') && (
            <div className="bg-white rounded-2xl border border-slate-200/80 px-4 py-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Listed as not in scope</div>
              <div className="flex flex-wrap gap-1.5">
                {result.zeroImported.map(l => {
                  const d = byId.get(l.id);
                  return <span key={l.id} className="text-[11.5px] bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-slate-600">{displayName(l.name)} · {l.section}{d?.heldReason ? ` · ${d.heldReason}` : ''}</span>;
                })}
              </div>
            </div>
          )}

          {quiet.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-slate-200/80 px-4 py-3">
              <span className="text-[12px] font-semibold text-slate-500">No changes in {quiet.length} room{quiet.length === 1 ? '' : 's'}:</span>
              {quiet.map(r => (
                <button key={r.name} onClick={() => { setFilter('all'); }} className="text-[11.5px] bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-slate-600 hover:border-slate-300 cursor-pointer">{r.name} · {inr(r.after)}</button>
              ))}
            </div>
          )}

          {editable && (
            newRoom !== null ? (
              <div className="flex gap-2">
                <input autoFocus value={newRoom} onChange={e => setNewRoom(e.target.value)} placeholder="Room name, e.g. Balcony" className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-[13px]"
                  onKeyDown={e => { if (e.key === 'Enter' && newRoom.trim()) { setExtraRooms([...extraRooms, newRoom.trim()]); setPicker({ room: newRoom.trim() }); setNewRoom(null); } if (e.key === 'Escape') setNewRoom(null); }} />
                <button onClick={() => { if (newRoom.trim()) { setExtraRooms([...extraRooms, newRoom.trim()]); setPicker({ room: newRoom.trim() }); } setNewRoom(null); }} className="px-3.5 py-2 rounded-xl bg-[#3D52A0] text-white text-[12.5px] font-bold cursor-pointer">Add room</button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <button onClick={() => setNewRoom('')} className="text-[12.5px] font-bold text-[#3D52A0] hover:underline cursor-pointer">+ Add a room</button>
                {confirmDiscard ? (
                  <span className="flex items-center gap-2 text-[12px] text-slate-600">Discard this draft? The signed scope is untouched.
                    <button onClick={onDiscard} className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold cursor-pointer">Discard</button>
                    <button onClick={() => setConfirmDiscard(false)} className="px-2.5 py-1 rounded-lg font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">Keep</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmDiscard(true)} className="text-[12px] font-semibold text-slate-400 hover:text-rose-600 cursor-pointer">Discard draft</button>
                )}
              </div>
            )
          )}
        </div>

        {/* ── Rail ────────────────────────────────────────────────────── */}
        <div className="space-y-3 xl:sticky xl:top-2">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4">
            <div className="flex items-center gap-2.5 mb-3"><Ic3 icon={Layers} size="sm" /><span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">This revision</span></div>
            <div className="space-y-1 text-[12.5px]">
              <div className="flex justify-between text-slate-500"><span>Signed v{vOf(v1)}</span><span className="tabular-nums">{inr2(result.v1Total)}</span></div>
              <div className="flex justify-between text-slate-700"><span>Revised v{vOf(v1) + 1}</span><Tween value={result.v2Total} format={inr2} className="tabular-nums font-extrabold text-slate-900" /></div>
            </div>
            <div className="mt-2">
              <Tween value={result.change} format={sgn} className={`text-[20px] font-extrabold tabular-nums ${tone(result.change)}`} />
              <div className="text-[11.5px] text-slate-500">{Math.abs(changePct) < 0.05 ? 'No change' : `${changePct > 0 ? '+' : '−'}${Math.abs(changePct).toFixed(1)}%`} on the signed scope</div>
            </div>
            <div className="mt-3 space-y-1.5">
              {BRIDGE.map(([k, label]) => {
                const v = result.bridge[k];
                return (
                  <div key={k} className="grid grid-cols-[78px_1fr_78px] items-center gap-2 text-[11.5px]">
                    <span className="text-slate-600">{label}</span>
                    <span className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><span className={`block h-full rounded-full sw-bar ${v < 0 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${(Math.abs(v) / maxBridge) * 100}%` }} /></span>
                    <Tween value={v} format={sgn} className={`text-right tabular-nums font-bold ${tone(v)}`} />
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-2.5">Six parts, always adding up to the change. The client sees the same breakdown.</p>
          </div>

          {finance && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4">
            <div className="flex items-center gap-2.5 mb-3"><Ic3 icon={Percent} tint="gold" size="sm" /><span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Margin</span><span className="text-[9.5px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">Studio only</span></div>
            {margin.lines === 0 ? <p className="text-[12px] text-slate-500">No changed lines yet.</p> : (
              <div className="space-y-1 text-[12.5px]">
                <div className="flex justify-between text-slate-600"><span>Changed lines · sell</span><span className="tabular-nums">{inr(margin.sell)}</span></div>
                <div className="flex justify-between text-slate-600"><span>Cost</span><span className="tabular-nums">{inr(margin.cost)}</span></div>
                <div className="flex justify-between text-slate-800 font-bold"><span>Margin on sell</span><Tween value={margin.margin} format={n => `${n.toFixed(1)}%`} className="tabular-nums" /></div>
                {margin.costed < margin.lines && <p className="text-[11px] text-amber-700 pt-1">{margin.lines - margin.costed} of {margin.lines} changed lines have no cost and count at 0%.</p>}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-2">Excel lines take their cost from the costing sheet; bank lines keep theirs. Never in a client document.</p>
          </div>
          )}

          {draft.excel && draft.excel.basisDetected !== 1 && newLineBasisDelta && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4">
              <div className="flex items-center gap-2.5 mb-3"><Ic3 icon={Sparkles} tint="slate" size="sm" /><span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Commercial basis</span></div>
              {draft.excel.net >= 3 && draft.excel.list >= 3 && (
                <Note tone="warn"><b>The Excel mixes bases.</b> {draft.excel.net} matched items are already at their signed rate, {draft.excel.list} are at list. Matched items keep their own basis. Excel lines whose rate the basis decides:</Note>
              )}
              <div className="space-y-1.5 mt-2">
                {[draft.excel.basisDetected, 1].map(b => (
                  <label key={b} className={`flex items-start gap-2 rounded-xl border px-3 py-2 cursor-pointer ${draft.basis === b ? 'border-[#3D52A0] bg-[#3D52A0]/[0.05]' : 'border-slate-200'} ${!editable ? 'pointer-events-none opacity-70' : ''}`}>
                    <input type="radio" className="mt-0.5" checked={draft.basis === b} onChange={() => save(setBasis(draft, b))} />
                    <span className="text-[12px]"><b>{pct(b)}</b> — {b === 1 ? 'the sheet’s rates' : 'the project’s basis'}
                      <span className="block text-slate-500">{b === 1 ? 'the new rates are already net' : 'the sheet’s new rates are list rates'}</span>
                      {draft.basis !== b && <span className="block text-slate-500 tabular-nums">revised total {inr(newLineBasisDelta.total)} ({sgn(newLineBasisDelta.total - result.v2Total)})</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4">
            <div className="flex items-center gap-2.5 mb-3"><Ic3 icon={ListChecks} tint={blocked ? 'rose' : 'green'} size="sm" /><span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Checks</span></div>
            <div className="space-y-1.5">
              {checks.map((c, i) => <Note key={i} tone={c.level}>{c.text}</Note>)}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4">
            <div className="flex items-center gap-2.5 mb-2"><Ic3 icon={MessageSquareText} size="sm" /><span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Note to the client</span></div>
            <textarea
              key={rec.id + (editable ? 'e' : 'r')}
              disabled={!editable}
              defaultValue={draft.summary}
              onBlur={e => { if (e.target.value !== draft.summary) save({ ...draft, summary: e.target.value }); }}
              rows={4}
              placeholder="In two sentences: why the scope changed, and what the client gets for it."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:ring-2 focus:ring-[#3D52A0]/20 disabled:bg-slate-50"
            />
          </div>
        </div>
      </div>

      {/* ── Overlays ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {picker && editable && (
          <ItemPicker
            key="picker"
            bank={bank}
            rooms={rooms.map(r => r.name)}
            room={picker.room}
            replacing={picker.replace ? byId.get(picker.replace) : undefined}
            onClose={() => setPicker(null)}
            onBank={(room, item) => {
              save(picker.replace ? replaceWithBank(draft, picker.replace, item) : addFromBank(draft, room, item, 1));
              setFilter(f => (f === 'removed' ? 'changed' : f));
              setPicker(null);
            }}
            onCustom={(room, v) => {
              if (picker.replace) {
                save(updateLine(draft, picker.replace, { name: v.name, unit: v.unit, qty: v.qty, rate: v.rate, cost: v.cost ?? null, bankId: null, basisLocked: true, description: v.description || null }, `Replaced with ${v.name}`));
              } else {
                save(addCustom(draft, room, v));
              }
              setPicker(null);
            }}
          />
        )}
        {importOpen && editable && (
          <ImportModal
            key="import"
            draft={draft}
            signed={signed}
            signedBoq={base.boq}
            bankMap={bankMap}
            onClose={() => setImportOpen(false)}
            onMerge={(next, source, costs) => {
              saveRecord({ ...rec, draft: next, settings: draftSettings(next), source, internalCosts: costs });
              setImportOpen(false);
              setFilter('changed');
            }}
          />
        )}
        {issueOpen && (
          <Modal key="issue" onClose={() => setIssueOpen(false)}>
            {(() => {
              const built = buildDocs();
              return (
                <>
                  <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                    <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">Issue to client</div>
                    <h3 className="text-[20px] font-bold tracking-tight text-slate-900 mt-0.5">Scope Revision {rec.number} · {built.reference}</h3>
                    <button onClick={() => setIssueOpen(false)} className="absolute right-4 top-4 p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        [`Signed v${vOf(v1)}`, inr(result.v1Total), ''],
                        [`Revised v${vOf(v1) + 1}`, inr(built.snapshot.v2.total), ''],
                        ['Change', sgn(result.change), tone(result.change)],
                        ['Rooms', String(result.rooms.length), ''],
                      ].map(([k, v, c]) => (
                        <div key={k} className="rounded-xl border border-slate-200 px-3 py-2.5"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</div><div className={`text-[17px] font-extrabold tabular-nums ${c || 'text-slate-900'}`}>{v}</div></div>
                      ))}
                    </div>
                    {built.drift > 0.01
                      ? <Note tone="block">The revised BOQ prices to {inr2(built.snapshot.v2.total)} but the draft says {inr2(result.v2Total)}. Issuing is blocked until they agree.</Note>
                      : <Note tone="ok">The revised BOQ prices to this total exactly, and the six parts add up to the change.</Note>}
                    <ClientTotalsPicker value={totalsOpts} onChange={setTotalsOpts} before={result.v1Total} after={built.snapshot.v2.total} />
                    <div>
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1.5">What the client gets</div>
                      <ul className="list-disc pl-5 text-[12.5px] text-slate-700 space-y-1">
                        <li>A short email with these totals, the Excel attached (Summary, What changed, Revised BOQ v{vOf(v1) + 1} in full with specifications, Not included), and a button to their portal.</li>
                        <li>{approvalMode === 'recorded'
                          ? 'In the portal: the same totals, the changed items and the Excel, marked as agreed. Nothing for them to sign.'
                          : 'In the portal: the same totals, the changed items, the Excel, and one Approve for the whole revision.'}</li>
                        <li>Nothing about costs or margins. The Excel is locked.</li>
                      </ul>
                      <button
                        onClick={async () => {
                          setPreviewXl(true);
                          try {
                            const snap: any = { ...built.snapshot, clientTotals: totalsOpts };
                            const buf = await buildRevisionWorkbook(snap, { studioName: orgName || 'Studio', fingerprint: 'added when issued', issuedOn: Date.now() });
                            downloadWorkbook(buf, `PREVIEW ${revisionWorkbookName(snap)}`);
                          } finally { setPreviewXl(false); }
                        }}
                        className="mt-2 px-3 py-1.5 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                      >
                        {previewXl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Preview the Excel
                      </button>
                    </div>
                    {onRecordAgreement && (
                      <div>
                        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1.5">How the client approves it</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {([
                            ['portal', 'They approve it in their portal', 'One tick and their name. Recorded with the time, their login and device.'],
                            ['recorded', 'They have already agreed', 'In a meeting, on a call or on WhatsApp. You record it; they sign nothing.'],
                          ] as const).map(([k, t, sub]) => (
                            <button key={k} type="button" onClick={() => { setApprovalMode(k); setIssueError(null); }}
                              className={`text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${approvalMode === k ? 'border-[#3D52A0] bg-[#3D52A0]/[0.05] ring-1 ring-[#3D52A0]/30' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <span className="flex items-center gap-2 text-[12.5px] font-bold text-slate-900">
                                <span className={`w-3.5 h-3.5 rounded-full border-2 ${approvalMode === k ? 'border-[#3D52A0] bg-[#3D52A0] shadow-[inset_0_0_0_2px_white]' : 'border-slate-300'}`} />{t}
                              </span>
                              <span className="block text-[11.5px] text-slate-500 mt-0.5 pl-[22px]">{sub}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {approvalMode === 'recorded' && <AgreementFields value={agreement} onChange={setAgreement} />}
                    {(approvalMode === 'portal' || agreement.email) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="text-[11.5px] font-bold text-slate-500">Send to
                          <input value={issueTo} onChange={e => setIssueTo(e.target.value)} placeholder="client@email.com" className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12.5px] font-normal text-slate-800" />
                        </label>
                        <label className="text-[11.5px] font-bold text-slate-500">CC (optional)
                          <input value={issueCc} onChange={e => setIssueCc(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12.5px] font-normal text-slate-800" />
                        </label>
                      </div>
                    )}
                    {approvalMode === 'recorded'
                      ? <Note tone="info">It is recorded as agreed on the date you give, by you. You can apply it straight away; the Payment Schedule's next version is then staged for them to confirm.</Note>
                      : <Note tone="warn">The scope changes only when they approve and you apply it; then the Payment Schedule's next version is staged for them to confirm.</Note>}
                    {issueError && <Note tone="block">{issueError}</Note>}
                  </div>
                  <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap justify-end gap-2">
                    <button onClick={() => { setIssueOpen(false); setPreview(built.snapshot); }} className="px-3.5 py-2 rounded-xl text-[12.5px] font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Preview first</button>
                    <button onClick={() => setIssueOpen(false)} className="px-3.5 py-2 rounded-xl text-[12.5px] font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Back to the draft</button>
                    {approvalMode === 'recorded' ? (
                      <button onClick={() => doIssue(false)} disabled={built.drift > 0.01 || blocked || issuing || !agreementValid(agreement)} className="px-4 py-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] disabled:bg-slate-300 text-white text-[12.5px] font-bold cursor-pointer flex items-center gap-1.5">{issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Issue &amp; record as agreed</button>
                    ) : <>
                    <button onClick={() => doIssue(false)} disabled={built.drift > 0.01 || blocked || issuing} className="px-3.5 py-2 rounded-xl border border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">Issue only, send later</button>
                    <button onClick={() => doIssue(true)} disabled={built.drift > 0.01 || blocked || issuing} className="px-4 py-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] disabled:bg-slate-300 text-white text-[12.5px] font-bold cursor-pointer flex items-center gap-1.5">{issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Issue &amp; send to client</button>
                    </>}
                  </div>
                </>
              );
            })()}
          </Modal>
        )}
        {preview && (
          <Modal key="preview" onClose={() => setPreview(null)} wide>
            <button onClick={() => setPreview(null)} className="absolute right-3 top-3 p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer z-10"><X className="w-5 h-5" /></button>
            <ScopeRevisionSheet snapshot={preview} studioName={orgName} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}


// ── Sending a scope document to the client ─────────────────────────────────

const splitEmails = (s: string) => s.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean);
const EMAIL_RX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/* The client's agreement as the studio records it: when, how, a note, and whether to email them the Excel. */
interface AgreementDraft { on: string; how: AgreedVia; note: string; email: boolean }
const newAgreementDraft = (): AgreementDraft => ({ on: isoDay(Date.now()), how: 'meeting', note: '', email: true });
const agreementValid = (a: AgreementDraft) => /^\d{4}-\d{2}-\d{2}$/.test(a.on) && a.on <= isoDay(Date.now());
/* Today means now (never later than the moment it is recorded); an earlier day, midday. */
const agreementOf = (a: AgreementDraft) => ({
  approvedAt: a.on === isoDay(Date.now()) ? Date.now() : new Date(`${a.on}T12:00:00`).getTime(),
  how: a.how,
  note: a.note.trim(),
});

const AgreementFields: React.FC<{ value: AgreementDraft; onChange: (a: AgreementDraft) => void }> = ({ value: a, onChange }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 space-y-2.5">
    <div className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-2">
      <label className="text-[11.5px] font-bold text-slate-500">Agreed on
        <input type="date" value={a.on} max={isoDay(Date.now())} onChange={e => onChange({ ...a, on: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12.5px] font-normal text-slate-800 bg-white" />
      </label>
      <div className="text-[11.5px] font-bold text-slate-500">How
        <div className="mt-1 flex flex-wrap gap-1.5">
          {AGREED_VIA.map(v => (
            <button key={v.value} type="button" onClick={() => onChange({ ...a, how: v.value })}
              className={`px-2.5 py-1.5 rounded-lg border text-[12px] font-semibold cursor-pointer ${a.how === v.value ? 'border-[#3D52A0] bg-[#3D52A0] text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{v.label}</button>
          ))}
        </div>
      </div>
    </div>
    <label className="block text-[11.5px] font-bold text-slate-500">Note (optional, shown on the approval record)
      <input value={a.note} onChange={e => onChange({ ...a, note: e.target.value })} placeholder="e.g. Agreed at the site visit; confirmed on WhatsApp the same day." className="mt-1 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12.5px] font-normal text-slate-800 bg-white" />
    </label>
    <label className="flex items-center gap-2 text-[12.5px] text-slate-700 cursor-pointer select-none">
      <input type="checkbox" checked={a.email} onChange={e => onChange({ ...a, email: e.target.checked })} className="w-4 h-4 accent-[#3D52A0]" />
      Email them the Excel for their records
    </label>
  </div>
);

/** The Excel, as the client will get it. */
const ExcelButton: React.FC<{ issue: DocumentIssue; studioName: string; label?: string }> = ({ issue, studioName, label = 'Download Excel' }) => {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        try { const { buf, filename } = await workbookForIssue(issue, studioName); downloadWorkbook(buf, filename); }
        catch (e) { console.error(e); alert('The Excel could not be made just now.'); }
        finally { setBusy(false); }
      }}
      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-[12px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="w-4 h-4 rounded-[3px] bg-[#107C41] text-white text-[9px] font-extrabold grid place-items-center">X</span>}
      {label}
    </button>
  );
};

/*
  Where a staged or issued document stands with the client, and how to send it.

  Sending is one step on purpose: publish the document, rewrite the client's
  portal copy, then email the Excel with the portal link -- in that order, so
  the email never points at a portal that does not have the document yet.
*/
/* What has happened to a sent document: sent, Excel downloaded, approved. */
const Trail: React.FC<{ issue: DocumentIssue }> = ({ issue }) => {
  const i: any = issue;
  const dl: { at: number; format: string }[] = (i.clientDownloads || []).filter((x: any) => x.format === 'excel');
  const a = approvalOf(issue);
  const when = (t?: number | string | null) => (t ? new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
  const rows: { done: boolean; label: string; sub?: string; at?: string }[] = [
    { done: !!i.sentAt, label: 'Sent to the client', sub: (i.sentTo || []).length ? (i.sentTo || []).join(', ') : 'Portal only', at: when(i.sentAt) },
    { done: dl.length > 0, label: 'Excel downloaded', sub: dl.length ? `From the portal, ${dl.length} time${dl.length === 1 ? '' : 's'}` : undefined, at: when(dl[dl.length - 1]?.at) },
    a?.kind === 'recorded'
      ? { done: true, label: approvalLabel(a), sub: a.recordedBy ? `by ${a.recordedBy}` : undefined, at: day(a.at) }
      : { done: !!a, label: a ? approvalLabel(a) : 'Approved in the portal', sub: a?.name || undefined, at: when(a?.at) },
  ];
  return (
    <ol className="mt-3 border-t border-slate-200/70 pt-2.5 space-y-1.5">
      {rows.map((r, k) => (
        <li key={k} className="grid grid-cols-[14px_minmax(0,1fr)_auto] gap-2.5 items-start text-[12px]">
          <span className={`mt-1 w-2.5 h-2.5 rounded-full ${r.done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
          <span className={r.done ? 'text-slate-800' : 'text-slate-400'}>{r.label}{r.sub ? <span className="text-slate-500"> · {r.sub}</span> : null}</span>
          <span className="text-slate-400 tabular-nums">{r.done ? r.at : 'not yet'}</span>
        </li>
      ))}
    </ol>
  );
};

const ClientSendPanel: React.FC<{
  issue: DocumentIssue;
  defaultTo: string;
  studioName: string;
  sending: boolean;
  onSend: (to: string[], cc: string[]) => Promise<{ ok: boolean; error?: string }>;
  /** Record that the client has already agreed, instead of waiting for their approval. */
  onRecord?: (a: { approvedAt: number; how: AgreedVia; note: string }, to: string[], cc: string[]) => Promise<{ ok: boolean; error?: string }>;
}> = ({ issue, defaultTo, studioName, sending, onSend, onRecord }) => {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [agreement, setAgreement] = useState<AgreementDraft>(() => newAgreementDraft());
  const d: any = issue.clientSignature;
  const rec = issue.recordedApproval;
  const sentAt = (issue as any).sentAt as number | undefined;
  const sentTo = ((issue as any).sentTo || []) as string[];
  if (rec && !d) {
    const a = approvalOf(issue)!;
    return (
      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3 flex flex-wrap items-center gap-3">
        <Check className="w-4 h-4 text-emerald-700 shrink-0" />
        <div className="flex-1 min-w-[220px] text-[12.5px] text-emerald-950">
          <b>{approvalLabel(a)}</b> on {day(a.at)}{a.recordedBy ? ` · recorded by ${a.recordedBy}` : ''}
          {a.note ? <span className="block text-emerald-900/80 mt-0.5">“{a.note}”</span> : null}
        </div>
        <ExcelButton issue={issue} studioName={studioName} label="Agreed Excel" />
        <ApprovalRecordButton issue={issue} studioName={studioName} />
        <div className="basis-full"><Trail issue={issue} /></div>
      </div>
    );
  }
  if (d) {
    return (
      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3 flex flex-wrap items-center gap-3">
        <Check className="w-4 h-4 text-emerald-700 shrink-0" />
        <div className="flex-1 min-w-[220px] text-[12.5px] text-emerald-950">
          <b>{d.witnessedBy ? 'Approved in person' : d.signatureType === 'portal_approval' ? 'Approved in the portal' : 'Signed'}</b> by {d.signatoryName || 'the client'}
          {d.signatoryEmail ? ` (${d.signatoryEmail})` : ''} on {new Date(d.signedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {d.witnessedBy ? ` · on a studio device` : ''}
        </div>
        <ExcelButton issue={issue} studioName={studioName} label="Approved Excel" />
        <ApprovalRecordButton issue={issue} studioName={studioName} />
        {(issue as any).sentAt && <div className="basis-full"><Trail issue={issue} /></div>}
      </div>
    );
  }
  const send = async () => {
    const toList = splitEmails(to);
    const ccList = splitEmails(cc);
    const bad = [...toList, ...ccList].find(e => !EMAIL_RX.test(e));
    if (bad) { setError(`"${bad}" is not an email address.`); return; }
    setError(null);
    const r = await onSend(toList, ccList);
    if (!r.ok) setError(r.error || 'It could not be sent.');
  };
  const record = async () => {
    if (!onRecord) return;
    const toList = agreement.email ? splitEmails(to) : [];
    const ccList = agreement.email ? splitEmails(cc) : [];
    const bad = [...toList, ...ccList].find(e => !EMAIL_RX.test(e));
    if (bad) { setError(`"${bad}" is not an email address.`); return; }
    if (!agreementValid(agreement)) { setError('Give the date the client agreed (today or earlier).'); return; }
    setError(null);
    const r = await onRecord(agreementOf(agreement), toList, ccList);
    if (!r.ok) setError(`Recorded as agreed, but: ${r.error || 'the portal was not updated'}.`);
  };
  if (recording && onRecord) {
    return (
      <div className="mt-4 rounded-xl border border-[#3D52A0]/20 bg-[#3D52A0]/[0.04] px-3.5 py-3 space-y-2.5">
        <div className="text-[12.5px] text-slate-700"><b>Record the client's agreement.</b> Use this when they agreed to this revision in person, on a call or on WhatsApp and will not approve it in the portal. Their portal shows it as agreed, with nothing to sign.</div>
        <AgreementFields value={agreement} onChange={setAgreement} />
        {agreement.email && (
          <div className="flex flex-wrap items-center gap-2">
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="client@email.com" aria-label="Send to" className="flex-1 min-w-[200px] border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white" />
            <input value={cc} onChange={e => setCc(e.target.value)} placeholder="CC (optional)" aria-label="CC" className="w-[180px] border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white" />
          </div>
        )}
        {error && <Note tone="block">{error}</Note>}
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={() => { setRecording(false); setError(null); }} className="px-3.5 py-2 rounded-xl text-[12px] font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
          <button onClick={record} disabled={sending || !agreementValid(agreement)} className="px-3.5 py-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] disabled:opacity-60 text-white text-[12px] font-bold cursor-pointer flex items-center gap-1.5">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Record as agreed
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-xl border border-[#3D52A0]/20 bg-[#3D52A0]/[0.04] px-3.5 py-3 space-y-2.5">
      <div className="text-[12.5px] text-slate-700">
        {sentAt
          ? <>Sent to the client {new Date(sentAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{sentTo.length ? ` (${sentTo.join(', ')})` : ' (portal only)'} · waiting for their approval in the portal.</>
          : <>Not sent yet. Sending publishes it to the client's portal and emails them the Excel with a link to approve it there.</>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={to} onChange={e => setTo(e.target.value)} placeholder="client@email.com" aria-label="Send to" className="flex-1 min-w-[200px] border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white" />
        <input value={cc} onChange={e => setCc(e.target.value)} placeholder="CC (optional)" aria-label="CC" className="w-[180px] border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12.5px] bg-white" />
        <ExcelButton issue={issue} studioName={studioName} />
        <button onClick={send} disabled={sending} className="px-3.5 py-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] disabled:opacity-60 text-white text-[12px] font-bold cursor-pointer flex items-center gap-1.5">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} {sentAt ? 'Send again' : 'Send to client'}
        </button>
      </div>
      {!splitEmails(to).length && <p className="text-[11.5px] text-slate-500">{sentAt ? 'With no email, sending again only refreshes their portal.' : 'With no email, it is published to the portal only.'}</p>}
      {error && <Note tone="block">{error}</Note>}
      {sentAt && <Trail issue={issue} />}
      {onRecord && (
        <button onClick={() => { setRecording(true); setError(null); }} className="text-[12px] font-bold text-[#3D52A0] hover:underline cursor-pointer">
          Client already agreed in person or on WhatsApp? Record it instead
        </button>
      )}
    </div>
  );
};

// ── One line ────────────────────────────────────────────────────────────────

const LineRow: React.FC<{
  l: RevisionLine;
  d?: DraftLine;
  editable: boolean;
  excelLabel: string;
  onQty: (d: DraftLine, n: number) => void;
  onRate: (d: DraftLine, n: number) => void;
  onRemove: (d: DraftLine) => void;
  onRestore: (d: DraftLine) => void;
  onReplace: (d: DraftLine) => void;
}> = ({ l, d, editable, excelLabel, onQty, onRate, onRemove, onRestore, onReplace }) => {
  const s = l.signed;
  const removed = l.kind === 'removed';
  const name = displayName(d?.name || l.imported?.name || s?.name);
  const unit = normaliseUnit(d?.unit || s?.unit || '');
  const change = l.amount2 - (s?.amount || 0);
  const tag = TAG[l.kind];
  const canEdit = editable && !!d && !removed;
  /* A row glows briefly when its amount moves — after an edit, not on load. */
  const row = useRef<HTMLTableRowElement>(null);
  const last = useRef(l.amount2);
  useEffect(() => {
    if (last.current === l.amount2) return;
    last.current = l.amount2;
    if (!reducedMotion()) row.current?.animate?.([{ backgroundColor: 'rgba(61,82,160,0.12)' }, { backgroundColor: 'rgba(61,82,160,0)' }], { duration: 1100, easing: 'ease-out' });
  }, [l.amount2]);
  return (
    <tr ref={row} className={`align-top ${removed ? 'bg-rose-50/30' : ''}`}>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`font-semibold ${removed ? 'line-through text-slate-400' : 'text-slate-900'}`}>{name}</span>
          {tag && <span className={`text-[9.5px] font-bold uppercase tracking-wide border rounded px-1.5 py-px ${tag[1]}`}>{tag[0]}</span>}
          {d && l.kind !== 'same' && (
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              <span className={`w-1.5 h-1.5 rounded-full ${d.source === 'edit' ? 'bg-[#3D52A0]' : d.source === 'excel' ? 'bg-amber-500' : 'bg-slate-300'}`} />
              {d.source === 'edit' ? d.editNote || 'Edited by you' : d.source === 'excel' ? d.editNote || excelLabel : ''}
            </span>
          )}
        </div>
        {l.kind === 'redesign' && s && <div className="text-[11px] text-slate-500 mt-0.5">Replaces: {displayName(s.name)}</div>}
        {d?.description && !removed && <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{d.description}</div>}
      </td>
      <td className="px-2 py-2 text-right">
        {s && l.kind !== 'same' && <div className="text-[10.5px] text-slate-400 tabular-nums">{num(s.qty)} {unit}</div>}
        {removed ? <div className="text-slate-400 tabular-nums pt-1">0</div>
          : d ? <NumCell label={`${name} quantity`} value={d.qty} changed={!!s && Math.abs(d.qty - s.qty) > 1e-6 || !s} disabled={!canEdit} onCommit={n => onQty(d, n)} />
            : <span className="tabular-nums">{num(l.qty2)}</span>}
        {!s && !removed && <div className="text-[10.5px] text-slate-400 mt-0.5">{unit}</div>}
      </td>
      <td className="px-2 py-2 text-right">
        {s && l.kind !== 'same' && <div className="text-[10.5px] text-slate-400 tabular-nums">{inr(s.rate)}</div>}
        {removed ? <div className="text-slate-400 tabular-nums pt-1">{inr(s?.rate || 0)}</div>
          : d ? <NumCell label={`${name} rate`} value={+d.rate.toFixed(2)} changed={!!s && Math.abs(d.rate - s.rate) > 0.005} disabled={!canEdit} onCommit={n => onRate(d, n)} />
            : <span className="tabular-nums">{inr(l.rate2)}</span>}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums">
        {s && l.kind !== 'same' && <div className="text-[10.5px] text-slate-400">{inr(s.amount)}</div>}
        <div className={`font-bold ${removed ? 'text-slate-400' : 'text-slate-900'}`}>{removed ? '—' : inr(l.amount2)}</div>
      </td>
      <td className={`px-2 py-2.5 text-right tabular-nums font-bold ${tone(change)}`}>{Math.abs(change) >= 0.5 ? sgn(change) : l.kind === 'same' ? '' : '₹0'}</td>
      <td className="px-2 py-2.5 text-right whitespace-nowrap">
        {editable && d && (removed ? (
          <button onClick={() => onRestore(d)} title="Put it back" className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-slate-100 cursor-pointer"><Undo2 className="w-3.5 h-3.5" /></button>
        ) : (
          <>
            <button onClick={() => onReplace(d)} title="Replace with another item" className="p-1.5 rounded-lg text-slate-400 hover:text-[#3D52A0] hover:bg-slate-100 cursor-pointer"><Repeat2 className="w-3.5 h-3.5" /></button>
            <button onClick={() => onRemove(d)} title={d.signedLineId ? 'Remove from the scope' : 'Delete this line'} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
          </>
        ))}
      </td>
    </tr>
  );
};

// ── Add or replace an item ──────────────────────────────────────────────────

const ItemPicker: React.FC<{
  bank: Item[];
  rooms: string[];
  room: string;
  replacing?: DraftLine;
  onClose: () => void;
  onBank: (room: string, item: Item) => void;
  onCustom: (room: string, v: { name: string; unit: string; qty: number; rate: number; cost?: number | null; description?: string }) => void;
}> = ({ bank, rooms, room: initialRoom, replacing, onClose, onBank, onCustom }) => {
  const [q, setQ] = useState(replacing ? '' : '');
  const [room, setRoom] = useState(initialRoom);
  // A custom line's cost and margin are studio finance (lib/roleAccess).
  const finance = seesStudioFinance(useOrg().currentRole);
  const [custom, setCustom] = useState(false);
  const [v, setV] = useState({ name: '', unit: 'nos', qty: '1', rate: '', cost: '', description: '' });
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? bank.filter(b => `${b.name} ${b.cat} ${b.specs || ''}`.toLowerCase().includes(t)) : bank;
    return list.slice(0, 40);
  }, [bank, q]);
  const ok = v.name.trim() && Number(v.qty) > 0 && Number(v.rate) > 0;
  return (
    <Modal onClose={onClose}>
      <div className="px-6 pt-6 pb-3">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">{replacing ? 'Replace an item' : 'Add an item'}</div>
        <h3 className="text-[19px] font-bold tracking-tight text-slate-900 mt-0.5">{replacing ? `Replace “${displayName(replacing.name)}”` : 'From the rate bank, or a custom item'}</h3>
        <button onClick={onClose} className="absolute right-4 top-4 p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5" /></button>
        {!replacing && (
          <div className="flex items-center gap-2 mt-3 text-[12.5px]">
            <span className="text-slate-500">Room</span>
            <select value={room} onChange={e => setRoom(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 font-semibold">
              {Array.from(new Set<string>([room, ...rooms])).map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="px-6 pb-5">
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit mb-3">
          {[['From the bank', false], ['Custom item', true]].map(([t, c]) => (
            <button key={String(t)} onClick={() => setCustom(c as boolean)} className={`px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer ${custom === c ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'}`}>{t as string}</button>
          ))}
        </div>
        {!custom ? (
          <>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search the rate bank — name, category, spec" className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-[#3D52A0]/20" />
            </div>
            <div className="mt-2 max-h-[360px] overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-100">
              {hits.map(b => (
                <button key={b.id} onClick={() => onBank(room, b)} className="w-full text-left px-3.5 py-2.5 hover:bg-[#3D52A0]/[0.05] flex items-center gap-3 cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900 truncate">{displayName(b.name)}</div>
                    <div className="text-[11px] text-slate-500 truncate">Rate bank · {b.cat || 'Uncategorised'} · per {normaliseUnit(b.unit)}</div>
                  </div>
                  <span className="text-[13px] font-bold tabular-nums text-slate-800">{inr(bankSellRate(b))}</span>
                </button>
              ))}
              {!hits.length && <div className="px-3.5 py-4 text-[12.5px] text-slate-500">Nothing in the bank matches. Add it as a custom item.</div>}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Bank items bring their cost and margin, frozen at today’s values. The quantity starts at 1 — set it on the line.</p>
          </>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12.5px]">
            <input autoFocus value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="Item name" className="col-span-2 sm:col-span-4 border border-slate-200 rounded-xl px-3 py-2" />
            <input value={v.description} onChange={e => setV({ ...v, description: e.target.value })} placeholder="What it is, in a line (printed under the name)" className="col-span-2 sm:col-span-4 border border-slate-200 rounded-xl px-3 py-2" />
            <label className="space-y-1"><span className="text-[11px] text-slate-500">Unit</span><select value={v.unit} onChange={e => setV({ ...v, unit: e.target.value })} className="w-full border border-slate-200 rounded-xl px-2 py-2">{UNITS.map(u => <option key={u}>{u}</option>)}</select></label>
            <label className="space-y-1"><span className="text-[11px] text-slate-500">Quantity</span><input type="number" value={v.qty} onChange={e => setV({ ...v, qty: e.target.value })} className="sw-num w-full border border-slate-200 rounded-xl px-3 py-2 text-right" /></label>
            <label className="space-y-1"><span className="text-[11px] text-slate-500">Rate (net, per unit)</span><input type="number" value={v.rate} onChange={e => setV({ ...v, rate: e.target.value })} className="sw-num w-full border border-slate-200 rounded-xl px-3 py-2 text-right" /></label>
            <label className={`space-y-1 ${finance ? '' : 'hidden'}`}><span className="text-[11px] text-slate-500">Your cost <span className="text-slate-400">· studio only</span></span><input type="number" value={v.cost} onChange={e => setV({ ...v, cost: e.target.value })} placeholder="optional" className="sw-num w-full border border-slate-200 rounded-xl px-3 py-2 text-right" /></label>
            <div className="col-span-2 sm:col-span-4 flex items-center justify-between pt-1">
              <span className="text-[11.5px] text-slate-500 tabular-nums">{ok ? `Amount ${inr(Number(v.qty) * Number(v.rate))}${!finance ? '' : Number(v.cost) > 0 ? ` · margin ${(((Number(v.rate) - Number(v.cost)) / Number(v.rate)) * 100).toFixed(1)}%` : ' · 0% margin without a cost'}` : 'Name, quantity and rate are needed.'}</span>
              <button disabled={!ok} onClick={() => onCustom(room, { name: v.name.trim(), unit: v.unit, qty: Number(v.qty), rate: Number(v.rate), cost: Number(v.cost) > 0 ? Number(v.cost) : null, description: v.description.trim() || undefined })} className="px-4 py-2 rounded-xl bg-[#3D52A0] disabled:bg-slate-300 text-white text-[12.5px] font-bold cursor-pointer">{replacing ? 'Replace' : 'Add to the draft'}</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

// ── Import an Excel into the draft ──────────────────────────────────────────

const ImportModal: React.FC<{
  draft: ScopeDraft;
  signed: SignedLine[];
  signedBoq: any[];
  bankMap: Map<string, Item>;
  onClose: () => void;
  onMerge: (next: ScopeDraft, source: ScopeRevisionRecord['source'], costs: Record<string, number>) => void;
}> = ({ draft, signed, signedBoq, bankMap, onClose, onMerge }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [settings, setSettings] = useState<RevisionSettings | null>(null);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const edits = draft.lines.filter(l => l.source === 'edit').length;

  const sheet = sheets?.find(s => s.sheetName === chosen) || null;
  const costing = (sheets || []).find(p => p.internal && p.lines.length) || null;
  const signedRooms = Array.from(new Set<string>(signed.map(s => s.room)));

  const pick = (s: ParsedSheet | null) => {
    setChosen(s?.sheetName || null);
    if (!s) { setSettings(null); return; }
    const st = defaultSettings(signed, s);
    // Rooms the studio has already compared as a whole stay that way.
    st.sectionCompare = Object.values(st.roomMap).filter((r): r is string => !!r && draft.sectionCompare.includes(draft.roomOf[r] || r));
    setSettings(st);
    setUncertain(proposeRoomMap(signed, s.lines, s.sections).uncertain);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    setFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const parsed = wb.SheetNames.map(n => parseRevisionSheet(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }) as any[][], n));
      setSheets(parsed);
      const p = pickClientSheet(parsed);
      pick(p);
      if (!p) setError('No sheet in this file has priced items without cost columns. Export the client sheet and try again.');
    } catch (err: any) {
      setError(`That file could not be read: ${err?.message || err}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const preview = useMemo(() => (sheet && settings ? computeRevision(signed, sheet.lines, settings) : null), [sheet, settings, signed]);
  const matched = preview ? preview.rooms.filter(r => !r.compareAsSection).flatMap(r => r.lines).filter(l => l.signed && l.imported && l.kind !== 'redesign').length : 0;

  const go = () => {
    if (!sheet || !settings) return;
    const at = Date.now();
    const costs = internalCostsFor(sheet, costing);
    const start = mode === 'replace' ? startDraft(signed, signedBoq, bankMap) : draft;
    const merged = mergeExcel(start, signed, sheet, costs, costing?.sheetName || null, settings, fileName, at);
    const next = { ...merged, summary: draft.summary, roomNotes: draft.roomNotes };
    onMerge(next, { fileName, sheetName: sheet.sheetName, importedAt: at, lineCount: sheet.lines.length, listTotal: sheet.listTotal, statedTotal: sheet.statedTotal, costSheet: costing?.sheetName || null }, costs);
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="px-6 pt-6 pb-4 border-b border-slate-100">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#3D52A0]">Import into the draft</div>
        <h3 className="text-[19px] font-bold tracking-tight text-slate-900 mt-0.5 break-all">{fileName || 'A revised BOQ workbook'}</h3>
        <button onClick={onClose} className="absolute right-4 top-4 p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5" /></button>
      </div>
      <div className="px-6 py-5 space-y-4">
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full border-2 border-dashed border-slate-300 hover:border-[#3D52A0] rounded-2xl py-6 flex flex-col items-center gap-2 text-slate-600 hover:text-[#3D52A0] transition-colors cursor-pointer">
          <Upload className="w-6 h-6" />
          <span className="text-[13px] font-bold">{busy ? 'Reading…' : sheets ? 'Choose a different file' : 'Choose an .xlsx file'}</span>
          <span className="text-[11.5px] text-slate-400">Only the client sheet is read into the scope. A costing sheet gives costs for your margins, never prices.</span>
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
        {error && <Note tone="block">{error}</Note>}

        {sheets && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="text-left px-3 py-2">Sheet</th><th className="text-left px-3 py-2">Used for</th><th className="text-right px-3 py-2">Lines</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {sheets.map(sh => (
                  <tr key={sh.sheetName}>
                    <td className="px-3 py-2">
                      <label className={`flex items-center gap-2 font-semibold ${sh.internal || !sh.lines.length ? 'text-slate-500' : 'cursor-pointer text-slate-900'}`}>
                        {!sh.internal && sh.lines.length > 0 && <input type="radio" checked={chosen === sh.sheetName} onChange={() => pick(sh)} />}
                        {sh.sheetName}
                      </label>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {sh.internal ? <>Costs only, for your margins <span className="text-[9.5px] font-bold uppercase bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 ml-1">Studio only</span></>
                        : !sh.lines.length ? 'Nothing priced — not used'
                          : chosen === sh.sheetName ? <>The revised scope · {inr2(sh.listTotal)} at the sheet’s rates
                            {sh.statedTotal !== null && (Math.abs(sh.statedTotal - sh.listTotal) <= 1 ? <span className="text-emerald-700"> · matches its own total</span> : <span className="text-rose-700"> · its own total says {inr2(sh.statedTotal)}</span>)}</>
                            : 'Another client sheet'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{sh.lines.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sheet?.warnings.slice(0, 3).map((w, i) => <Note key={i} tone="warn">{w}</Note>)}

        {preview && settings && sheet && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[['Matched', matched], ['Redesigns', preview.counts.redesign], ['New', preview.counts.new], ['Whole sections', preview.rooms.filter(r => r.compareAsSection).length], ['At zero', preview.zeroImported.length]].map(([k, n]) => (
                <div key={k as string} className="rounded-xl border border-slate-200 px-3 py-2.5"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</div><div className="text-[18px] font-extrabold tabular-nums text-slate-900">{n}</div></div>
              ))}
            </div>
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1.5">Rooms — proposed from their contents, change any</div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="text-left px-3 py-2">In the sheet</th><th className="text-left px-3 py-2">Signed room</th><th className="text-left px-3 py-2">Client reads</th><th className="px-3 py-2">Whole section</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {sheet.sections.map(sec => {
                      const mapped = settings.roomMap[sec] ?? null;
                      const claimed = new Set(Object.values(settings.roomMap).filter(Boolean) as string[]);
                      return (
                        <tr key={sec} className={uncertain.includes(sec) ? 'bg-amber-50/60' : ''}>
                          <td className="px-3 py-1.5 text-slate-700">{sec}{uncertain.includes(sec) && <span className="ml-1.5 text-[9.5px] font-bold text-amber-700">CHECK</span>}</td>
                          <td className="px-3 py-1.5">
                            <select value={mapped || ''} onChange={e => {
                              const r = e.target.value || null;
                              setSettings({ ...settings, roomMap: { ...settings.roomMap, [sec]: r }, roomNames: { ...settings.roomNames, [sec]: r && r.toLowerCase() === sec.toLowerCase() ? r : settings.roomNames[sec] || roomDisplayName(sec) } });
                            }} className="border border-slate-200 rounded-lg px-2 py-1 w-full">
                              <option value="">New room</option>
                              {signedRooms.map(r => <option key={r} value={r} disabled={claimed.has(r) && r !== mapped}>{r}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-1.5"><input value={settings.roomNames[sec] || ''} onChange={e => setSettings({ ...settings, roomNames: { ...settings.roomNames, [sec]: e.target.value } })} className="border border-slate-200 rounded-lg px-2 py-1 w-full font-semibold" /></td>
                          <td className="px-3 py-1.5 text-center">
                            <input type="checkbox" disabled={!mapped} checked={!!mapped && settings.sectionCompare.includes(mapped)} onChange={e => setSettings({ ...settings, sectionCompare: e.target.checked ? [...settings.sectionCompare, mapped!] : settings.sectionCompare.filter(x => x !== mapped) })} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="space-y-1.5">
              {([
                ['merge', <><b>Merge into this draft.</b> {edits ? `Your ${edits} hand edit${edits === 1 ? '' : 's'} stay — they win over the sheet where both touch the same line.` : 'The sheet’s lines replace the draft’s; nothing you edited by hand is lost.'}</>],
                ['replace', <><b>Replace the draft with the sheet.</b> Start again from the signed scope and this Excel{edits ? `; your ${edits} hand edit${edits === 1 ? ' is' : 's are'} dropped` : ''}.</>],
              ] as const).map(([k, t]) => (
                <label key={k} className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12.5px] cursor-pointer ${mode === k ? 'border-[#3D52A0] bg-[#3D52A0]/[0.05]' : 'border-slate-200'}`}>
                  <input type="radio" className="mt-0.5" checked={mode === k} onChange={() => setMode(k)} /><span>{t}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
        <button onClick={onClose} className="px-3.5 py-2 rounded-xl text-[12.5px] font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
        <button onClick={go} disabled={!sheet || !settings} className="px-4 py-2 rounded-xl bg-[#3D52A0] hover:bg-[#334486] disabled:bg-slate-300 text-white text-[12.5px] font-bold cursor-pointer">{mode === 'merge' ? 'Merge into draft' : 'Replace the draft'}</button>
      </div>
    </Modal>
  );
};
