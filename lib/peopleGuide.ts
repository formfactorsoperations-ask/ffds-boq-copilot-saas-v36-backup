/*
  PEOPLE: THE OFFICE GUIDE, AND THE STUDIO'S OWN LIFE.

  Approved by the studio owner on 27 Oct 2026 (mockups 1, B, C, E and I):

    Office guide      everyone's desk, computer, office mobile, office email,
                      extension and birthday, in one table. It replaces the
                      Directory. Everyone sees it; admins keep it up to date.
    Office essentials Wi-Fi, the studio address, printers, who to call for
                      repairs and in an emergency. Admins edit it.
    Celebrations      birthdays and work anniversaries, and a card the whole
                      studio signs from the day before to three days after.
    Kudos wall        a short, specific thank-you, pinned up for everyone.
    Emergency contacts who to call if something happens to someone at work.
                      Private: only the person and admins. An admin opens
                      them with a reason, the opening is recorded, and the
                      person is told.

  The data lives beside attendance under peopleDesk/{studio}, which no
  browser may read or write (firestore.rules); the Cloud Functions
  (functions/src/peopleGuide.ts) read and write it with these rules.

  Pure, so the tests and the Cloud Functions run the same code.
*/
import { DomainError, validDate, type Person } from "./peopleDesk";

/* ── What is kept ────────────────────────────────────────────────────────── */

/** One person's office details (peopleDesk/{studio}/office/{personId}). */
export interface OfficeDetails {
  desk: string;
  computer: string;
  mobile: string;
  ext: string;
  /** Day and month only, "MM-DD": the year is never asked for. */
  birthday: string;
  /** "YYYY-MM-DD", for work anniversaries. */
  joinedOn: string;
  /** The person's birthday is shown and celebrated. */
  showBirthday: boolean;
  /** For IT help from a distance. Admins only. */
  remoteId: string;
  updatedAt?: string;
  updatedBy?: string;
}
export const NO_DETAILS: OfficeDetails = {
  desk: "", computer: "", mobile: "", ext: "", birthday: "", joinedOn: "", showBirthday: true, remoteId: "",
};

/** The studio's essentials (peopleDesk/{studio}/guide/essentials). */
export interface Essentials {
  wifiName: string;
  wifiPassword: string;
  address: string;
  landmark: string;
  mapsUrl: string;
  addressNote: string;
  printers: { name: string; label: string }[];
  help: { label: string; phone: string }[];
  emergency: { label: string; phone: string }[];
  firstAid: string;
  updatedAt?: string;
  updatedBy?: string;
}
export const NO_ESSENTIALS: Essentials = {
  wifiName: "", wifiPassword: "", address: "", landmark: "", mapsUrl: "", addressNote: "",
  printers: [], help: [], emergency: [], firstAid: "",
};

export interface Wish { by: string; name: string; text: string; at: string }

export const KUDOS_TAGS = ["Saved the day", "Client loved it", "Clean handover", "Taught me something", "Above and beyond"] as const;
export type KudosTag = (typeof KUDOS_TAGS)[number];
export interface Kudos {
  id: string;
  to: string;
  from: string;
  tag: KudosTag;
  text: string;
  at: string;
  hearts: string[];
}

export interface EmergencyContact { name: string; relation: string; phone: string }
export interface Opening { id: string; by: string; byName: string; reason: string; at: string }
/** One person's emergency contacts (peopleDesk/{studio}/emergency/{personId}). */
export interface Emergency {
  contacts: EmergencyContact[];
  bloodGroup: string;
  allergies: string;
  checkedAt: string;
  /** Every time an admin opened them, newest last. */
  openings: Opening[];
}
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
/** People are asked to check their emergency contacts twice a year. */
export const EMERGENCY_RECHECK_DAYS = 182;

/* ── What a person sees ──────────────────────────────────────────────────── */

export interface GuideEntry {
  id: string;
  name: string;
  title: string;
  teamId: string;
  email: string;
  desk: string;
  computer: string;
  mobile: string;
  ext: string;
  /** "MM-DD", or empty when the person keeps it to themselves (admins and the person still see it). */
  birthday: string;
  showBirthday: boolean;
  joinedOn: string;
  /** Admins only. */
  remoteId?: string;
  updatedAt?: string;
  updatedByName?: string;
}
export type OccasionKind = "birthday" | "anniversary";
export interface Occasion {
  id: string;
  personId: string;
  kind: OccasionKind;
  /** The day itself, "YYYY-MM-DD". */
  date: string;
  /** Days from today: 0 is today, negative is past. */
  days: number;
  /** Years with the studio, for an anniversary. */
  years?: number;
}
export interface CardView extends Occasion {
  wishes: Wish[];
  /** The card is for the person viewing it. */
  mine: boolean;
  /** The person viewing has signed it. */
  signed: boolean;
}
export interface GuideView {
  today: string;
  entries: GuideEntry[];
  essentials: Essentials | null;
  /** Occasions in the next 30 days, from today. */
  upcoming: Occasion[];
  /** Cards open for signing that this person may see. */
  cards: CardView[];
  kudos: Kudos[];
  /** The person's own emergency contacts. */
  emergency: Emergency | null;
  /** Admins: who has added their contacts, and when they last checked them. Never the contacts. */
  emergencyRoll?: { personId: string; checkedAt: string }[];
  /** Admins edit the guide and the essentials, and open emergency contacts. */
  canEdit: boolean;
}

/* ── Rules ───────────────────────────────────────────────────────────────── */

function need(ok: unknown, message: string, code = "INVALID", status = 400): asserts ok {
  if (!ok) throw new DomainError(code, message, status);
}
export const isGuideAdmin = (p: Pick<Person, "accessRole" | "active">) => p.active && p.accessRole === "admin";

const str = (v: unknown, label: string, max: number, required = false): string => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v == null ? "" : null;
  need(s !== null, `${label} must be text.`);
  need(!required || s, `${label} is needed.`);
  need(s.length <= max, `${label} is too long (${max} characters at most).`);
  return s;
};
/* Free text with its line breaks kept (an address, a wish). */
const lines = (v: unknown, label: string, max: number, required = false): string => {
  const s = typeof v === "string" ? v.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : v == null ? "" : null;
  need(s !== null, `${label} must be text.`);
  need(!required || s, `${label} is needed.`);
  need(s.length <= max, `${label} is too long (${max} characters at most).`);
  return s;
};
/** A phone number as people write it: digits, spaces, +, -, brackets; at least three digits. */
export function phone(v: unknown, label: string, required = false): string {
  const s = str(v, label, 24, required);
  need(!s || (/^[0-9+()\- ]+$/.test(s) && (s.match(/\d/g) || []).length >= 3), `${label} does not look like a phone number.`);
  return s;
}
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function validMonthDay(v: string): boolean {
  const m = /^(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const month = Number(m[1]), day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN[month - 1];
}
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** The day an "MM-DD" falls on in a year; 29 February is kept on the 28th in other years. */
export function onYear(monthDay: string, year: number): string {
  const md = monthDay === "02-29" && !isLeap(year) ? "02-28" : monthDay;
  return `${year}-${md}`;
}
const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000;
export const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from));

export function cleanOffice(data: any, today: string): OfficeDetails {
  const d = data || {};
  const birthday = str(d.birthday, "Birthday", 10);
  need(!birthday || validMonthDay(birthday), "Pick the birthday's day and month.");
  const joinedOn = str(d.joinedOn, "Joining date", 10);
  need(!joinedOn || (validDate(joinedOn) && joinedOn <= today), "The joining date must be a real day, not in the future.");
  const ext = str(d.ext, "Extension", 10);
  need(!ext || /^[0-9A-Za-z#*\- ]+$/.test(ext), "The extension can only hold digits and letters.");
  return {
    desk: str(d.desk, "Desk", 40),
    computer: str(d.computer, "Computer name", 60),
    mobile: phone(d.mobile, "Office mobile"),
    ext,
    birthday,
    joinedOn,
    showBirthday: d.showBirthday !== false,
    remoteId: str(d.remoteId, "Remote desktop ID", 40),
  };
}

const list = <T,>(v: unknown, label: string, max: number, each: (x: any, i: number) => T): T[] => {
  need(v == null || Array.isArray(v), `${label} must be a list.`);
  const items = (v as any[] | null) || [];
  need(items.length <= max, `${label} holds ${max} at most.`);
  return items.map(each);
};
export function cleanEssentials(data: any): Essentials {
  const d = data || {};
  const mapsUrl = str(d.mapsUrl, "Map link", 500);
  need(!mapsUrl || /^https:\/\/[^\s<>"]+$/i.test(mapsUrl), "The map link must start with https://.");
  return {
    wifiName: str(d.wifiName, "Wi-Fi name", 60),
    wifiPassword: str(d.wifiPassword, "Wi-Fi password", 80),
    address: lines(d.address, "Address", 300),
    landmark: str(d.landmark, "Landmark", 120),
    mapsUrl,
    addressNote: str(d.addressNote, "Note for visitors", 200),
    printers: list(d.printers, "Printers", 6, (p) => ({ name: str(p?.name, "Printer name", 60, true), label: str(p?.label, "What it prints", 60) })),
    help: list(d.help, "Office help", 10, (h) => ({ label: str(h?.label, "Who", 60, true), phone: phone(h?.phone, "Their number", true) })),
    emergency: list(d.emergency, "Emergency numbers", 8, (h) => ({ label: str(h?.label, "Who", 60, true), phone: str(h?.phone, "Number or directions", 80, true) })),
    firstAid: str(d.firstAid, "Where the first-aid kit is", 120),
  };
}

export function cleanEmergency(data: any): Pick<Emergency, "contacts" | "bloodGroup" | "allergies"> {
  const d = data || {};
  const contacts = list(d.contacts, "Contacts", 2, (c, i) => ({
    name: str(c?.name, `Contact ${i + 1}'s name`, 80, true),
    relation: str(c?.relation, `Contact ${i + 1}'s relation to you`, 40, true),
    phone: phone(c?.phone, `Contact ${i + 1}'s number`, true),
  }));
  need(contacts.length >= 1, "Add at least one person to call.");
  const bloodGroup = str(d.bloodGroup, "Blood group", 3);
  need(!bloodGroup || BLOOD_GROUPS.includes(bloodGroup), "Pick a blood group from the list.");
  return { contacts, bloodGroup, allergies: str(d.allergies, "Allergies", 200) };
}

export function cleanReason(v: unknown): string {
  const r = str(v, "The reason", 200, true);
  need(r.length >= 5, "Say why you are opening them, in a few words.");
  return r;
}

export function cleanKudos(data: any, from: Person, people: Person[]): Pick<Kudos, "to" | "tag" | "text"> {
  const d = data || {};
  const to = people.find((p) => p.id === String(d.to || "") && p.active && p.id !== "platform-owner");
  need(to, "Pick who you are thanking.");
  need(to.id !== from.id, "Thank someone else.");
  need((KUDOS_TAGS as readonly string[]).includes(d.tag), "Pick what it was for.");
  const text = lines(d.text, "What they did", 280, true);
  need(text.length >= 3, "Say what they did.");
  return { to: to.id, tag: d.tag, text };
}

/* ── Occasions and cards ─────────────────────────────────────────────────── */

/** A card opens the day before (so it is full by the morning) and stays open three days after. */
export const CARD_OPENS = -1;
export const CARD_CLOSES = 3;

export const cardId = (kind: OccasionKind, personId: string, date: string) => `${kind}_${personId}_${date}`;
export function parseCardId(id: string): { kind: OccasionKind; personId: string; date: string } | null {
  const m = /^(birthday|anniversary)_([A-Za-z0-9_-]{1,80})_(\d{4}-\d{2}-\d{2})$/.exec(String(id || ""));
  return m && validDate(m[3]) ? { kind: m[1] as OccasionKind, personId: m[2], date: m[3] } : null;
}

/**
 * Birthdays (when shown) and work anniversaries (a full year or more) falling
 * `from` to `to` days around today.
 */
export function occasions(people: Person[], offices: Record<string, Partial<OfficeDetails>>, today: string, from: number, to: number): Occasion[] {
  const year = Number(today.slice(0, 4));
  const out: Occasion[] = [];
  for (const p of people) {
    const o = offices[p.id];
    if (!p.active || !o) continue;
    for (const y of [year - 1, year, year + 1]) {
      if (o.showBirthday !== false && o.birthday && validMonthDay(o.birthday)) {
        const date = onYear(o.birthday, y), days = daysBetween(today, date);
        if (days >= from && days <= to) out.push({ id: cardId("birthday", p.id, date), personId: p.id, kind: "birthday", date, days });
      }
      if (o.joinedOn && validDate(o.joinedOn)) {
        const date = onYear(o.joinedOn.slice(5), y), days = daysBetween(today, date);
        const years = y - Number(o.joinedOn.slice(0, 4));
        if (years >= 1 && days >= from && days <= to) out.push({ id: cardId("anniversary", p.id, date), personId: p.id, kind: "anniversary", date, days, years });
      }
    }
  }
  return out.sort((a, b) => a.days - b.days || a.kind.localeCompare(b.kind) || a.personId.localeCompare(b.personId));
}

/** The cards open today. The person a card is for sees it from the day itself, so the day before stays a surprise. */
export function openCards(people: Person[], offices: Record<string, Partial<OfficeDetails>>, today: string): Occasion[] {
  return occasions(people, offices, today, -CARD_CLOSES, -CARD_OPENS);
}

/** Sign a card, or change your wish: one wish a person, the card's own person never signs. */
export function signCard(wishes: Wish[], card: Occasion | undefined, actor: Person, text: unknown, now: string): Wish[] {
  need(card, "That card is not open for signing.", "NOT_FOUND", 404);
  need(card.personId !== actor.id, "This card is for you. Enjoy it.");
  const clean = lines(text, "Your wish", 280, true);
  const rest = (wishes || []).filter((w) => w.by !== actor.id);
  need(rest.length < 80, "The card is full.");
  return [...rest, { by: actor.id, name: actor.name, text: clean, at: now }];
}

/* ── What each person may see ────────────────────────────────────────────── */

export interface GuideStore {
  people: Person[];
  offices: Record<string, Partial<OfficeDetails>>;
  essentials: Partial<Essentials> | null;
  /** Wishes on the open cards, by card ID. */
  cards: Record<string, Wish[]>;
  kudos: Kudos[];
  /** The viewer's own emergency contacts. */
  emergency: Partial<Emergency> | null;
  /** Admins: when each person last checked their contacts, by person ID. */
  emergencyChecked?: Record<string, string>;
}

/** People listed in the guide: the studio's active team, never the platform owner looking in. */
const listed = (people: Person[]) => people.filter((p) => p.active && p.id !== "platform-owner");

export function guideView(store: GuideStore, me: Person, today: string): GuideView {
  const admin = isGuideAdmin(me);
  const people = listed(store.people);
  const names = new Map(store.people.map((p) => [p.id, p.name]));
  const entries: GuideEntry[] = people.map((p) => {
    const o: OfficeDetails = { ...NO_DETAILS, ...(store.offices[p.id] || {}) };
    const showsBirthday = o.showBirthday !== false;
    return {
      id: p.id,
      name: p.name,
      title: p.title,
      teamId: p.teamId,
      email: p.email || "",
      desk: o.desk,
      computer: o.computer,
      mobile: o.mobile,
      ext: o.ext,
      birthday: showsBirthday || admin || p.id === me.id ? o.birthday : "",
      showBirthday: showsBirthday,
      joinedOn: o.joinedOn,
      ...(admin ? { remoteId: o.remoteId || "" } : {}),
      ...(o.updatedAt ? { updatedAt: o.updatedAt, updatedByName: names.get(o.updatedBy || "") || "" } : {}),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const cards: CardView[] = openCards(people, store.offices, today)
    .filter((c) => c.personId !== me.id || c.days <= 0)
    .map((c) => {
      const wishes = store.cards[c.id] || [];
      return { ...c, wishes, mine: c.personId === me.id, signed: wishes.some((w) => w.by === me.id) };
    });

  const live = new Set(people.map((p) => p.id));
  const kudos = (store.kudos || [])
    .filter((k) => live.has(k.to))
    .sort((a, b) => b.at.localeCompare(a.at));

  const e = store.emergency;
  const emergency: Emergency | null = e && Array.isArray(e.contacts) && e.contacts.length
    ? { contacts: e.contacts, bloodGroup: e.bloodGroup || "", allergies: e.allergies || "", checkedAt: e.checkedAt || "", openings: (e.openings || []).slice(-10) }
    : null;

  return {
    today,
    entries,
    essentials: store.essentials ? { ...NO_ESSENTIALS, ...store.essentials } : null,
    upcoming: occasions(people, store.offices, today, 0, 30),
    cards,
    kudos,
    emergency,
    ...(admin
      ? { emergencyRoll: people.filter((p) => p.id !== me.id).map((p) => ({ personId: p.id, checkedAt: store.emergencyChecked?.[p.id] || "" })) }
      : {}),
    canEdit: admin,
  };
}

/** Contacts not checked for half a year, or never added. */
export function emergencyDue(e: Pick<Emergency, "checkedAt"> | null, today: string): boolean {
  return !e?.checkedAt || daysBetween(e.checkedAt.slice(0, 10), today) > EMERGENCY_RECHECK_DAYS;
}
