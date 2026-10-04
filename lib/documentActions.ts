import { ProjectContext } from '../types';
import { 
  FileText, 
  Handshake, 
  Ruler, 
  Activity, 
  BookOpen, 
  Hammer, 
  Key, 
  Calendar,
  LucideIcon 
} from 'lucide-react';
import { publicAppOrigin } from './publicUrl';

export interface DocMeta {
  id: string;                     // route id — matches the workspace tab
  name: string;
  icon: LucideIcon;
  group: 'Proposal' | 'Agreement & Design' | 'Execution';
  minStage: number;               // lifecycle stage at which it becomes relevant
  money?: boolean;                // hidden from Designers
  signable?: { field: keyof ProjectContext };   // supports the e-signature flow
  downloadable?: boolean;         // printable / exportable to PDF
  gateGated?: boolean;            // locked until the Design Gate opens
  clientVisible?: boolean;
  documentKind?: import('../types').ClientDocumentKind;
  /**
   * Only on projects with the signed-scope flow switched on. Everywhere else
   * the document does not exist — not greyed, not "coming soon" — so a live
   * project that has not moved over sees exactly what it saw before.
   */
  scopeFlowOnly?: boolean;
  /** Where "Prepare" goes, when that is not a workspace tab of the same id. */
  route?: string;
}

export const PROJECT_DOCUMENTS: DocMeta[] = [
  { 
    id: 'client', 
    name: 'Client Proposal', 
    icon: FileText, 
    group: 'Proposal', 
    minStage: 1,
    downloadable: true 
  },
  { 
    id: 'terms-docket', 
    name: 'Terms Docket', 
    icon: Ruler, 
    group: 'Agreement & Design', 
    minStage: 1, 
    signable: { field: 'designAgreementSignoff' },
    downloadable: true,
    clientVisible: true,
    documentKind: 'terms_docket'
  },
  { 
    id: 'payment-schedule', 
    name: 'Payment Schedule', 
    icon: Activity, 
    group: 'Agreement & Design', 
    minStage: 1, 
    money: true,
    downloadable: true,
    clientVisible: true,
    documentKind: 'payment_schedule'
  },
  { 
    id: 'onboarding', 
    name: 'Onboarding Kit', 
    icon: BookOpen, 
    /* Filed with the proposal, because that is what unlocks it. */
    group: 'Proposal', 
    minStage: 1,
    downloadable: true,
    clientVisible: true,
    documentKind: 'onboarding_kit'
  },
  {
    id: 'detailed-boq',
    name: 'Detailed BOQ',
    icon: FileText,
    group: 'Agreement & Design',
    minStage: 1,
    /* Not `money`: it carries client prices, which every role may see. The
       flag hides a document from roles that do not see studio finance. */
    downloadable: true,
    clientVisible: true,
    documentKind: 'detailed_boq',
    scopeFlowOnly: true,
    route: 'revision-studio'
  },
  {
    id: 'scope-revision',
    name: 'Scope Revision',
    icon: FileText,
    group: 'Agreement & Design',
    minStage: 1,
    /* Client prices only, like the Detailed BOQ: not `money`. */
    downloadable: true,
    clientVisible: true,
    documentKind: 'scope_revision',
    scopeFlowOnly: true,
    route: 'revision-studio'
  },
  {
    id: 'execution-agreement',
    name: 'Execution Agreement', 
    icon: Hammer, 
    group: 'Execution', 
    minStage: 1, 
    signable: { field: 'executionSignoff' },
    downloadable: true,
    gateGated: true,
    clientVisible: true,
    documentKind: 'execution_agreement'
  },
  { 
    id: 'update-client-feed', 
    name: 'Weekly Pulse Reports', 
    icon: Activity, 
    group: 'Execution', 
    minStage: 1 
  },
  {
    id: 'mom-action-tracker',
    name: 'Minutes of Meeting (MOM)',
    icon: FileText,
    group: 'Execution',
    minStage: 1,
    downloadable: true
  },
  { 
    id: 'snaglist', 
    name: 'Snag List & Defect Report', 
    icon: Hammer, 
    group: 'Execution', 
    minStage: 1, 
    downloadable: true,
    /* Signed by the client as a pre-requisite to handover. */
    clientVisible: true,
    documentKind: 'snag_list'
  },
  { 
    id: 'checklist', 
    name: 'Quality & Handover Checklist', 
    icon: FileText, 
    group: 'Execution', 
    minStage: 1, 
    downloadable: true 
  },
  { 
    id: 'handover-docket', 
    name: 'Handover Docket', 
    icon: Key, 
    group: 'Execution', 
    minStage: 1, 
    signable: { field: 'handoverSignoff' },
    downloadable: true,
    clientVisible: true,
    documentKind: 'handover_docket'
  },
  /* Variation Order removed: registered, releasable and client-visible, but
     DocumentRenderer never had a case for it, so it could only ever render as
     "being prepared". A half-built document in the vault is worse than none. */
  /* Invoices are raised in Zoho Books, not here. This entry only ever opened
     a calculator, so the vault listed a client document that was never one. */
];

/** The documents this project has: scope documents only where the flow is on. */
export function projectDocumentsFor(ctx: ProjectContext | null | undefined): DocMeta[] {
  /* The client's copy of the project carries documents but not the studio's
     switch, so a scope document actually issued also turns the rows on. */
  const on = !!ctx?.scopeFlow?.enabled
    || (ctx?.documents?.issues || []).some(i => i.kind === 'detailed_boq' || i.kind === 'scope_revision');
  return PROJECT_DOCUMENTS.filter(d => on || !d.scopeFlowOnly);
}

/** The workspace tab a document's "Prepare" or "Open" leads to. */
export const docRoute = (d: DocMeta): string => d.route || d.id;

export function buildSigningUrl(token: string): string {
  let origin = publicAppOrigin();
  if (origin.includes('ais-dev-')) {
    origin = origin.replace('ais-dev-', 'ais-pre-');
  }
  return `${origin}/?agreementSignoff=${token}`;
}

export function getSigningToken(ctx: ProjectContext, field: keyof ProjectContext): string | undefined {
  if (!ctx || !field) return undefined;
  const signoffObj = ctx[field] as any;
  return signoffObj?.token;
}
