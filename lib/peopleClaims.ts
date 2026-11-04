/*
  PEOPLE: TRAVEL CLAIMS (the owner, 4 Nov 2026).

  "Designers travel to sites, shops for selections and they can reimburse. To
  log reimbursement I need a UI, very easy to use yet intuitive. Founders
  should be able to approve or disapprove. I need reports of the
  reimbursement, team member wise, in the monthly report."

  A claim is one trip: when, why, where, how, and what it cost. By own bike or
  car it is the distance at the studio's rate a kilometre (doubled for a
  return trip); by cab, auto or public transport it is the fare paid. Parking
  and tolls go on top. A photo of the receipt can go with it.

    Pending → Approved → Paid
            → Rejected (with a reason)
            → Withdrawn (by the person, while it waits)

  Founders (People admins) decide and mark claims paid; never their own,
  unless no other founder is on the team. Stored under peopleDesk/{studio},
  which no browser may read (functions/src/peopleClaims.ts).

  Pure, so the tests and the Cloud Functions run the same code.
*/
import { DomainError, addDays, validDate, type Person } from "./peopleDesk";

export const CLAIM_PURPOSES = ["Site visit", "Selections", "Client meeting", "Vendor visit", "Other"] as const;
export type ClaimPurpose = (typeof CLAIM_PURPOSES)[number];
export const PURPOSE_LABELS: Record<ClaimPurpose, string> = {
  "Site visit": "Site visit",
  Selections: "Shopping for selections",
  "Client meeting": "Client meeting",
  "Vendor visit": "Vendor or factory",
  Other: "Something else",
};

export const TRAVEL_MODES = ["bike", "car", "cab", "auto", "transit", "other"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];
export const MODE_LABELS: Record<TravelMode, string> = {
  bike: "Own bike",
  car: "Own car",
  cab: "Cab",
  auto: "Auto",
  transit: "Bus, train or metro",
  other: "Other",
};
/** Paid by the kilometre, at the studio's rate; the rest are paid at the fare. */
export const byKm = (m: TravelMode) => m === "bike" || m === "car";

export type ClaimStatus = "Pending" | "Approved" | "Rejected" | "Withdrawn" | "Paid";
export interface ClaimRates { bike: number; car: number }
/** Rupees a kilometre until the founders set their own. */
export const DEFAULT_RATES: ClaimRates = { bike: 4, car: 10 };

export interface ClaimDecision { by: string; byName: string; at: string; status: ClaimStatus; note: string }
export interface Claim {
  id: string;
  personId: string;
  /** The day of the trip. */
  date: string;
  purpose: ClaimPurpose;
  /** The site, shop or client: where the trip was for. */
  place: string;
  from: string;
  to: string;
  mode: TravelMode;
  /** One way, by own bike or car. */
  km: number;
  roundTrip: boolean;
  /** The rate a kilometre when it was logged. */
  rate: number;
  /** The fare paid, by cab, auto or public transport. */
  fare: number;
  /** Parking and tolls. */
  extras: number;
  /** What is claimed, in rupees. */
  amount: number;
  note: string;
  /** A photo or PDF of the receipt is kept beside it. */
  receipt: boolean;
  status: ClaimStatus;
  createdAt: string;
  decisions: ClaimDecision[];
}

function need(ok: unknown, message: string, code = "INVALID", status = 400): asserts ok {
  if (!ok) throw new DomainError(code, message, status);
}
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
};
const rupees = (n: number) => Math.round(n * 100) / 100;

/** How far back a trip may be claimed. */
export const CLAIM_BACK_DAYS = 90;
export const MAX_CLAIM = 100000;

export function cleanRates(v: any): ClaimRates {
  const bike = num(v?.bike), car = num(v?.car);
  need(bike >= 0 && bike <= 100, "Set the bike rate between ₹0 and ₹100 a km.");
  need(car >= 0 && car <= 200, "Set the car rate between ₹0 and ₹200 a km.");
  return { bike: rupees(bike), car: rupees(car) };
}

/** What a trip comes to: the distance at the rate (twice for a return trip), or the fare, plus parking and tolls. */
export function claimAmount(c: Pick<Claim, "mode" | "km" | "roundTrip" | "rate" | "fare" | "extras">): number {
  const travel = byKm(c.mode) ? (c.km || 0) * (c.roundTrip ? 2 : 1) * (c.rate || 0) : c.fare || 0;
  return Math.round(travel + (c.extras || 0));
}

/** A trip as logged, checked; the rate is the studio's, whatever the browser sent. */
export function cleanClaim(d: any, rates: ClaimRates, today: string): Omit<Claim, "id" | "personId" | "status" | "createdAt" | "decisions" | "receipt"> {
  const date = String(d?.date || "");
  need(validDate(date), "Pick the day of the trip.");
  need(date <= today, "A trip can be claimed once it has happened.");
  need(date >= addDays(today, -CLAIM_BACK_DAYS), `Trips older than ${CLAIM_BACK_DAYS} days cannot be claimed here. Ask a founder.`);
  need((CLAIM_PURPOSES as readonly string[]).includes(d?.purpose), "Pick what the trip was for.");
  need((TRAVEL_MODES as readonly string[]).includes(d?.mode), "Pick how you travelled.");
  const mode = d.mode as TravelMode;
  const place = text(d?.place, 80);
  need(place.length >= 2, "Say where you went: the site, shop or client.");
  const km = byKm(mode) ? num(d?.km) : 0;
  if (byKm(mode)) need(km > 0 && km <= 1000, "Enter the distance one way, in km.");
  const fare = byKm(mode) ? 0 : num(d?.fare);
  if (!byKm(mode)) need(fare > 0 && fare <= MAX_CLAIM, "Enter the fare you paid.");
  const extras = d?.extras == null || d?.extras === "" ? 0 : num(d.extras);
  need(extras >= 0 && extras <= 20000, "Parking and tolls should be between ₹0 and ₹20,000.");
  const rate = mode === "bike" ? rates.bike : mode === "car" ? rates.car : 0;
  const c = {
    date, purpose: d.purpose as ClaimPurpose, place, from: text(d?.from, 80), to: text(d?.to, 80), mode,
    km: rupees(km), roundTrip: byKm(mode) ? !!d?.roundTrip : false, rate, fare: rupees(fare), extras: rupees(extras),
    note: text(d?.note, 280), amount: 0,
  };
  c.amount = claimAmount(c);
  need(c.amount > 0, "This trip comes to nothing to claim.");
  need(c.amount <= MAX_CLAIM, "That is more than one trip can claim. Ask a founder.");
  return c;
}

/* ── Who decides ─────────────────────────────────────────────────────────── */

export const isFounder = (p: Pick<Person, "accessRole" | "active">) => p.active && p.accessRole === "admin";
/** A founder decides anyone's trips but their own, unless no other founder is on the team to do it. */
export function canDecide(actor: Person, claim: Pick<Claim, "personId">, people: Person[]): boolean {
  if (!isFounder(actor)) return false;
  if (claim.personId !== actor.id) return true;
  return !people.some((p) => p.id !== actor.id && p.id !== "platform-owner" && isFounder(p));
}

/** A founder's decision on a claim waiting for one; a rejection says why. */
export function decideClaim(c: Claim, actor: Person, people: Person[], decision: "approve" | "reject", note: unknown, now: string): Claim {
  need(canDecide(actor, c, people), isFounder(actor) ? "Another founder decides your own trips." : "Only a founder can decide travel claims.", "FORBIDDEN", 403);
  need(c.status === "Pending", `This claim is already ${c.status.toLowerCase()}.`, "CONFLICT", 409);
  const why = text(note, 280);
  if (decision === "reject") need(why.length >= 3, "Say why, in a few words. They will see it.");
  const status: ClaimStatus = decision === "approve" ? "Approved" : "Rejected";
  return { ...c, status, decisions: [...c.decisions, { by: actor.id, byName: actor.name, at: now, status, note: why }] };
}

/** Approved claims marked as paid back. */
export function payClaim(c: Claim, actor: Person, people: Person[], now: string): Claim {
  need(canDecide(actor, c, people), "Only a founder can mark claims paid.", "FORBIDDEN", 403);
  need(c.status === "Approved", c.status === "Paid" ? "Already paid." : "Only an approved claim can be paid.", "CONFLICT", 409);
  return { ...c, status: "Paid", decisions: [...c.decisions, { by: actor.id, byName: actor.name, at: now, status: "Paid", note: "" }] };
}

/** The person takes back a claim still waiting. */
export function withdrawClaim(c: Claim, actor: Person, now: string): Claim {
  need(c.personId === actor.id, "Only the person who logged it can take it back.", "FORBIDDEN", 403);
  need(c.status === "Pending", "Only a claim still waiting can be taken back.", "CONFLICT", 409);
  return { ...c, status: "Withdrawn", decisions: [...c.decisions, { by: actor.id, byName: actor.name, at: now, status: "Withdrawn", note: "" }] };
}

/* ── What each person sees ───────────────────────────────────────────────── */

export interface ClaimsView {
  rates: ClaimRates;
  /** Your own trips, newest first. */
  mine: Claim[];
  /** Founders: everyone's trips in the window, newest first. Empty for anyone else. */
  all: Claim[];
  /** Founders: trips waiting for you, oldest first. */
  toDecide: Claim[];
  /** Founders: approved trips not yet paid back, that you may mark paid. */
  toPay: Claim[];
  founder: boolean;
}
const newest = (a: Claim, b: Claim) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
export function claimsView(claims: Claim[], me: Person, people: Person[], rates: ClaimRates): ClaimsView {
  const founder = isFounder(me);
  const all = founder ? [...claims].sort(newest) : [];
  return {
    rates,
    mine: claims.filter((c) => c.personId === me.id).sort(newest),
    all,
    toDecide: founder ? all.filter((c) => c.status === "Pending" && canDecide(me, c, people)).reverse() : [],
    toPay: founder ? all.filter((c) => c.status === "Approved" && canDecide(me, c, people)).reverse() : [],
    founder,
  };
}

/* ── Totals and the monthly report ───────────────────────────────────────── */

export interface ClaimTotals { trips: number; km: number; claimed: number; waiting: number; approved: number; paid: number; rejected: number }
const ZERO: ClaimTotals = { trips: 0, km: 0, claimed: 0, waiting: 0, approved: 0, paid: 0, rejected: 0 };
/** Trips that count: everything but those taken back. Approved includes paid; claimed is all but rejected. */
export function totalsOf(list: Claim[]): ClaimTotals {
  return list.reduce((t, c) => {
    if (c.status === "Withdrawn") return t;
    const live = c.status !== "Rejected";
    return {
      trips: t.trips + (live ? 1 : 0),
      km: t.km + (live && byKm(c.mode) ? c.km * (c.roundTrip ? 2 : 1) : 0),
      claimed: t.claimed + (live ? c.amount : 0),
      waiting: t.waiting + (c.status === "Pending" ? c.amount : 0),
      approved: t.approved + (c.status === "Approved" || c.status === "Paid" ? c.amount : 0),
      paid: t.paid + (c.status === "Paid" ? c.amount : 0),
      rejected: t.rejected + (c.status === "Rejected" ? c.amount : 0),
    };
  }, { ...ZERO });
}

export interface ClaimRow { personId: string; name: string; totals: ClaimTotals; trips: Claim[] }
/** A month's trips, person by person (the most claimed first), and the studio's totals. */
export function claimsMonth(claims: Claim[], month: string, nameOf: (id: string) => string): { rows: ClaimRow[]; totals: ClaimTotals } {
  const inMonth = claims.filter((c) => c.date.slice(0, 7) === month && c.status !== "Withdrawn");
  const by = new Map<string, Claim[]>();
  for (const c of inMonth) by.set(c.personId, [...(by.get(c.personId) || []), c]);
  const rows = [...by.entries()].map(([personId, trips]) => ({
    personId, name: nameOf(personId), totals: totalsOf(trips), trips: trips.sort((a, b) => a.date.localeCompare(b.date)),
  })).sort((a, b) => b.totals.claimed - a.totals.claimed || a.name.localeCompare(b.name));
  return { rows, totals: totalsOf(inMonth) };
}

const cell = (v: unknown) => {
  const t = String(v ?? "");
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
/** Every trip in a month, one row each, for a spreadsheet. */
export function claimsCsv(claims: Claim[], month: string, nameOf: (id: string) => string): string {
  const head = ["Date", "Name", "Purpose", "Place", "From", "To", "How", "Km (total)", "Rate a km", "Fare", "Parking and tolls", "Amount", "Status", "Decided by", "Note", "Receipt"];
  const rows = claims
    .filter((c) => c.date.slice(0, 7) === month && c.status !== "Withdrawn")
    .sort((a, b) => a.date.localeCompare(b.date) || nameOf(a.personId).localeCompare(nameOf(b.personId)))
    .map((c) => {
      const last = [...c.decisions].reverse().find((d) => d.status !== "Withdrawn");
      return [
        c.date, nameOf(c.personId), PURPOSE_LABELS[c.purpose], c.place, c.from, c.to, MODE_LABELS[c.mode],
        byKm(c.mode) ? c.km * (c.roundTrip ? 2 : 1) : "", byKm(c.mode) ? c.rate : "", byKm(c.mode) ? "" : c.fare, c.extras || "",
        c.amount, c.status, last?.byName || "", [c.note, last?.note].filter(Boolean).join(" · "), c.receipt ? "Yes" : "No",
      ];
    });
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

/** Recent trips worth repeating: the same place and way of travel, once each, newest first. */
export function recentTrips(mine: Claim[], n = 3): Claim[] {
  const seen = new Set<string>();
  const out: Claim[] = [];
  for (const c of mine) {
    if (c.status === "Withdrawn" || c.status === "Rejected") continue;
    const key = `${c.place.toLowerCase()}|${c.mode}|${c.km}|${c.from.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
