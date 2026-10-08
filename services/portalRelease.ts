import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db as fsDb } from './firebaseClient';
import { db as storageDb } from './dbService';
import { writePortalView } from './portalViewService';
import { normaliseAddition, scopeAdditionsPath } from '../lib/scopeAdditions';
import type { PortalScopeAddition, PortalView } from '../lib/portalProjection';
import type { ClientBoqRow } from '../lib/clientBoq';
import { portalDesignRecord, type DesignMeeting, type PortalDesignMeeting } from '../lib/designMeeting';
import type { PortalMoney } from '../lib/portalMoney';
import type { ProjectContext, ProjectSchedule } from '../types';

/*
  SEND THE CLIENT'S PORTAL COPY.

  The client reads a stored projection (projects/{id}/portalView/current), not
  the project. Publishing an item decides what may be shown; releasing writes
  the projection so it actually is. This was written inside the Client Portal
  tab's publish controls, so nothing else could send it -- a Scope Revision
  issued from the Scope workspace sat unseen until someone also went to the
  portal tab and pressed send. Both now call this.
*/

export interface PortalReleaseInputs {
  projectId: string;
  tenantId?: string | null;
  /** The studio's Studio Settings (organizations/{tenant}). */
  orgData?: any;
  /** studios/{tenant}/settings/main, where the studio has one. */
  settings?: any;
  clientBoq?: ClientBoqRow[];
  clientBoqBaseline?: ClientBoqRow[];
  portalMoney?: PortalMoney;
  /** The derived programme, used when no schedule was saved by hand. */
  clientSchedule?: ProjectSchedule;
}

/*
  Scope additions, reduced to what a client should see. Read at release time so
  the stored view cannot drift from what is true. Cost, margin and the internal
  type code are dropped. A failed read publishes nothing rather than "none".
*/
export async function gatherPortalScopeAdditions(tenantId?: string | null, projectId?: string): Promise<PortalScopeAddition[] | undefined> {
  if (!fsDb || !tenantId || !projectId) return undefined;
  try {
    const snap = await getDocs(collection(fsDb, scopeAdditionsPath(tenantId, projectId)));
    const rows = snap.docs
      .map(d => normaliseAddition(d.id, d.data()))
      .filter(a => a.invoiceStatus !== 'cancelled' && a.invoiceStatus !== 'void' && a.invoiceStatus !== 'draft')
      .map<PortalScopeAddition>(a => ({
        ref: a.ref,
        request: a.clientRequest,
        nature: a.type === 'TYPE_A' ? 'Finish change' : a.type === 'TYPE_C' ? 'New scope' : 'Alteration',
        issuedAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
        designFeeTotal: a.designFeeTotal,
        designFeeBase: a.designFeeBase,
        designFeeGst: a.designFeeGst,
        executionSubtotal: a.executionSubtotal,
        executionGst: a.executionGst,
        executionTotal: a.executionTotal,
        grandTotal: a.grandTotal,
        released: a.workAuthorized,
        designFeePaid: a.designFeePaid,
        executionPaid: a.executionPaid,
        lines: (a.miniBoq || [])
          .map((l: any) => ({
            description: String(l?.description || 'Item'),
            qty: Number(l?.qty) || 0,
            unit: String(l?.unit || ''),
            amount: Number(l?.baseCost) || 0,
          }))
          .filter((l: any) => l.amount > 0 || l.qty > 0),
      }));
    return rows.length ? rows : undefined;
  } catch {
    return undefined;
  }
}

/*
  The design meetings held, as the client sees them. The designMeeting function
  keeps this current between releases; a release sends it too, so a re-send
  never wipes it. A failed read sends nothing rather than "none".
*/
export async function gatherPortalDesignRecord(tenantId?: string | null, projectId?: string): Promise<PortalDesignMeeting[] | undefined> {
  if (!fsDb || !tenantId || !projectId) return undefined;
  try {
    const snap = await getDocs(query(collection(fsDb, `organizations/${tenantId}/projects/${projectId}/designMeetings`), where('state', '==', 'CLOSED')));
    const rows = portalDesignRecord(snap.docs.map((d) => ({ ...(d.data() as DesignMeeting), id: d.id })));
    return rows.length ? rows : undefined;
  } catch {
    return undefined;
  }
}

/* The studio's saved schedule where there is one, so the client gets the dates
   on the studio's own Timeline; otherwise the derived programme. */
export async function portalScheduleToSend(projectId: string | undefined, fallback?: ProjectSchedule): Promise<ProjectSchedule | undefined> {
  if (!projectId) return fallback;
  try {
    const saved = await storageDb.getSchedule(projectId);
    if (saved?.tasks?.length) return saved;
  } catch {
    /* Fall back to the derived programme rather than publishing none. */
  }
  return fallback;
}

/** Rewrites the client's portal copy from `ctx`. Throws if the write is refused. */
export async function releasePortal(ctx: ProjectContext, inputs: PortalReleaseInputs): Promise<PortalView | null> {
  const { orgData } = inputs;
  let settings = inputs.settings;
  /* Bank and contact details may live only in the studio's settings document;
     a send that left them out would empty the client's payment details. */
  const tenant = inputs.tenantId || orgData?.tenantId;
  if (!settings && fsDb && tenant) {
    try {
      const snap = await getDoc(doc(fsDb, `studios/${tenant}/settings/main`));
      settings = snap.exists() ? snap.data() : undefined;
    } catch {
      /* Studio Settings below still carry name, contact and bank details. */
    }
  }
  return writePortalView(
    inputs.projectId,
    ctx,
    {
      name: settings?.companyName || orgData?.orgName,
      logoUrl: settings?.logoUrl || orgData?.orgLogo,
      phone: settings?.phone || orgData?.contactPhone,
      email: settings?.email || orgData?.contactEmail,
      address: settings?.address || orgData?.officeAddress,
      bankDetails: settings?.bankDetails || orgData?.bankDetails,
      cityState: orgData?.cityState,
      gstin: orgData?.gstin,
      legalName: orgData?.legalName,
      signatoryName: orgData?.signatoryName,
      signatoryTitle: orgData?.signatoryTitle,
      tagline: orgData?.tagline,
      about: orgData?.about,
      themeColor: orgData?.themeColor,
    } as any,
    inputs.clientBoq,
    inputs.clientBoqBaseline,
    await gatherPortalScopeAdditions(inputs.tenantId || orgData?.tenantId, inputs.projectId),
    inputs.portalMoney,
    await portalScheduleToSend(inputs.projectId, inputs.clientSchedule),
    await gatherPortalDesignRecord(inputs.tenantId || orgData?.tenantId, inputs.projectId),
  );
}
