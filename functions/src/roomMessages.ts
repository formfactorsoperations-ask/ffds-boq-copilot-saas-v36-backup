import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { cleanEmails } from "./designViewStrip";
import { notify } from "./notify";
import { roomMessageDraft } from "../../lib/notify";

/*
  ROOM MESSAGES (lib/roomMessages.ts): telling the people on the project.

  A message is written by the browser, under the security rules. This runs
  once it is saved and puts a note in the bell of everyone who can read it:
  the Design Head and the Ops Director (and the Owners and Admins, who hear
  everything the studio hears), and the Designers, Client Relations and Site
  Supervisors on the project. Those three lists are read from the server's own
  copies of the project (designView, teamView), which are what the rules check,
  so nobody is told about a message they could not open. The writer is not
  told. Best effort, like every note: a failure is logged, never thrown.
*/

const db = () => admin.firestore();

export const onRoomMessageCreated = onDocumentCreated("projects/{projectId}/roomMessages/{messageId}", async (event) => {
  const m: any = event.data?.data();
  const projectId = event.params.projectId;
  const tenantId = String(m?.tenantId || "");
  if (!m || !tenantId || !String(m.text || "").trim()) return;

  const project = db().collection("projects").doc(projectId);
  const [design, ops, site] = await Promise.all([
    project.collection("designView").doc("current").get(),
    project.collection("teamView").doc("ops").get(),
    project.collection("teamView").doc("site").get(),
  ]);
  /* A copy counts only when it belongs to the message's studio. */
  const own = (s: FirebaseFirestore.DocumentSnapshot): any => (s.exists && s.data()?.tenantId === tenantId ? s.data() : null);
  const people = cleanEmails([...(own(design)?.designers || []), ...(own(ops)?.members || []), ...(own(site)?.members || [])]);

  await notify({ tenantId, projectId, actorEmail: m.by?.email || null }, [roomMessageDraft({
    projectId,
    projectName: own(design)?.name || null,
    room: String(m.room || ""),
    text: String(m.text || ""),
    actor: String(m.by?.name || ""),
  }, people)]);
});
