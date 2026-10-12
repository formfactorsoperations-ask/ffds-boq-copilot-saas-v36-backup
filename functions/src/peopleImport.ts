import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { contextOf, fail, type Ctx } from "./peopleDesk";
import { BATCH_ID, IMPORT_PREFIX, checkImported } from "../../lib/peopleImport";
import type { Attendance, RequestRecord } from "../../lib/peopleDesk";

/*
  PEOPLE HUB IMPORT, ON THE SERVER (lib/peopleImport.ts plans it).

  Only someone who runs People (an Owner, Admin or the platform owner) may
  import. The browser plans the import from the workbook and sends it here
  in parts; every record is checked again (checkImported) before it is
  saved, under peopleDesk/{studio}, which no browser can write.

    begin    start an import: who, when, the file and its counts
    archive  keep the workbook's rows as they were, for the record
    records  save up to 400 attendance days and leave requests
    finish   close the import with what was saved
    list     the studio's imports, newest first
    undo     remove what an import saved and nobody has changed since

  Records keep the IDs the plan gave them, so sending a part twice, or
  importing the same workbook again, updates instead of duplicating. A
  record changed in StudioDesk since (checked out, corrected, decided) is
  never overwritten or undone. A day already checked in on StudioDesk, or
  leave already booked there, wins over the workbook's.
*/

const db = () => admin.firestore();
const MAX_RECORDS = 400;
const MAX_ARCHIVE = 700_000;
const TABS = ["Team", "Attendance", "Leaves", "Balances", "Holidays"];
const ACTIVE = ["Pending", "Approved", "Cancellation requested"];

const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const touched = (v: any) => !v?.imported || Number(v.version) !== 1;

function requireAdmin(ctx: Ctx) {
  if (ctx.me.accessRole !== "admin") throw new HttpsError("permission-denied", "Only an Owner or Admin can import People Hub records.");
}
function batchOf(data: any): string {
  const batch = String(data?.batch || "");
  if (!BATCH_ID.test(batch)) throw new HttpsError("invalid-argument", "Invalid import.");
  return batch;
}

export const peopleImport = onCall({ cors: true, timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  try {
    const ctx = await contextOf(request);
    requireAdmin(ctx);
    const data = request.data || {};
    const root = `peopleDesk/${ctx.tenantId}`;
    const now = new Date().toISOString();
    const action = String(data.action || "");

    if (action === "list") {
      const q = await db().collection(`${root}/imports`).orderBy("startedAt", "desc").limit(10).get();
      return { ok: true, imports: q.docs.map((d) => ({ id: d.id, ...d.data() })) };
    }

    const batch = batchOf(data);
    const ref = db().doc(`${root}/imports/${batch}`);

    if (action === "begin") {
      const meta = data.meta || {};
      const counts: Record<string, number> = {};
      for (const [k, v] of Object.entries(meta.counts || {})) if (/^[a-zA-Z]{1,40}$/.test(k) && Number.isFinite(Number(v))) counts[k] = Number(v);
      await ref.set({
        status: "running",
        startedAt: now,
        by: ctx.me.id,
        byName: ctx.me.name,
        fileName: String(meta.fileName || "").slice(0, 200),
        counts,
      }, { merge: true });
      return { ok: true };
    }

    const doc = await ref.get();
    if (!doc.exists) throw new HttpsError("not-found", "That import was not started.");

    if (action === "archive") {
      const t = String(data.tab || "");
      const part = Number(data.part);
      const rows = String(data.rows || "");
      if (!TABS.includes(t) || !Number.isInteger(part) || part < 0 || part > 200 || rows.length > MAX_ARCHIVE) throw new HttpsError("invalid-argument", "Invalid part of the workbook.");
      try { if (!Array.isArray(JSON.parse(rows))) throw new Error(); } catch { throw new HttpsError("invalid-argument", "Invalid part of the workbook."); }
      await ref.collection("sheets").doc(`${t}_${part}`).set({ tab: t, part, rows });
      return { ok: true };
    }

    if (action === "records") {
      if (doc.data()?.status !== "running") throw new HttpsError("failed-precondition", "That import is closed.");
      const attendance: any[] = Array.isArray(data.attendance) ? data.attendance : [];
      const requests: any[] = Array.isArray(data.requests) ? data.requests : [];
      if (attendance.length + requests.length > MAX_RECORDS) throw new HttpsError("invalid-argument", `Send up to ${MAX_RECORDS} records at a time.`);
      for (const a of attendance) { const why = checkImported("attendance", a, batch, ctx.people); if (why) throw new HttpsError("invalid-argument", `Attendance ${String(a?.id || "").slice(0, 80)}: ${why}`); }
      for (const r of requests) { const why = checkImported("request", r, batch, ctx.people); if (why) throw new HttpsError("invalid-argument", `Leave ${String(r?.id || "").slice(0, 80)}: ${why}`); }

      /* Days already recorded on StudioDesk itself. */
      const live = new Set<string>();
      if (attendance.length) {
        const dates = attendance.map((a) => a.date).sort();
        const q = await db().collection(`${root}/attendance`).where("date", ">=", dates[0]).where("date", "<=", dates[dates.length - 1]).get();
        for (const d of q.docs) if (!d.id.startsWith(IMPORT_PREFIX)) live.add(`${d.get("employeeId")}:${d.get("date")}`);
      }
      /* Leave already booked on StudioDesk itself, by person. */
      const booked = new Map<string, RequestRecord[]>();
      const who = [...new Set(requests.filter((r) => ACTIVE.includes(r.status)).map((r) => r.employeeId))];
      for (let i = 0; i < who.length; i += 30) {
        const q = await db().collection(`${root}/requests`).where("employeeId", "in", who.slice(i, i + 30)).get();
        for (const d of q.docs) {
          const r = d.data() as RequestRecord;
          if (d.id.startsWith(IMPORT_PREFIX) || r.kind !== "leave" || !ACTIVE.includes(r.status)) continue;
          booked.set(r.employeeId, [...(booked.get(r.employeeId) || []), r]);
        }
      }
      const clash = (r: RequestRecord) => ACTIVE.includes(r.status) && (booked.get(r.employeeId) || []).some((b) =>
        b.days.some((d) => r.days.some((x) => x.date === d.date)));

      const refs = [
        ...attendance.map((a) => db().doc(`${root}/attendance/${a.id}`)),
        ...requests.map((r) => db().doc(`${root}/requests/${r.id}`)),
      ];
      const existing = refs.length ? await db().getAll(...refs) : [];
      const writer = db().batch();
      const skipped: { id: string; why: string }[] = [];
      let written = 0;
      [...attendance, ...requests].forEach((rec: Attendance | RequestRecord, i) => {
        const before = existing[i];
        if (before.exists && touched(before.data())) { skipped.push({ id: rec.id, why: "Changed on StudioDesk since it was imported" }); return; }
        if ("checkIn" in rec && live.has(`${rec.employeeId}:${rec.date}`)) { skipped.push({ id: rec.id, why: "Already checked in on StudioDesk that day" }); return; }
        if ("kind" in rec && clash(rec)) { skipped.push({ id: rec.id, why: "Leave already booked on StudioDesk for those days" }); return; }
        writer.set(refs[i], plain(rec));
        written++;
      });
      if (written) await writer.commit();
      await ref.update({ written: FieldValue.increment(written), skipped: FieldValue.increment(skipped.length) });
      return { ok: true, written, skipped };
    }

    if (action === "finish") {
      await ref.update({ status: "done", finishedAt: now });
      return { ok: true, import: { id: batch, ...(await ref.get()).data() } };
    }

    if (action === "undo") {
      let removed = 0, kept = 0;
      for (const kind of ["attendance", "requests"]) {
        const q = await db().collection(`${root}/${kind}`).where("imported.batch", "==", batch).get();
        for (let i = 0; i < q.docs.length; i += 450) {
          const writer = db().batch();
          for (const d of q.docs.slice(i, i + 450)) {
            if (touched(d.data())) { kept++; continue; }
            writer.delete(d.ref);
            removed++;
          }
          await writer.commit();
        }
      }
      await ref.update({ status: "undone", undoneAt: now, undoneBy: ctx.me.id, removed, kept });
      return { ok: true, removed, kept };
    }

    throw new HttpsError("invalid-argument", "Unknown action.");
  } catch (e) {
    return fail(e);
  }
});
