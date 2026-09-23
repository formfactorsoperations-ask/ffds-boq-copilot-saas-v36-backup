/**
 * CLIENT DOCUMENT BOARD
 *
 * The studio's Documents page, as one unified list.
 *
 * It replaces a layout that showed the same five documents twice — once in a
 * release panel, again in a card grid below it. Here each document is a single
 * row. Its mode (does it need a signature, an acknowledgement, or just a read),
 * its live lifecycle state, and the one thing to do with it next all sit on that
 * row. Everything else — read receipts, the activity trail, the backup signing
 * routes, the client's questions, the release confirmation, addenda — lives in a
 * drawer that opens in place, so the studio never leaves the list to act.
 *
 * The board orchestrates; it does not re-implement. Signing goes through the one
 * shared SignatureStatusPanel; questions through the one shared ClientQueryInbox;
 * lifecycle state always through the issue engine. Nothing here is a second copy
 * of logic that lives elsewhere.
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ProjectContext,
  FullProjectData,
  ClientDocumentKind,
  DocumentState
} from '../../types';
import { PROJECT_DOCUMENTS, DocMeta } from '../../lib/documentActions';
import {
  getCurrentIssue,
  resolveDocumentState,
  getIssueHistory
} from '../../services/documentIssueEngine';
import {
  RELEASABLE_DOCUMENTS,
  documentMode,
  getReleaseReadiness,
  releaseDocument,
  releasePack,
  recordReminder,
  getAddenda,
  documentTitle,
  SignatureMode
} from '../../services/documentReleaseEngine';
import { resolveApprovals } from '../../services/clientApprovalEngine';
import { getQueries } from '../../services/documentQueryEngine';
import { formatINR } from '../../lib/utils';
import { resolveProposalAcceptance, CHANNEL_LABEL } from '../../services/proposalAcceptanceService';
import { auditLegacyIssues, withdrawLegacyIssues, describeAudit } from '../../services/documentMigration';
import { useOrg } from '../../contexts/OrgContext';
import SignatureStatusPanel from './SignatureStatusPanel';
import DocumentThumbnail from './DocumentThumbnail';
import ClientQueryInbox from '../ops/ClientQueryInbox';
import {
  ChevronDown,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  Send,
  Bell,
  Eye,
  Clock,
  Lock,
  ExternalLink,
  MessageCircleQuestion,
  FileText,
  CheckCircle2,
  AlertCircle,
  Layers,
  Check,
  X
} from 'lucide-react';

interface ClientDocumentBoardProps {
  projectContext: ProjectContext;
  setProjectContext: (updater: any) => void;
  projectData?: FullProjectData;
  onNavigate: (tab: string) => void;
  currentUserName?: string;
  currentStage: number;
  isExecutionGateOpen: boolean;
  isDesigner: boolean;
}

type RowMode = SignatureMode | 'internal';

interface Row {
  meta: DocMeta;
  kind: ClientDocumentKind | null;
  mode: RowMode;
  /** Client-document lifecycle state, or null for internal working docs. */
  state: DocumentState | null;
  available: boolean;
  gateLocked: boolean;
  issue: ReturnType<typeof getCurrentIssue>;
  readinessReady: boolean;
  readinessWarnings: string[];
  readinessBlockers: string[];
  openQueryCount: number;
  addendaCount: number;
  unsignedAddenda: number;
  lastViewed?: number;
  evidence: any;
  signedBy?: string | null;
  signedAt?: string | number | null;
  recordedOffline?: boolean;
}

const GROUPS: DocMeta['group'][] = ['Proposal', 'Agreement & Design', 'Execution'];

const ago = (ts?: number | null) => {
  if (!ts) return null;
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
};

const STATE_CHIP: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Draft',        cls: 'bg-slate-100 text-slate-500 border border-slate-200' },
  issued:   { label: 'Sent',         cls: 'bg-amber-50 text-amber-800 border border-amber-200' },
  viewed:   { label: 'Opened',       cls: 'bg-amber-100 text-amber-900' },
  queried:  { label: 'Queried',      cls: 'bg-violet-100 text-violet-800' },
  amended:  { label: 'Updated',      cls: 'bg-amber-500 text-white' },
  signed:   { label: 'Signed',       cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  executed: { label: 'Executed',     cls: 'bg-emerald-600 text-white' }
};

const MODE_CHIP: Record<RowMode, { label: string; cls: string } | null> = {
  signature:   { label: 'Signature',   cls: 'bg-[#3D52A0] text-white' },
  acknowledge: { label: 'Acknowledge', cls: 'bg-slate-100 text-slate-600 border border-slate-200' },
  review:      { label: 'Review',      cls: 'border border-dashed border-slate-300 text-slate-400' },
  internal:    null
};


/*
  Where a document has got to, as a position rather than a word.

  A row said "v1 · DOC-2026-230 · signature" and "Opened today" — accurate, and
  it still made you reconstruct the sequence in your head for each of twelve
  documents. Every one of them travels the same four steps, so showing the
  track and marking the current step makes the whole board readable at a
  glance: what is still on the studio's desk, what is sitting unopened, what is
  done.
*/
const RAIL_STEPS = ['Prepared', 'Sent', 'Opened', 'Signed'] as const;

const railFor = (state: DocumentState | null, mode: RowMode): { steps: string[]; at: number } => {
  const last = mode === 'signature' ? 'Signed' : mode === 'acknowledge' ? 'Confirmed' : 'Read';
  const steps = [...RAIL_STEPS.slice(0, 3), last];
  const at =
    state === 'signed' || state === 'executed' ? 3
    : state === 'viewed' || state === 'queried' ? 2
    : state === 'issued' || state === 'amended' ? 1
    : 0;
  return { steps, at };
};

const ProgressRail: React.FC<{ state: DocumentState | null; mode: RowMode }> = ({ state, mode }) => {
  const { steps, at } = railFor(state, mode);
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${at + 1} of 4: ${steps[at]}`}>
      {steps.map((label, i) => {
        const done = i < at;
        const here = i === at;
        return (
          <React.Fragment key={label}>
            <span
              title={label}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                here ? 'w-6 bg-[#3D52A0]' : done ? 'w-3 bg-[#3D52A0]/35' : 'w-3 bg-slate-200'
              }`}
            />
          </React.Fragment>
        );
      })}
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
        {steps[at]}
      </span>
    </div>
  );
};

const ClientDocumentBoard: React.FC<ClientDocumentBoardProps> = ({
  projectContext,
  setProjectContext,
  projectData,
  onNavigate,
  currentUserName = 'Studio',
  currentStage,
  isExecutionGateOpen,
  isDesigner
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  /* Whose court, as a filter. On a board of a dozen documents the question is
     never "show me everything", it is "what is mine". */
  const [court, setCourt] = useState<'all' | 'mine' | 'client' | 'settled'>('all');
  const [releasing, setReleasing] = useState<string | null>(null);
  const [releaseNote, setReleaseNote] = useState('');
  const [asPack, setAsPack] = useState(true);

  const { orgData } = useOrg();
  // Frozen onto every release so the client's copy keeps this letterhead.
  const studioIdentity = {
    orgName: orgData?.orgName,
    officeAddress: (orgData as any)?.officeAddress,
    contactEmail: (orgData as any)?.contactEmail
  };

  // Documents released before the studio sheets existed carry a snapshot the
  // real sheets cannot render. Surfaced here so nothing is silently wrong.
  const legacyAudit = useMemo(() => auditLegacyIssues(projectContext), [projectContext]);

  const approvals = useMemo(() => resolveApprovals(projectContext, 1), [projectContext]);

  /*
    The Client Proposal has no document kind, so it had no state of its own here
    and rendered forever as "Internal working document" — even after the studio
    had recorded the client accepting it on the proposal screen. Two surfaces,
    one fact, and only one of them knew it.

    Read from the same service the proposal screen writes, so acceptance is
    canonical rather than restated. Terms, contract and handover already work
    this way through resolveApprovals.
  */
  const acceptance = useMemo(() => resolveProposalAcceptance(projectContext), [projectContext]);

  /*
    The proposal carries no document kind, so it is identified by id — and the
    id is 'client', not 'client-proposal'. Guessing it cost a whole release:
    the branch below never matched, so the board kept saying "Internal working
    document" while the proposal screen showed the acceptance.
  */
  const isProposalRow = (r: Row) => r.meta.id === 'client';

  /** Which pile a row belongs in, from the state it already renders. */
  const courtOf = (r: Row): 'mine' | 'client' | 'settled' => {
    if (isProposalRow(r)) return acceptance.accepted ? 'settled' : 'mine';
    if (r.state === 'signed' || r.state === 'executed') return 'settled';
    // 'queried' is defined as the ball being with the studio.
    if (r.openQueryCount > 0 || r.state === 'queried') return 'mine';
    if (r.state === 'issued' || r.state === 'viewed' || r.state === 'amended') return 'client';
    return 'mine';
  };

  const rows: Row[] = useMemo(() => {
    return PROJECT_DOCUMENTS.filter(d => !(isDesigner && d.money)).map(meta => {
      const kind = (meta.documentKind as ClientDocumentKind | undefined) || null;
      const available = currentStage >= meta.minStage;
      const gateLocked = !!(meta.gateGated && !isExecutionGateOpen);

      const mode: RowMode = kind
        ? documentMode(kind)
        : meta.clientVisible
          ? 'review'
          : 'internal';

      let state: DocumentState | null = null;
      let issue = null as Row['issue'];
      let readinessReady = false;
      let readinessWarnings: string[] = [];
      let readinessBlockers: string[] = [];
      let openQueryCount = 0;
      let addendaCount = 0;
      let unsignedAddenda = 0;
      let lastViewed: number | undefined;
      let evidence: any = null;
      let signedBy: string | null | undefined;
      let signedAt: string | number | null | undefined;
      let recordedOffline: boolean | undefined;

      if (kind) {
        /*
          The synthesised snapshot for a never-released document belongs to the
          surfaces that WORK on it, not to the one that reports where it stands.
          Every read of `issue` below is a status claim -- "Sent ...", the age
          column, "Never issued" -- so an unsent draft is simply not an issue
          here, and the row falls through to "Being prepared".
        */
        const rawIssue = getCurrentIssue(projectContext, kind);
        issue = rawIssue?.legacyNeverReleased ? null : rawIssue;
        state = resolveDocumentState(projectContext, kind);
        const readiness = getReleaseReadiness(kind, projectContext, projectData);
        readinessReady = readiness.ready;
        readinessWarnings = readiness.warnings;
        readinessBlockers = readiness.blockers;
        openQueryCount = getQueries(projectContext, kind).filter(q => q.status === 'open').length;
        const addenda = issue ? getAddenda(projectContext, issue.id) : [];
        addendaCount = addenda.length;
        unsignedAddenda = addenda.filter(a => !a.clientSignature).length;
        lastViewed = projectContext.documents?.lastViewedAt?.[kind];
        const agreementKind =
          kind === 'terms_docket' ? 'terms' : kind === 'execution_agreement' ? 'contract' : kind === 'handover_docket' ? 'handover' : null;
        const agreement = agreementKind ? (approvals as any)[agreementKind] : null;
        evidence = agreement?.record?.docket?.readingEvidence || null;
        signedBy = agreement?.signedBy;
        signedAt = agreement?.signedAt;
        recordedOffline = agreement?.recordedOffline;
      }

      return {
        meta, kind, mode, state, available, gateLocked, issue,
        readinessReady, readinessWarnings, readinessBlockers,
        openQueryCount, addendaCount, unsignedAddenda, lastViewed, evidence,
        signedBy, signedAt, recordedOffline
      };
    });
  }, [projectContext, projectData, approvals, currentStage, isExecutionGateOpen, isDesigner]);

  const grouped = useMemo(() => {
    const out: Record<string, Row[]> = {};
    rows
      .filter(r => court === 'all' || courtOf(r) === court)
      .forEach(r => {
        (out[r.meta.group] ||= []).push(r);
      });
    return out;
  }, [rows, court, acceptance]);

  /*
    The "needs you" summary that lived here is gone, and the derivation behind
    it with it. It counted the same documents the filter chips count, from the
    same rows, one line above them — a second tally that could only ever drift
    from the first. `Your move` does the job and filters as well as counts.
  */



  const doRelease = (kind: ClientDocumentKind) => {
    const def = RELEASABLE_DOCUMENTS.find(d => d.kind === kind);
    const kinds = asPack && def?.packWith ? [kind, ...def.packWith] : [kind];
    setProjectContext((prev: ProjectContext) =>
      releasePack(kinds, prev, projectData, {
        issuedBy: currentUserName,
        via: ['portal'],
        note: releaseNote.trim() || undefined,
        org: studioIdentity
      })(prev)
    );
    setReleasing(null);
    setReleaseNote('');
  };

  // ── Row primary action ─────────────────────────────────────────────────
  const primaryFor = (r: Row) => {
    if (r.gateLocked) return { label: 'Locked', variant: 'locked' as const, onClick: () => {} };
    if (!r.available) return { label: 'Not yet due', variant: 'locked' as const, onClick: () => {} };
    if (!r.kind) return { label: 'Open', variant: 'ghost' as const, onClick: () => onNavigate(r.meta.id) };

    switch (r.state) {
      case 'signed':
      case 'executed':
        return { label: 'Certificate', variant: 'ghost' as const, onClick: () => setExpanded(r.meta.id) };
      case 'queried':
        return { label: 'Answer question', variant: 'primary' as const, onClick: () => setExpanded(r.meta.id) };
      case 'issued':
      case 'viewed':
      case 'amended':
        return { label: 'View activity', variant: 'ghost' as const, onClick: () => setExpanded(r.meta.id) };
      default: // draft — a client document with a kind is releasable regardless
               // of mode. Review-mode docs (the onboarding kit) are still sent to
               // the client to read; they just carry no signature.
        return r.readinessReady
          ? { label: 'Release to client', variant: 'dark' as const, onClick: () => { setExpanded(r.meta.id); setReleasing(r.meta.id); setAsPack(true); setReleaseNote(''); } }
          : { label: 'Prepare', variant: 'ghost' as const, onClick: () => onNavigate(r.meta.id) };
    }
  };

  /**
   * Send an already-released document again.
   *
   * `primaryFor` offers "Release to client" only in the `draft` case, so once a
   * document had been sent there was no way to send it again from anywhere in
   * the app — the engine has always supported it (`releaseDocument` bumps the
   * version and stamps `supersedes`), the board simply never offered it.
   *
   * This reuses the same release drawer as a first send, so the studio sees the
   * note field and the pack option before anything reaches the client.
   */
  const canSendAgain = (r: Row) =>
    !!r.kind && r.available && !r.gateLocked && !!r.issue;

  const sendAgain = (r: Row) => {
    setExpanded(r.meta.id);
    setReleasing(r.meta.id);
    setAsPack(false);
    setReleaseNote('');
  };

  const btnCls = (v: string) =>
    v === 'primary' ? 'bg-[#3D52A0] hover:bg-[#334486] text-white'
    : v === 'dark' ? 'bg-[#3D52A0] hover:bg-[#334486] text-white'
    : v === 'locked' ? 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed'
    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50';

  // ── Whose court is it in ───────────────────────────────────────────────
  //
  // Every card resolves to one of four postures. The arrow direction is the
  // whole point: it names the party who owes the next move, so a grid can be
  // triaged without reading a word of the detail.
  //
  //   right  — sent, sitting with the client
  //   left   — the client came back with something; it is the studio's move
  //   done   — closed, nothing owed either way
  //   idle   — not sent; the studio still holds it
  const EDGE = {
    amber:   '#F59E0B',
    violet:  '#8B5CF6',
    emerald: '#10B981',
    slate:   '#CBD5E1'
  };


  const handoff = (r: Row) => {
    const age = r.issue
      ? (ago(r.issue.issuedAt) || 'today').replace(' days ago', 'd').replace('yesterday', '1d').replace('today', 'now')
      : '—';

    const pane = {
      amber:   { cls: 'bg-amber-50 border-amber-200 text-amber-900',     label: 'text-amber-700' },
      violet:  { cls: 'bg-violet-50 border-violet-200 text-violet-900',  label: 'text-violet-700' },
      emerald: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-900', label: 'text-emerald-700' },
      slate:   { cls: 'bg-slate-50 border-slate-200 text-slate-800',     label: 'text-slate-500' },
      blank:   { cls: 'bg-white border-slate-200 border-dashed text-slate-400', label: 'text-slate-300' }
    };

    // Signed and closed.
    if (r.state === 'signed' || r.state === 'executed') {
      return {
        edge: EDGE.emerald, age,
        /*
          Only say "Issued" when something actually was. With no issue behind
          it this read "Issued · Signed" on a document whose own signature panel
          said, correctly, that it had never been sent.
        */
        studio: r.issue
          ? { ...pane.emerald, text: `Sent ${ago(r.issue.issuedAt) || 'today'}` }
          : { ...pane.amber, text: 'Never issued' },
        arrow: { dir: 'done' as const, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
        client: {
          ...pane.emerald,
          text: `${r.recordedOffline || !r.issue ? 'Recorded' : r.mode === 'acknowledge' ? 'Confirmed' : 'Signed'}${r.signedBy ? ` · ${r.signedBy}` : ''}`,
        },
        verdict: 'Closed', verdictCls: 'text-emerald-700'
      };
    }

    // The client asked something. The ball came back.
    if (r.openQueryCount > 0) {
      return {
        edge: EDGE.violet, age,
        studio: { ...pane.violet, text: `${r.openQueryCount} question${r.openQueryCount === 1 ? '' : 's'} open` },
        arrow: { dir: 'left' as const, cls: 'bg-violet-50 border-violet-200 text-violet-700' },
        client: { ...pane.slate, text: readingLine(r) || 'Waiting on you' },
        verdict: 'Your move', verdictCls: 'text-violet-700'
      };
    }

    // Out with the client.
    if (r.state === 'issued' || r.state === 'viewed' || r.state === 'amended') {
      const waited = r.issue ? Math.floor((Date.now() - r.issue.issuedAt) / 86400000) : 0;
      return {
        edge: EDGE.amber, age,
        studio: { ...pane.amber, text: r.issue ? `Sent ${ago(r.issue.issuedAt) || 'today'}` : 'Sent' },
        arrow: { dir: 'right' as const, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
        client: {
          ...pane.slate,
          text: r.state === 'amended' ? 'Re-read pending' : readingLine(r) || 'Not opened'
        },
        verdict: waited >= 3 ? `Waiting ${waited} days` : 'With client',
        verdictCls: waited >= 3 ? 'text-amber-700' : 'text-slate-500'
      };
    }

    // Never sent — the studio still holds it.
    return {
      edge: EDGE.slate, age,
      studio: { ...pane.slate, text: r.readinessReady ? 'Ready to send' : 'Being prepared' },
      arrow: { dir: 'right' as const, cls: 'bg-slate-50 border-slate-200 text-slate-300' },
      client: { ...pane.blank, text: '—' },
      verdict: r.readinessReady ? 'Not sent yet' : (r.readinessBlockers[0] || 'Not ready'),
      verdictCls: 'text-slate-500'
    };
  };

  /** What the client actually did with it, when we know. */
  const readingLine = (r: Row): string | null => {
    if (!r.lastViewed) return null;
    const bits: string[] = [`Opened ${ago(r.lastViewed) || 'today'}`];
    const total = r.issue?.materialSections?.length || 0;
    if (total && r.evidence?.sectionsAcknowledged) {
      bits.push(`${r.evidence.sectionsAcknowledged.length} of ${total} ticked`);
    } else if (r.evidence?.totalDwellSeconds) {
      bits.push(`${Math.max(1, Math.round(r.evidence.totalDwellSeconds / 60))}m read`);
    }
    return bits.join(' · ');
  };

  const subLine = (r: Row): string => {
    if (r.gateLocked) return 'Unlocks after the Design Complete Gate';
    if (!r.available) return `Available from Stage ${r.meta.minStage}`;
    if (!r.kind) {
      return r.mode === 'review' ? 'Client can view this' : 'Internal working document';
    }
    switch (r.state) {
      case 'signed':
      case 'executed':
        /*
          Three different facts, said as three different sentences. A signature
          taken in the portal names who signed; one recorded by the studio says
          so; and a state carried only by a lifecycle gate says exactly that,
          rather than borrowing the client's name to look like evidence.
        */
        if (!r.issue && !r.signedBy) {
          return `Recorded as signed in the studio · no document was issued`;
        }
        return `${r.recordedOffline || !r.issue ? 'Recorded offline' : 'Signed'} by ${r.signedBy || 'the client'}${r.signedAt ? ` · ${new Date(r.signedAt as any).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}`;
      case 'queried':
        return `Client asked a question · ${r.openQueryCount} awaiting your reply`;
      case 'issued':
        return `Sent ${ago(r.issue?.issuedAt)} · not opened yet`;
      case 'viewed': {
        const bits = [`opened ${ago(r.lastViewed)}`];
        const secAck = r.evidence?.sectionsAcknowledged?.length || 0;
        const secTotal = r.issue?.materialSections?.length || 0;
        if (secAck > 0 && secTotal > 0) {
          bits.push(`${secAck} of ${secTotal} key terms ticked`);
        }
        return `Opened · ${bits.join(' · ')}`;
      }
      case 'amended':
        return 'Re-issued — awaiting the client to re-read';
      default:
        return r.readinessReady
          ? 'Ready to send'
          : r.readinessBlockers[0] || 'Being prepared';
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Legacy documents released before the studio sheets ────────── */}
      {((legacyAudit?.withdrawable?.length || 0) > 0 || (legacyAudit?.signedLegacy?.length || 0) > 0) && (
        <div className="bg-amber-50/70 border border-amber-300 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-amber-200/70">
            <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 grid place-items-center">
              <AlertCircle className="w-3.5 h-3.5" />
            </span>
            <span className="text-[13px] font-bold text-amber-950">
              Documents sent from the old renderer
            </span>
          </div>

          <div className="px-4 py-3 space-y-3">
            <p className="text-[12px] text-amber-900 leading-relaxed">{describeAudit(legacyAudit)}</p>

            {(legacyAudit?.withdrawable?.length || 0) > 0 && (
              <ul className="space-y-1">
                {legacyAudit.withdrawable.map(l => (
                  <li key={l.issueId} className="text-[11px] text-amber-900 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span className="font-semibold">{documentTitle(l.kind)}</span>
                    <span className="text-amber-700">
                      v{l.version} · {l.reference}
                      {l.seenByClient ? ' · client had opened it' : ' · never opened'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {(legacyAudit?.signedLegacy?.length || 0) > 0 && (
              <div className="p-2.5 rounded-lg bg-white border border-amber-200">
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  <strong>Left untouched:</strong>{' '}
                  {legacyAudit.signedLegacy.map(l => documentTitle(l.kind)).join(', ')} —
                  already signed. The signature and reading record stand; withdrawing them would
                  destroy that evidence. Issue an addendum if the wording needs to change.
                </p>
              </div>
            )}

            {(legacyAudit?.withdrawable?.length || 0) > 0 && (
              <button
                onClick={() => setProjectContext(withdrawLegacyIssues())}
                className="px-4 py-2 bg-[#3D52A0] hover:bg-[#334486] text-white text-[12px] font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Withdraw {legacyAudit.withdrawable.length} and re-release from the app
              </button>
            )}
          </div>
        </div>
      )}

      {/* Whose court. Derived from the same verdict each row already shows,
          so the filter and the rows can never disagree. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          { id: 'all',     label: 'All documents' },
          { id: 'mine',    label: 'Your move' },
          { id: 'client',  label: 'With the client' },
          { id: 'settled', label: 'Settled' },
        ] as const).map(f => {
          const on = court === f.id;
          const n = f.id === 'all' ? rows.length : rows.filter(r => courtOf(r) === f.id).length;
          return (
            <button
              key={f.id}
              onClick={() => setCourt(f.id)}
              aria-pressed={on}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer border transition-colors ${
                on ? 'bg-sky-50 text-[#334486] border-sky-200'
                   : 'text-slate-500 border-slate-200 hover:border-sky-300 hover:text-[#334486]'
              }`}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums font-extrabold opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {/* ── The list ──────────────────────────────────────────────────── */}
      {GROUPS.map(group => {
        const items = grouped[group];
        if (!items || items.length === 0) return null;
        return (
          <div key={group} className="space-y-3">
            <div className="flex items-center gap-2.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{group}</h3>
              <span className="h-px flex-1 bg-slate-100" />
              <span className="text-[11px] font-semibold text-slate-400">{items.length}</span>
            </div>

            {/*
              One document, one line.

              This was a two-column grid of cards, each carrying a coloured
              edge, a Studio pane, a Client pane, an arrow between them, a
              verdict and three buttons. Twelve of those is a wall: cards of
              unequal height, nothing to scan down, and the same information
              stated four ways on every one.

              A document is a sentence — what it is, where it has got to, and
              who owes the next move — so it is set as one. Everything else
              waits for hover or for the drawer. The list is layout-animated,
              so filtering reflows rather than repaints.
            */}
            <motion.div layout className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
            {items.map((r, i) => {
              const isOpen = expanded === r.meta.id;
              const primary = primaryFor(r);
              const hand = handoff(r);
              const mine = courtOf(r) === 'mine';
              const settled = courtOf(r) === 'settled';
              const proposalDone = isProposalRow(r) && acceptance.accepted;

              /* The one line that says where this stands. */
              const sentence = proposalDone
                ? `${acceptance.tierName || 'Proposal'}${acceptance.amount != null ? ` · ${formatINR(acceptance.amount)}` : ''} — accepted${acceptance.acceptedBy ? ` by ${acceptance.acceptedBy}` : ''}`
                : !r.kind || !r.available || r.gateLocked
                  ? subLine(r)
                  : `${hand.studio.text} · ${hand.client.text}`;

              const orb = proposalDone || settled ? 'bg-emerald-500'
                : mine ? 'bg-amber-500'
                : 'bg-violet-500';

              return (
                <motion.div
                  key={r.meta.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.18), ease: [0.22, 1, 0.36, 1] }}
                  className={`group border-b border-slate-100 last:border-b-0 transition-colors ${
                    isOpen ? 'bg-sky-50/40' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <div className="px-4 py-3 flex items-center gap-3.5">

                    {/* Whose court, before any words. Pulses only when it is ours. */}
                    <span className="relative flex w-2 h-2 shrink-0">
                      {mine && !proposalDone && (
                        <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${orb}`} />
                      )}
                      <span className={`relative inline-flex w-2 h-2 rounded-full ${orb}`} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h4 className="text-[13px] font-bold text-slate-900 leading-snug">{r.meta.name}</h4>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {[r.issue ? `v${r.issue.version}` : null, r.issue?.reference].filter(Boolean).join(' · ')}
                        </span>
                        {r.unsignedAddenda > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            +{r.unsignedAddenda} unsigned
                          </span>
                        )}
                      </div>
                      <p className="text-[11.5px] text-slate-500 font-medium mt-0.5 truncate">{sentence}</p>
                    </div>

                    {r.kind && r.available && !r.gateLocked && (
                      <div className="hidden lg:block shrink-0">
                        <ProgressRail state={r.state} mode={r.mode} />
                      </div>
                    )}

                    <span className="text-[10.5px] text-slate-400 whitespace-nowrap shrink-0 w-10 text-right">
                      {hand.age}
                    </span>

                    {/* Primary always; the rest on hover or focus, so twelve rows
                        are not thirty-six competing buttons. */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* The one action the summary line used to own. Offered
                          where it applies: sent, unopened or unsigned, quiet
                          for three days or more. */}
                      {r.issue && (r.state === 'issued' || r.state === 'viewed')
                        && Math.floor((Date.now() - r.issue.issuedAt) / 86400000) >= 3 && (
                        <button
                          onClick={() => setProjectContext(recordReminder(r.kind!, currentUserName, 'portal'))}
                          title="Log a reminder to the client"
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap text-slate-500
                                     hover:text-[#334486] hover:bg-sky-50 cursor-pointer transition-all
                                     opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          Remind
                        </button>
                      )}
                      {canSendAgain(r) && (
                        <button
                          onClick={() => sendAgain(r)}
                          title="Issue a new version to the client"
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap text-slate-500
                                     hover:text-[#334486] hover:bg-sky-50 cursor-pointer transition-all
                                     opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          Send again
                        </button>
                      )}
                      <button
                        onClick={primary.onClick}
                        disabled={primary.variant === 'locked'}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${primary.variant !== 'locked' ? 'cursor-pointer' : ''} ${btnCls(primary.variant)}`}
                      >
                        {primary.label}
                      </button>
                      {r.kind && r.available && !r.gateLocked && (
                        <button
                          onClick={() => setExpanded(isOpen ? null : r.meta.id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Hide details' : 'Show details'}
                          className="text-slate-400 hover:text-[#3D52A0] p-1.5 rounded-lg hover:bg-sky-50 cursor-pointer transition-colors"
                        >
                          <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }} className="block">
                            <ChevronRight className="w-4 h-4" />
                          </motion.span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Drawer ────────────────────────────────────────── */}
                  {/* Opens rather than appears. A panel this tall arriving in one
                      frame moves everything below it with no explanation; the
                      height transition shows where the space came from. */}
                  <AnimatePresence initial={false}>
                  {isOpen && r.kind && (
                    <motion.div
                      key="drawer"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                    <div className="border-t border-dashed border-slate-200 bg-slate-50/70 p-4 sm:p-5 space-y-5">
                      {/* The document itself. Once the studio has chosen to open
                          one, the first thing it should see is the paper — not a
                          description of the paper. This is the same renderer the
                          client reads, so a wrong preview means a wrong send. */}
                      {r.issue && (
                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-4 items-start">
                          <DocumentThumbnail
                            issue={r.issue}
                            studioName={studioIdentity.orgName}
                            stamp={r.state ? STATE_CHIP[r.state] : null}
                            onOpen={() => onNavigate(r.meta.id)}
                          />
                          <div className="space-y-2">
                            <h4 className="text-[13px] font-bold text-slate-900">{documentTitle(r.kind)}</h4>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                              {[
                                ['Reference', r.issue.reference],
                                ['Version', `v${r.issue.version}`],
                                ['Frozen', new Date(r.issue.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })],
                                ['Content hash', r.issue.contentHash.slice(0, 18) + '…']
                              ].map(([k, v]) => (
                                <div key={k as string}>
                                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</dt>
                                  <dd className="text-[12px] font-semibold text-slate-700 mt-0.5 break-all">{v}</dd>
                                </div>
                              ))}
                            </dl>
                            <p className="text-[11px] text-slate-500 leading-relaxed pt-1">
                              This is the frozen copy in {projectContext.clientName || 'the client'}&rsquo;s portal.
                              Editing the studio page will not change it — that takes a re-issue.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Release confirmation.
                          Also shown when the studio has asked to send an
                          already-released document again — this was gated on
                          `draft` alone, so "Send again" opened the drawer onto
                          a panel that could never render and the button did
                          nothing at all. */}
                      {(r.state === 'draft' || releasing === r.meta.id) && (
                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Send className="w-4 h-4 text-[#3D52A0]" />
                            <h4 className="text-[13px] font-bold text-slate-900">
                              {r.issue
                                ? `Re-issue ${r.meta.name} as v${(r.issue.version || 1) + 1}`
                                : `Release ${r.meta.name} to the client`}
                            </h4>
                          </div>
                          <p className="text-[12px] text-slate-600 leading-relaxed">
                            {r.issue ? (
                              <>
                                A fresh copy is frozen now. {projectContext.clientName || 'The client'} keeps
                                reading v{r.issue.version || 1} until you publish the new one from the portal
                                controls{r.issue.clientSignature || r.state === 'signed' ? ', and will be asked to sign again' : ''}.
                              </>
                            ) : (
                              <>
                                A copy is frozen now and appears in {projectContext.clientName || 'the client'}&rsquo;s
                                portal once published. Later edits here won&rsquo;t change what they read or sign.
                              </>
                            )}
                          </p>
                          {(() => {
                            const def = RELEASABLE_DOCUMENTS.find(d => d.kind === r.kind);
                            return def?.packWith && def.packWith.length > 0 ? (
                              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#3D52A0]/8 border border-[#3D52A0]/15 cursor-pointer">
                                <input type="checkbox" checked={asPack} onChange={e => setAsPack(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#3D52A0]" />
                                <span className="text-[11px] text-slate-600 leading-relaxed">
                                  <b className="text-slate-900 flex items-center gap-1"><Layers className="w-3 h-3" />Send as a pack</b>
                                  Also release {def.packWith.map(k => documentTitle(k)).join(' and ')} — these normally go together.
                                </span>
                              </label>
                            ) : null;
                          })()}
                          {r.readinessWarnings.length > 0 && (
                            <div className="space-y-1">
                              {r.readinessWarnings.map((w, i) => (
                                <p key={i} className="text-[11px] text-amber-700 flex items-start gap-1.5"><AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />{w}</p>
                              ))}
                            </div>
                          )}
                          <textarea
                            value={releasing === r.meta.id ? releaseNote : ''}
                            onFocus={() => setReleasing(r.meta.id)}
                            onChange={e => setReleaseNote(e.target.value)}
                            rows={2}
                            placeholder="Optional note to the client…"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-[12px] outline-none focus:border-[#3D52A0] resize-none"
                          />
                          <div className="flex justify-end">
                            <button
                              onClick={() => doRelease(r.kind!)}
                              className="px-4 py-2 bg-[#3D52A0] hover:bg-[#334486] text-white text-[12px] font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" /> Release
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Activity + receipt for anything sent */}
                      {r.state && r.state !== 'draft' && r.issue && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Client activity</div>
                            <ul className="text-[12px] text-slate-600 space-y-1.5">
                              <li className="flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" /><span><b className="text-slate-800">Released</b> · v{r.issue.version} {ago(r.issue.issuedAt)}</span></li>
                              {r.lastViewed && <li className="flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" /><span><b className="text-slate-800">Opened</b> {ago(r.lastViewed)}</span></li>}
                              {r.openQueryCount > 0 && <li className="flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 shrink-0" /><span><b className="text-slate-800">Asked a question</b></span></li>}
                              {(r.state === 'signed' || r.state === 'executed') && <li className="flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" /><span><b className="text-slate-800">Signed</b> by {r.signedBy || 'client'}</span></li>}
                              {(r.issue.reminders?.length || 0) > 0 && <li className="flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" /><span>{r.issue!.reminders!.length} reminder(s) sent</span></li>}
                              {r.addendaCount > 0 && <li className="flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" /><span><b className="text-slate-800">{r.addendaCount} addendum(a)</b> · {r.unsignedAddenda} awaiting signature</span></li>}
                            </ul>
                          </div>
                          {r.evidence && (
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Reading record</div>
                              <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1 text-[12px]">
                                <div className="flex justify-between"><span className="text-slate-500">Engaged</span><b className="text-slate-800 tabular-nums">{Math.floor((r.evidence.totalDwellSeconds || 0) / 60)}m {(r.evidence.totalDwellSeconds || 0) % 60}s</b></div>
                                <div className="flex justify-between"><span className="text-slate-500">Scrolled</span><b className="text-slate-800 tabular-nums">{r.evidence.maxScrollPercent}%</b></div>
                                <div className="flex justify-between"><span className="text-slate-500">Key terms</span><b className="text-slate-800 tabular-nums">{r.evidence.sectionsAcknowledged?.length || 0} of {r.issue.materialSections?.length || 0}</b></div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Questions — the shared inbox, scoped to this document */}
                      {r.openQueryCount > 0 && (
                        <ClientQueryInbox
                          projectContext={projectContext}
                          setProjectContext={setProjectContext}
                          currentUserName={currentUserName}
                          kind={r.kind}
                        />
                      )}

                      {/* Signing / certificate — the one shared panel */}
                      {r.mode === 'signature' && r.state !== 'draft' && (
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                            {r.state === 'signed' || r.state === 'executed' ? 'Signature' : 'If the client can’t sign in their portal'}
                          </div>
                          <SignatureStatusPanel
                            kind={r.kind}
                            projectContext={projectContext}
                            setProjectContext={setProjectContext}
                            projectId={projectData?.id}
                            currentUserName={currentUserName}
                            actionsOnly
                          />
                        </div>
                      )}

                      {/* Footer utilities */}
                      <div className="flex items-center gap-3 pt-1">
                        <button onClick={() => onNavigate(r.meta.id)} className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer flex items-center gap-1.5">
                          <ExternalLink className="w-3.5 h-3.5" /> Open in workspace to edit
                        </button>
                      </div>
                    </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
            </AnimatePresence>
            </motion.div>
          </div>
        );
      })}

    </div>
  );
};

export default ClientDocumentBoard;
