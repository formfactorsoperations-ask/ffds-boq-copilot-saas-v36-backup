import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { FieldPath } from "firebase-admin/firestore";
import { nextVisit, tabIdOf, type PortalVisit } from "../../lib/portalVisits";

/*
  portalPing: a signed-in client's portal saying which approved tab is open
  (lib/portalVisits, handoff "Clients overhaul" PR D).

  Counted only for a real client on their own project: users/{uid} has the
  role Client, the project is on their projectIds, and their studio is the
  project's (the same check as isProjectClient in firestore.rules). Anyone
  else -- every studio role, and so the studio's own preview of the portal --
  gets { ok: false } and nothing is written.

  It writes projects/{projectId}/portalVisits/{uid} and nothing else: never
  the project document, so it cannot collide with the studio's own saves. A
  ping on the same tab within 45 seconds writes nothing. A failure is the
  client's portal's to ignore: it never shows them anything.
*/

const db = () => admin.firestore();

export const portalPing = onCall({ cors: true, memory: "256MiB", timeoutSeconds: 20 }, async (request) => {
  const uid = request.auth?.uid;
  const projectId = String(request.data?.projectId || "");
  if (!uid || !projectId || projectId.includes("/") || projectId.length > 200) return { ok: false };

  try {
    const profile = (await db().collection("users").doc(uid).get()).data() || {};
    const projectIds: string[] = Array.isArray(profile.projectIds) ? profile.projectIds : [];
    if (profile.role !== "Client" || !projectIds.includes(projectId) || !profile.tenantId) return { ok: false };

    /* The project's studio, and nothing else of it: the document can be large. */
    const found = await db().collection("projects")
      .where(FieldPath.documentId(), "==", projectId)
      .select("tenantId")
      .get();
    const tenantId = found.docs[0]?.get("tenantId");
    if (!tenantId || tenantId !== profile.tenantId) return { ok: false };

    const ref = db().doc(`projects/${projectId}/portalVisits/${uid}`);
    const written = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const next = nextVisit(snap.exists ? (snap.data() as PortalVisit) : null, {
        uid,
        email: typeof request.auth?.token?.email === "string" ? String(request.auth.token.email).toLowerCase() : null,
        tenantId,
        projectId,
        tab: tabIdOf(request.data?.tab),
        now: Date.now(),
      });
      if (!next) return false;
      tx.set(ref, next);
      return true;
    });
    return { ok: true, written };
  } catch (e: any) {
    logger.warn("portalPing failed", { projectId, uid, error: e?.message || String(e) });
    return { ok: false };
  }
});
