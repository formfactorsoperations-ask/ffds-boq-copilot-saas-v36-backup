import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { portalDrafts } from "../../lib/notify";
import { notifyClients } from "./notify";

/*
  "NEW FOR YOU" IN THE CLIENT'S PORTAL (lib/notify.ts portalDrafts).

  The studio releases what a client sees by rebuilding the project's portal
  view, projects/{projectId}/portalView/current (services/portalRelease.ts).
  This compares the build before with the build after and tells the project's
  clients what is new: a document to approve, minutes to acknowledge, an
  answer about a finish, a meeting record to confirm, an invoice, a decision,
  site updates. Only additions and answers count, so the client's own actions,
  which rebuild the view too, never notify them.

  The clients are the sign-ins made for this project by createClientLogin
  (users/{uid}, role Client, projectIds). Their notes live at
  portalInbox/{uid}/notes, keyed by sign-in because a client's address is not
  verified (firestore.rules). Best effort, like every note: a failure is
  logged and the release stands.
*/

const db = () => admin.firestore();

export const onPortalViewWritten = onDocumentWritten("projects/{projectId}/portalView/{viewId}", async (event) => {
  if (event.params.viewId !== "current") return;
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after) return;
  const projectId = event.params.projectId;
  try {
    const studioName = String(after?.context?.portalStudio?.name || "") || null;
    const drafts = portalDrafts(before, after, { projectId, studioName });
    if (!drafts.length) return;
    /* Each client sign-in carries its studio (createClientLogin), so the project document, often a large compressed one, is not read. */
    const clients = await db().collection("users").where("projectIds", "array-contains", projectId).get();
    const byStudio = new Map<string, string[]>();
    for (const d of clients.docs) {
      const u = d.data() || {};
      if (u.role !== "Client" || !u.tenantId) continue;
      byStudio.set(String(u.tenantId), [...(byStudio.get(String(u.tenantId)) || []), d.id]);
    }
    await Promise.all([...byStudio.entries()].map(([tenantId, uids]) => notifyClients(tenantId, uids, drafts)));
  } catch (e: any) {
    logger.error("[portalNotify] could not tell the clients", { projectId, message: e?.message });
  }
});
