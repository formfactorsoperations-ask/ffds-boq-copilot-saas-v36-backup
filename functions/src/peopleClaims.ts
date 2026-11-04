import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { contextOf, fail, PEOPLE_REGION, type Ctx } from "./peopleDesk";
import { notify } from "./notify";
import { claimDecidedDraft, claimDeletedDraft, claimLoggedDraft } from "../../lib/notify";
import { DomainError, addDays, businessDate } from "../../lib/peopleDesk";
import {
  DEFAULT_RATES, FOR_LABELS, PURPOSE_LABELS, canDecide, canDelete, claimsView, cleanClaim, cleanRates, decideClaim, isFounder, payClaim, withdrawClaim,
  type Claim, type ClaimRates, type ClaimsView,
} from "../../lib/peopleClaims";

/*
  PEOPLE'S TRAVEL CLAIMS, ON THE SERVER (lib/peopleClaims.ts has the rules).

  Beside attendance under peopleDesk/{studio}, which no browser may read or
  write (firestore.rules):

    claims/{id}          a trip logged for reimbursement
    claimReceipts/{id}   its receipt (a small photo or PDF), apart, so the
                         list stays light; only its person and the founders
                         may open it
    settings/claims      the rates a kilometre, set by the founders

    peopleClaims         your trips; a founder's view also has everyone's,
                         what waits for them and what is ready to pay
    peopleClaimsCommand  log, take back, delete, decide, mark paid, set the
                         rates, open a receipt

  Who someone is, and whether they are a founder (a People admin), comes from
  People's own context (functions/src/peopleDesk.ts).
*/

const db = () => admin.firestore();
const base = (tenantId: string) => `peopleDesk/${tenantId}`;
/** How far back a founder's view reaches: the monthly report covers a year. */
const VIEW_DAYS = 400;
const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;
const CLAIM_ID = /^[A-Za-z0-9_-]{1,250}$/;
/** A receipt, base64, kept well under Firestore's 1 MB a document. */
const RECEIPT_MAX = 900_000;
const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

async function ratesOf(root: string): Promise<ClaimRates> {
  const d = (await db().doc(`${root}/settings/claims`).get()).data();
  return d?.rates ? { ...DEFAULT_RATES, ...d.rates } : DEFAULT_RATES;
}

async function viewFor(ctx: Ctx, now: string): Promise<ClaimsView> {
  const root = base(ctx.tenantId);
  const from = addDays(businessDate(now, ctx.policy.timezone), -VIEW_DAYS);
  /* A founder reads the studio's year; anyone else only their own (no composite index: the date is filtered here). */
  const [snap, rates] = await Promise.all([
    isFounder(ctx.me)
      ? db().collection(`${root}/claims`).where("date", ">=", from).get()
      : db().collection(`${root}/claims`).where("personId", "==", ctx.me.id).get(),
    ratesOf(root),
  ]);
  const claims = snap.docs.map((d) => d.data() as Claim).filter((c) => c.date >= from);
  return claimsView(claims, ctx.me, ctx.people, rates);
}

export const peopleClaims = onCall({ cors: true, region: PEOPLE_REGION }, async (request) => {
  try {
    const ctx = await contextOf(request);
    return { ok: true, view: await viewFor(ctx, new Date().toISOString()) };
  } catch (e) {
    return fail(e);
  }
});

/** The founders who can decide a person's trips, to ask them. */
const decidersFor = (ctx: Ctx, personId: string) =>
  ctx.people.filter((p) => p.email && p.id !== "platform-owner" && canDecide(p, { personId }, ctx.people)).map((p) => String(p.email));

export const peopleClaimsCommand = onCall({ cors: true, region: PEOPLE_REGION, memory: "512MiB" }, async (request) => {
  try {
    const ctx = await contextOf(request);
    const action = String(request.data?.action || "");
    const data: any = request.data?.data || {};
    if (typeof data !== "object" || JSON.stringify(data).length > RECEIPT_MAX + 8000) throw new DomainError("INVALID", "That is too large. Try a smaller photo of the receipt.");
    const now = new Date().toISOString();
    const today = businessDate(now, ctx.policy.timezone);
    const root = base(ctx.tenantId);
    const by = { tenantId: ctx.tenantId, actorEmail: ctx.me.email || null };
    let extra: Record<string, unknown> = {};

    switch (action) {
      case "log": {
        const clean = cleanClaim(data, await ratesOf(root), today);
        /* The browser names the trip, so a retry after a dropped connection logs it once. */
        const key = String(data.id || "");
        if (!SAFE_ID.test(key)) throw new DomainError("INVALID", "Invalid request.");
        const id = `${ctx.me.id}_${key}`;
        let receipt: { type: string; data: string } | null = null;
        if (data.receipt) {
          const type = String(data.receipt.type || "");
          const body = String(data.receipt.data || "");
          if (!RECEIPT_TYPES.includes(type) || !/^[A-Za-z0-9+/=]+$/.test(body)) throw new DomainError("INVALID", "The receipt should be a photo or a PDF.");
          if (body.length > RECEIPT_MAX) throw new DomainError("INVALID", "That receipt is too large. Try a smaller photo.");
          receipt = { type, data: body };
        }
        const claim: Claim = { id, personId: ctx.me.id, ...clean, receipt: !!receipt, status: "Pending", createdAt: now, decisions: [] };
        const ref = db().doc(`${root}/claims/${id}`);
        const created = await db().runTransaction(async (tx) => {
          if ((await tx.get(ref)).exists) return false; // the same trip, sent again
          tx.create(ref, plain(claim));
          if (receipt) tx.set(db().doc(`${root}/claimReceipts/${id}`), { ...receipt, personId: ctx.me.id, at: now });
          return true;
        });
        if (created) {
          await notify(by, [claimLoggedDraft({ ...claim, purpose: PURPOSE_LABELS[claim.purpose], forName: claim.for ? `${FOR_LABELS[claim.for.kind]}: ${claim.for.name}` : '' }, { name: ctx.me.name, personId: ctx.me.id, emails: decidersFor(ctx, ctx.me.id).filter((e) => e !== ctx.me.email) })]);
        }
        extra = { id };
        break;
      }
      case "withdraw": {
        const ref = db().doc(`${root}/claims/${claimId(data.claimId)}`);
        await db().runTransaction(async (tx) => {
          const doc = await tx.get(ref);
          if (!doc.exists) throw new DomainError("NOT_FOUND", "That trip is gone.", 404);
          tx.set(ref, plain(withdrawClaim(doc.data() as Claim, ctx.me, now)));
        });
        break;
      }
      case "delete": {
        const id = claimId(data.claimId);
        const ref = db().doc(`${root}/claims/${id}`);
        const gone = await db().runTransaction(async (tx) => {
          const doc = await tx.get(ref);
          if (!doc.exists) return null; // already deleted: sent again after a dropped connection
          const c = doc.data() as Claim;
          if (!canDelete(ctx.me, c)) {
            throw new DomainError("FORBIDDEN", c.personId === ctx.me.id ? "An approved trip can only be deleted by a founder." : "Only a founder can delete someone else's trip.", 403);
          }
          tx.delete(ref);
          tx.delete(db().doc(`${root}/claimReceipts/${id}`));
          return c;
        });
        const person = gone && gone.personId !== ctx.me.id ? ctx.people.find((p) => p.id === gone.personId) : null;
        if (gone && person?.email) await notify(by, [claimDeletedDraft(gone, { byName: ctx.me.name, toEmail: person.email })]);
        break;
      }
      case "decide": {
        /* One trip, or several of one person's at once ("Approve all"). */
        const ids: string[] = (Array.isArray(data.claimIds) ? data.claimIds : [data.claimId]).slice(0, 60).map(claimId);
        const decision = data.decision === "reject" ? "reject" : "approve";
        const decided = await db().runTransaction(async (tx) => {
          const docs = await Promise.all(ids.map((id) => tx.get(db().doc(`${root}/claims/${id}`))));
          const out: Claim[] = [];
          for (const d of docs) {
            if (!d.exists) throw new DomainError("NOT_FOUND", "One of those trips is gone. Refresh and try again.", 404);
            const c = d.data() as Claim;
            /* Sent again after a dropped connection: already decided the same way, so nothing to do. */
            if (c.status === (decision === "approve" ? "Approved" : "Rejected") && c.decisions[c.decisions.length - 1]?.by === ctx.me.id) continue;
            const next = decideClaim(c, ctx.me, ctx.people, decision, data.note, now);
            tx.set(d.ref, plain(next));
            out.push(next);
          }
          return out;
        });
        await tell(ctx, decided, decision === "approve" ? "Approved" : "Rejected", String(data.note || ""));
        break;
      }
      case "pay": {
        const ids: string[] = (Array.isArray(data.claimIds) ? data.claimIds : [data.claimId]).slice(0, 200).map(claimId);
        const paid = await db().runTransaction(async (tx) => {
          const docs = await Promise.all(ids.map((id) => tx.get(db().doc(`${root}/claims/${id}`))));
          const out: Claim[] = [];
          for (const d of docs) {
            if (!d.exists) throw new DomainError("NOT_FOUND", "One of those trips is gone. Refresh and try again.", 404);
            const c = d.data() as Claim;
            if (c.status === "Paid") continue;
            const next = payClaim(c, ctx.me, ctx.people, now);
            tx.set(d.ref, plain(next));
            out.push(next);
          }
          return out;
        });
        await tell(ctx, paid, "Paid", "");
        break;
      }
      case "rates": {
        if (!isFounder(ctx.me)) throw new DomainError("FORBIDDEN", "Only a founder can change the rates.", 403);
        await db().doc(`${root}/settings/claims`).set({ rates: cleanRates(data), updatedAt: now, updatedBy: ctx.me.id }, { merge: true });
        break;
      }
      case "receipt": {
        const id = claimId(data.claimId);
        const doc = await db().doc(`${root}/claimReceipts/${id}`).get();
        if (!doc.exists) throw new DomainError("NOT_FOUND", "No receipt was added to this trip.", 404);
        const r = doc.data() as { type: string; data: string; personId: string };
        if (r.personId !== ctx.me.id && !isFounder(ctx.me)) throw new DomainError("FORBIDDEN", "Only the person who logged it, or a founder, can open this receipt.", 403);
        /* Only the receipt: the view is unchanged. */
        return { ok: true, receipt: { type: r.type, data: r.data } };
      }
      default:
        throw new DomainError("INVALID", "Unknown action.");
    }
    return { ok: true, view: await viewFor(ctx, now), ...extra };
  } catch (e) {
    return fail(e);
  }
});

function claimId(v: unknown): string {
  const id = String(v || "");
  if (!CLAIM_ID.test(id)) throw new DomainError("NOT_FOUND", "That trip is gone.", 404);
  return id;
}

/** Each person whose trips were decided or paid hears it once: one note for theirs together. */
async function tell(ctx: Ctx, list: Claim[], status: "Approved" | "Rejected" | "Paid", note: string) {
  const byPerson = new Map<string, Claim[]>();
  for (const c of list) byPerson.set(c.personId, [...(byPerson.get(c.personId) || []), c]);
  const drafts = [...byPerson.entries()].map(([personId, trips]) => {
    const person = ctx.people.find((p) => p.id === personId);
    if (!person?.email || person.id === ctx.me.id) return null;
    const amount = trips.reduce((n, c) => n + c.amount, 0);
    return claimDecidedDraft({ status, amount, count: trips.length, place: trips.length === 1 ? trips[0].place : `${trips.length} trips`, note }, { byName: ctx.me.name, toEmail: person.email });
  });
  if (drafts.some(Boolean)) await notify({ tenantId: ctx.tenantId, actorEmail: ctx.me.email || null }, drafts);
}
