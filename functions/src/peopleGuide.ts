import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { contextOf, fail, PEOPLE_REGION, type Ctx } from "./peopleDesk";
import { notify } from "./notify";
import { emergencyOpenedDraft, kudosDraft } from "../../lib/notify";
import { DomainError, businessDate } from "../../lib/peopleDesk";
import {
  cleanEmergency, cleanEssentials, cleanKudos, cleanOffice, cleanReason, guideView, isGuideAdmin, openCards, parseCardId, signCard,
  type Emergency, type GuideView, type Kudos, type OfficeDetails, type Opening, type Wish,
} from "../../lib/peopleGuide";

/*
  PEOPLE'S OFFICE GUIDE, ON THE SERVER (lib/peopleGuide.ts has the rules).

  Beside attendance under peopleDesk/{studio}, which no browser may read or
  write (firestore.rules):

    office/{personId}     desk, computer, office mobile, extension, birthday
    guide/essentials      Wi-Fi, address, printers, office help, emergencies
    cards/{cardId}        the wishes on a birthday or anniversary card
    kudos/{id}            thank-yous on the kudos wall
    emergency/{personId}  a person's emergency contacts, and every opening

    peopleGuide         what the signed-in person may see of all that
    peopleGuideCommand  change it: admins edit the guide and essentials and
                        open emergency contacts (with a reason, recorded and
                        told to the person); everyone signs cards, thanks
                        people and keeps their own emergency contacts.

  Who someone is, and whether they are an admin, comes from People's own
  context (functions/src/peopleDesk.ts), so the two never disagree.
*/

const db = () => admin.firestore();
const base = (tenantId: string) => `peopleDesk/${tenantId}`;
/** How far back the kudos wall reaches. */
const KUDOS_DAYS = 62;
const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;
/* A thank-you is named `${author}_${the browser's ID}`. */
const KUDOS_ID = /^[A-Za-z0-9_-]{1,250}$/;

/* Firestore keeps no undefined values; a JSON round trip drops them. */
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

async function viewFor(ctx: Ctx, now: string): Promise<GuideView> {
  const root = base(ctx.tenantId);
  const today = businessDate(now, ctx.policy.timezone);
  const admin = isGuideAdmin(ctx.me);
  const kudosFrom = new Date(Date.parse(now) - KUDOS_DAYS * 86400000).toISOString();
  const [offices, essentials, kudos, mine, roll] = await Promise.all([
    db().collection(`${root}/office`).get(),
    db().doc(`${root}/guide/essentials`).get(),
    db().collection(`${root}/kudos`).where("at", ">=", kudosFrom).get(),
    db().doc(`${root}/emergency/${ctx.me.id}`).get(),
    /* Only when each person last checked theirs: the contacts stay where they are. */
    admin ? db().collection(`${root}/emergency`).select("checkedAt").get() : null,
  ]);
  const officeMap: Record<string, Partial<OfficeDetails>> = {};
  offices.docs.forEach((d) => { officeMap[d.id] = d.data() as OfficeDetails; });
  const open = openCards(ctx.people, officeMap, today);
  const cardDocs = open.length ? await db().getAll(...open.map((c) => db().doc(`${root}/cards/${c.id}`))) : [];
  const cards: Record<string, Wish[]> = {};
  cardDocs.forEach((d) => { if (d.exists) cards[d.id] = (d.data()?.wishes || []) as Wish[]; });
  const checked: Record<string, string> = {};
  roll?.docs.forEach((d) => { checked[d.id] = String(d.data()?.checkedAt || ""); });
  return guideView({
    people: ctx.people,
    offices: officeMap,
    essentials: essentials.exists ? (essentials.data() as any) : null,
    cards,
    kudos: kudos.docs.map((d) => d.data() as Kudos),
    emergency: mine.exists ? (mine.data() as Emergency) : null,
    emergencyChecked: checked,
  }, ctx.me, today);
}

export const peopleGuide = onCall({ cors: true, region: PEOPLE_REGION }, async (request) => {
  try {
    const ctx = await contextOf(request);
    return { ok: true, view: await viewFor(ctx, new Date().toISOString()) };
  } catch (e) {
    return fail(e);
  }
});

const adminOnly = (ctx: Ctx) => {
  if (!isGuideAdmin(ctx.me)) throw new DomainError("FORBIDDEN", "Only an admin can change this.", 403);
};
const personIn = (ctx: Ctx, id: unknown) => {
  const p = ctx.people.find((x) => x.id === String(id || "") && x.active && x.id !== "platform-owner");
  if (!p) throw new DomainError("NOT_FOUND", "That person is not on the studio's team.", 404);
  return p;
};

export const peopleGuideCommand = onCall({ cors: true, region: PEOPLE_REGION }, async (request) => {
  try {
    const ctx = await contextOf(request);
    const action = String(request.data?.action || "");
    const data: any = request.data?.data || {};
    if (typeof data !== "object" || JSON.stringify(data).length > 8000) throw new DomainError("INVALID", "Request is too large.");
    const now = new Date().toISOString();
    const today = businessDate(now, ctx.policy.timezone);
    const root = base(ctx.tenantId);
    /* What only this command returns: an emergency contact list, once opened. */
    let extra: Record<string, unknown> = {};

    switch (action) {
      case "office": {
        adminOnly(ctx);
        const person = personIn(ctx, data.personId);
        const clean = cleanOffice(data, today);
        await db().doc(`${root}/office/${person.id}`).set(plain({ ...clean, updatedAt: now, updatedBy: ctx.me.id }));
        break;
      }
      case "essentials": {
        adminOnly(ctx);
        await db().doc(`${root}/guide/essentials`).set(plain({ ...cleanEssentials(data), updatedAt: now, updatedBy: ctx.me.id }));
        break;
      }
      case "wish": {
        const id = parseCardId(data.cardId);
        if (!id) throw new DomainError("NOT_FOUND", "That card is not open for signing.", 404);
        const office = (await db().doc(`${root}/office/${id.personId}`).get()).data() as OfficeDetails | undefined;
        const card = openCards(ctx.people, office ? { [id.personId]: office } : {}, today).find((c) => c.id === data.cardId);
        const ref = db().doc(`${root}/cards/${data.cardId}`);
        await db().runTransaction(async (tx) => {
          const doc = await tx.get(ref);
          const wishes = signCard((doc.data()?.wishes || []) as Wish[], card, ctx.me, data.text, now);
          tx.set(ref, plain({ personId: id.personId, kind: id.kind, date: id.date, wishes }));
        });
        break;
      }
      case "kudos": {
        const clean = cleanKudos(data, ctx.me, ctx.people);
        /* The browser names the thank-you, so a retry after a dropped connection pins it up once. */
        const key = String(data.id || "");
        if (!SAFE_ID.test(key)) throw new DomainError("INVALID", "Invalid request.");
        const id = `${ctx.me.id}_${key}`;
        const kudos: Kudos = { id, ...clean, from: ctx.me.id, at: now, hearts: [] };
        let created = true;
        await db().doc(`${root}/kudos/${id}`).create(plain(kudos)).catch((e: any) => {
          if (Number(e?.code) === 6) created = false; // already there: the same thank-you, sent again
          else throw e;
        });
        const to = ctx.people.find((p) => p.id === clean.to);
        if (created && to?.email) await notify({ tenantId: ctx.tenantId, actorEmail: ctx.me.email || null }, [kudosDraft(clean, { fromName: ctx.me.name, toEmail: to.email })]);
        break;
      }
      case "heart": {
        const id = String(data.kudosId || "");
        if (!KUDOS_ID.test(id)) throw new DomainError("NOT_FOUND", "That thank-you is gone.", 404);
        const ref = db().doc(`${root}/kudos/${id}`);
        await db().runTransaction(async (tx) => {
          const doc = await tx.get(ref);
          if (!doc.exists) throw new DomainError("NOT_FOUND", "That thank-you is gone.", 404);
          const hearts: string[] = (doc.data()?.hearts || []).filter((h: string) => h !== ctx.me.id);
          tx.update(ref, { hearts: data.on === false ? hearts : [...hearts, ctx.me.id] });
        });
        break;
      }
      case "unkudos": {
        const id = String(data.kudosId || "");
        if (!KUDOS_ID.test(id)) throw new DomainError("NOT_FOUND", "That thank-you is gone.", 404);
        const ref = db().doc(`${root}/kudos/${id}`);
        const doc = await ref.get();
        if (doc.exists) {
          const k = doc.data() as Kudos;
          if (k.from !== ctx.me.id && !isGuideAdmin(ctx.me)) throw new DomainError("FORBIDDEN", "Only the person who wrote it, or an admin, can take it down.", 403);
          await ref.delete();
        }
        break;
      }
      case "emergency": {
        const clean = cleanEmergency(data);
        /* Merged, so the record of openings stays whatever the person changes. */
        await db().doc(`${root}/emergency/${ctx.me.id}`).set(plain({ ...clean, checkedAt: now }), { merge: true });
        break;
      }
      case "emergencyChecked": {
        const ref = db().doc(`${root}/emergency/${ctx.me.id}`);
        const doc = await ref.get();
        if (!doc.exists || !(doc.data()?.contacts || []).length) throw new DomainError("NOT_FOUND", "Add your emergency contacts first.", 404);
        await ref.update({ checkedAt: now });
        break;
      }
      case "openEmergency": {
        adminOnly(ctx);
        const person = personIn(ctx, data.personId);
        if (person.id === ctx.me.id) throw new DomainError("INVALID", "Your own contacts are already on your screen.");
        const reason = cleanReason(data.reason);
        const key = String(data.id || "");
        if (!SAFE_ID.test(key)) throw new DomainError("INVALID", "Invalid request.");
        const ref = db().doc(`${root}/emergency/${person.id}`);
        let first = true;
        const record = await db().runTransaction(async (tx) => {
          const doc = await tx.get(ref);
          const e = doc.data() as Emergency | undefined;
          if (!doc.exists || !e?.contacts?.length) throw new DomainError("NOT_FOUND", `${person.name} has not added any emergency contacts yet.`, 404);
          const openings: Opening[] = e.openings || [];
          /* The same opening sent again (a dropped connection) is recorded once. */
          first = !openings.some((o) => o.id === key);
          if (first) tx.update(ref, { openings: plain([...openings, { id: key, by: ctx.me.id, byName: ctx.me.name, reason, at: now }].slice(-20)) });
          return e;
        });
        extra = { opened: { personId: person.id, contacts: record.contacts, bloodGroup: record.bloodGroup || "", allergies: record.allergies || "" } };
        if (first && person.email) await notify({ tenantId: ctx.tenantId, actorEmail: ctx.me.email || null }, [emergencyOpenedDraft(reason, { byName: ctx.me.name, toEmail: person.email })]);
        break;
      }
      default:
        throw new DomainError("INVALID", "Unknown action.");
    }
    return { ok: true, view: await viewFor(ctx, now), ...extra };
  } catch (e) {
    return fail(e);
  }
});
