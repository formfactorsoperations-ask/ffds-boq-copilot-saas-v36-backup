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
    group: 'Agreement & Design', 
    minStage: 1,
    downloadable: true,
    clientVisible: true,
    documentKind: 'onboarding_kit'
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
    downloadable: true 
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
  {
    id: 'variation-order',
    name: 'Variation Order',
    icon: FileText,
    group: 'Execution',
    minStage: 1,
    downloadable: true,
    clientVisible: true,
    documentKind: 'variation_order'
  },
  { 
    id: 'payment-calc', 
    name: 'Invoices', 
    icon: FileText, 
    group: 'Execution', 
    minStage: 1, 
    money: true, 
    downloadable: true 
  }
];

export function buildSigningUrl(token: string): string {
  let origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (!origin) {
    origin = 'https://ais-pre-oemogartnmwkt2jc2dlqrb-489259392227.asia-southeast1.run.app';
  }
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
