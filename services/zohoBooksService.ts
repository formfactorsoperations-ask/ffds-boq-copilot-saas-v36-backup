import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseClient';

/**
 * The browser's side of the optional Zoho Books add-in. Every call goes to the
 * `zohoBooks` function (functions/src/zohoBooks.ts); the studio's Zoho
 * credentials live there and never come to the browser.
 */

export type ZohoRegionCode = 'in' | 'com' | 'eu' | 'au' | 'jp' | 'ca' | 'sa';

export interface ZohoSettingsView {
  numbering: { mode: 'zoho' | 'template'; template: string };
  hsnDesign: string;
  hsnExecution: string;
  designItemName: string;
  executionItemName: string;
  paymentTermsDays: number | null;
}

export interface ZohoStatus {
  connected: boolean;
  region?: ZohoRegionCode;
  organizationName?: string | null;
  /** Present when the Zoho login reaches several organisations and one is yet to be chosen. */
  needsOrganization?: { id: string; name: string }[] | null;
  settings?: ZohoSettingsView;
  canManage: boolean;
  canRaise: boolean;
}

export interface ZohoContactHit { id: string; name: string; company: string }

export interface ZohoContactDetail {
  id: string;
  name: string;
  gstin: string;
  placeOfContact: string;
  placeOfSupply: string | null;
}

export interface ZohoRaiseRequest {
  projectId: string;
  milestoneId: string;
  projectName: string;
  milestoneName: string;
  milestoneType: 'design' | 'execution';
  taxableAmount: number;
  gstAmount: number;
  gstRatePct: number;
  retainerDeducted: number;
  discountApplied: number;
  discountReason?: string;
  contactId: string;
  gstin?: string;
  placeOfSupply?: string;
}

export interface ZohoRaiseResult {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  total: number;
  expectedTotal: number;
  url: string;
  reused: boolean;
  gstLabel: string;
  placeOfSupply: string;
}

/** An error from the add-in, with the reason the server gave when the studio can fix it. */
export class ZohoCallError extends Error {
  constructor(message: string, public code = '', public reason = '') {
    super(message);
  }
  /**
   * There is nothing to ask: no Firebase backend in this build, or the function
   * is not deployed. Behave as though the add-in were off. Any other failure
   * (offline, a server error) is NOT this: a connected studio must not fall
   * back to local invoice numbers just because a request failed.
   */
  get isUnavailable() { return this.code === 'no-backend' || this.code === 'functions/not-found' || this.code === 'not-found'; }
}

export async function zohoCall<T>(action: string, payload: Record<string, unknown> = {}, tenantId?: string): Promise<T> {
  if (!functions) throw new ZohoCallError('No server is configured.', 'no-backend');
  try {
    const res: any = await httpsCallable(functions, 'zohoBooks', { timeout: 60000 })({ action, tenantId, ...payload });
    return res.data as T;
  } catch (e: any) {
    throw new ZohoCallError(e?.message || 'Zoho Books request failed.', String(e?.code || ''), String(e?.details?.reason || ''));
  }
}
