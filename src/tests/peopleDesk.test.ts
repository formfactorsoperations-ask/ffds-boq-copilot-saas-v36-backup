/*
  The People rules, proven: People Hub's own tests (ffdstoolsuniverse,
  apps/people-hub/tests/domain.test.ts) carried over unchanged, then the
  StudioDesk additions: location, and the team as People.
*/
import { test, expect } from "vitest";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,
  applyEvent,
  balanceFor,
  execute,
  fiscalYear,
  leaveDays,
  scopeSnapshot,
  type Command,
  type Store,
} from "../../lib/peopleDesk";
const now = "2026-10-07T05:00:00.000Z";
function setup(): Store {
  return {
    policy: structuredClone(DEFAULT_POLICY),
    people: [
      {
        id: "a",
        name: "One",
        email: "one@example.com",
        googleSub: "sub-one",
        title: "Designer",
        teamId: "design",
        managerId: "m",
        accessRole: "employee",
        active: true,
      },
      {
        id: "b",
        name: "Two",
        email: "two@example.com",
        title: "Designer",
        teamId: "design",
        managerId: "other",
        accessRole: "employee",
        active: true,
      },
      {
        id: "m",
        name: "Manager",
        title: "Lead",
        teamId: "design",
        managerId: "",
        accessRole: "manager",
        active: true,
      },
      {
        id: "ops",
        name: "Ops",
        title: "Ops",
        teamId: "ops",
        managerId: "",
        accessRole: "ops",
        active: true,
      },
    ],
    attendance: [],
    requests: [],
    events: [],
  };
}
const request = (extra: Record<string, unknown> = {}) => ({
  type: "PL",
  start: "2026-10-08",
  end: "2026-10-08",
  portion: "Full day",
  reason: "private information",
  ...extra,
});
let seq = 0;
function send(
  s: Store,
  actor: string,
  action: Command["action"],
  data: Command["data"],
  at = now,
) {
  return applyEvent(
    s,
    execute(s, actor, { id: `command_${++seq}`, action, data }, at),
  );
}
test("weekly offs, configured holidays, half days and fiscal allocation", () => {
  const p = structuredClone(DEFAULT_POLICY);
  p.holidays = ["2026-10-09"];
  assert.deepEqual(
    leaveDays("2026-10-08", "2026-10-13", "Full day", p).map((d) => d.date),
    ["2026-10-08", "2026-10-10", "2026-10-13"],
  );
  assert.equal(
    leaveDays("2026-10-08", "2026-10-08", "First half", p)[0].units,
    0.5,
  );
  assert.throws(() => leaveDays("2026-10-08", "2026-10-09", "First half", p));
  assert.throws(() => leaveDays("2026-02-30", "2026-02-30", "Full day", p));
  assert.equal(fiscalYear("2027-03-31", p), "2026");
  assert.equal(fiscalYear("2027-04-01", p), "2027");
});
test("pending reserves, approve consumes, cancellation holds until approved", () => {
  let s = send(setup(), "a", "request", request());
  const r = s.requests[0];
  assert.equal(balanceFor(s, s.people[0], "PL", "2026").reserved, 1);
  s = send(s, "m", "decide", {
    requestId: r.id,
    version: 1,
    decision: "approve",
  });
  assert.equal(balanceFor(s, s.people[0], "PL", "2026").used, 1);
  s = send(s, "a", "cancel", { requestId: r.id, version: 2 });
  assert.equal(balanceFor(s, s.people[0], "PL", "2026").available, 11);
  s = send(s, "m", "decide", {
    requestId: r.id,
    version: 3,
    decision: "approve",
  });
  assert.equal(balanceFor(s, s.people[0], "PL", "2026").available, 12);
});
test("approved April-year allowances do not carry unused days or usage forward", () => {
  let s = send(
    setup(),
    "a",
    "request",
    request({ start: "2026-03-31", end: "2026-03-31" }),
    "2026-03-01T05:00:00.000Z",
  );
  s = send(
    s,
    "m",
    "decide",
    { requestId: s.requests[0].id, version: 1, decision: "approve" },
    "2026-03-02T05:00:00.000Z",
  );
  assert.equal(balanceFor(s, s.people[0], "PL", "2025").available, 11);
  assert.equal(balanceFor(s, s.people[0], "PL", "2026").available, 12);
  assert.equal(balanceFor(s, s.people[0], "SL", "2026").available, 6);
  assert.equal(balanceFor(s, s.people[0], "CL", "2026").available, 6);
});
test("permission scope omits private fields and denies self, unrelated manager, disabled actor", () => {
  let s = send(setup(), "b", "request", request());
  const r = s.requests[0];
  const snapshot = scopeSnapshot(s, "a", now);
  assert.equal(snapshot.requests.length, 0);
  assert.equal(snapshot.availability.length, 1);
  assert.equal(JSON.stringify(snapshot).includes("private information"), false);
  assert.equal(JSON.stringify(snapshot).includes("@example.com"), false);
  assert.equal(JSON.stringify(snapshot).includes("sub-one"), false);
  for (const actor of ["m", "b"])
    assert.throws(
      () =>
        send(s, actor, "decide", {
          requestId: r.id,
          version: 1,
          decision: "approve",
        }),
      /cannot decide/,
    );
  s.people[3].active = false;
  assert.throws(
    () =>
      send(s, "ops", "decide", {
        requestId: r.id,
        version: 1,
        decision: "approve",
      }),
    /not active/,
  );
});
test("idempotent retry, conflicting command id, cross-person ID isolation", () => {
  const command: Command = {
    id: "same_uuid_1234",
    action: "checkin",
    data: { mode: "Office" },
  };
  let s = setup();
  const event = execute(s, "a", command, now);
  s = applyEvent(s, event);
  assert.deepEqual(execute(s, "a", command, now), event);
  assert.equal(applyEvent(s, event).events.length, 1);
  assert.throws(
    () => execute(s, "a", { ...command, data: { mode: "WFH" } }, now),
    /different action/,
  );
  s = applyEvent(s, execute(s, "b", command, now));
  assert.equal(s.attendance.length, 2);
});
test("stale decisions cannot overwrite and rejection needs a reason", () => {
  let s = send(setup(), "a", "request", request());
  const id = s.requests[0].id;
  assert.throws(
    () =>
      send(s, "m", "decide", { requestId: id, version: 1, decision: "reject" }),
    /reason/,
  );
  s = send(s, "ops", "decide", {
    requestId: id,
    version: 1,
    decision: "approve",
  });
  assert.throws(
    () =>
      send(s, "m", "decide", {
        requestId: id,
        version: 1,
        decision: "reject",
        note: "not available",
      }),
    /already changed/,
  );
});
test("overlaps, balance overdraw, cross-year budgets and WFH", () => {
  let s = send(setup(), "a", "request", request({ portion: "First half" }));
  assert.throws(() => send(s, "a", "request", request()), /overlap/);
  s = send(s, "a", "request", request({ portion: "Second half" }));
  assert.equal(s.requests.length, 2);
  assert.throws(
    () => send(setup(), "a", "request", request({ type: "COMP" })),
    /Insufficient/,
  );
  const wfh = send(setup(), "a", "request", request({ type: "WFH" }));
  assert.equal(balanceFor(wfh, wfh.people[0], "PL", "2026").available, 12);
  s = send(
    setup(),
    "a",
    "request",
    request({ start: "2027-03-31", end: "2027-04-01" }),
  );
  assert.equal(balanceFor(s, s.people[0], "PL", "2026").reserved, 1);
  assert.equal(balanceFor(s, s.people[0], "PL", "2027").reserved, 1);
  assert.throws(
    () => send(setup(), "a", "request", request({ type: "__proto__" })),
    /Unknown/,
  );
});
test("attendance and approved corrections are atomic with version protection", () => {
  let s = send(setup(), "a", "checkin", { mode: "Office" });
  const session = s.attendance[0];
  assert.throws(
    () => send(s, "a", "checkin", { mode: "Office" }),
    /open attendance/,
  );
  assert.throws(
    () => send(s, "b", "checkout", { sessionId: session.id, version: 1 }),
    /No open session/,
  );
  s = send(
    s,
    "a",
    "correction",
    {
      sessionId: session.id,
      version: 1,
      checkIn: "2026-10-07T04:30:00Z",
      checkOut: "2026-10-07T06:30:00Z",
      mode: "Office",
      reason: "Forgot to check out",
    },
    "2026-10-07T08:00:00Z",
  );
  assert.equal(s.attendance[0].checkOut, undefined);
  s = send(
    s,
    "m",
    "decide",
    { requestId: s.requests[0].id, version: 1, decision: "approve" },
    "2026-10-07T08:00:00Z",
  );
  assert.equal(s.requests[0].status, "Approved");
  assert.equal(s.attendance[0].version, 2);
  assert.equal(s.attendance[0].checkOut, "2026-10-07T06:30:00.000Z");
});

test("daily update links are optional and private to the current member", () => {
  let s = setup();
  s.people[0].dailyUpdateUrl =
    "https://drive.google.com/drive/folders/member-a";
  s.people[1].dailyUpdateUrl =
    "https://docs.google.com/document/d/member-b/edit";
  const own = scopeSnapshot(s, "a", now);
  assert.equal(own.me.dailyUpdateUrl, s.people[0].dailyUpdateUrl);
  assert.ok(own.people.every((p) => !p.dailyUpdateUrl));
  assert.ok(
    scopeSnapshot(s, "ops", now).people.every((p) => !p.dailyUpdateUrl),
  );
  s.people[0].dailyUpdateUrl = "https://drive.google.com.evil.example/file";
  assert.equal(scopeSnapshot(s, "a", now).me.dailyUpdateUrl, undefined);
  s = send(s, "a", "checkin", { mode: "Office", site: "" });
  const session = s.attendance[0];
  s = send(
    s,
    "a",
    "checkout",
    { sessionId: session.id, version: session.version },
    "2026-10-07T12:00:00.000Z",
  );
  assert.ok(s.attendance[0].checkOut);
});


/* ── StudioDesk additions ─────────────────────────────────────────────────── */

import { distanceM, isLate, peopleOf, personByEmail, policyOf, DEFAULT_POLICY as BASE } from "../../lib/peopleDesk";

const OFFICE = { lat: 19.2183, lng: 72.9781, radiusM: 150 };

test("an Office or Site check-in records where, measured against the office; WFH never does", () => {
  const s = setup();
  s.policy.office = OFFICE;
  const near = { lat: 19.2186, lng: 72.9783, accuracyM: 25 };
  const office = applyEvent(s, execute(s, "a", { id: "loc_office_1", action: "checkin", data: { mode: "Office", location: near } }, now));
  expect(office.attendance[0].checkInLocation).toMatchObject({ atOffice: true, accuracyM: 25 });
  expect(office.attendance[0].checkInLocation!.distanceM).toBeLessThan(60);
  const far = { lat: 19.076, lng: 72.8777, accuracyM: 20 };
  const site = applyEvent(s, execute(s, "b", { id: "loc_site_01", action: "checkin", data: { mode: "Site", site: "Kapoor Villa", location: far } }, now));
  expect(site.attendance[0].checkInLocation).toMatchObject({ atOffice: false });
  expect(site.attendance[0].checkInLocation!.distanceM).toBeGreaterThan(10000);
  const home = applyEvent(s, execute(s, "a", { id: "loc_wfh_001", action: "checkin", data: { mode: "WFH", location: near } }, now));
  expect(home.attendance[0].checkInLocation).toBeNull();
});

test("a location is required for Office and Site when the studio asks for it, never for check-out", () => {
  const s = setup();
  s.policy.requireLocation = true;
  expect(() => execute(s, "a", { id: "noloc_0001", action: "checkin", data: { mode: "Office" } }, now)).toThrow(/Allow location/);
  expect(() => execute(s, "a", { id: "badloc_001", action: "checkin", data: { mode: "Site", location: { lat: 200, lng: 0, accuracyM: 5 } } }, now)).toThrow(/invalid/);
  s.policy.requireLocation = false;
  let t = applyEvent(s, execute(s, "a", { id: "noloc_0002", action: "checkin", data: { mode: "Office" } }, now));
  expect(t.attendance[0].checkInLocation).toBeNull();
  t = { ...t, policy: { ...t.policy, requireLocation: true } };
  const open = t.attendance[0];
  t = applyEvent(t, execute(t, "a", { id: "noloc_0003", action: "checkout", data: { sessionId: open.id, version: 1 } }, "2026-10-07T12:00:00.000Z"));
  expect(t.attendance[0].checkOut).toBeTruthy();
  expect(t.attendance[0].checkOutLocation).toBeNull();
});

test("late, distance, and the policy read from Studio settings", () => {
  expect(isLate({ checkIn: "2026-10-07T05:59:00.000Z" }, BASE)).toBe(false); // 11:29 IST
  expect(isLate({ checkIn: "2026-10-07T06:01:00.000Z" }, BASE)).toBe(true); // 11:31 IST
  expect(distanceM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBe(111195);
  const p = policyOf({ peopleDesk: { policy: {
    start: "10:00", lateAfter: "25:00", holidays: ["2026-10-20", "2026-02-30", "2026-10-20"], holidayNames: { "2026-10-20": "Diwali" },
    allowances: { PL: 15, SL: -1 }, office: { lat: 19.2, lng: 72.9, radiusM: 5 }, weeklyOffDays: [1, 9],
  } } });
  expect(p).toMatchObject({ start: "10:00", lateAfter: "11:30", holidays: ["2026-10-20"], holidayNames: { "2026-10-20": "Diwali" }, office: null, weeklyOffDays: [1], requireLocation: true, fiscalStartMonth: 4 });
  expect(p.allowances).toMatchObject({ PL: 15, SL: 6, CL: 6 });
});

test("the studio team becomes People: co-founders run it, managers by who reports to them, clients never", () => {
  const org = {
    team: [
      { id: "tm-anish", name: "Anish", email: "Anish@FF.in", role: "Owner" },
      { id: "tm-mayuri", name: "Mayuri", email: "mayuri@ff.in", role: "Design Head", roles: ["Admin"] },
      { id: "tm-tanvi", name: "Tanvi", email: "tanvi@ff.in", role: "Designer" },
      { id: "tm-sougata", name: "Sougata", email: "sougata@ff.in", role: "Designer" },
      { id: "tm-riya", name: "Riya", email: "riya@ff.in", role: "Client Relations" },
      { id: "tm-ops", name: "Suresh", email: "suresh@ff.in", role: "Ops Director" },
      { id: "tm-client", name: "Mrs Kapoor", email: "kapoor@x.in", role: "Client" },
    ],
    peopleDesk: { members: {
      "tm-tanvi": { managerId: "tm-mayuri" }, "tm-sougata": { managerId: "tm-mayuri", entitlements: { "2026": { PL: 15, XX: 3 } } },
      "tm-riya": { managerId: "tm-anish", dailyUpdateUrl: "https://drive.google.com/drive/folders/abc" },
      "tm-ops": { managerId: "tm-ops" },
    } },
  };
  const people = peopleOf(org);
  const by = Object.fromEntries(people.map((p) => [p.id, p]));
  expect(people.map((p) => p.id)).not.toContain("tm-client");
  expect(by["tm-anish"]).toMatchObject({ accessRole: "admin", teamId: "leadership", email: "anish@ff.in" });
  expect(by["tm-mayuri"].accessRole).toBe("admin");
  expect(by["tm-tanvi"]).toMatchObject({ accessRole: "employee", managerId: "tm-mayuri", teamId: "design" });
  expect(by["tm-sougata"].entitlements).toEqual({ "2026": { PL: 15 } });
  expect(by["tm-riya"]).toMatchObject({ managerId: "tm-anish", dailyUpdateUrl: "https://drive.google.com/drive/folders/abc" });
  expect(by["tm-ops"]).toMatchObject({ accessRole: "ops", managerId: "" });
  expect(personByEmail(people, " ANISH@ff.in ")?.id).toBe("tm-anish");

  // A designer's leave goes to Mayuri or Anish, never to a colleague or themselves.
  const store = { policy: policyOf(org), people, attendance: [], requests: [], events: [] } as any;
  const req = applyEvent(store, execute(store, "tm-tanvi", { id: "tanvi_leave_1", action: "request", data: { type: "PL", start: "2026-10-08", end: "2026-10-08", portion: "Full day", reason: "family" } }, now));
  const id = req.requests[0].id;
  for (const who of ["tm-tanvi", "tm-sougata", "tm-riya"])
    expect(() => execute(req, who, { id: `deny_${who}`, action: "decide", data: { requestId: id, version: 1, decision: "approve" } }, now)).toThrow(/cannot decide/);
  const ok = applyEvent(req, execute(req, "tm-mayuri", { id: "mayuri_ok_1", action: "decide", data: { requestId: id, version: 1, decision: "approve" } }, now));
  expect(ok.requests[0].status).toBe("Approved");
});
