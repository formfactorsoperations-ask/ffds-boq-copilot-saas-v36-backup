import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { drawingCounts } from "../../lib/projectHealth";
import { requireStaff, type Staff } from "./guards";

/*
  THE PROJECTS SCREEN'S DRAWING COUNTS (lib/projectHealth.ts; DESIGN.md
  "Projects: journey, needs you, one list", health rings).

  A project's drawings live in organizations/{orgId}/projects/{id}/drawingTracker,
  written from the drawing tracker, both Design Desks and the design meeting
  and review functions. The Projects list does not load them, so every change
  to one is counted here, and one small summary per project is kept at
  organizations/{orgId}/projectHealth/{projectId}: how many drawings, how many
  issued to the client. Only this function writes it (firestore.rules); the
  studio reads it with one listener.

  rebuildProjectHealth counts every project of a studio once. The Projects
  screen asks for it the first time a senior role opens it and the studio has
  no counts yet, so nothing has to be run by hand after a deploy.
*/

/** The few Firestore calls this needs, so the counting can be tested without a database. */
type Db = Pick<admin.firestore.Firestore, "doc" | "collection">;
const db = (): Db => admin.firestore();

/** Count one project's drawings and keep the summary; unchanged counts are not written again. */
export async function writeDrawingCounts(store: Db, orgId: string, projectId: string): Promise<"written" | "unchanged"> {
  const tracker = await store.collection(`organizations/${orgId}/projects/${projectId}/drawingTracker`).get();
  const drawings = drawingCounts(tracker.docs.map((d) => d.data()));
  const ref = store.doc(`organizations/${orgId}/projectHealth/${projectId}`);
  const now = (await ref.get()).data() as any;
  if (now?.drawings?.total === drawings.total && now?.drawings?.issued === drawings.issued) return "unchanged";
  await ref.set({ projectId, drawings, updatedAt: Date.now() }, { merge: true });
  return "written";
}

/** Count every project of a studio: its own senior roles, or the platform owner for any studio. */
export async function rebuildFor(store: Db, staff: Staff, requested?: string | null): Promise<{ projects: number; written: number; unchanged: number }> {
  const tenantId = String(requested || staff.tenantId || "");
  if (!tenantId) throw new HttpsError("invalid-argument", "Which studio?");
  if (!staff.platformOwner && staff.tenantId !== tenantId) throw new HttpsError("permission-denied", "Not your studio.");
  const projects = await store.collection(`organizations/${tenantId}/projects`).select().get();
  const counts = { written: 0, unchanged: 0 };
  for (const p of projects.docs) counts[await writeDrawingCounts(store, tenantId, p.id)]++;
  return { projects: projects.size, ...counts };
}

/** A drawing added, changed or removed: its project's counts follow. */
export const onDrawingTrackerWrittenHealth = onDocumentWritten(
  "organizations/{orgId}/projects/{projectId}/drawingTracker/{drawingId}",
  async (event) => {
    const { orgId, projectId } = event.params as { orgId: string; projectId: string };
    try {
      await writeDrawingCounts(db(), orgId, projectId);
    } catch (e: any) {
      logger.error("[projectHealth] drawing count failed", { orgId, projectId, error: String(e?.message || e) });
    }
  },
);

/** Who may ask for every project to be counted (requireStaff lets the platform owner through as well). */
export const SENIOR = new Set(["Super Admin", "Owner", "Admin", "Ops Director"]);

/** Count every project of a studio once: the studio's senior roles, or the platform owner for any studio. */
export const rebuildProjectHealth = onCall({ timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  const staff = await requireStaff(request, SENIOR);
  const out = await rebuildFor(db(), staff, request.data?.tenantId);
  logger.info("rebuildProjectHealth", { tenantId: request.data?.tenantId || staff.tenantId, by: staff.uid, ...out });
  return out;
});
