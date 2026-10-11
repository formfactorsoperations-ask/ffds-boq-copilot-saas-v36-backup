import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as pako from "pako";
import { createHash } from "crypto";
import { PLATFORM_OWNER_EMAILS } from "./guards";
import { cleanEmails, designViewOf, storedProject as stored } from "./designViewStrip";
import { deleteTeamViews, writeTeamViews } from "./teamView";

const storedProject = (data: any) =>
  stored(data, (b64) => Buffer.from(pako.inflate(Buffer.from(b64, "base64"))).toString("utf-8"));

/*
  THE DESIGNER'S COPY OF A PROJECT.

  A Designer used to read the project document itself, and the screens hid
  the money. The document is the whole project: approved values, discounts,
  the billable share, payment schedules, the agreement, the priced BOQ with
  base rates and margin overrides, and the client's portal token. Anyone with
  a Designer login and the browser console had all of it, for every project
  in the studio, assigned or not.

  So a Designer now reads this instead: a copy made here, on the server, from
  every write to the project, with the money taken out -- by name for the
  sections that are money, and by key wherever a price, rate, cost, margin or
  token turns up inside what is left. The rules give a Designer this copy and
  nothing else of the project, and only for projects they are assigned to.

  Stored at projects/{id}/designView/current, compressed like a large project,
  with the assigned Designers' emails beside it for the rules to check.
*/

const db = () => admin.firestore();

/** The people assigned to a project (projectDesigners holds every role's assignments), and the studio's team list. */
async function assignedFor(projectId: string, tenantId: string | null, project: any): Promise<{ designers: string[]; team: any[] }> {
  let mapped: string[] = [];
  let team: any[] = [];
  if (tenantId) {
    const org = (await db().collection("organizations").doc(tenantId).get()).data();
    mapped = cleanEmails(org?.projectDesigners?.[projectId]);
    team = Array.isArray(org?.team) ? org!.team : [];
  }
  return { designers: [...new Set([...mapped, ...cleanEmails(project?.context?.assignedDesigners)])], team };
}

async function writeDesignView(projectId: string, data: any): Promise<"written" | "unchanged" | "skipped"> {
  const project = storedProject(data);
  if (!project) return "skipped";
  project.id = project.id || projectId;
  const view = designViewOf(project);
  const json = JSON.stringify(view);
  const { designers, team } = await assignedFor(projectId, view.tenantId, project);
  // The Client Relations and Site Supervisor copies, from the same read (teamView.ts).
  await writeTeamViews(projectId, { ...project, tenantId: view.tenantId }, designers, team);
  const hash = createHash("sha256").update(json).update(designers.join(",")).digest("hex").slice(0, 32);
  const ref = db().collection("projects").doc(projectId).collection("designView").doc("current");
  const existing = await ref.get();
  if (existing.exists && existing.data()?.hash === hash) return "unchanged";
  await ref.set({
    tenantId: view.tenantId,
    designers,
    legacyDesigners: cleanEmails(project?.context?.assignedDesigners),
    name: project?.context?.name || null,
    hash,
    updatedAt: Date.now(),
    compressedData: Buffer.from(pako.deflate(json)).toString("base64"),
  });
  return "written";
}

/** Every write to a project refreshes its Designer copy; a deleted project takes it along. */
export const onProjectWrittenDesignView = onDocumentWritten("projects/{projectId}", async (event) => {
  const projectId = event.params.projectId;
  const after = event.data?.after;
  if (!after?.exists) {
    await db().collection("projects").doc(projectId).collection("designView").doc("current").delete().catch(() => undefined);
    await deleteTeamViews(projectId);
    return;
  }
  await writeDesignView(projectId, after.data());
});

/**
 * A studio assigning or unassigning a Designer: the copies of the projects
 * whose list changed get the new list at once, so access follows the
 * assignment rather than the next save of the project.
 */
export const onDesignerAssignmentChange = onDocumentUpdated("organizations/{orgId}", async (event) => {
  const before: Record<string, any> = event.data?.before.data()?.projectDesigners || {};
  const after: Record<string, any> = event.data?.after.data()?.projectDesigners || {};
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const id of ids) {
    if (cleanEmails(before[id]).join(",") === cleanEmails(after[id]).join(",")) continue;
    const ref = db().collection("projects").doc(id).collection("designView").doc("current");
    const view = await ref.get();
    /* The other copies' member lists follow the same map: rebuild them from the project. */
    const project = await db().collection("projects").doc(id).get();
    if (project.exists) {
      const stored = storedProject(project.data());
      if (stored) {
        stored.id = stored.id || id;
        const tenantId = stored.tenantId || event.params.orgId;
        if (tenantId === event.params.orgId) {
          const designers = [...new Set([...cleanEmails(after[id]), ...cleanEmails(stored?.context?.assignedDesigners)])];
          await writeTeamViews(id, { ...stored, tenantId }, designers, event.data?.after.data()?.team || []);
        }
      }
    }
    if (!view.exists) {
      if (project.exists) await writeDesignView(id, project.data());
      continue;
    }
    const designers = [...new Set([...cleanEmails(after[id]), ...cleanEmails(view.data()?.legacyDesigners)])];
    await ref.set({ designers, updatedAt: Date.now() }, { merge: true });
  }
});

/** Builds the copies -- Designer, Client Relations, Site Supervisor -- for every project once (platform owner only), for projects not saved since they shipped. */
export const rebuildDesignViews = onCall({ timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
  const email = String(request.auth?.token?.email || "").toLowerCase();
  if (!request.auth || request.auth.token?.email_verified !== true || !PLATFORM_OWNER_EMAILS.includes(email)) {
    throw new HttpsError("permission-denied", "Platform admin access only.");
  }
  const counts = { written: 0, unchanged: 0, skipped: 0 };
  const projects = await db().collection("projects").get();
  for (const p of projects.docs) counts[await writeDesignView(p.id, p.data())]++;
  logger.info("rebuildDesignViews", { by: request.auth.uid, ...counts });
  return counts;
});
