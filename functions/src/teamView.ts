import * as admin from "firebase-admin";
import * as pako from "pako";
import { createHash } from "crypto";
import { cleanEmails } from "./designViewStrip";
import { opsViewOf, siteViewOf } from "./teamViewStrip";
import { opsAccessOf, coverEmailsFor, activeCovers } from "../../lib/opsAccess";

/*
  THE CLIENT RELATIONS AND SITE SUPERVISOR COPIES OF A PROJECT.

  The same arrangement as the Designer's copy (designView.ts), for the two
  other roles that work on assigned projects only. Each reads a copy the
  server makes from every write to the project, with the money taken out and
  what their work needs kept:

    projects/{id}/teamView/ops   Client Relations: client details, timeline,
                                 decisions, drawings, and what the client owes.
    projects/{id}/teamView/site  Site Supervisor: the site work, no money.

  `members` lists the emails assigned to the project, for the rules to check
  alongside the reader's role. Assignment is the studio's projectDesigners map
  (one list of the people on each project, whatever their role), and for a
  Supervisor also the project's own assignedSupervisors, which names team
  members by id.
*/

export type TeamViewKind = "ops" | "site";
export const TEAM_VIEW_KINDS: TeamViewKind[] = ["ops", "site"];

const db = () => admin.firestore();
const viewRef = (projectId: string, kind: TeamViewKind) =>
  db().collection("projects").doc(projectId).collection("teamView").doc(kind);

/** Emails of the team members a project names in assignedSupervisors. */
export function supervisorEmails(project: any, team: any[]): string[] {
  const ids = new Set((Array.isArray(project?.context?.assignedSupervisors) ? project.context.assignedSupervisors : []).map(String));
  if (!ids.size) return [];
  return cleanEmails((Array.isArray(team) ? team : []).filter((m: any) => m && ids.has(String(m.id))).map((m: any) => m.email));
}

/** The project's Drive folder, as Studio settings → Google Drive made it (googleDrive.ts). */
async function driveFolderOf(tenantId: string | null, projectId: string): Promise<{ link?: string | null } | null> {
  if (!tenantId) return null;
  const conn = (await db().doc(`driveConnections/${tenantId}`).get().catch(() => null))?.data();
  const known = conn?.projects?.[projectId];
  return known?.folderId ? { link: known.link || `https://drive.google.com/drive/folders/${known.folderId}` } : null;
}

/**
 * Write both copies for one project. `assigned` is the project's people from
 * the projectDesigners map; `team` is the studio's team list, for the
 * Supervisors named by id; `org` is the studio, for the Ops Desk's "Who sees
 * what" switches and any cover a lead has given (lib/opsAccess).
 */
export async function writeTeamViews(projectId: string, project: any, assigned: string[], team: any[], org?: any): Promise<void> {
  const tenantId = project?.tenantId || null;
  const supervisors = supervisorEmails(project, team);
  const access = opsAccessOf(org);
  const now = Date.now();
  const drive = access.drive ? await driveFolderOf(tenantId, projectId) : null;
  const covers = activeCovers(org, now).filter((c) => c.projectIds.includes(projectId))
    .map((c) => ({ email: c.email, name: c.name, forName: c.forName, until: c.until }));
  for (const kind of TEAM_VIEW_KINDS) {
    const view = kind === "ops" ? { ...opsViewOf(project, access, drive), cover: covers } : siteViewOf(project);
    const json = JSON.stringify(view);
    const members = [...new Set(kind === "site" ? [...assigned, ...supervisors] : [...assigned, ...coverEmailsFor(projectId, org, now)])];
    const hash = createHash("sha256").update(json).update(members.join(",")).digest("hex").slice(0, 32);
    const ref = viewRef(projectId, kind);
    const existing = await ref.get();
    if (existing.exists && existing.data()?.hash === hash) continue;
    await ref.set({
      tenantId,
      kind,
      members,
      name: project?.context?.name || null,
      status: project?.context?.status || null,
      hash,
      updatedAt: Date.now(),
      compressedData: Buffer.from(pako.deflate(json)).toString("base64"),
    });
  }
}

export async function deleteTeamViews(projectId: string): Promise<void> {
  for (const kind of TEAM_VIEW_KINDS) await viewRef(projectId, kind).delete().catch(() => undefined);
}

/** Whether this email is on this project's copy of this kind, for the callables that act on a project. */
export async function isTeamViewMember(projectId: string, tenantId: string, email: string, kind: TeamViewKind): Promise<boolean> {
  const view = (await viewRef(projectId, kind).get()).data();
  return !!view && view.tenantId === tenantId && Array.isArray(view.members) && view.members.includes(String(email || "").toLowerCase());
}
