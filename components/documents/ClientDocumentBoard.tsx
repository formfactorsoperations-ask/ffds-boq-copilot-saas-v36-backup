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
  X,
  Search,
  Download
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
  /** Free text from the register's own filter bar. */
  search?: string;
  onSearch?: (v: string) => void;
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

/*
  The register's columns, declared once.

  The header strip and every row read these same constants. Stating a width in
  two places is how a header stops lining up with the thing it labels the first
  time either one is touched.
*/
const COL = {
  status: 'w-[172px]',
  move: 'w-[104px]',
  age: 'w-12',
  act: 'w-[196px]',
};

/** Who owes the next move, in two words, for the column that asks. */
const moveLabel = (args: {
  kind: unknown; available: boolean; gateLocked: boolean;
  court: 'mine' | 'client' | 'settled';
}): { text: string; tone: string } => {
  if (args.gateLocked || !args.available) return { text: 'Blocked', tone: 'text-slate-400' };
  if (!args.kind) return { text: 'Not shared', tone: 'text-slate-400' };
  if (args.court === 'settled') return { text: 'Settled', tone: 'text-slate-400' };
  if (args.court === 'client') return { text: 'With client', tone: 'text-[#3E4F87]' };
  return { text: 'Your move', tone: 'text-[#8A7440]' };
};

const ClientDocumentBoard: React.FC<ClientDocumentBoardProps> = ({
  projectContext,
  setProjectContext,
  projectData,
  onNavigate,
  currentUserName = 'Studio',
  currentStage,
  isExecutionGateOpen,
  isDesigner,
  search = '',
  onSearch,
}) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  /* Whose court, as a filter. On a board of a dozen documents the question is
     never "show me everything", it is "what is mine". */
  const [court, setCourt] = useState<'all' | 'mine' | 'client' | 'settled' | 'blocked'>('all');
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
    const q = search.trim().toLowerCase();
    rows
      .filter(r => court === 'all'
        ? true
        : court === 'blocked'
          ? !!r.kind && (r.gateLocked || !r.available)
          : courtOf(r) === court)
      /*
        Name, group and reference -- the three things somebody types when
        looking for a document they half remember.
      */
      .filter(r => !q
        || r.meta.name.toLowerCase().includes(q)
        || r.meta.group.toLowerCase().includes(q)
        || (r.issue?.reference || '').toLowerCase().includes(q))
      .forEach(r => {
        (out[r.meta.group] ||= []).push(r);
      });
    return out;
  }, [rows, court, acceptance, search]);

  /*
    The "needs you" summary that lived here is gone, and the derivation behind
    it with it. It counted the same documents the filter chips count, from the
    same rows, one line above them — a second tally that could only ever drift
    from the first. `Your move` does the job and filters as well as counts.
  */

  /*
    What the register knows about itself, and what the rail reports.

    Every figure below comes from `rows`, the same array the list renders, so
    the summary and the documents underneath it cannot drift apart. Most of it
    was already computed per row and thrown away: `gateLocked`, `available`,
    `openQueryCount` and `lastViewed` reached the screen nowhere at all.
  */
  const register = useMemo(() => {
    const client = rows.filter(r => courtOf(r) === 'client');
    const settled = rows.filter(r => courtOf(r) === 'settled');
    const mine = rows.filter(r => courtOf(r) === 'mine');
    const signable = rows.filter(r => !!r.kind);

    /* Held back rather than merely unfinished: a gate or a stage says no. */
    const blocked = rows.filter(r => !!r.kind && (r.gateLocked || !r.available));

    /* Sent, but no reading evidence ever came back. */
    const unopened = rows.filter(r => !!r.issue && !r.lastViewed);
    const questions = rows.reduce((n, r) => n + r.openQueryCount, 0);

    /*
      The oldest thing on the studio's side that the CLIENT is owed.

      Internal working documents count as the studio's move too, so an
      unsorted list named "Client Proposal" here -- a document nobody is
      waiting on. Only documents with a kind ever reach a client.
    */
    const oldestMine = [...mine]
      .filter(r => !!r.kind)
      .sort((a, b) => (a.issue?.issuedAt || 0) - (b.issue?.issuedAt || 0))[0];

    return {
      client, settled, mine, blocked, unopened, questions, oldestMine,
      executed: settled.length,
      signableCount: signable.length,
    };
  }, [rows, acceptance]);



  /*
    The register as a file.

    Built from `rows`, so the export says exactly what the screen says. Quotes
    are doubled rather than stripped, because a document named 6" Skirting has
    to survive the round trip into a spreadsheet.
  */
  const exportCsv = () => {
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Group', 'Document', 'Reference', 'Version', 'Status', 'Whose move', 'Issued', 'Opened', 'Open questions'];
    const lines = rows.map(r => {
      const ml = moveLabel({
        kind: r.kind, available: r.available, gateLocked: r.gateLocked,
        court: courtOf(r) as 'mine' | 'client' | 'settled',
      });
      const iso = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : '');
      return [
        r.meta.group, r.meta.name, r.issue?.reference || '', r.issue ? `v${r.issue.version}` : '',
        r.state || 'internal', ml.text, iso(r.issue?.issuedAt), iso(r.lastViewed), r.openQueryCount,
      ].map(cell).join(',');
    });
    const csv = [header.map(cell).join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `documents-${(projectContext.name || 'project').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    /*
      A locked row says why, rather than only that.

      "Locked" with a dead click told the studio nothing and offered nothing:
      the reason -- a design gate that has not cleared, or a stage not yet
      reached -- was computed on the row and shown nowhere. Opening the drawer
      is where the blockers already are.
    */
    if (r.gateLocked) return { label: 'Why blocked?', variant: 'ghost' as const, onClick: () => setExpanded(r.meta.id) };
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
        /*
          "Review & release", because that is what the click does.

          The button said "Release to client" and released nothing: it opened
          the drawer, where a second button actually sent the document. Two
          controls carrying the same verb, one of them inert, with the real one
          further from the cursor. The row now names the step it opens, and
          `openLabel` below turns it into Cancel while that drawer is open so
          the pair never sits on screen competing.
        */
        return r.readinessReady
          ? { label: 'Review & release', variant: 'dark' as const, onClick: () => { setExpanded(r.meta.id); setReleasing(r.meta.id); setAsPack(true); setReleaseNote(''); } }
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
    v === 'primary' ? 'bg-[#5468A8] hover:bg-[#3E4F87] text-white'
    : v === 'dark' ? 'bg-[#5468A8] hover:bg-[#3E4F87] text-white'
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

      {/*
        The register, and beside it what it knows.

        The board used to be a single column of rows: everything it had worked
        out about blockers, reading evidence and open questions stayed inside
        the row objects and never reached a screen. The rail is that knowledge,
        stated once, in numbers.
      */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_288px] gap-4 items-start">
      <div className="space-y-5 min-w-0">

      {/* One sentence about the whole register, above the filters it agrees with. */}
      <p className="text-[12.5px] text-slate-500 font-medium">
        <b className="text-slate-800 font-bold">{rows.length} documents</b> on this project
        {register.mine.length > 0 && <> · <b className="text-slate-800 font-bold">{register.mine.length} your move</b></>}
        {register.client.length > 0
          ? <> · {register.client.length} with the client</>
          : <> · nothing waiting on the client</>}
      </p>

      {/*
        Filters, search and the one action, on a single bar.

        The search used to be a full-width box in the page header, nowhere near
        the things it filters — and, in this view, wired to nothing. Sitting it
        with the chips makes the bar say what it is: the controls for the list
        directly beneath it.
      */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          { id: 'all',     label: 'All documents' },
          { id: 'mine',    label: 'Your move' },
          { id: 'client',  label: 'With the client' },
          { id: 'settled', label: 'Settled' },
          /* Held back by a gate or a stage. The rows knew; nothing asked. */
          { id: 'blocked', label: 'Blocked' },
        ] as const).map(f => {
          const on = court === f.id;
          const n = f.id === 'all' ? rows.length
            : f.id === 'blocked' ? register.blocked.length
            : rows.filter(r => courtOf(r) === f.id).length;
          if (f.id === 'blocked' && n === 0) return null;
          return (
            <button
              key={f.id}
              onClick={() => setCourt(f.id)}
              aria-pressed={on}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer border transition-colors ${
                on ? 'bg-[#EEF0F8] text-[#3E4F87] border-[#CDD5EA]'
                   : 'text-slate-500 border-slate-200 hover:border-[#CDD5EA] hover:text-[#3E4F87]'
              }`}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums font-extrabold opacity-70">{n}</span>
            </button>
          );
        })}

        <span className="flex-1 min-w-[12px]" />

        <div className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => onSearch?.(e.target.value)}
            placeholder="Search name, stage or ref…"
            className="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-full text-[11.5px] font-medium
                       text-slate-800 placeholder-slate-400 outline-none focus:border-[#ADBBDA] transition-colors"
          />
          {search && (
            <button
              onClick={() => onSearch?.('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={exportCsv}
          className="px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer border border-slate-200
                     text-slate-600 hover:border-[#ADBBDA] hover:text-[#3E4F87] transition-colors flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* Nothing matched — said once, rather than three empty groups. */}
      {search.trim() && Object.keys(grouped).length === 0 && (
        <p className="text-[12.5px] text-slate-500 font-medium py-6 text-center">
          No document matches <b className="text-slate-800">“{search.trim()}”</b>.
        </p>
      )}

      {/* ── The list ──────────────────────────────────────────────────── */}
      {GROUPS.map(group => {
        const items = grouped[group];
        if (!items || items.length === 0) return null;
        return (
          <div key={group} className="space-y-3">
            {/*
              The group, and how far through it this project is.

              A bare label and a count said nothing about progress; the same
              rows already know which of them are settled, so the bar is free.
            */}
            {(() => {
              const done = items.filter(r => courtOf(r) === 'settled').length;
              const pct = items.length ? Math.round((done / items.length) * 100) : 0;
              return (
                <div className="flex items-center gap-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{group}</h3>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {items.length} document{items.length === 1 ? '' : 's'}
                  </span>
                  <span className="h-1 flex-1 max-w-[150px] rounded-full bg-slate-100 overflow-hidden">
                    {/*
                      Animated on the VALUE, not on mount.

                      A scaleX entrance plays once and then never again, so
                      releasing a document moved this bar with no transition at
                      all. Animating width means the bar grows whenever the
                      group's progress actually changes, which is the only time
                      anyone is looking at it.
                    */}
                    <motion.span
                      className="block h-full rounded-full bg-[#5468A8]/60"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                  <span className="text-[11px] font-bold text-slate-400 tabular-nums w-8 text-right">{pct}%</span>
                  <span className="h-px flex-1 bg-slate-100" />
                </div>
              );
            })()}

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

            {/*
              Column headings, on the screens wide enough to have columns.

              The rows below were a loose flex: a name, some pips, an age and a
              cluster of buttons, none of them labelled. Naming them costs one
              strip and turns a list into a register you can read down.
            */}
            <div className="hidden lg:flex items-center gap-3.5 px-4 py-2 bg-slate-50/70 border-b border-slate-100">
              <span className="w-2 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-slate-400">
                Document
              </span>
              <span className={`${COL.status} shrink-0 pl-3 border-l border-slate-200/70 text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-slate-400`}>
                Status
              </span>
              <span className={`${COL.move} shrink-0 pl-3 border-l border-slate-200/70 text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-slate-400`}>
                Whose move
              </span>
              <span className={`${COL.age} shrink-0 pl-3 border-l border-slate-200/70 text-right text-[9.5px] font-extrabold uppercase tracking-[0.11em] text-slate-400`}>
                Age
              </span>
              <span className={`${COL.act} shrink-0`} aria-hidden="true" />
            </div>

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

              /* Desaturated on purpose: the dot marks state, it does not
                 compete with the document's name for attention. */
              const orb = proposalDone || settled ? 'bg-[#7FA98F]'
                : mine ? 'bg-[#D8B25E]'
                : 'bg-[#8E9BC4]';

              return (
                <motion.div
                  key={r.meta.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.18), ease: [0.22, 1, 0.36, 1] }}
                  className={`group border-b border-slate-100 last:border-b-0 transition-colors ${
                    isOpen ? 'bg-[#F8F9FC]' : 'hover:bg-slate-50/70'
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

                    {/*
                      Status, in its column.

                      The rail was `hidden lg:block` with no reserved width, so
                      rows of different states ended at different places and the
                      ages beside them never lined up. The cell is now always
                      there on lg+, whether or not it has a rail to put in it.
                    */}
                    <div className={`hidden lg:block ${COL.status} shrink-0 self-stretch pl-3 border-l border-slate-100 flex items-center`}>
                      {r.kind && r.available && !r.gateLocked ? (
                        <ProgressRail state={r.state} mode={r.mode} />
                      ) : (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                          {r.gateLocked ? 'Gate locked' : !r.available ? 'Not yet due' : 'Internal'}
                        </span>
                      )}
                    </div>

                    {/* Whose move, said in words rather than inferred from a dot. */}
                    <div className={`hidden lg:block ${COL.move} shrink-0 self-stretch pl-3 border-l border-slate-100 flex items-center`}>
                      {(() => {
                        const ml = moveLabel({
                          kind: r.kind, available: r.available, gateLocked: r.gateLocked,
                          court: proposalDone ? 'settled' : (courtOf(r) as 'mine' | 'client' | 'settled'),
                        });
                        return (
                          <span className={`text-[11px] font-bold ${ml.tone}`}>{ml.text}</span>
                        );
                      })()}
                    </div>

                    <span className={`text-[10.5px] text-slate-400 whitespace-nowrap shrink-0 ${COL.age} lg:pl-3 lg:border-l lg:border-slate-100 text-right tabular-nums`}>
                      {hand.age}
                    </span>

                    {/* Primary always; the rest on hover or focus, so twelve rows
                        are not thirty-six competing buttons. */}
                    <div className="flex items-center justify-end gap-1 shrink-0 lg:w-[196px]">
                      {/* The one action the summary line used to own. Offered
                          where it applies: sent, unopened or unsigned, quiet
                          for three days or more. */}
                      {r.issue && (r.state === 'issued' || r.state === 'viewed')
                        && Math.floor((Date.now() - r.issue.issuedAt) / 86400000) >= 3 && (
                        <button
                          onClick={() => setProjectContext(recordReminder(r.kind!, currentUserName, 'portal'))}
                          title="Log a reminder to the client"
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap text-slate-500
                                     hover:text-[#3E4F87] hover:bg-[#EEF0F8] cursor-pointer transition-all
                                     opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          Remind
                        </button>
                      )}
                      {/*
                        Edit, on the row, for anything with a workspace page.

                        A ready draft's row offered only "Review & release" —
                        the way to change the document before sending it lived
                        two clicks away inside the drawer. It joins Remind and
                        Send again in the hover cluster, so the row carries the
                        three things you might do to a document without being
                        three permanent buttons.
                      */}
                      {r.kind && r.state === 'draft' && r.readinessReady && (
                        <button
                          onClick={() => onNavigate(r.meta.id)}
                          title="Open this document in its workspace"
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap text-slate-500
                                     hover:text-[#3E4F87] hover:bg-[#EEF0F8] cursor-pointer transition-all
                                     opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          Edit
                        </button>
                      )}
                      {canSendAgain(r) && (
                        <button
                          onClick={() => sendAgain(r)}
                          title="Issue a new version to the client"
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap text-slate-500
                                     hover:text-[#3E4F87] hover:bg-[#EEF0F8] cursor-pointer transition-all
                                     opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          Send again
                        </button>
                      )}
                      {/*
                        One Release on screen at a time.

                        With the drawer open the row's trigger has done its job,
                        so it becomes the way back out rather than a second copy
                        of the button three inches below it.
                      */}
                      <button
                        onClick={isOpen && primary.variant === 'dark'
                          ? () => { setExpanded(null); setReleasing(null); }
                          : primary.onClick}
                        disabled={primary.variant === 'locked'}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${primary.variant !== 'locked' ? 'cursor-pointer' : ''} ${
                          isOpen && primary.variant === 'dark'
                            ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                            : btnCls(primary.variant)
                        }`}
                      >
                        {isOpen && primary.variant === 'dark' ? 'Cancel' : primary.label}
                      </button>
                      {r.kind && (r.available || r.gateLocked) && (
                        <button
                          onClick={() => setExpanded(isOpen ? null : r.meta.id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Hide details' : 'Show details'}
                          className="text-slate-400 hover:text-[#3E4F87] p-1.5 rounded-lg hover:bg-[#EEF0F8] cursor-pointer transition-colors"
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
                          {/*
                            Editing sits beside sending, not in a footer.

                            "Open in workspace to edit" was the last line of the
                            drawer, below the signature panel and the activity
                            log — so the one thing a studio does to a document
                            it has not sent yet was the hardest thing to find on
                            the screen. The decision here is send-or-change, so
                            both are offered at the point it is made.
                          */}
                          <div className="flex items-center justify-between gap-3">
                            <button
                              onClick={() => onNavigate(r.meta.id)}
                              className="px-3 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[12px] font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Edit first
                            </button>
                            <button
                              onClick={() => doRelease(r.kind!)}
                              className="px-4 py-2 bg-[#5468A8] hover:bg-[#3E4F87] text-white text-[12px] font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
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

                      {/*
                        Footer utilities — only where the panel above has not
                        already offered the same thing.

                        The release panel now carries "Edit first" beside the
                        send, so on a draft this footer was the second copy of
                        one link. It stays for documents already sent, where no
                        release panel renders and this is the only way through
                        to the workspace.
                      */}
                      {!(r.state === 'draft' || releasing === r.meta.id) && (
                        <div className="flex items-center gap-3 pt-1">
                          <button onClick={() => onNavigate(r.meta.id)} className="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer flex items-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5" /> Open in workspace to edit
                          </button>
                        </div>
                      )}
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

      </div>{/* ── end of the list column ─────────────────────────────── */}

      {/*
        What the register knows, in numbers.

        Nothing here is recomputed: every figure reads the same `rows` the list
        renders. These were all derived per row already and displayed nowhere —
        a document could be held back by a gate, or signed without ever having
        been opened, and no screen said so.

        Signature exposure was drafted here too and dropped: "uncovered" needs a
        definition the studio stands behind, and inventing one would put a
        confident number on a guess.
      */}
      {/*
        One card, not three floating ones.

        Three separate panels read as three unrelated widgets parked in a
        column. A register's health is one subject, so it is one surface with
        hairline rules between its parts -- and it opens on a ring, because a
        column of bare numerals gives the eye nothing to land on.
      */}
      <motion.aside
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 xl:sticky xl:top-4"
      >

        {/* ── executed, as a ring ─────────────────────────────────── */}
        {(() => {
          const total = register.signableCount;
          const done = register.executed;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const R = 26, C = 2 * Math.PI * R;
          return (
            <div className="p-4 flex items-center gap-4">
              <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
                <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                  <circle cx="32" cy="32" r={R} fill="none" stroke="#EEF1F7" strokeWidth="6" />
                  <motion.circle
                    cx="32" cy="32" r={R} fill="none" stroke="#5468A8" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={C}
                    initial={{ strokeDashoffset: C }}
                    animate={{ strokeDashoffset: C - (C * pct) / 100 }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  />
                </svg>
                <span className="absolute inset-0 grid place-items-center text-[13px] font-extrabold text-slate-800 tabular-nums">
                  {pct}%
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400">Executed</div>
                <p className="text-[15px] font-extrabold text-slate-800 mt-0.5 tabular-nums">
                  {done} <span className="text-slate-400 font-bold">of {total}</span>
                </p>
                <p className="text-[11px] text-slate-500 font-semibold leading-snug mt-0.5">
                  client documents settled
                </p>
              </div>
            </div>
          );
        })()}

        {/* ── whose move ──────────────────────────────────────────── */}
        <div className="p-4">
          <h4 className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
            Whose move
          </h4>
          <p className="text-[26px] font-extrabold text-slate-900 leading-none tracking-tight">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={register.mine.length}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6, position: 'absolute' }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="inline-block"
              >
                {register.mine.length}
              </motion.span>
            </AnimatePresence>
            <span className="text-[11.5px] font-semibold text-slate-500 ml-1.5 tracking-normal">yours</span>
          </p>
          <div className="flex gap-5 mt-3">
            <div>
              <b className="block text-[15px] font-extrabold text-slate-700 tabular-nums">{register.client.length}</b>
              <span className="text-[10px] font-bold text-slate-400">With client</span>
            </div>
            <div>
              <b className="block text-[15px] font-extrabold text-slate-700 tabular-nums">{register.settled.length}</b>
              <span className="text-[10px] font-bold text-slate-400">Settled</span>
            </div>
          </div>
          {register.oldestMine && (
            <p className="mt-2.5 text-[11.5px] text-slate-500 font-semibold leading-snug">
              Oldest: <b className="text-slate-700">{register.oldestMine.meta.name}</b>
              {!register.oldestMine.issue && <>, never released</>}
            </p>
          )}
        </div>

        {/* ── blocked ─────────────────────────────────────────────── */}
        {register.blocked.length > 0 && (
          <div className="p-4">
            <h4 className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
              Blocked
            </h4>
            <ul className="space-y-2.5">
              {register.blocked.slice(0, 4).map(r => (
                <li key={r.meta.id} className="flex gap-2 items-start">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    r.gateLocked ? 'bg-[#C08A83]' : 'bg-slate-300'
                  }`} />
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold text-slate-700 leading-snug">{r.meta.name}</div>
                    <div className="text-[11px] text-slate-400 font-medium leading-snug">
                      {r.gateLocked ? 'Design gate not open' : `Opens at stage ${r.meta.minStage}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── unread and unanswered ───────────────────────────────── */}
        {(register.unopened.length > 0 || register.questions > 0) && (
          <div className="p-4">
            <h4 className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-400 mb-2.5">
              Unread &amp; unanswered
            </h4>
            <div className="flex gap-5">
              <div>
                <b className="block text-[15px] font-extrabold text-slate-700 tabular-nums">{register.unopened.length}</b>
                <span className="text-[10px] font-bold text-slate-400">Never opened</span>
              </div>
              <div>
                <b className="block text-[15px] font-extrabold text-slate-700 tabular-nums">{register.questions}</b>
                <span className="text-[10px] font-bold text-slate-400">
                  Question{register.questions === 1 ? '' : 's'} open
                </span>
              </div>
            </div>
            {register.unopened[0] && (
              <p className="mt-2.5 text-[11.5px] text-slate-500 font-semibold leading-snug">
                <b className="text-slate-700">{register.unopened[0].meta.name}</b> sent, never opened.
              </p>
            )}
          </div>
        )}

      </motion.aside>
      </div>{/* ── end of the two-column register ─────────────────────── */}

    </div>
  );
};

export default ClientDocumentBoard;
