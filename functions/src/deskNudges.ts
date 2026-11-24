import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { notify } from "./notify";
import { nudgeDraft } from "../../lib/notify";
import { dailyNudgeDue } from "../../lib/deskSmart";
import type { ReviewSummary } from "../../lib/drawingReview";

/*
  DESIGN DESK NUDGES (Design Desk 2.0, Phase 3A).

  Every morning at 10:00 the desk reminds whoever has held a drawing for more
  than a day: the Design Head when it waits for a check, its designer when it
  waits for changes or to be sent. The rule is lib/deskSmart.ts (heldBy,
  dailyNudgeDue): nobody is reminded twice within 20 hours, and the daily
  reminder stops after two weeks. A drawing with the client is not reminded
  here; the client's reminders are the approval email's own
  (designApprovalReminders).

  The reminder goes to the bell and the phone (functions/src/notify.ts). It
  changes nothing about the review beyond the stamp of when it went.
*/

const db = () => admin.firestore();
/* The same states the desk's own studio-wide list asks for, so this uses its index (review.orgId, review.state). */
const STATES = ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED"];

export const designDeskNudges = onSchedule({ schedule: "every day 10:00", timeZone: "Asia/Kolkata", timeoutSeconds: 300 }, async () => {
  const now = Date.now();
  const orgs = await db().collection("organizations").select().get();
  let sent = 0;
  for (const org of orgs.docs) {
    let held: FirebaseFirestore.QuerySnapshot;
    try {
      held = await db().collectionGroup("drawingTracker").where("review.orgId", "==", org.id).where("review.state", "in", STATES).get();
    } catch (e: any) {
      logger.error("designDeskNudges could not list a studio's drawings", { orgId: org.id, message: e?.message });
      continue;
    }
    for (const doc of held.docs) {
      const review = doc.data()?.review as (ReviewSummary & { nudgedAt?: number | null }) | undefined;
      if (!review?.projectId || !dailyNudgeDue(review, now)) continue;
      try {
        /* Claimed first, so a retried run never reminds the same person twice. */
        const due = await db().runTransaction(async (tx) => {
          const fresh = (await tx.get(doc.ref)).data();
          const h = dailyNudgeDue(fresh?.review, now);
          if (!h) return null;
          tx.update(doc.ref, { "review.nudgedAt": now });
          return { held: h, sheet: String(fresh?.name || ""), review: fresh!.review as ReviewSummary };
        });
        if (!due) continue;
        sent += await notify({ tenantId: org.id, projectId: review.projectId }, [nudgeDraft({
          projectId: review.projectId, projectName: due.review.projectName || null, sheet: due.sheet,
          who: due.held.who, days: due.held.days, ask: due.held.ask, designerEmail: due.review.designer?.email || null,
        })]);
      } catch (e: any) {
        logger.error("designDeskNudges failed for a drawing", { path: doc.ref.path, message: e?.message });
      }
    }
  }
  logger.info("designDeskNudges done", { studios: orgs.size, notes: sent });
});
