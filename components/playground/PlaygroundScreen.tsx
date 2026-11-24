import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PenTool, Map as MapIcon, LayoutGrid, Table2, SlidersHorizontal, Target, Plus, Search, Check, Undo2, Upload, Download,
  ChevronDown, FileText, Expand, Shrink, Receipt as ReceiptIcon, Lock, Sparkles, MapPin, X, PenLine, Zap, ChevronRight, AlertTriangle, Play,
} from 'lucide-react';
import { Button, EmptyState, LABEL, Segmented } from '../ui/kit';
import { useSeesMargins } from '../ui/HideFigures';
import type { ProjectContext, ProposalTier, Item, BoqItem, Room } from '../../types';
import { realRooms } from '../../lib/scopeBuckets';
import { boardPieces, drawOf, isHigh, isWallBacked, pieceSize, footprintOf, wallCovers, pieceItemOf } from '../../lib/playground/pieces';
import { autoPlace, type PlacedPiece } from '../../lib/playground/placing';
import { lineIssues, marginFloorFor } from '../../lib/playground/issues';
import { pricingRulesOf, playgroundTotals, isPlaygroundTier, measureOfBoq } from '../../lib/playground/pricing';
import { boqFormatOf, BOQ_FORMAT_LABEL, paintingFromPlan, syncedWholeFlat, versionPlace } from '../../lib/playground/versions';
import { withNewPlan, sketchRects, sketchFromRooms, mergeRooms, type TidyResult } from '../../lib/playground/sketch';
import { quickBuild, standardLines, sizeOf, type RoomStandards } from '../../lib/playground/quickBuild';
import { inferBasis } from '../../lib/takeoff';
import { lockedTierId } from '../../lib/scopeFlow';
import { ftin } from '../../lib/playground/geometry';
import SketchModal from './SketchModal';
import CustomItemModal from './CustomItemModal';
import { SCOPE_BUCKETS } from '../../lib/scopeBuckets';
import { CivilPanel } from './CivilParts';
import {
  civilItems, toggleRoomCivil, addWallCivil, fromBrief, missingStandardItems, briefCivilAsk, toolOf, syncedCivil, SITE_LABEL,
  type CivilTool, type CivilResult, type Segment,
} from '../../lib/playground/civil';
import ImportExcelModal from './ImportExcelModal';
import { buildStudioBook, buildClientBook, bookName } from '../../lib/playground/excelBook';
import { unitCostOf } from '../../lib/playground/excel';
import { downloadWorkbook } from '../../lib/scopeWorkbook';
import QuickBuildModal, { type QuickBuildChoice } from './QuickBuildModal';
import { sheetOf } from '../../lib/playground/planSheet';
import { placeWaitingLines } from '../../lib/playground/placeAll';
import { drawingOf } from './linePlan';
import { newPieceLine, needsPlace, pushHistory, undoHistory, type History } from '../../lib/playground/board';
import { ArtDefs } from './pieceArt';
import { inr, Ring, lineModel, type LineModel, FreshContext, type FreshState } from './playgroundUi';
import { freshOf, popWorth, popText } from '../../lib/playground/motion';
import './playground.css';
import PlanStage from './PlanStage';
import Catalogue from './Catalogue';
import RoomsLens from './RoomsLens';
import SheetLens from './SheetLens';
import TuneLens from './TuneLens';
import type { MarginFloors } from '../../lib/playground/issues';
import { Receipt, LineInspector, RoomInspector, useShareRows } from './LiveBoq';
import PlanSheetPanel from './PlanSheetPanel';
import RecipeDrawer from '../materialSpecs/RecipeDrawer';
import { artOfSpecs } from './pieceArt';
import type { MaterialSpecsBank } from '../../lib/materialSpecs';
import { gradeOf, offersUpdates, withRecipeSpecs, updatedLine, recipeOf, specsFromRecipe } from '../../lib/lineSpecs';
import { kitsOf, kitStartRooms, kitApply, kitAddsDebris, kitEstimate, kitFits, roomAsKit, type BundleLike, type SavedKit } from '../../lib/playground/kits';
import { ADDON_BUNDLES, priceForOption, type TemplateData } from '../../lib/standardPackages';
import { optionSetupOf } from '../../lib/optionSetup';
import { scopeEdit, isEmptyEdit, applyScopeEdit, namesOf } from '../../lib/playground/allOptions';
import { templateLines } from '../../lib/playground/templateBuild';
import { workLine, measureWork } from '../../lib/playground/works';
import type { Grade } from '../../lib/materialSpecs';
import { lineAmount } from '../../lib/playground/pricing';
import { KitModal, KIT_DRAG } from './KitParts';
import { ChangesPanel } from './ChangesParts';
import { AllOptionsToggle } from './AllOptionsParts';
import { RevisionIssueModal } from './RevisionParts';
import { needingReason } from '../../lib/playground/revision';
import type { ScopeRevisionRecord, RevisionResult } from '../../lib/scopeRevision';
import { optionChains, latestOf, sameOption, chainOf } from '../../lib/optionChains';
import { scopeSplit, splitPricingOf, splitLines } from '../../lib/offers';
import { gstTermsOf, scheduleFor, contractInForce } from '../../lib/paymentSchedule';
import { playgroundTierSummary } from '../../lib/playground/versions';
import { proposalValidity, withValidDays, followBoq, discountsOf, withDiscounts, withInitiationFee, withBooking } from '../../lib/playground/deal';
import { holdsFinanceRole } from '../../lib/roleAccess';
import { DealLens } from './DealParts';
import ProposalPdf from './ProposalPdf';
import MeetingView from './MeetingView';
import type { Journey } from '../../lib/playground/meeting';
import { contextWithApproved, tiersWithApproved } from '../../lib/tierApproval';
import { issueProposal, sentProposalTier } from '../../lib/playground/proposal';
import type { PaymentStructure, TermsSettings } from '../../types';
import { changesBetween } from '../../lib/playground/changes';
import { withSupply, supplyLine, supplyOf, SUPPLY_WORDS } from '../../lib/playground/supply';
import { holdPrice } from '../../lib/boqPricing';

/*
  The BOQ Playground (the approved mockup, v14): the BOQ Editor's one tab.

  One bar across the top (the version, the five lenses, the library, search,
  save, undo, import, export), and under it the lens beside the inspector:

    Plan    the flat drawn to scale, furniture on it, a price on every room
    Rooms   a card per room (was Cards)
    Sheet   every line in a grid (was Excel)
    Tune    markups by room and the client's number (comes with PR 4)
    Deal    offers, fee, GST and what the client pays (comes with PR P)

  The inspector is the Live BOQ until a line or a room is picked. Every change,
  wherever it is made, writes the same BOQ, so the lenses always agree, and one
  gesture is one undo.
*/

export type Lens = 'plan' | 'rooms' | 'sheet' | 'tune' | 'deal';
const LENSES: [Lens, string, React.ElementType, string][] = [
  ['plan', 'Plan', MapIcon, 'Was Plan Takeoff: rooms, sizes and quantities from the plan'],
  ['rooms', 'Rooms', LayoutGrid, 'Was Cards: a card per room'],
  ['sheet', 'Sheet', Table2, 'Was Excel: every line in a grid'],
  ['tune', 'Tune', SlidersHorizontal, 'Markups and the client’s number'],
  ['deal', 'Deal', Target, 'Offers, design fee, GST and what the client pays'],
];
const HINT_KEY = 'ffds.playground.hintDone';
/** The "Edit all 3" tip has been seen (once per browser). */
const ALL_TIP_KEY = 'ffds.playground.allOptionsTip';

/** A signed version, revised on the plan (PR R2): read-only, with its revision if one is open. */
export interface SignedPlayground {
  /** When the client signed it: "12 Nov 2026". */
  at: string;
  /** The revision open on the plan: a draft, with the client, or signed by them and waiting to be applied. */
  rec: ScopeRevisionRecord | null;
  revState?: 'draft' | 'issued' | 'signed';
  /** When it went to the client. */
  sentAt?: string;
  /** A revision drafted in Revision Studio instead (its number): the plan stays read-only. */
  elsewhere?: number | null;
  nextNumber: number;
  /** The revision's reference, as the document will carry it. */
  reference: string;
  /** What the revision comes to against the signed BOQ, as the document has it. */
  result: RevisionResult | null;
  onStart: () => void;
  onBoq: (next: BoqItem[]) => void;
  onReasons: (reasons: Record<string, string>) => void;
  /** Issues it; resolves to a problem in words, or null. */
  onIssue: () => Promise<string | null>;
  onWithdraw: () => void;
  onApply: () => void;
}

interface Props {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  tiers: ProposalTier[];
  setTiers: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
  tier: ProposalTier;
  bank: Item[];
  bankMap: Map<string, Item>;
  /** The BOQ is frozen: everything is shown, nothing changes. */
  readOnly: boolean;
  currentRoles?: any;
  tenantId?: string;
  /** Writes the option's BOQ whole. */
  onBoq: (next: BoqItem[]) => void;
  newId: () => string;
  onSelectTier?: (id: string) => void;
  onMakePlaygroundVersion?: () => void;
  /** The option's next version: this one is kept as it was, the copy opens to edit (PR R); from the meeting view, with the client's asks made (PR P). */
  onNewVersion?: (boq?: BoqItem[]) => void;
  /** The signed version and its revision (PR R2). */
  signed?: SignedPlayground | null;
  onSave: () => void;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  /** When Save last wrote the project (the bar says so). */
  lastSaved?: Date | null;
  onImport: () => void;
  onExportExcel?: () => void;
  onExportPdf: () => void;
  /** Opens the Item Bank picker for a room (the existing Add items dialog). */
  onAddFromBank: (room: string) => void;
  /** Opened at a line (from Pricing & Tiers): it opens on the Sheet with the line picked. */
  focusLineId?: string | null;
  /** The full grid (the Excel view as it was: statuses, linkage, notes), opened from the Sheet. */
  renderFullGrid?: () => React.ReactNode;
  /** The Material specs bank (S2): new lines take their recipe's materials, and drafts are offered newer versions. */
  specBank?: MaterialSpecsBank | null;
  /** The Owner (and Super Admin) may change a recipe from a line's Item recipe drawer. */
  canEditRecipes?: boolean;
  onSaveSpecs?: (bank: MaterialSpecsBank) => Promise<void>;
  /** Studio settings `marginFloors`: Tune never goes under them, and lines under them are flagged. */
  marginFloors?: MarginFloors | null;
  /** Studio settings `roomStandards`: each room kind's standard pieces, for the quick build (PR 5). */
  roomStandards?: RoomStandards | null;
  /** The studio's Standard templates: what the quick build fills the rooms with, as the setup wizard does. */
  templates?: TemplateData | null;
  /** Who is working, for the plan history. */
  userName?: string;
  /** The studio's name, on the client copy. */
  studioName?: string;
  /** The Owner may add an imported row's item to the Item Bank. */
  isOwner?: boolean;
  /** The studio's Room Bundles & Kits (settings `customBundles`): the library's room kits, with the standard add-ons (PR K). */
  kits?: BundleLike[];
  /** A room saved to the Item Bank as a kit. */
  onSaveKit?: (bundle: SavedKit['bundle']) => Promise<void>;
  /** Terms & Payment's stages, for the payment schedule when Money has none saved (PR P). */
  paymentStructure?: PaymentStructure | null;
  /** Terms & Payment: the proposal's validity period (PR P). */
  termsSettings?: TermsSettings | null;
  /** The lead profile's main concern: the order of the proposal's pages. */
  leadConcern?: string | null;
  /** Who else decides, from the lead profile: the proposal's one-page summary (PR B). */
  decisionMakers?: string | null;
  /** The project Timeline's programme: the proposal's timeline (PR B). */
  programme?: { designWorkDays?: number; siteWorkDays?: number } | null;
  /** Where the client is: booked, and the layout approved (lib/playground/meeting journeyOf). */
  journey?: Journey | null;
}

export default function PlaygroundScreen(props: Props) {
  const { projectContext: ctx, setProjectContext, tiers, setTiers, tier, bank, bankMap, readOnly: readOnlyProp, currentRoles, tenantId, onBoq: onBoqProp, newId,
    onSelectTier, onMakePlaygroundVersion, onNewVersion, signed, onSave, saveState, lastSaved, onImport, onExportExcel, onExportPdf, onAddFromBank, focusLineId, renderFullGrid, specBank, canEditRecipes, onSaveSpecs, marginFloors, roomStandards, templates, userName, studioName, isOwner, onSaveKit, paymentStructure, termsSettings, leadConcern, journey, decisionMakers, programme } = props;
  /* A signed version (PR R2) is read-only; a revision of it is drawn and edited here, against it. */
  const revRec = signed?.rec || null;
  const revDraft = !!revRec && signed?.revState === 'draft';
  const boq = (revRec ? revRec.playground?.boq : tier.boq) || [];
  const onBoq = revDraft ? signed!.onBoq : onBoqProp;
  /* Versions (PR R): an option's earlier version is kept as it was; only the newest is edited. */
  const vplace = useMemo(() => versionPlace(tiers, tier.id), [tiers, tier.id]);
  const superseded = !!vplace?.superseded;
  /* A frozen BOQ is changed only through a revision: a revision's draft is edited even when the BOQ is frozen. */
  /* The version the first proposal went out on is kept as it went (PR P): changes go in a new version. */
  const sentHere = !signed && !superseded && sentProposalTier(ctx) === tier.id;
  const readOnly = revDraft ? false : readOnlyProp || superseded || !!signed || sentHere;
  const seesMargins = useSeesMargins(currentRoles);
  /* Hide figures hides margins only (lib/figuresPrivacy): prices stay, and seesMargins already reads it. */
  const hideFigures = false;
  const rules = pricingRulesOf(tier);
  const format = boqFormatOf(tier);

  /* A Classic BOQ opens as it is, on the Sheet; a Playground version on the plan. */
  const [lens, setLens] = useState<Lens>(focusLineId || !isPlaygroundTier(tier) ? 'sheet' : 'plan');
  const [sel, setSel] = useState<string | null>(focusLineId || null);
  const [selRoom, setSelRoom] = useState<string | null>(null);
  const [libOpen, setLibOpen] = useState(true);
  const [insOpen, setInsOpen] = useState(true);
  const [q, setQ] = useState('');
  const [hist, setHist] = useState<History<BoqItem[]>>({ past: [], future: [] });
  const [note, setNote] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [menu, setMenu] = useState<'ver' | 'export' | 'plan' | null>(null);
  const [planModal, setPlanModal] = useState(false);
  const [sketching, setSketching] = useState(false);
  const [building, setBuilding] = useState(false);
  /* The client's drawing under the rooms, for checking them against it; off by default. */
  const [showDrawing, setShowDrawing] = useState(false);
  const [importing, setImporting] = useState(false);
  /* The plan's layer (PR C): Interiors, the furniture; Civil, the civil work and its tools. */
  const [layer, setLayer] = useState<'int' | 'civ'>('int');
  const [civilTool, setCivilTool] = useState<CivilTool | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  /* What the last edit did, played once (PR 7, lib/playground/motion): the BOQ and the price before it. */
  const [fresh, setFresh] = useState<FreshState | null>(null);
  const pending = useRef<{ boq: BoqItem[]; sell: number } | null>(null);
  const [fullGrid, setFullGrid] = useState(false);
  const [recipeItemId, setRecipeItemId] = useState<string | null>(null);
  /* The first-proposal PDF (PR P), over the screen; and once the layout is approved, the meeting view. */
  const [pdfOpen, setPdfOpen] = useState(false);
  const [meeting, setMeeting] = useState(false);
  const layoutApproved = !!journey?.layoutApproved;
  /* No drawing reaches the client until the layout is approved (the drawing gate): before that, Present is the PDF. */
  const present = () => (layoutApproved ? setMeeting(true) : setPdfOpen(true));
  /* S2: the option's grade picks each recipe's column; a draft is offered newer versions. */
  const grade = gradeOf(tier);
  const offer = !!specBank && offersUpdates(tier, ctx, readOnly);
  const spec = useMemo(() => (specBank ? { bank: specBank, offer } : undefined), [specBank, offer]);
  /* A Classic BOQ stays as it was: its new lines keep the Item Bank's words. */
  /* A new line takes its recipe's words, and an item bought by the client or at actuals its status (PR X): it never reaches the price. */
  const prepareNew = useCallback((line: BoqItem) => withSupply(format === 'playground' ? withRecipeSpecs(line, bankMap.get(line.bankId), specBank, grade) : line, bankMap.get(line.bankId)), [bankMap, specBank, grade, format]);
  const [hint, setHint] = useState(() => { try { return !localStorage.getItem(HINT_KEY); } catch { return true; } });
  const [wide, setWide] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 1280));
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 1280);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => { if (focusLineId) { setLens('sheet'); setSel(focusLineId); } }, [focusLineId]);
  const firstTier = useRef(true);
  /* A version opened from the Deal lens opens on the Deal lens. */
  const keepLens = useRef<Lens | null>(null);
  useEffect(() => {
    if (firstTier.current) { firstTier.current = false; return; }
    setLens(keepLens.current || (isPlaygroundTier(tier) ? 'plan' : 'sheet')); setSel(null); setSelRoom(null);
    keepLens.current = null;
  }, [tier.id]);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 3200); return () => clearTimeout(t); }, [note]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as Element)?.closest?.('[data-pg-menu]')) setMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  /* ── one reading of the BOQ ── */

  const rooms: Room[] = useMemo(() => realRooms(ctx.rooms || []), [ctx.rooms]);
  const planRooms = useMemo(() => rooms.filter(r => r.plan).map(r => ({ name: r.name, plan: r.plan })), [rooms]);
  const pieces = useMemo(() => boardPieces(boq, bankMap), [boq, bankMap]);
  const measure = useMemo(() => ({ covers: wallCovers(pieces) }), [pieces]);
  const models: LineModel[] = useMemo(
    () => boq.filter(l => l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted').map(l => lineModel(l, bankMap, rules, rooms, measure, spec)),
    [boq, bankMap, rules, rooms, measure, spec],
  );
  const byId = useMemo(() => new Map(models.map(m => [m.line.id, m])), [models]);
  const totals = useMemo(() => playgroundTotals(boq, bankMap, { rules, rooms, measure }), [boq, bankMap, rules, rooms, measure]);
  const margin = totals.sell > 0 ? ((totals.sell - totals.cost) / totals.sell) * 100 : 0;

  /* ── Show changes since the version before (PR R) ── */
  const [cmp, setCmp] = useState(false);
  useEffect(() => { setCmp(false); }, [tier.id]);
  const prev = vplace?.previous;
  const prevName = prev ? `v${vplace!.n - 1}` : '';
  const changeOpts = useMemo(() => {
    if (!prev) return null;
    const baseMeasure = { covers: wallCovers(boardPieces(prev.boq || [], bankMap)) };
    return { base: { rules: pricingRulesOf(prev), rooms, measure: baseMeasure }, cur: { rules, rooms, measure } };
  }, [prev, bankMap, rooms, rules, measure]);
  /* A revision is set against the signed BOQ, priced as its documents are (the rules and rooms, as Money reads them). */
  const revOpts = useMemo(() => (revRec ? { base: { rules, rooms, measure: measureOfBoq(tier.boq, bankMap) }, cur: { rules, rooms, measure } } : null), [revRec, rules, rooms, tier.boq, bankMap, measure]);
  const changes = useMemo(() => (revRec && revOpts ? changesBetween(tier.boq || [], boq, bankMap, revOpts)
    : cmp && prev && changeOpts ? changesBetween(prev.boq || [], boq, bankMap, changeOpts) : null), [revRec, revOpts, tier.boq, cmp, prev, changeOpts, boq, bankMap]);
  const revNeed = useMemo(() => new Set((signed?.result ? needingReason(signed.result, {}) : []).map(id => id.replace(/^removed:/, ''))), [signed?.result]);
  const reasons = revRec?.playground?.reasons || {};
  const missingReasons = [...revNeed].filter(id => !(reasons[id] || '').trim()).length;
  const [issueOpen, setIssueOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const doIssue = async () => {
    if (!signed) return;
    setIssuing(true); setIssueError(null);
    try {
      const problem = await signed.onIssue();
      if (problem) { setIssueError(problem); return; }
      setIssueOpen(false);
      setNote(`${signed.reference} is in the client’s portal to sign. The signed BOQ stays the contract until they do.`);
    } finally { setIssuing(false); }
  };
  const materialName = (id: string) => specBank?.materials.find(m => m.id === id)?.name;
  const when = (t?: number) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const shares = useShareRows(models, rooms, bankMap, rules, measure);
  const floors: MarginFloors | null = marginFloors || (ctx as any)?.marginFloors || null;
  const floor = marginFloorFor(undefined, floors);
  const waiting = useMemo(() => needsPlace(boq, bankMap), [boq, bankMap]);

  /* ── the deal (PR P): the project's offers on this option, as Money reads them ── */
  const discounts = discountsOf(ctx);
  const gstTerms = useMemo(() => gstTermsOf(ctx), [ctx]);
  const dealSummary = useMemo(() => (isPlaygroundTier(tier) ? playgroundTierSummary(tier, bankMap, ctx) : tier.summary), [tier, bankMap, ctx]);
  const dealSplit = useMemo(() => scopeSplit(tier, bankMap, splitPricingOf(tier, ctx.rooms, bankMap)), [tier, bankMap, ctx.rooms]);
  const validity = proposalValidity(ctx, termsSettings, Date.now(), tier.id);
  /* Offers are written by the studio's finance roles, on an option that is not signed or kept as it was. */
  const dealLocked = readOnlyProp || superseded || !!signed || sentHere || contractInForce(ctx) || !holdsFinanceRole(currentRoles);
  /* Why, in words, with the way to where it can be changed. */
  const dealLockedWhy = !dealLocked ? null
    : superseded && vplace ? {
      text: `v${vplace.n} is kept as it was, so its deal is shown, not changed. Offers are made on v${vplace.versions.length}, the newest version of ${tier.name || 'this option'}: it is the one the proposal and Money price.`,
      action: onSelectTier ? { label: `Open v${vplace.versions.length}`, onClick: () => { keepLens.current = 'deal'; onSelectTier(vplace.latest.id); } } : undefined,
    }
    : signed || contractInForce(ctx) ? { text: 'This option is signed: its offers stay as the client signed them. A change to the scope goes through a revision.' }
    : readOnlyProp ? { text: 'The BOQ is frozen, so the deal is shown, not changed.' }
    : sentHere ? {
      text: `This version went to the client on ${when(ctx.proposal?.issuedAt)}${validity.expired ? `, and expired on ${when(validity.until.getTime())}` : `, valid until ${when(validity.until.getTime())}`}. It stays as it went: make a new version to change the deal, then send it.`,
      action: onNewVersion ? { label: 'New version', onClick: () => { keepLens.current = 'deal'; onNewVersion(); } } : undefined,
    }
    : { text: 'Offers, the design fee and the schedule are set by the Owner and the studio’s finance roles. Ask one of them to change the deal.' };
  const chains = useMemo(() => optionChains(tiers), [tiers]);
  /* The offers follow the BOQ: a changed line re-prices them, and a special price still meets its target. A sent proposal keeps its figures. */
  useEffect(() => {
    if (dealLocked) return;
    const next = followBoq(discounts, tier.id, dealSplit, { summary: dealSummary, terms: gstTerms }, (a, b) => sameOption(chains, a, b));
    if (next) setProjectContext(prev => withDiscounts(prev, next));
  }, [dealLocked, discounts, tier.id, dealSplit, dealSummary, gstTerms, chains, setProjectContext]);
  const query = useCallback((m: LineModel) => {
    const s = q.trim().toLowerCase();
    return !s || `${m.name} ${m.words} ${m.cat}`.toLowerCase().includes(s);
  }, [q]);

  /* ── writing, with undo ── */

  /*
    Edit: this option, or every option at once (lib/playground/allOptions). What
    is in the flat (added, deleted, moved, resized, its quantity) reaches each
    option's newest version; finish, rate and margin stay in the option edited.
    An option sent to the client or signed is left as it is.
  */
  const [editAll, setEditAll] = useState(false);
  const [allTip, setAllTip] = useState(() => { try { return !localStorage.getItem(ALL_TIP_KEY); } catch { return false; } });
  const doneAllTip = () => { setAllTip(false); try { localStorage.setItem(ALL_TIP_KEY, '1'); } catch { /* private window */ } };
  const optionSetup = useMemo(() => optionSetupOf(templates as any), [templates]);
  const otherOptions = useMemo(() => {
    const mine = chainOf(chains, tier.id);
    const locked = lockedTierId(ctx), sent = sentProposalTier(ctx);
    return chains.filter(c => c !== mine).map(latestOf).map(t => ({ t, held: t.id === locked ? 'signed' : t.id === sent ? 'sent to the client' : null }));
  }, [chains, tier.id, ctx]);
  const reachable = otherOptions.filter(o => !o.held);
  const fanOn = editAll && !revRec && reachable.length > 0;
  /* The Edit switch shows while there is another option to reach; the bar's longer labels then wait for a wider screen. */
  const editSwitch = !readOnly && !revRec && otherOptions.length > 0 && lens !== 'deal';
  /* An item added to every option is priced at each one's grade, as the generator prices it. */
  const priceAt = useCallback((t: ProposalTier) => (line: BoqItem): BoqItem => {
    const item = bankMap.get(line.bankId);
    if (!item) return line;
    const g = gradeOf(t);
    const priced: BoqItem = { ...line, ...priceForOption(item, optionSetup[g]) };
    const specd = boqFormatOf(t) === 'playground' ? withRecipeSpecs(priced, item, specBank, g) : priced;
    return holdPrice(withSupply(specd, item), item);
  }, [bankMap, optionSetup, specBank]);
  /* What each fanned edit changed in the other options, so Undo puts them back too. */
  const fanUndo = useRef<(Record<string, BoqItem[]> | null)[]>([]);

  const commit = useCallback((next: BoqItem[], msg?: string) => {
    if (readOnly) return;
    setHist(h => pushHistory(h, boq));
    pending.current = { boq, sell: totals.sell };
    const had = new Set(boq.map(l => l.id));
    const edit = fanOn ? scopeEdit(boq, next) : null;
    const fan = !!edit && !isEmptyEdit(edit);
    /* A line that is new in this edit holds its item's price from now on (lib/boqPricing.ts
       holdPrice), however it came in: the catalogue, a kit, Quick Build, the brief, a sheet.
       Made in every option, it is priced at this option's grade like the others. */
    onBoq(next.map(l => (had.has(l.id) ? l : fan ? priceAt(tier)(l) : holdPrice(l, bankMap.get(l.bankId)))));
    let also = '';
    if (fan) {
      const before: Record<string, BoqItem[]> = {};
      const after = new Map<string, BoqItem[]>();
      let missed = 0;
      reachable.forEach(({ t }) => {
        const r = applyScopeEdit(edit!, t.boq || [], priceAt(t), newId);
        missed += r.missed;
        if (r.applied) { before[t.id] = t.boq || []; after.set(t.id, r.boq); }
      });
      if (after.size) setTiers(ts => ts.map(t => (after.has(t.id) ? { ...t, boq: after.get(t.id)! } : t)));
      fanUndo.current.push(after.size ? before : null);
      const reached = reachable.filter(o => after.has(o.t.id)).map(o => o.t.name || 'Option');
      const held = otherOptions.filter(o => o.held);
      also = [
        reached.length ? `Also in ${namesOf(reached)}.` : '',
        held.length ? `${namesOf(held.map(o => `${o.t.name || 'Option'} (${o.held})`))} ${held.length === 1 ? 'is' : 'are'} left as ${held.length === 1 ? 'it is' : 'they are'}.` : '',
        missed ? `${missed} change${missed === 1 ? '' : 's'} had no matching line in another option.` : '',
      ].filter(Boolean).join(' ');
    } else {
      fanUndo.current.push(null);
    }
    if (fanUndo.current.length > 120) fanUndo.current.shift();
    if (msg || also) setNote([msg, also].filter(Boolean).join(' '));
  }, [boq, onBoq, readOnly, totals.sell, bankMap, fanOn, reachable, otherOptions, priceAt, tier, newId, setTiers]);
  /* Once the edit is in: new lines print in, new pieces drop, the room glows, the price change floats up. Undo shows nothing. */
  useEffect(() => {
    const p = pending.current;
    if (!p || p.boq === boq) return;
    pending.current = null;
    const f = freshOf(p.boq, boq);
    const d = totals.sell - p.sell;
    const tag = f.pop && popWorth(d) && !hideFigures ? { id: f.pop, text: popText(d), up: d > 0 } : null;
    if (!f.flash.size && !f.drop.size && !f.glow && !tag) return;
    setFresh(prev => ({ ...f, tag, key: (prev?.key || 0) + 1 }));
  }, [boq]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 1700);
    return () => clearTimeout(t);
  }, [fresh]);
  const replace = (line: BoqItem, msg?: string) => commit(boq.map(l => (l.id === line.id ? line : l)), msg);
  const replaceMany = (lines: BoqItem[]) => { const m = new Map(lines.map(l => [l.id, l])); commit(boq.map(l => m.get(l.id) || l)); };
  const remove = (ids: string[]) => { const s = new Set(ids); commit(boq.filter(l => !s.has(l.id)), `${ids.length === 1 ? 'Line' : `${ids.length} lines`} deleted. Undo puts ${ids.length === 1 ? 'it' : 'them'} back.`); if (sel && s.has(sel)) setSel(null); };
  const undo = () => {
    const r = undoHistory(hist, boq);
    if (!r) return;
    setHist(r.h); onBoq(r.state);
    /* An edit made in every option is undone in every option. */
    const back = fanUndo.current.pop();
    if (back) setTiers(ts => ts.map(t => (back[t.id] ? { ...t, boq: back[t.id] } : t)));
    setNote(back ? `Undone in ${namesOf([tier.name || 'this option', ...otherOptions.filter(o => back[o.t.id]).map(o => o.t.name || 'Option')])}.` : 'Undone.');
  };

  const probeOf = (item: Item, line?: BoqItem): PlacedPiece | null => {
    const draw = drawOf(item);
    if (!draw) return null;
    const size = line ? pieceSize(line, item, draw) : { w: draw.w, h: draw.h, d: draw.d };
    return { id: line?.id || '__new', fp: footprintOf(size), place: { x: 0, y: 0, rot: 0 }, high: isHigh(draw), wallBacked: isWallBacked(draw) };
  };
  /** A bank item added to a room: on the plan along a free wall when it draws and fits, else as a line in the room. */
  const addToRoom = (item: Item, roomName: string) => {
    const planRoom = planRooms.find(r => r.name === roomName);
    const probe = probeOf(item);
    if (planRoom && probe) {
      const at = autoPlace(probe, planRoom, pieces.filter(p => p.room === roomName));
      const made = at ? newPieceLine(item, roomName, at, newId()) : null;
      const line = made ? prepareNew(made) : null;
      if (line) { commit([...boq, line], `${item.name} added to ${roomName}.`); setSel(line.id); return; }
    }
    const line: BoqItem = prepareNew({ id: newId(), bankId: item.id, qty: 1, roomId: roomName, baseRate: item.materials });
    commit([...boq, line], probe && planRoom ? `${item.name} added to ${roomName}. No free wall fits it: drag it into place.` : `${item.name} added to ${roomName}.`);
    setSel(line.id);
  };
  /* A work from the library (civil, plumbing, electrical…): not drawn, so it joins the room it is dropped on, its
     quantity measured from that room and the sum said (lib/playground/works). */
  /* A custom item: something the Item Bank does not have, kept with the project (lib/playground/custom). */
  const [custom, setCustom] = useState<{ name: string; cat?: string } | null>(null);
  const customRooms = useMemo(() => [...realRooms(rooms).map(r => r.name), ...SCOPE_BUCKETS].filter((n, i, a) => a.indexOf(n) === i), [rooms]);
  const addCustom = (item: Item, qty: number, roomName: string) => {
    setProjectContext(p => ({ ...p, adHocItems: [...(p.adHocItems || []), item] }));
    const line = prepareNew({ id: newId(), bankId: item.id, qty, roomId: roomName, baseRate: item.materials, labor: item.labor, marginOverride: item.margin });
    commit([...boq, line], `${item.name} added to ${roomName} as a custom item. It is kept with this project, and the Item Bank keeps a copy to pick again.`);
    setSel(line.id); setSelRoom(null); setCustom(null);
  };
  const addWork = (item: Item, roomName: string | null) => {
    if (readOnly) { setNote('This option is locked: nothing can be added.'); return; }
    if (!roomName) { setNote('Click a room on the plan first, or drag the work onto a room.'); return; }
    const r = workLine(item, rooms.find(x => x.name === roomName), boq, newId);
    if ('problem' in r) { setNote(r.problem); if (r.existing) setSel(r.existing); return; }
    const line = prepareNew(r.line);
    commit([...boq, line], `${item.name} added to ${roomName}: ${line.qty} ${item.unit}, ${r.how}.`);
    setSel(line.id);
  };
  /* The room a work's + goes to: the one in hand on the plan. Never a room nobody chose. */
  const workRoom = selRoom || (sel ? byId.get(sel)?.room : null) || null;
  const workRoomReal = workRoom && rooms.some(x => x.name === workRoom) ? workRoom : null;
  const libTarget = selRoom || (sel ? byId.get(sel)?.room : null) || planRooms[0]?.name || rooms[0]?.name || 'Others';
  const placeLine = (line: BoqItem) => {
    const item = pieceItemOf(line, bankMap);
    const room = planRooms.find(r => r.name === line.roomId);
    const probe = item ? probeOf(item, line) : null;
    if (!room || !probe) { setNote(`${line.roomId || 'Its room'} is not on the plan yet.`); return; }
    const at = autoPlace(probe, room, pieces.filter(p => p.room === room.name));
    if (!at) { setNote(`${item?.name || 'It'} does not fit along a free wall in ${room.name}.`); return; }
    replace({ ...line, place: { x: at.x, y: at.y, rot: at.rot, depthFt: probe.fp.d } }, `${item?.name || 'Piece'} placed in ${room.name}.`);
  };
  const duplicate = (m: LineModel) => {
    const copy: BoqItem = { ...m.line, id: newId() };
    if (copy.place) {
      const room = planRooms.find(r => r.name === copy.roomId);
      const pi = pieceItemOf(copy, bankMap);
      const probe = pi ? probeOf(pi, copy) : null;
      const at = room && probe ? autoPlace(probe, room, pieces.filter(p => p.room === room.name)) : null;
      copy.place = at ? { ...copy.place, x: at.x, y: at.y, rot: at.rot } : { ...copy.place, x: copy.place.x + 0.5, y: copy.place.y + 0.5 };
    }
    commit([...boq, copy], `${m.name} duplicated.`);
    setSel(copy.id);
  };
  const canPaint = !boq.some(l => l.byRoom?.basis === 'wallPaint') && rooms.length > 0 && !!paintingFromPlan(bank, rooms, () => 'probe');
  const addPainting = () => { const p = paintingFromPlan(bank, rooms, newId); if (p) commit([...boq, ...p.lines], 'Painting added from the plan, shared into the rooms.'); };

  /* ── no plan yet (PR 5): a tidied sketch, a quick build, a room pulled to size ── */

  /** The project on a new plan: rooms, the plan sheet and its history; each option's pieces moved with their rooms. */
  const applyPlan = (rects: ReturnType<typeof sketchRects>, source: 'sketch' | 'blocks', extra?: (active: BoqItem[], nextRooms: Room[]) => { lines: BoqItem[]; specGrade?: ProposalTier['specGrade'] }) => {
    const np = withNewPlan({ ctx, tiers, activeTierId: tier.id, lockedTierId: lockedTierId(ctx), bankMap, rects, sheet: { source }, at: Date.now(), by: userName });
    const nextRooms = realRooms(np.rooms);
    const moved = np.tiers.find(t => t.id === tier.id)?.boq || boq;
    const more = extra ? extra(moved, nextRooms) : { lines: [] };
    setTiers(ts => ts.map(t => {
      const n = np.tiers.find(x => x.id === t.id) || t;
      if (t.id !== tier.id) return n;
      return { ...n, boq: syncedWholeFlat([...(n.boq || []), ...more.lines], nextRooms, measure, bankMap), ...(more.specGrade ? { specGrade: more.specGrade } : {}) };
    }));
    setProjectContext(p => ({ ...p, rooms: np.rooms, planSheet: np.planSheet, ...(np.planHistory ? { planHistory: np.planHistory } : {}) }));
    setHist({ past: [], future: [] });
    setSel(null); setSelRoom(null); setLens('plan'); setFitSignal(s => s + 1);
    return np;
  };
  const useSketch = (t: TidyResult) => {
    const np = applyPlan(sketchRects(t.rooms), 'sketch');
    setSketching(false);
    setNote(`Saved as the project’s plan (source: sketch). Room sizes feed the takeoff; site measurement replaces them later.${np.needsPlace ? ` ${np.needsPlace} piece${np.needsPlace === 1 ? '' : 's'} no longer fit and wait under Needs a place.` : ''}`);
  };
  /* The quick build's preview: the rooms filled from the Standard templates at a grade. */
  const quickFill = useCallback((rs: Room[], g: Grade) => {
    let n = 0;
    return templateLines({ ctx, rooms: rs, bank, templates, grade: g, boq, newId: () => `t${++n}` });
  }, [ctx, bank, templates, boq]);
  const runQuickBuild = (c: QuickBuildChoice) => {
    const qb = quickBuild({ size: c.size, carpet: c.carpet, own: rooms, bank, boq, standards: roomStandards, newId: () => '' });
    let placed = 0, waiting = 0;
    applyPlan(qb.rects, 'blocks', (active, nextRooms) => {
      /* The studio's Standard templates, as the setup wizard fills an option (lib/playground/templateBuild);
         the room standards only when the templates name nothing in this Item Bank. */
      const fromTemplates = templateLines({ ctx, rooms: nextRooms.filter(r => r.plan), bank, templates, grade: c.grade, boq: active, newId });
      const std = fromTemplates || standardLines({ rooms: nextRooms.filter(r => r.plan), bank, boq: active, standards: roomStandards, newId });
      placed = std.placed; waiting = std.waiting.length;
      const paint = [...active, ...std.lines].some(l => l.byRoom?.basis === 'wallPaint' || inferBasis(bankMap.get(l.bankId)?.name || '', bankMap.get(l.bankId)?.unit) === 'wallPaint')
        ? null : paintingFromPlan(bank, nextRooms, newId);
      const lines = [...std.lines, ...(paint?.lines || [])]
        /* A template line is already priced at its grade, as the wizard prices it: a recipe on top would charge the grade twice. */
        .map(l => (format === 'playground' && !fromTemplates ? withRecipeSpecs(l, bankMap.get(l.bankId), specBank, c.grade) : l));
      return { lines, ...(c.grade !== gradeOf(tier) ? { specGrade: c.grade } : {}) };
    });
    setProjectContext(p => ({ ...p, ...(!(Number(p.area) > 0) ? { area: c.carpet } : {}), ...(!p.config ? { config: c.size } : {}) }));
    setBuilding(false);
    setNote(`Built: ${qb.rects.length} rooms, ${placed} pieces placed${waiting ? `, ${waiting} waiting under Needs a place` : ''}. Replace the blocks with the real plan from the plan menu.`);
  };
  /* Needs a place, emptied: each waiting piece on a free wall or floor of its own room. */
  const placeWaiting = () => {
    const r = placeWaitingLines(boq, rooms, bankMap);
    if (!r.placed) { setNote('No room on the plan has space for the waiting pieces, or their rooms are not on it. Drag them in from the Rooms lens.'); return; }
    commit(r.boq, `Placed ${r.placed} piece${r.placed === 1 ? '' : 's'} in their rooms.${r.waiting ? ` ${r.waiting} still need a place: their room is not on the plan or has no space.` : ''} Undo takes it back.`);
  };

  /* ── the Civil layer (PR C): tools on the plan, a room's civil work, the brief ── */

  /* A civil line's stored quantity follows its room whatever changed it (a new scale, a traced room), so the
     Detailed BOQ, the exports and Classic readers read what the plan says. Prices already follow it live. */
  useEffect(() => {
    if (readOnly || !rooms.length || !boq.some(l => l.civil)) return;
    const synced = syncedCivil(boq, rooms, bankMap);
    if (synced.some((l, i) => l !== boq[i])) onBoq(synced);
  }, [rooms, bankMap]);  // eslint-disable-line react-hooks/exhaustive-deps


  const civilCtx = { bank, bankMap, rooms, newId, site: ctx?.propertyStatus };
  const civilLinesNow = boq.filter(l => l.civil && l.boqStatus !== 'deleted' && l.boqStatus !== 'substituted');
  const civilModels = models.filter(m => m.line.civil || (m.line.roomId === 'Whole flat' && /\bdebris\b/i.test(m.name)));
  const applyCivil = (r: CivilResult, selectLast = false) => {
    if ('problem' in r) { setNote(r.problem); return; }
    commit(r.boq, `${r.message}${r.debris ? ' Debris removal added once, across the flat.' : ''}`);
    const last = [...r.added].reverse().find(l => l.civil);
    if (selectLast && last) { setSel(last.id); setSelRoom(null); }
  };
  const pickLayer = (v: 'int' | 'civ') => {
    setLayer(v); setSel(null);
    if (v !== 'civ') setCivilTool(null);
    else if (!civilLinesNow.length) setNote('Civil layer: the furniture fades back. Pick a tool and draw, or start from the brief.');
  };
  const pickTool = (t: CivilTool) => {
    const next = civilTool === t ? null : t;
    setCivilTool(next);
    if (next) setNote(`${toolOf(next).label}: ${toolOf(next).hint.toLowerCase()}. Click the tool again, or press Esc, to stop.`);
  };
  const civilRoom = (roomName: string, tool: 'floor' | 'walls7' | 'waterproof') => {
    const room = rooms.find(r => r.name === roomName);
    if (room) applyCivil(toggleRoomCivil(boq, room, tool, civilCtx));
  };
  const civilWall = (tool: 'break' | 'build', roomName: string, segment: Segment) => {
    const room = rooms.find(r => r.name === roomName);
    if (room) applyCivil(addWallCivil(boq, tool, room, segment, civilCtx), true);
  };
  const civilBrief = () => { setCivilTool(null); applyCivil(fromBrief(boq, { ...civilCtx, project: ctx })); };
  const addCivilItems = () => {
    const items = missingStandardItems(bank, newId);
    if (!items.length) { setNote('The Item Bank has every civil item already.'); return; }
    setProjectContext(p => ({ ...p, adHocItems: [...(p.adHocItems || []), ...items] }));
    setNote(`${items.length} civil item${items.length === 1 ? '' : 's'} added to the Item Bank at starting rates: ${items.map(i => i.name).join(', ')}. Set your own rates there.`);
  };

  /* ── room kits (PR K): the Item Bank's bundles, sized from the room they land in ── */

  const kits = useMemo(() => kitsOf(props.kits, ADDON_BUNDLES as BundleLike[], bankMap), [props.kits, bankMap]);
  const kitRooms = useMemo(() => realRooms(rooms), [rooms]);
  const [kitUi, setKitUi] = useState<{ id: string; rooms: string[]; off: Record<string, boolean> } | null>(null);
  const openKit = (id: string, room?: string | null) => {
    const kit = kits.find(k => k.id === id);
    if (!kit) return;
    if (readOnly) { setNote('This option is locked: kits cannot be added.'); return; }
    setKitUi({ id, rooms: kitStartRooms(kit, kitRooms, room || (kit.kinds.length ? null : selRoom)), off: {} });
  };
  const kitOpen = kitUi ? kits.find(k => k.id === kitUi.id) || null : null;
  const amountOf = (l: BoqItem) => lineAmount(l, bankMap, { rules, rooms, measure });
  const applyKit = () => {
    if (!kitUi || !kitOpen) return;
    const r = kitApply({ kit: kitOpen, rooms: kitRooms, picked: kitUi.rooms, off: kitUi.off, boq, bank, bankMap, newId, prepare: prepareNew, ceilingHeight: Number(ctx.ceilingHeight) || undefined });
    setKitUi(null);
    if (!r) return;
    commit(r.boq, r.message);
    if (r.waiting) setTimeout(() => setNote(`${r.waiting} piece${r.waiting > 1 ? 's' : ''} found no free wall and ${r.waiting > 1 ? 'wait' : 'waits'} under Needs a place.`), 1900);
  };
  /** What a kit comes to in a room of its kind, for its card: the room picked, else the first of its kinds. */
  const kitCardEstimate = (k: (typeof kits)[number]) => {
    const room = (selRoom && kitRooms.find(r => r.name === selRoom && kitFits(k, r))) || kitRooms.find(r => (k.kinds.length ? kitFits(k, r) : r.name === libTarget));
    return room ? { room: room.name, amount: kitEstimate(k, room, { bankMap, amount: amountOf }) } : null;
  };
  const saveRoomAsKit = async (room: Room) => {
    if (!onSaveKit) return;
    const saved = roomAsKit({ room, boq, bankMap, project: ctx.name, existing: (props.kits || []) as { name: string }[], id: `kit-${Date.now().toString(36)}` });
    if (!saved) { setNote(`${room.name} has no Item Bank items to save as a kit.`); return; }
    try {
      await onSaveKit(saved.bundle);
      const n = saved.bundle.items.length;
      setNote(`Saved to Item Bank → Room Bundles & Kits as “${saved.bundle.name}”: ${n} item${n === 1 ? '' : 's'}, each with how it is sized (on a free wall, the floor, walls to 7′).${saved.skipped ? ` ${saved.skipped} line${saved.skipped === 1 ? '' : 's'} of this room’s own stayed out.` : ''}`);
    } catch {
      setNote('The kit could not be saved. Try again.');
    }
  };

  /* ── bought by the client, and at actuals (PR X): on their own list, out of every figure ── */

  const supplyPlaces = useMemo(() => [...kitRooms.map(r => r.name), 'Whole flat'], [kitRooms]);
  const addSupplied = (item: Item, room: string) => {
    if (readOnly) { setNote('This option is locked: nothing can be added.'); return; }
    const s = supplyOf(item);
    if (!s) return;
    const { line } = supplyLine({ item, room, rooms, boq, bankMap, newId });
    commit([...boq, prepareNew(line)], `${item.name} added to ${room}, ${SUPPLY_WORDS[s]}. The price stays ${inr(totals.sell)}.`);
  };

  /* ── Excel (PR 6): the studio and client copies out; a studio copy or any other sheet in ── */

  const bookMeta = () => ({ studio: studioName || 'Studio', project: ctx.name || 'Project', option: tier.name || 'Option', tierId: tier.id, roundTo100: !!rules, at: Date.now() });
  const exportBook = async (kind: 'studio' | 'client') => {
    try {
      const m = bookMeta();
      const x = { bankMap, rules, rooms, measure, specBank };
      const buf = kind === 'studio' ? await buildStudioBook(boq, x, m) : await buildClientBook(boq, x, m);
      downloadWorkbook(buf, bookName(m, kind));
      setNote(kind === 'studio' ? 'Studio copy downloaded. Edit the blue cells, then Import Excel brings it back by its Line IDs.' : 'Client copy downloaded: locked, with no costs.');
    } catch (e: any) { setNote(`The Excel file could not be made: ${e?.message || String(e)}`); }
  };
  const addImported = (lines: BoqItem[], items: Item[], msg: string, rates: (number | undefined)[]) => {
    const map = new Map([...bankMap, ...items.map(i => [i.id, i] as [string, Item])]);
    const ready = lines.map((l, i) => {
      const p = prepareNew(l);
      const rate = rates[i];
      const cost = unitCostOf(p, map);
      // The recipe's finish can move the cost: the markup is solved again so the rate still meets the sheet.
      return rate && cost > 0 && p !== l ? { ...p, marginOverride: Math.round((rate / cost - 1) * 10000) / 100 } : p;
    });
    if (items.length) setProjectContext(p => ({ ...p, adHocItems: [...(p.adHocItems || []), ...items] }));
    commit([...boq, ...ready], msg);
    setImporting(false);
  };

  const resizeRooms = (next: Room[], nextBoq: BoqItem[], changed: string[]) => {
    const all = mergeRooms(ctx.rooms || [], next.filter(r => changed.includes(r.name)));
    setProjectContext(p => ({ ...p, rooms: mergeRooms(p.rooms || [], next.filter(r => changed.includes(r.name))) }));
    const synced = syncedWholeFlat(nextBoq, realRooms(all), measure, bankMap);
    if (synced.some((l, i) => l !== boq[i])) commit(synced);
    const r = next.find(x => x.name === changed[0]);
    if (r?.plan) setNote(`${r.name} is now ${ftin(r.plan.w)} × ${ftin(r.plan.h)}, ${Math.round(r.plan.w * r.plan.h)} sq ft.${changed.length > 1 ? ` ${changed.slice(1).join(', ')} gave the same.` : ''}`);
  };

  /* Lines taken to the current versions of their materials. */
  const updateLines = (ids: string[]) => {
    if (!specBank) return;
    const set = new Set(ids);
    let n = 0;
    const next = boq.map(l => {
      if (!set.has(l.id)) return l;
      const u = updatedLine(specBank, l, bankMap.get(l.bankId));
      if (u !== l) n++;
      return u;
    });
    if (n) commit(next, `${n} line${n === 1 ? '' : 's'} updated to the latest specs.`);
    else setNote('Those lines already use the latest specs.');
  };
  const pickLine = (id: string | null) => { setSel(id); if (id) setSelRoom(null); };
  const pickRoom = (name: string | null) => { setSelRoom(name); if (name) setSel(null); };
  const step = (d: number) => {
    const i = models.findIndex(m => m.line.id === sel);
    const n = models[(i + d + models.length) % models.length];
    if (n) setSel(n.line.id);
  };

  /* Keys: Ctrl+Z undoes; on the plan, the arrows nudge, R turns, Delete deletes. */
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.key === 'Escape') { if (kitUi) { setKitUi(null); return; } if (civilTool) { setCivilTool(null); return; } setSel(null); setSelRoom(null); setMenu(null); return; }
    const line = sel ? boq.find(l => l.id === sel) : undefined;
    if (!line || readOnly || lens !== 'plan' || !line.place) return;
    const k = e.key, s = e.shiftKey ? 1 : 0.25;
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      replace({ ...line, place: { ...line.place, x: Math.round((line.place.x + (k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0)) * 100) / 100, y: Math.round((line.place.y + (k === 'ArrowUp' ? -s : k === 'ArrowDown' ? s : 0)) * 100) / 100 } });
    } else if (k === 'r' || k === 'R') {
      e.preventDefault();
      replace({ ...line, place: { ...line.place, rot: (((line.place.rot + (e.shiftKey ? -90 : 90)) % 360) + 360) % 360 } });
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault(); remove([line.id]);
    }
  };

  /* ── layout ── */

  const plan = lens === 'plan';
  const classic = format === 'classic';
  const showLib = libOpen && !readOnly && !classic && lens !== 'tune' && lens !== 'deal';
  const selModel = sel ? byId.get(sel) : undefined;
  const selRoomObj = selRoom ? rooms.find(r => r.name === selRoom) : undefined;
  const showIns = !wide || !!selModel || !!selRoomObj || (plan && insOpen);
  const sheet = sheetOf(ctx);
  const planLabel = `${(ctx.name || 'Project').split(/[–—-]/)[0].trim()} plan · ${sheet?.source === 'upload' ? 'uploaded' : sheet?.source === 'blocks' || (!sheet && planRooms.length) ? 'blocks' : sheet?.source === 'sketch' ? 'sketched' : 'from Brief'}`;
  const verDot = revRec ? 'bg-amber-500' : signed ? 'bg-emerald-500' : readOnly ? 'bg-slate-400' : format === 'playground' ? 'bg-[#3D52A0]' : 'bg-slate-400';

  const inspector = selModel ? (
    <React.Fragment key={selModel.line.id}><LineInspector
      m={selModel}
      measure={measure}
      index={models.findIndex(x => x.line.id === selModel.line.id)}
      count={models.length}
      issues={lineIssues(selModel.line, { bankMap, pieces, rooms: planRooms, floors, specBank: offer ? specBank : null })}
      rooms={rooms}
      bankMap={bankMap}
      rules={rules}
      readOnly={readOnly}
      seesMargins={seesMargins}
      hideFigures={hideFigures}
      floor={floor}
      specBank={specBank}
      offerUpdates={offer}
      onOpenRecipe={specBank ? setRecipeItemId : undefined}
      onReplace={(l, msg) => replace(l, msg)}
      onStep={step}
      onClose={() => setSel(null)}
      onDuplicate={() => duplicate(selModel)}
      onDelete={() => remove([selModel.line.id])}
      onTakeOff={() => { const { place: _p, ...rest } = selModel.line; replace(rest as BoqItem, 'Taken off the plan; the line stays in the BOQ.'); }}
      onPlace={() => placeLine(selModel.line)}
    /></React.Fragment>
  ) : selRoomObj ? (
    <React.Fragment key={selRoomObj.name}><RoomInspector
      room={selRoomObj}
      models={models.filter(m => m.room === selRoomObj.name && !m.line.byRoom)}
      shares={shares.get(selRoomObj.name) || []}
      total={totals.byRoom.get(selRoomObj.name) || 0}
      rooms={rooms}
      bankMap={bankMap}
      rules={rules}
      measure={measure}
      readOnly={readOnly}
      hideFigures={hideFigures}
      canPaint={canPaint}
      onAddPainting={addPainting}
      onSel={pickLine}
      onClose={() => setSelRoom(null)}
      onReplace={l => replace(l)}
      civilShown={layer === 'civ'}
      onCivil={format === 'playground' ? (t => civilRoom(selRoomObj.name, t)) : undefined}
      onSaveKit={format === 'playground' && onSaveKit ? () => saveRoomAsKit(selRoomObj) : undefined}
    /></React.Fragment>
  ) : changes && revRec && revOpts && signed ? (
    <ChangesPanel changes={changes} cur={boq} baseName="the signed BOQ"
      sub={signed.revState === 'draft' ? 'Draft · against the signed BOQ' : signed.revState === 'issued' ? 'With the client to sign' : 'Signed by the client'}
      bankMap={bankMap} opts={revOpts} hideFigures={hideFigures} readOnly={readOnly} materialName={materialName}
      onSel={pickLine} onRestore={l => { commit([...boq, l], `${bankMap.get(l.bankId)?.name || 'The line'} restored as it was signed.`); setSel(l.id); }}
      onHide={wide && plan ? () => setInsOpen(false) : undefined}
      revision={{
        title: `Revision ${revRec.number}`,
        parts: signed.result ? [['New', signed.result.bridge.new], ['Size and quantity', signed.result.bridge.qty], ['Rate and finish', signed.result.bridge.rate], ['Redesigned', signed.result.bridge.redesign], ['Compared by section', signed.result.bridge.section], ['Removed', signed.result.bridge.removed]] : [],
        need: revNeed, reasons, editing: revDraft,
        onReason: (id, r) => signed.onReasons({ ...reasons, [id]: r }),
        actions: signed.revState === 'draft' ? (
          <>
            <div className={`rounded-xl px-3 py-2 text-xs flex items-center gap-2 ${missingReasons ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`} role="status">
              {missingReasons ? <AlertTriangle className="w-3.5 h-3.5" aria-hidden /> : <Check className="w-3.5 h-3.5" aria-hidden />}
              <span className="flex-1">{!revNeed.size ? 'No changes yet' : missingReasons ? `${missingReasons} of ${revNeed.size} changes need a reason` : 'Every change has a reason'}</span>
            </div>
            {revNeed.size > 0 && <Button variant="primary" icon={ChevronRight} onClick={() => { setIssueError(null); setIssueOpen(true); }}>Review and issue</Button>}
          </>
        ) : signed.revState === 'issued' ? (
          <>
            <div className="rounded-xl bg-[#3D52A0]/[0.05] border border-[#3D52A0]/20 p-3 text-xs text-slate-600">Sent{signed.sentAt ? ` on ${signed.sentAt}` : ''}. The signed BOQ stays the contract until the client signs; then this revision becomes the scope.</div>
            <Button size="sm" onClick={signed.onWithdraw}>Withdraw to edit</Button>
          </>
        ) : (
          <>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">Signed by the client. Apply it to make it the contract in force: the next Detailed BOQ is issued and the payment schedule follows.</div>
            <Button variant="primary" icon={Check} onClick={signed.onApply}>Apply revision {revRec.number}</Button>
          </>
        ),
      }} />
  ) : changes && changeOpts ? (
    <ChangesPanel changes={changes} cur={boq} baseName={prevName} sub={`${prevName} · ${when(prev?.timestamp) || 'the version before'} · kept as it was`}
      bankMap={bankMap} opts={changeOpts} hideFigures={hideFigures} readOnly={readOnly} materialName={materialName}
      onSel={pickLine} onRestore={l => { commit([...boq, l], `${bankMap.get(l.bankId)?.name || (l as { name?: string }).name || "The line"} restored as it was in ${prevName}.`); setSel(l.id); }}
      onHide={wide && plan ? () => setInsOpen(false) : undefined} />
  ) : (
    <Receipt
      models={models}
      rooms={rooms}
      roomTotals={totals.byRoom}
      shares={shares}
      workTotal={totals.sell}
      tierName={tier.name}
      sel={sel}
      onSel={pickLine}
      onRoom={pickRoom}
      hideFigures={hideFigures}
      hint={hint}
      onHint={() => { setHint(false); try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private window */ } }}
      onLens={l => { setLens(l); setFitSignal(s => s + 1); }}
      onHide={wide && plan ? () => setInsOpen(false) : undefined}
      onUpdateStale={offer ? () => updateLines(models.filter(m => m.stale.length).map(m => m.line.id)) : undefined}
    />
  );

  const barBtn = 'px-2.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap';

  return (
    <FreshContext.Provider value={fresh}>
    <div onKeyDown={onKey} tabIndex={-1}
      className={`outline-none ${full ? 'fixed inset-0 z-[150] bg-slate-50 p-3 flex flex-col gap-3' : 'flex flex-col gap-3 mb-6'}`}
      style={full ? undefined : { height: wide ? 'calc(100vh - 150px)' : undefined, minHeight: wide ? 640 : undefined }}>
      <ArtDefs />

      {format === 'classic' && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3 flex items-start gap-3 hud-panel-in">
          <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 grid place-items-center shrink-0"><Table2 className="w-4 h-4" aria-hidden /></span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-800">Classic BOQ · made before the Playground · {tier.name} is {readOnly ? 'frozen' : 'a draft'}</div>
            <p className="text-xs text-slate-600 mt-0.5">It opens as it is, in Sheet and Rooms, and you edit it as before. Nothing is recalculated: amounts keep their exact figures (no ₹100 rounding), painting stays one line for the flat, and specs keep their typed words. The plan, kits, civil work, ranges and rounding come with a Playground version.</p>
          </div>
          {!readOnly && onMakePlaygroundVersion && <div className="shrink-0"><Button size="sm" variant="primary" icon={PenTool} onClick={onMakePlaygroundVersion}>Make a Playground version</Button></div>}
        </div>
      )}

      {/* The bar */}
      <div className={`rounded-2xl bg-white border p-2 flex items-center gap-2 flex-wrap shadow-sm transition-[border-color,box-shadow] duration-300 ${fanOn ? 'border-[#3D52A0]/50 ring-2 ring-[#3D52A0]/15' : 'border-slate-200/90'}`} data-editing-all={fanOn || undefined}>
        <div className="flex items-center gap-2 pl-0.5">
          <span className="w-8 h-8 rounded-xl bg-[#3D52A0] text-white grid place-items-center shrink-0" title="BOQ Playground"><PenTool className="w-4 h-4" aria-hidden /></span>
          <div className="leading-tight hidden 2xl:block">
            <div className="text-sm font-bold text-slate-800">BOQ Playground</div>
            <div className="text-[11px] text-slate-500 tabular-nums">{models.length} lines</div>
          </div>
        </div>

        <div className="relative" data-pg-menu>
          <button type="button" onClick={() => setMenu(m => (m === 'ver' ? null : 'ver'))} aria-expanded={menu === 'ver'} title="Versions"
            className="pl-2.5 pr-1.5 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-2 text-left">
            <span className={`w-2 h-2 rounded-full ${verDot}`} />
            <span className="leading-tight">
              <span className="block text-xs font-bold text-slate-800 whitespace-nowrap max-w-[160px] truncate">{tier.name}{vplace && vplace.versions.length > 1 ? ` · v${vplace.n}` : ''}</span>
              <span className="block text-[10px] text-slate-500 whitespace-nowrap">{revRec ? `Revision ${revRec.number} · ${signed!.revState === 'draft' ? 'Draft' : signed!.revState === 'issued' ? 'With the client' : 'Signed by the client'}` : signed ? `Signed · ${signed.at}` : `${BOQ_FORMAT_LABEL[format]} · ${readOnlyProp ? 'Frozen' : superseded ? 'Kept as it was' : sentHere ? `Sent ${when(ctx.proposal?.issuedAt)}` : 'Draft'}`}</span>
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden />
          </button>
          {menu === 'ver' && (
            <div className="absolute left-0 top-full mt-1.5 z-40 w-[300px] rounded-2xl bg-white border border-slate-200 shadow-2xl p-1.5 hud-panel-in">
              {vplace && (
                <>
                  <div className={`${LABEL} px-3 pt-1.5 pb-1`}>Versions of {tier.name}</div>
                  {[...vplace.versions].reverse().map(v => {
                    const i = vplace.versions.indexOf(v) + 1;
                    const newest = v.id === vplace.latest.id;
                    return (
                      <button key={v.id} type="button" onClick={() => { if (v.id !== tier.id) onSelectTier?.(v.id); setMenu(null); }}
                        className={`w-full text-left px-3 py-2 rounded-xl flex items-start gap-2 ${v.id === tier.id ? 'bg-[#3D52A0]/[0.06]' : 'hover:bg-slate-50'}`}>
                        <span className="w-4 mt-0.5 text-[#3D52A0]">{v.id === tier.id && <Check className="w-4 h-4" aria-hidden />}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-800">v{i} · {newest ? (readOnlyProp ? 'Frozen' : 'Draft') : 'Kept as it was'}</span>
                          <span className="block text-[11px] text-slate-500">{newest ? (v.id === tier.id ? 'Editing now' : 'The newest version') : `${when(v.timestamp) || 'Earlier'} · read-only`}{boqFormatOf(v) !== format ? ` · ${BOQ_FORMAT_LABEL[boqFormatOf(v)]}` : ''}</span>
                        </span>
                      </button>
                    );
                  })}
                  {prev && (
                    <label className="mx-1.5 my-1 px-2.5 py-2 rounded-xl bg-slate-50 flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={cmp} onChange={e => { setCmp(e.target.checked); if (e.target.checked) { setSel(null); setSelRoom(null); setInsOpen(true); } }} className="w-4 h-4 accent-[#3D52A0]" />
                      Show changes since {prevName}
                    </label>
                  )}
                  {onNewVersion && (!readOnly || sentHere) && format === 'playground' && (
                    <button type="button" onClick={() => { setMenu(null); onNewVersion(); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 flex items-start gap-2">
                      <span className="w-4 mt-0.5" />
                      <span><span className="block text-sm font-semibold text-slate-800">New version</span><span className="block text-[11px] text-slate-500">Keep v{vplace.n} as it is, edit v{vplace.n + 1}</span></span>
                    </button>
                  )}
                </>
              )}
              {(() => {
                const others = optionChains(tiers).filter(c => !c.versions.some(v => v.id === tier.id)).map(latestOf);
                return others.length > 0 && (
                  <div className={vplace ? 'border-t border-slate-100 mt-1.5 pt-1.5' : ''}>
                    <div className={`${LABEL} px-3 pt-1.5 pb-1`}>Other options on this project</div>
                    {others.map(t => (
                      <button key={t.id} type="button" onClick={() => { onSelectTier?.(t.id); setMenu(null); }}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-slate-50">
                        <span className={`w-2 h-2 rounded-full ${boqFormatOf(t) === 'playground' ? 'bg-[#3D52A0]' : 'bg-slate-400'}`} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-slate-800 truncate">{t.name}</span>
                          <span className="block text-[11px] text-slate-500">{BOQ_FORMAT_LABEL[boqFormatOf(t)]} · {(t.boq || []).length} lines</span>
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })()}
              {format === 'classic' && !readOnly && onMakePlaygroundVersion && (
                <button type="button" onClick={() => { setMenu(null); onMakePlaygroundVersion(); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-sm font-semibold text-[#3D52A0] inline-flex items-center gap-2">
                  <Sparkles className="w-4 h-4" aria-hidden />Make a Playground version
                </button>
              )}
            </div>
          )}
        </div>

        {editSwitch && (
          <AllOptionsToggle count={otherOptions.length + 1} on={editAll} coach={allTip && !editAll}
            names={namesOf(otherOptions.map(o => o.t.name || 'Option'))} onCoachDone={doneAllTip}
            onChange={on => {
              setEditAll(on);
              if (on) doneAllTip();
              const held = otherOptions.filter(o => o.held);
              setNote(!on ? `Edits stay in ${tier.name || 'this option'} again.` : reachable.length
                ? `Editing all ${otherOptions.length + 1} options: what you add, delete, move or resize goes into ${namesOf(reachable.map(o => o.t.name || 'Option'))} too. Finish, rate and margin stay in each option.${held.length ? ` ${namesOf(held.map(o => `${o.t.name || 'Option'} (${o.held})`))} ${held.length === 1 ? 'is' : 'are'} left as ${held.length === 1 ? 'it is' : 'they are'}.` : ''}`
                : 'The other options are sent or signed, so edits stay in this one.');
            }} />
        )}

        {signed && !revRec && !signed.elsewhere && !superseded && (
          <Button size="sm" variant="primary" icon={PenLine} onClick={signed.onStart}>Start revision {signed.nextNumber}</Button>
        )}
        {revDraft && revNeed.size > 0 && <Button size="sm" variant="primary" icon={ChevronRight} onClick={() => { setIssueError(null); setIssueOpen(true); }}>Review and issue</Button>}

        <Segmented<Lens> size="sm" label="Lens" value={lens}
          onChange={l => { setLens(l); if (l === 'plan') setFitSignal(s => s + 1); }}
          options={LENSES.map(([id, n, I, tt]) => ({ id, label: <span title={tt} className="inline-flex items-center gap-1.5"><I className="w-3.5 h-3.5" aria-hidden />{n}</span> }))} />

        {lens !== 'tune' && lens !== 'deal' && !readOnly && !classic && (
          <button type="button" onClick={() => setLibOpen(o => !o)} aria-pressed={libOpen}
            className={`${barBtn} px-3 border ${libOpen ? 'bg-[#3D52A0]/10 border-[#3D52A0]/30 text-[#3D52A0]' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            <Plus className="w-3.5 h-3.5" aria-hidden /><span className={editSwitch ? 'min-[1800px]:hidden' : 'min-[1400px]:hidden'}>Add</span><span className={editSwitch ? 'hidden min-[1800px]:inline' : 'hidden min-[1400px]:inline'}>Add items</span>
          </button>
        )}

        <div className="relative grow basis-[150px] min-w-[150px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items…" aria-label="Search items"
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50/70 border border-slate-200/80 rounded-xl text-sm outline-none focus:border-[#3D52A0]" />
        </div>

        {!plan && !hideFigures && (
          <span className="hidden xl:inline text-xs text-slate-500 whitespace-nowrap">
            <b className="text-slate-800 tabular-nums">{inr(totals.sell)}</b>{seesMargins ? ` · ${margin.toFixed(1)}%` : ''}
          </span>
        )}

        <button type="button" onClick={onSave} disabled={saveState === 'saving'} title="Saves now; edits also save on their own"
          className={`${barBtn} px-3 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}>
          <Check className="w-3.5 h-3.5" aria-hidden /><span className={editSwitch ? 'min-[1800px]:hidden' : 'min-[1400px]:hidden'}>{saveState === 'saving' ? 'Saving…' : 'Save'}</span><span className={editSwitch ? 'hidden min-[1800px]:inline' : 'hidden min-[1400px]:inline'}>{saveState === 'saving' ? 'Saving…' : 'Save changes'}</span>
        </button>
        {saveState === 'saved' && lastSaved && (
          <span className="text-[11px] text-slate-500 whitespace-nowrap" data-saved>Saved {lastSaved.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        )}
        {saveState === 'error' && <span role="alert" className="text-[11px] font-semibold text-rose-600 whitespace-nowrap">Couldn’t save. Try again.</span>}
        <button type="button" onClick={undo} disabled={!hist.past.length} aria-label="Undo" title="Undo (Ctrl+Z)" className="p-1.5 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-30">
          <Undo2 className="w-4 h-4" aria-hidden />
        </button>
        {!readOnly && (
          <button type="button" onClick={classic ? onImport : () => setImporting(true)} disabled={readOnly && !classic} title="Import Excel" className={`${barBtn} bg-[#3D52A0]/[0.06] border border-[#3D52A0]/20 text-[#334486]`}>
            <Upload className="w-3.5 h-3.5" aria-hidden /><span className={editSwitch ? 'hidden min-[1800px]:inline' : 'hidden 2xl:inline'}>Import Excel</span><span className={editSwitch ? 'hidden' : '2xl:hidden'}>Import</span>
          </button>
        )}
        <div className="relative" data-pg-menu>
          <button type="button" onClick={() => setMenu(m => (m === 'export' ? null : 'export'))} aria-expanded={menu === 'export'} title="Export" className={`${barBtn} border border-slate-200 text-slate-700`}>
            <Download className="w-3.5 h-3.5" aria-hidden />Export<ChevronDown className="w-3 h-3" aria-hidden />
          </button>
          {menu === 'export' && (
            <div className={`absolute right-0 top-full mt-1.5 z-40 ${classic ? 'w-[260px]' : 'w-[340px]'} rounded-2xl bg-white border border-slate-200 shadow-2xl p-1.5 hud-panel-in`}>
              {!classic && onExportExcel && (
                <button type="button" onClick={() => { setMenu(null); exportBook('studio'); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50">
                  <span className="block text-sm font-semibold text-slate-800">Studio copy · .xlsx</span>
                  <span className="block text-[11px] text-slate-500">Line IDs, materials with versions, sizes, cost, markup, live formulas. Blue cells edit; import it back. Rooms, Material specs and Read me sheets.</span>
                </button>
              )}
              {!classic && (
                <button type="button" onClick={() => { setMenu(null); exportBook('client'); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50">
                  <span className="block text-sm font-semibold text-slate-800">Client copy · .xlsx</span>
                  <span className="block text-[11px] text-slate-500">Locked. Item, specification, qty, unit, rate, amount by room, and the material specifications. No costs or markups.</span>
                </button>
              )}
              {classic && onExportExcel && (
                <button type="button" onClick={() => { setMenu(null); onExportExcel(); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50">
                  <span className="block text-sm font-semibold text-slate-800">Excel with live formulas</span>
                  <span className="block text-[11px] text-slate-500">Every line with cost, markup and rate. Studio only.</span>
                </button>
              )}
              {!classic && (
                <button type="button" onClick={() => { setMenu(null); setPdfOpen(true); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50">
                  <span className="block text-sm font-semibold text-slate-800">First proposal · PDF</span>
                  <span className="block text-[11px] text-slate-500">The A4 pages the client is sent: room by room, materials, investment, Annexure A. No drawing.</span>
                </button>
              )}
              <button type="button" onClick={() => { setMenu(null); onExportPdf(); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50">
                <span className="block text-sm font-semibold text-slate-800">{classic ? 'BOQ as a PDF' : 'PDF'}</span>
                <span className="block text-[11px] text-slate-500">{classic ? 'The schedule of finishes, as on screen.' : 'The client BOQ, as today.'}</span>
              </button>
            </div>
          )}
        </div>
        {!classic && <button type="button" onClick={() => { setMenu(null); present(); }}
          title={layoutApproved ? 'Meeting view: the layout is approved, so rooms are drawn' : 'First proposal PDF: no drawing until the layout is approved'} className={`${barBtn} px-3 bg-slate-800 text-white hover:bg-slate-900`}>
          {layoutApproved ? <><Play className="w-3.5 h-3.5" aria-hidden />Present</> : <><FileText className="w-3.5 h-3.5" aria-hidden />Proposal PDF</>}
        </button>}
        <button type="button" onClick={() => { setFull(f => !f); setFitSignal(s => s + 1); }} aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'} className="p-1.5 rounded-xl border border-slate-200 text-slate-600">
          {full ? <Shrink className="w-4 h-4" aria-hidden /> : <Expand className="w-4 h-4" aria-hidden />}
        </button>
      </div>

      {/* The lens and the inspector */}
      <div className="flex-1 min-h-0 grid gap-3 grid-cols-1" style={wide ? { gridTemplateColumns: showIns ? 'minmax(0,1fr) 320px' : 'minmax(0,1fr)' } : undefined}>
        <section className="relative rounded-2xl bg-white border border-slate-200 shadow-sm min-h-0 min-w-0 overflow-hidden" style={wide ? undefined : { height: '72vh', minHeight: 440 }}>
          <div className="absolute inset-0 bg-slate-100">
            {plan ? (
              planRooms.length ? (
                <PlanStage
                  showDrawing={showDrawing}
                  ctx={ctx} rooms={rooms} boq={boq} bank={bank} bankMap={bankMap} models={byId} roomTotals={totals.byRoom}
                  readOnly={readOnly} sel={sel} onSel={pickLine} selRoom={selRoom} onSelRoom={pickRoom}
                  commit={commit} newId={newId} libOpen={showLib} hideFigures={hideFigures} fitSignal={fitSignal} prepareNew={prepareNew}
                  onRooms={resizeRooms}
                  layer={layer} civilTool={civilTool} onCivilRoom={civilRoom} onCivilWall={civilWall} onNote={setNote} onDropWork={(it, room) => addWork(it, room)} onDropKit={(id, room) => openKit(id, room)} changes={changes} fresh={fresh}
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center p-6" style={{ paddingLeft: showLib && wide ? 260 : undefined }}>
                  {/*
                    The three ways in sit under the empty state, not in its action slot.
                    EmptyState holds one button beside its words; with three there the
                    buttons kept their full width and squeezed the words to a column one
                    letter wide, and the buttons ran off the card, so a new project's plan
                    showed no way to start.
                  */}
                  <div className="max-w-md w-full bg-white rounded-2xl p-4 shadow-sm space-y-3">
                    <EmptyState icon={MapIcon} title="No plan yet"
                      text="Sketch the rooms roughly and tidy them into a plan, build the BOQ from the flat’s size in one step, or read the rooms off the brief’s plan. Then draw the furniture here." />
                    <div className="flex flex-wrap gap-2">
                      {readOnly
                        ? <Button size="sm" onClick={() => setPlanModal(true)}>See the plan</Button>
                        : <>
                          <Button size="sm" variant="primary" icon={PenLine} onClick={() => setSketching(true)}>Sketch a rough plan</Button>
                          <Button size="sm" icon={Zap} onClick={() => setBuilding(true)}>Quick build</Button>
                          <Button size="sm" onClick={() => setPlanModal(true)}>Set up the plan</Button>
                        </>}
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="absolute inset-0 overflow-auto bg-slate-50 hud-swap" key={lens} style={{ paddingLeft: showLib && wide ? 244 : 0 }}>
                {lens === 'rooms' && (
                  <RoomsLens rooms={rooms} models={models} shares={shares} roomTotals={totals.byRoom} bankMap={bankMap} sel={sel} selRoom={selRoom}
                    readOnly={readOnly} seesMargins={seesMargins} hideFigures={hideFigures} floor={floor} query={query}
                    onSel={pickLine} onRoom={pickRoom} onAdd={onAddFromBank}
                    onShowOnPlan={name => { setLens('plan'); pickRoom(name); setFitSignal(s => s + 1); }}
                    changes={changes} baseName={prevName}
                    onDropItem={(id, room) => { if (id.startsWith(KIT_DRAG)) { openKit(id.slice(KIT_DRAG.length), room); return; } const it = bank.find(i => i.id === id); if (it) { if (drawOf(it)) addToRoom(it, room); else addWork(it, room); } }}
                    onReplaceMany={replaceMany} />
                )}
                {lens === 'sheet' && fullGrid && renderFullGrid && (
                  <div className="p-3">
                    <div className="mb-2"><Button size="sm" onClick={() => setFullGrid(false)}>Back to the Sheet</Button></div>
                    {renderFullGrid()}
                  </div>
                )}
                {lens === 'sheet' && !(fullGrid && renderFullGrid) && (
                  <SheetLens rooms={rooms} models={models} shares={shares} roomTotals={totals.byRoom} sel={sel} readOnly={readOnly}
                    seesMargins={seesMargins} hideFigures={hideFigures} floor={floor} query={query}
                    onSel={pickLine} onReplace={l => replace(l)} onReplaceMany={replaceMany} onDelete={remove}
                    onFullGrid={renderFullGrid ? () => setFullGrid(true) : undefined}
                    onCustom={() => setCustom({ name: '' })}
                    specBank={specBank} onUpdateLines={offer ? updateLines : undefined}
                    changes={changes} removedName={l => bankMap.get(l.bankId)?.name || (l as { name?: string }).name || 'Line'} />
                )}
                {lens === 'tune' && (
                  <TuneLens boq={boq} bankMap={bankMap} rules={rules} rooms={rooms} measure={measure} floor={floor} floors={floors}
                    seesMargins={seesMargins} readOnly={readOnly} commit={commit} />
                )}
                {lens === 'deal' && (() => {
                  const order = new Map(boq.map((l, i) => [String(l.id), i]));
                  const lines = splitLines(dealSplit).sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9));
                  const named = rooms.map(r => r.name);
                  const dealRooms = [...named, ...Object.keys(dealSplit.byRoom).filter(n => !named.includes(n))].filter(n => (dealSplit.byRoom[n] || 0) > 0);
                  return (
                    <DealLens tierId={tier.id} optionName={tier.name || 'this option'} summary={dealSummary} lineCount={lines.length} rounded={!!rules}
                      split={dealSplit} discounts={discounts} terms={gstTerms}
                      schedule={scheduleFor(ctx, { tierSummary: dealSummary }, { paymentStructure })}
                      validity={validity} fee={{ type: ctx.designFeeType || 'percentage', value: Number(ctx.designFee ?? 10) }}
                      floor={floor} seesMargins={seesMargins && !hideFigures} locked={dealLocked} lockedWhy={dealLockedWhy} rooms={dealRooms} pickLines={lines} newId={newId}
                      onDiscounts={(next, msg) => { setProjectContext(prev => withDiscounts(prev, next)); if (msg) setNote(msg); }}
                      onFee={v => setProjectContext(prev => ({ ...prev, designFee: (prev.designFeeType || 'percentage') === 'percentage' ? Math.min(30, Math.max(0, v)) : Math.max(0, v) }))}
                      onDays={d => setProjectContext(prev => withValidDays(prev, d))}
                      onInitiation={v => setProjectContext(prev => withInitiationFee(prev, v))}
                      proposal={ctx.proposal}
                      onBooking={(by, fee) => setProjectContext(prev => withBooking(prev, by, fee))}
                      onNote={setNote} onPresent={isPlaygroundTier(tier) ? present : undefined} />
                  );
                })()}
              </div>
            )}

            {showLib && (
              <div className="absolute left-2 top-2 bottom-2 z-20 w-[232px] flex pg-slide">
                <Catalogue bank={bank} readOnly={readOnly} onClose={() => setLibOpen(false)} onAdd={it => addToRoom(it, libTarget)} addLabel={`to ${libTarget}`}
                  kits={kits} bankMap={bankMap} hideFigures={hideFigures} kitEstimate={kitCardEstimate} onKit={id => openKit(id)}
                  places={supplyPlaces} onAddSupplied={addSupplied} onAddWork={it => addWork(it, workRoomReal)} workRoom={workRoomReal}
                  measureWork={it => (workRoomReal ? measureWork(it, rooms.find(x => x.name === workRoomReal)) : null)}
                  onCustom={(name, cat) => setCustom({ name, cat })}
                  artOf={specBank ? (it => { const r = recipeOf(it, specBank); return r ? artOfSpecs(specsFromRecipe(specBank, r, grade), specBank.materials) : {}; }) : undefined} />
              </div>
            )}

            {plan && (
              <div className="absolute top-2.5 z-10 flex flex-wrap items-center gap-y-1.5" style={{ left: showLib ? 248 : 10, right: 200 }}>
                <span className="relative inline-block" data-pg-menu>
                  <button type="button" onClick={() => setMenu(m => (m === 'plan' ? null : 'plan'))} aria-expanded={menu === 'plan'}
                    className="inline-flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-xl bg-white/95 border border-slate-200 shadow-sm hover:border-[#3D52A0]/40">
                    <span className="w-6 h-6 rounded-lg bg-[#3D52A0]/10 text-[#3D52A0] grid place-items-center"><FileText className="w-3.5 h-3.5" aria-hidden /></span>
                    <span className="text-xs font-bold text-slate-700">{planLabel}</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" aria-hidden />
                  </button>
                  {menu === 'plan' && (
                    <div className="absolute left-0 top-full mt-1.5 z-40 w-[300px] rounded-2xl bg-white border border-slate-200 shadow-2xl p-1.5 hud-panel-in">
                      <div className={`${LABEL} px-3 pt-1.5 pb-1`}>The plan under this BOQ</div>
                      {([
                        [Upload, 'Replace with a new plan', 'Upload a PDF or photo. Rooms are matched by name; pieces move with their room'],
                        [PenLine, 'Sketch a rough plan', 'No plan? Draw rough boxes and the app tidies them into a plan'],
                        [MapPin, 'Read or trace the rooms', 'Rooms off the drawing, or traced by hand, or laid out as blocks'],
                        [Target, 'Set the scale again', 'Measure one wall you know'],
                        [FileText, 'Back to the brief’s plan', 'The plan the client gave with the brief'],
                      ] as [React.ElementType, string, string][]).filter(([, t]) => !readOnly || t !== 'Sketch a rough plan').map(([I, t, d]) => (
                        <button key={t} type="button" onClick={() => { setMenu(null); if (t === 'Sketch a rough plan') setSketching(true); else setPlanModal(true); }} className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 flex items-start gap-2">
                          <span className="mt-0.5 text-[#3D52A0]"><I className="w-4 h-4" aria-hidden /></span>
                          <span><span className="block text-sm font-semibold text-slate-800">{t}</span><span className="block text-[11px] text-slate-500">{d}</span></span>
                        </button>
                      ))}
                    </div>
                  )}
                </span>
                {readOnly && <span className="ml-1.5 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/95 border border-slate-200 shadow-sm text-xs font-bold text-slate-600" title={superseded ? `v${vplace!.n} is kept as it was. Switch to v${vplace!.versions.length} to edit.` : undefined}><Lock className="w-3.5 h-3.5 text-[#3D52A0]" aria-hidden />{superseded ? `v${vplace!.n} · kept as it was` : sentHere ? `Sent ${when(ctx.proposal?.issuedAt)} · kept as it went` : signed?.elsewhere ? `Revision ${signed.elsewhere} is being drafted in Revision Studio` : signed ? (revRec ? `Revision ${revRec.number} · ${signed.revState === 'issued' ? 'with the client' : 'signed by the client'}` : 'Signed · read-only') : 'Read-only'}</span>}
                {/* The client's drawing, or the line plan redrawn from it (linePlan.tsx). The line plan is the default: rendered furniture and flooring stay out from under the BOQ's pieces. */}
                {drawingOf(sheet) && planRooms.length > 0 && (
                  <span className="ml-1.5 inline-flex p-0.5 rounded-xl bg-white/95 border border-slate-200 shadow-sm" role="radiogroup" aria-label="What the plan shows">
                    {([[false, 'Line plan'], [true, 'Drawing']] as const).map(([v, n]) => (
                      <button key={n} type="button" role="radio" aria-checked={showDrawing === v} onClick={() => setShowDrawing(v)}
                        title={v ? 'The client’s plan as they gave it, under the rooms' : 'The rooms redrawn as a clean plan'}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold ${showDrawing === v ? 'bg-[#3D52A0] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                        {n}
                      </button>
                    ))}
                  </span>
                )}
                <span className="ml-1.5 inline-flex p-0.5 rounded-xl bg-white/95 border border-slate-200 shadow-sm" role="radiogroup" aria-label="Plan layer">
                  {([['int', 'Interiors'], ['civ', 'Civil']] as const).map(([k, n]) => (
                    <button key={k} type="button" role="radio" aria-checked={layer === k} onClick={() => pickLayer(k)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${layer === k ? 'bg-[#3D52A0] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                      {n}{k === 'civ' && civilLinesNow.length > 0 && <span className="tabular-nums opacity-80"> {civilLinesNow.length}</span>}
                    </button>
                  ))}
                </span>
                {waiting.length > 0 && (
                  <button type="button" onClick={() => pickLine(waiting[0].id)} className="ml-1.5 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/95 border border-amber-200 shadow-sm text-xs font-bold text-amber-700">
                    <MapPin className="w-3.5 h-3.5" aria-hidden />{waiting.length} need a place
                  </button>
                )}
                {/* Every waiting piece put in its own room in one go (lib/playground/placeAll); undo takes it back. */}
                {waiting.length > 0 && !readOnly && planRooms.length > 0 && (
                  <button type="button" onClick={placeWaiting} className="ml-1.5 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#3D52A0] text-white shadow-sm text-xs font-bold hover:bg-[#334486]">
                    Place them
                  </button>
                )}
              </div>
            )}

            {plan && layer === 'civ' && planRooms.length > 0 && (
              <CivilPanel left={showLib ? 248 : 10} tool={civilTool} site={ctx.propertyStatus ? SITE_LABEL[ctx.propertyStatus] : undefined}
                ask={briefCivilAsk(ctx, rooms)} lines={civilModels.length} total={civilModels.reduce((a, m) => a + (m.billable ? m.amount : 0), 0)}
                hideFigures={hideFigures} readOnly={readOnly || classic} items={civilItems(bank)} bank={bank} siteStatus={ctx.propertyStatus} isOwner={!!isOwner}
                onTool={pickTool} onBrief={civilBrief} onAddItems={addCivilItems} />
            )}

            {plan && (
              <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-2">
                <div className="rounded-2xl bg-white/95 border border-slate-200 shadow-md pl-2 pr-3 py-1.5 flex items-center gap-2 pointer-events-none">
                  {seesMargins && !hideFigures && <Ring margin={margin} floor={floor} />}
                  <div className="text-right">
                    <div className={LABEL}>Client pays · work</div>
                    <div className="text-base font-black text-slate-800 tabular-nums leading-tight">{hideFigures ? '••••' : inr(totals.sell)}</div>
                    {changes && !hideFigures && (Math.abs(changes.after - changes.before) >= 1 ? (
                      <div className={`text-[10px] font-bold tabular-nums ${changes.after > changes.before ? 'text-rose-600' : 'text-emerald-600'}`}>{changes.after > changes.before ? '+' : '−'}{inr(Math.abs(changes.after - changes.before))} vs {revRec ? 'signed' : prevName}</div>
                    ) : revRec ? <div className="text-[10px] font-bold text-slate-400">same as signed</div> : null)}
                  </div>
                </div>
                {!showIns && (
                  <button type="button" onClick={() => setInsOpen(true)} className="rounded-2xl bg-white/95 border border-slate-200 shadow-md px-3 py-2.5 text-xs font-bold text-[#3D52A0] inline-flex items-center gap-1.5 hover:bg-white">
                    <ReceiptIcon className="w-3.5 h-3.5" aria-hidden />Live BOQ
                  </button>
                )}
              </div>
            )}

            {note && (
              <div role="status" className="absolute z-30 bottom-14 left-1/2 -translate-x-1/2 max-w-[90%] rounded-xl bg-slate-800 text-white text-xs font-semibold px-3 py-2 shadow-2xl hud-panel-in">{note}</div>
            )}
          </div>
        </section>
        {showIns && (
          <div className="min-h-0 min-w-0">
            <aside className="rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col min-h-0 h-full overflow-hidden" aria-label={selModel ? 'Line' : selRoomObj ? 'Room' : changes ? 'Changes' : 'Live BOQ'}>
              <div className="flex-1 overflow-auto">{inspector}</div>
            </aside>
          </div>
        )}
      </div>

      {recipeItemId && specBank && bankMap.get(recipeItemId) && (
        <RecipeDrawer
          item={bankMap.get(recipeItemId)!}
          specs={specBank}
          canEditRecipes={!!canEditRecipes && !!onSaveSpecs}
          canEditItem={false}
          projects={0}
          sharedBy={rid => bank.filter(i => recipeOf(i, specBank)?.id === rid).length}
          onSave={async ({ bank: next }) => { if (next && onSaveSpecs) await onSaveSpecs(next); }}
          onClose={() => setRecipeItemId(null)}
        />
      )}

      {meeting && (
        <MeetingView ctx={ctx} tier={{ ...tier, boq }} tiers={tiers} bankMap={bankMap} specBank={specBank} paymentStructure={paymentStructure}
          studioName={studioName || 'The studio'} userName={userName}
          priceDetail={ctx.proposal?.priceDetail || 'lines'}
          onPriceDetail={p => setProjectContext(prev => ({ ...prev, proposal: { ...(prev.proposal || {}), priceDetail: p } }))}
          approved={ctx.approvedTierId === tier.id}
          onApprove={() => {
            const now = Date.now();
            const was = ctx.approvedTierId;
            setProjectContext(prev => contextWithApproved(prev, tier, tiers, now));
            setTiers(prev => tiersWithApproved(prev, tier.id, was, { at: now, by: userName || 'The studio' }));
            setNote(`${tier.name} is the client’s approved option.`);
          }}
          onNewVersion={onNewVersion ? next => { setMeeting(false); onNewVersion(next); } : undefined}
          onPdf={() => { setMeeting(false); setPdfOpen(true); }}
          onClose={() => setMeeting(false)} />
      )}
      {pdfOpen && (
        <ProposalPdf ctx={ctx} tier={{ ...tier, boq }} tiers={tiers} bankMap={bankMap} specBank={specBank} termsSettings={termsSettings} paymentStructure={paymentStructure}
          studioName={studioName || 'The studio'} userName={userName} concern={leadConcern} decisionMakers={decisionMakers} programme={programme} booked={!!journey?.booked}
          onSent={(via, shapedFor, priceDetail) => {
            setProjectContext(prev => issueProposal(prev, { tierId: tier.id, at: Date.now(), via, days: validity.days, shapedFor, priceDetail, by: userName }));
            setNote(`Sent. ${tier.name} is kept as it went; make a new version to change it.`);
          }}
          onClose={() => setPdfOpen(false)} />
      )}
      {importing && (
        <ImportExcelModal project={ctx.name || 'Project'} option={tier.name || 'Option'} tierId={tier.id} boq={boq}
          ctx={{ bankMap, rules, rooms, measure, specBank }} bank={bank} floors={floors} isOwner={!!isOwner} seesMargins={seesMargins} newId={newId}
          onApply={(next, msg) => { commit(next, msg); setImporting(false); }} onAdd={addImported} onClose={() => setImporting(false)} />
      )}
      {sketching && (
        <SketchModal project={(ctx.name || 'Project').split(/[(]/)[0].trim()} initial={sketchFromRooms(rooms)} carpet={Number(ctx.area) || 0}
          onUse={useSketch} onClose={() => setSketching(false)} />
      )}
      {building && (
        <QuickBuildModal project={(ctx.name || 'Project').split(/[(]/)[0].trim()} size={sizeOf(ctx.config)} carpet={Number(ctx.area) || 0} grade={gradeOf(tier)}
          own={rooms} bank={bank} boq={boq} standards={roomStandards}
          fill={quickFill}
          paints={!boq.some(l => l.byRoom?.basis === 'wallPaint') && !!paintingFromPlan(bank, rooms.length ? rooms : [{ name: 'x', size: 100, unit: 'sq ft' }], () => 'probe')}
          onBuild={runQuickBuild} onClose={() => setBuilding(false)} />
      )}
      {issueOpen && signed?.result && revRec && revOpts && changes && (
        <RevisionIssueModal number={revRec.number} reference={signed.reference} result={signed.result} changes={changes} cur={boq} bankMap={bankMap} opts={revOpts}
          need={revNeed} reasons={reasons} issuing={issuing} error={issueError} onClose={() => setIssueOpen(false)} onIssue={doIssue} />
      )}
      {kitUi && kitOpen && (
        <KitModal kit={kitOpen} rooms={kitRooms} picked={kitUi.rooms} off={kitUi.off} boq={boq} bankMap={bankMap} amount={amountOf} hideFigures={hideFigures}
          addsDebris={kitAddsDebris(kitOpen, boq, bank, bankMap)}
          onRoom={name => setKitUi(k => k && ({ ...k, rooms: k.rooms.includes(name) ? k.rooms.filter(r => r !== name) : [...k.rooms, name] }))}
          onTick={(key, on) => setKitUi(k => k && ({ ...k, off: { ...k.off, [key]: !on } }))}
          onClose={() => setKitUi(null)} onApply={applyKit} />
      )}
      {custom && (
        <CustomItemModal bank={bank} rooms={customRooms} room={libTarget} name={custom.name} cat={custom.cat}
          seesMargins={seesMargins && !hideFigures} rounded={!!rules} newId={newId}
          onAdd={addCustom} onClose={() => setCustom(null)} />
      )}
      {planModal && (
        <div className="fixed inset-0 z-[300] grid place-items-center p-4 phd-scrim" style={{ background: 'rgba(15,23,42,.45)' }} role="dialog" aria-modal="true" aria-label="The plan under this BOQ">
          <div className="phd-pop w-full max-w-[1100px] max-h-[90vh] overflow-auto rounded-3xl bg-slate-50 shadow-2xl p-4">
            <div className="flex items-center mb-3">
              <span className="text-sm font-bold text-slate-800">The plan under this BOQ</span>
              <button type="button" onClick={() => { setPlanModal(false); setFitSignal(s => s + 1); }} aria-label="Close" className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
            </div>
            <PlanSheetPanel projectContext={ctx} setProjectContext={setProjectContext} tiers={tiers} setTiers={setTiers} activeTierId={tier.id} bank={bank} tenantId={tenantId} />
          </div>
        </div>
      )}
    </div>
    </FreshContext.Provider>
  );
}
