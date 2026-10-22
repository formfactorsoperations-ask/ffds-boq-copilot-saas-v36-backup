import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { cleanEmails } from "./designViewStrip";
import { supervisorEmails } from "./teamView";
import { resolveAudience, stamp, type Draft } from "../../lib/notify";

/*
  WRITING NOTES (lib/notify.ts decides what they say and who they are for).

  Called by the server calls that save a change -- a client's portal action,
  a People command, a site action, a Design Desk review, an escalation, a
  website enquiry -- straight after the change is saved, so a note reaches the
  open StudioDesk of everyone it is for in about the time it took to save.

  Best effort. A note that fails to write is logged and dropped: the change it
  describes has already happened, and refusing the client's signature because
  the Ops Director's inbox could not be written would be the wrong way round.

  Notes live at inbox/{email}/notes/{id}, keyed by the lowercased address the
  studio's team list holds, which is also how a person is admitted to the
  studio (access.ts). Only the Admin SDK writes them; a person may read their
  own and mark them read, done or snoozed (firestore.rules).
*/

const db = () => admin.firestore();
/** No one person gets more than this from one change, and no change writes to more than this many people. */
const MAX_RECIPIENTS = 40;

export interface Where {
  tenantId: string;
  /** The project the change is on, for the project's seats (Client Relations, Designers, Supervisors). */
  projectId?: string | null;
  /** Who made the change; they are never told. */
  actorEmail?: string | null;
  /** The studio record, when the caller already has it. */
  org?: any;
  /** The project as stored, when the caller already has it (for its named Supervisors). */
  project?: any;
}

async function audienceContext(w: Where) {
  const org = w.org || (await db().doc(`organizations/${w.tenantId}`).get()).data() || {};
  const team: any[] = Array.isArray(org.team) ? org.team : [];
  const assigned = w.projectId ? cleanEmails(org?.projectDesigners?.[w.projectId]) : [];
  const site = w.projectId && w.project ? supervisorEmails(w.project, team) : [];
  return { team, assigned, site };
}

/** Write each draft into the inbox of everyone it resolves to. Never throws. */
export async function notify(w: Where, drafts: (Draft | null | undefined)[]): Promise<number> {
  const list = drafts.filter(Boolean) as Draft[];
  if (!list.length || !w.tenantId) return 0;
  try {
    const ctx = await audienceContext(w);
    const at = Date.now();
    const batch = db().batch();
    let n = 0;
    for (const d of list) {
      const to = resolveAudience(d.to, { ...ctx, actorEmail: w.actorEmail }).slice(0, MAX_RECIPIENTS);
      const note = { ...stamp(d, at), tenantId: w.tenantId };
      for (const email of to) {
        batch.set(db().collection("inbox").doc(email).collection("notes").doc(), note);
        n++;
      }
    }
    if (n) await batch.commit();
    return n;
  } catch (e: any) {
    logger.error("[notify] could not write notes", { tenantId: w.tenantId, kinds: list.map((d) => d.kind), message: e?.message });
    return 0;
  }
}
