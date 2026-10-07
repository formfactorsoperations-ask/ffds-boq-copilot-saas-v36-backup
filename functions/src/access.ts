/*
  Who belongs to which studio, decided on the server.

  The browser used to decide it. On a first sign-in, LoginScreen wrote
  users/{uid} itself -- `tenantId: 'demo-tenant-01', role: 'Admin'` -- and on
  every sign-in it copied a role from the organisation's team list into the
  same document. The rules allowed both, because the browser was the only thing
  doing the writing. So anybody with a Google account could sign in and be an
  Admin, and anybody who could open the console could write any tenantId and
  any role onto their own profile: every rule that asks "same tenant?" reads
  that document.

  The profile's privileged fields -- role, tenantId, projectIds -- are now
  written only here and by the client-login functions, with admin credentials
  that the rules do not constrain. The rules refuse them from the browser.

  Membership comes from one place: a studio's own team list, matched on an
  email address Firebase Auth has verified. An unverified password account
  proves nothing about the address it was registered with, so it cannot claim
  a seat on somebody's team.
*/

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as pako from "pako";
import { timingSafeEqual, randomInt } from "crypto";

/* Resolved per call; see the note on the same line in platformAdmin.ts. */
const db = () => admin.firestore();

/** Same list, same reasoning, as platformAdmin.ts. */
const PLATFORM_OWNER_EMAILS = ["formfactors.operations@gmail.com"];

/*
  Roles a team list may hand out. A studio owner assigns roles to their own
  people; they cannot mint a platform administrator, and a client is created by
  createClientLogin with a project attached, never by being typed into a team.
*/
const TEAM_ROLES = new Set([
  "Owner", "Admin", "Ops Director", "Designer", "Site Supervisor", "Viewer",
  "Vendor",
]);

type Access =
  | { access: "studio"; tenantId: string | null; role: string }
  | { access: "client"; tenantId: string | null; role: "Client"; projectIds: string[] }
  | { access: "none" };

function teamRole(raw: any): string {
  const role = String(raw || "").trim();
  // The team screen offers "Super Admin" in its role list. Only the platform
  // owner is one, so a studio choosing it gets its highest studio role.
  if (role === "Super Admin") return "Admin";
  if (role === "Client" || !role) return "Viewer";
  return TEAM_ROLES.has(role) ? role : "Viewer";
}

/*
  A row marked "Client" is not a seat on the team. It used to count, as a
  Viewer -- who sees every rate and margin -- so typing a client into the
  team screen quietly gave them the studio's books. Clients get their
  portal from createClientLogin, with their own projects and nothing else.
*/
const isStaffRow = (m: any) => String(m?.role || "").trim() !== "Client";

function onTeam(org: any, email: string): any | null {
  const team: any[] = Array.isArray(org?.team) ? org.team : [];
  return team.find((m) => isStaffRow(m) && String(m?.email || "").trim().toLowerCase() === email) || null;
}

/**
 * Settle the signed-in user's studio and role, and say which app they get.
 *
 * Called on every studio sign-in. It never creates access out of nothing:
 * a verified email on a studio's team list, a profile an administrator already
 * set up, or no access at all.
 */
export const syncStudioAccess = onCall(async (request): Promise<Access> => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const uid = request.auth.uid;
  const email = String(request.auth.token?.email || "").trim().toLowerCase();
  const verified = request.auth.token?.email_verified === true;

  const ref = db().collection("users").doc(uid);
  const snap = await ref.get();
  const profile: any = snap.exists ? snap.data() : {};

  // Clients are set up by createClientLogin, with their projects. Nothing here
  // turns a client into anything else, or back.
  if (profile.role === "Client") {
    return {
      access: "client",
      tenantId: profile.tenantId || null,
      role: "Client",
      projectIds: Array.isArray(profile.projectIds) ? profile.projectIds : [],
    };
  }

  /*
    A team list is the studio's own statement of who works there. The studio
    already on the profile is asked first, so a person on two teams stays
    where they were; otherwise every studio is asked, which is cheap at this
    platform's size and is the only way a newly invited member finds theirs.
  */
  let match: { tenantId: string; role: string } | null = null;
  if (verified && email) {
    if (profile.tenantId) {
      const own = await db().collection("organizations").doc(String(profile.tenantId)).get();
      const member = own.exists ? onTeam(own.data(), email) : null;
      if (member) match = { tenantId: own.id, role: teamRole(member.role) };
    }
    if (!match) {
      const orgs = await db().collection("organizations").get();
      const found = orgs.docs.filter((d) => onTeam(d.data(), email));
      if (found.length > 1) {
        logger.warn("syncStudioAccess: email is on several teams; using the first", {
          uid, tenants: found.map((d) => d.id),
        });
      }
      if (found.length) {
        match = { tenantId: found[0].id, role: teamRole(onTeam(found[0].data(), email)?.role) };
      }
    }
  }

  if (match) {
    if (profile.tenantId !== match.tenantId || profile.role !== match.role || profile.email !== email) {
      await ref.set(
        { email, tenantId: match.tenantId, role: match.role, updatedAt: Date.now() },
        { merge: true },
      );
    }
    return { access: "studio", tenantId: match.tenantId, role: match.role };
  }

  /*
    A profile that already names a studio and a role, with no team entry to
    correct it. These were set up before team lists were the rule -- by an
    administrator, or by the old sign-in -- and are kept as they are. The rules
    no longer let anyone write one of these from the browser, so none can be
    added this way from now on.
  */
  /*
    Unless that studio keeps a team list and this person is not on it. Leaving
    the team used to change nothing: the profile kept its studio and role, and
    every rule reads the profile, so a person who had left could go on reading
    and writing the studio's projects for as long as they liked.
  */
  if (profile.tenantId && profile.role) {
    if (!PLATFORM_OWNER_EMAILS.includes(email)) {
      const own = await db().collection("organizations").doc(String(profile.tenantId)).get();
      const team = own.exists ? own.data()?.team : null;
      if (Array.isArray(team) && team.length && !onTeam(own.data(), email)) {
        await revokeStaff(uid, String(profile.tenantId), "not on the studio's team at sign-in");
        return { access: "none" };
      }
    }
    return { access: "studio", tenantId: profile.tenantId, role: profile.role };
  }

  if (verified && PLATFORM_OWNER_EMAILS.includes(email)) {
    return { access: "studio", tenantId: profile.tenantId || null, role: "Super Admin" };
  }

  logger.info("syncStudioAccess: no studio for this account", { uid, email, verified });
  return { access: "none" };
});

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Take a person's studio access away now.
 *
 * The profile loses its studio and role, which every rule reads on every
 * request, so their access to data ends with this write. Their sessions are
 * revoked and the login is disabled, so they are signed out and cannot sign
 * back in; createStaffLogin turns it on again if the studio adds them back.
 */
async function revokeStaff(uid: string, tenantId: string, reason: string) {
  await db().collection("users").doc(uid).set({
    role: admin.firestore.FieldValue.delete(),
    tenantId: admin.firestore.FieldValue.delete(),
    revokedAt: Date.now(),
    revokedFrom: tenantId,
    revokedReason: reason,
    updatedAt: Date.now(),
  }, { merge: true });
  try {
    await admin.auth().revokeRefreshTokens(uid);
    await admin.auth().updateUser(uid, { disabled: true });
  } catch (e: any) {
    logger.warn("revokeStaff: could not disable the login", { uid, message: e?.message });
  }
  logger.info("revokeStaff", { uid, tenantId, reason });
}

const teamEmails = (team: any): Map<string, any> => {
  const out = new Map<string, any>();
  (Array.isArray(team) ? team : []).forEach((m: any) => {
    const e = String(m?.email || "").trim().toLowerCase();
    if (e && isStaffRow(m)) out.set(e, m);
  });
  return out;
};

/**
 * When a studio changes its team list, the change takes effect at once.
 *
 * A person taken off the list loses access immediately, not at their next
 * sign-in -- someone who has left has no reason to sign in again, and their
 * open session would otherwise carry on. A changed role is copied onto the
 * profile too, so demoting an Admin to Designer is not a request they can
 * ignore by staying signed in.
 *
 * People are found through Firebase Auth by the email on the team list, not by
 * the email on their profile, which they may edit themselves.
 */
export const onStudioTeamChange = onDocumentUpdated("organizations/{orgId}", async (event) => {
  const orgId = event.params.orgId;
  const before = teamEmails(event.data?.before.data()?.team);
  const after = teamEmails(event.data?.after.data()?.team);

  for (const [email, member] of before) {
    if (PLATFORM_OWNER_EMAILS.includes(email)) continue;
    const now = after.get(email);
    const removed = !now;
    const roleChanged = !!now && teamRole(now.role) !== teamRole(member.role);
    if (!removed && !roleChanged) continue;

    let uid: string;
    try {
      uid = (await admin.auth().getUserByEmail(email)).uid;
    } catch (e: any) {
      if (e?.code === "auth/user-not-found") continue; // never had a login
      throw e;
    }
    const profile: any = (await db().collection("users").doc(uid).get()).data() || {};
    // Only this studio's own staff: a client, or someone working for another
    // studio, is not this team's to change.
    if (profile.role === "Client" || profile.tenantId !== orgId) continue;

    if (removed) {
      await revokeStaff(uid, orgId, "removed from the studio's team");
    } else {
      await db().collection("users").doc(uid).set({ role: teamRole(now.role), updatedAt: Date.now() }, { merge: true });
      await admin.auth().revokeRefreshTokens(uid);
      logger.info("onStudioTeamChange: role changed", { uid, orgId, from: profile.role, to: teamRole(now.role) });
    }
  }
});

/**
 * The people who still hold studio access without being on that studio's team.
 *
 * Revocation used to happen only at the next sign-in, and a "Client" row used
 * to grant Viewer, so profiles like that exist from before. Platform owner
 * only. A dry run by default -- it lists them; `{ apply: true }` revokes them.
 */
export const sweepStaffAccess = onCall(async (request) => {
  const email = String(request.auth?.token?.email || "").toLowerCase();
  if (!request.auth || request.auth.token?.email_verified !== true || !PLATFORM_OWNER_EMAILS.includes(email)) {
    throw new HttpsError("permission-denied", "Platform admin access only.");
  }
  const apply = request.data?.apply === true;
  const orgs = new Map<string, any>();
  (await db().collection("organizations").get()).docs.forEach((d) => orgs.set(d.id, d.data()));

  const strays: { uid: string; email: string; role: string; tenantId: string }[] = [];
  const users = await db().collection("users").get();
  for (const u of users.docs) {
    const p: any = u.data();
    if (!p.tenantId || !p.role || p.role === "Client") continue;
    let authEmail = "";
    try { authEmail = String((await admin.auth().getUser(u.id)).email || "").toLowerCase(); } catch { continue; }
    if (PLATFORM_OWNER_EMAILS.includes(authEmail)) continue;
    const org = orgs.get(String(p.tenantId));
    const team = org?.team;
    if (!Array.isArray(team) || !team.some(isStaffRow)) continue; // a studio without a team list is left alone
    if (onTeam(org, authEmail)) continue;
    strays.push({ uid: u.id, email: authEmail, role: p.role, tenantId: p.tenantId });
  }
  if (apply) {
    for (const s of strays) await revokeStaff(s.uid, s.tenantId, "not on the studio's team (sweep)");
  }
  logger.info("sweepStaffAccess", { by: request.auth.uid, apply, count: strays.length });
  return { applied: apply, strays };
});

/* ────────────────────────────────────────────────────────────────────────── */

function storedContext(data: any): any {
  if (data?.isCompressed && data?.compressedData) {
    const json = Buffer.from(pako.inflate(Buffer.from(data.compressedData, "base64"))).toString("utf-8");
    return JSON.parse(json)?.context || {};
  }
  return data?.context || {};
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * The studio name and logo for a portal link's sign-in door.
 *
 * The door used to read projects/{id} straight from the browser, before anyone
 * had signed in, to find the tenant -- one of the two reasons that collection
 * was readable by the whole internet. This answers only the branding, and only
 * for a link the studio actually issued. Every failure returns the same empty
 * answer, so the door cannot be used to test which project ids exist.
 */
/*
  Where an agreement link's token is kept on the project. The same signature is
  written under several names (see clientApprovalEngine), so any of them may be
  the one the link was sent from.
*/
const AGREEMENT_TOKEN_FIELDS = [
  "executionSignoff", "executionAgreementSignoff", "contractSignoff", "designAgreementSignoff",
  "termsSignoff", "proposalSignoff", "handoverSignoff", "handoverDocketSignoff",
];

export const portalDoor = onCall(async (request) => {
  const token = String(request.data?.token || "");
  const at = token.lastIndexOf("_");
  if (at <= 0 || token.length > 200) return {};

  /*
    Two kinds of link reach the door: a portal link, `<projectId>_<random>`,
    and an agreement link, `<TYPE>_AGREEMENT_<projectId>_<random>`, which now
    opens the portal too instead of a page of its own.
  */
  const agreement = /^[A-Z]+_AGREEMENT_(.+)_[^_]+$/.exec(token);
  const projectId = agreement ? agreement[1] : token.slice(0, at);
  if (!projectId || projectId.includes("/")) return {};

  try {
    const snap = await db().collection("projects").doc(projectId).get();
    if (!snap.exists) return {};
    const data: any = snap.data();
    const ctx = storedContext(data);
    const issued: string[] = agreement
      ? AGREEMENT_TOKEN_FIELDS.map((f) => String(ctx?.[f]?.token || "")).filter(Boolean)
      : [String(ctx?.portalAccess?.token || "")].filter(Boolean);
    if (!issued.some((t) => sameToken(t, token))) return {};

    const tenantId = data?.tenantId;
    if (!tenantId) return {};
    const org = await db().collection("organizations").doc(String(tenantId)).get();
    if (!org.exists) return {};
    const o: any = org.data();
    const looksLikeAnId = !o.orgName || /^[a-z0-9]+([-_][a-z0-9]+)+$/.test(String(o.orgName));
    return {
      name: looksLikeAnId ? null : o.orgName,
      logo: o.orgLogo || null,
      phone: o.contactPhone || null,
      email: o.contactEmail || null,
    };
  } catch (e: any) {
    logger.warn("portalDoor: lookup failed", { message: e?.message });
    return {};
  }
});


/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Readable temp password: three words and two digits, said aloud over a phone.
 * Two words from twenty gave about 36,000 possibilities; this gives about
 * twenty-four million, and it is changed at the first sign-in anyway.
 */
function tempPassword(): string {
  const words = ["amber", "cedar", "delta", "ember", "fable", "grove", "haven", "ivory", "jasper", "linen",
    "marble", "nectar", "onyx", "pearl", "quartz", "raven", "slate", "thistle", "umber", "willow",
    "acorn", "basil", "cobalt", "dune", "falcon", "garnet", "harbor", "indigo", "juniper", "kestrel",
    "lagoon", "maple", "nimbus", "olive", "pepper", "quill", "russet", "saffron", "tundra", "velvet",
    "walnut", "zephyr", "birch", "canyon", "fern", "glacier", "heron", "iris", "lotus", "meadow",
    "orchid", "prism", "ripple", "sable", "teal", "vista", "wren", "yarrow", "aspen", "bramble",
    "coral", "drift", "flint", "gale"];
  const pick = () => words[randomInt(words.length)];
  return `${pick()}-${pick()}-${pick()}-${randomInt(10, 100)}`;
}

/** Roles that may create a login for somebody else in their studio. */
const LOGIN_ISSUERS = new Set(["Owner", "Admin", "Ops Director"]);

/**
 * Create -- or reset -- the login for a person on a studio's team.
 *
 * Studio staff used to be added in the Firebase console, and an account made
 * there has an unverified email. syncStudioAccess cannot trust an unverified
 * address, because anyone can register one, so those people would be turned
 * away. This makes the account here instead: the email is marked verified,
 * because the studio vouches for it by putting it on the team, and the person
 * is made to choose their own password when they first sign in.
 *
 * The team list stays the authority. The email must already be on the saved
 * list, and the role comes from there, never from the request.
 */
export const createStaffLogin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const tenantId = String(request.data?.tenantId || "");
  const email = String(request.data?.email || "").trim().toLowerCase();
  if (!tenantId || !email) throw new HttpsError("invalid-argument", "A studio and an email are needed.");

  const callerEmail = String(request.auth.token?.email || "").toLowerCase();
  const isOwner = request.auth.token?.email_verified === true && PLATFORM_OWNER_EMAILS.includes(callerEmail);
  if (!isOwner) {
    const caller: any = (await db().collection("users").doc(request.auth.uid).get()).data() || {};
    if (caller.tenantId !== tenantId || !LOGIN_ISSUERS.has(String(caller.role))) {
      throw new HttpsError("permission-denied", "Only the studio's Owner, Admin or Ops Director can create logins.");
    }
  }

  const org = await db().collection("organizations").doc(tenantId).get();
  const member = org.exists ? onTeam(org.data(), email) : null;
  if (!member) {
    throw new HttpsError("failed-precondition", "Save the team with this person on it first, then create their login.");
  }
  if (PLATFORM_OWNER_EMAILS.includes(email)) {
    throw new HttpsError("failed-precondition", "The platform owner's login is not managed from a studio team.");
  }
  const role = teamRole(member.role);
  const password = tempPassword();

  let user: admin.auth.UserRecord;
  let reissued = false;
  try {
    user = await admin.auth().getUserByEmail(email);
    reissued = true;
  } catch (e: any) {
    if (e?.code !== "auth/user-not-found") throw e;
    user = await admin.auth().createUser({
      email,
      password,
      emailVerified: true,
      displayName: member.name || undefined,
    });
  }

  const ref = db().collection("users").doc(user.uid);
  const existing: any = (await ref.get()).data() || {};
  if (existing.role === "Client") {
    throw new HttpsError("failed-precondition", "That email is a client login. Use a different email for staff.");
  }
  // Moving a person between studios is a Platform console decision, never a
  // side effect of a password reset -- for anyone, the platform owner included.
  if (existing.tenantId && existing.tenantId !== tenantId && existing.role) {
    throw new HttpsError("failed-precondition", "That email already works for another studio.");
  }
  if (reissued) {
    // disabled: false -- a person taken off the team and added back again.
    await admin.auth().updateUser(user.uid, { password, emailVerified: true, disabled: false });
  }

  await ref.set({
    email,
    tenantId,
    role,
    displayName: member.name || existing.displayName || null,
    mustChangePassword: true,
    revokedAt: admin.firestore.FieldValue.delete(),
    revokedFrom: admin.firestore.FieldValue.delete(),
    revokedReason: admin.firestore.FieldValue.delete(),
    updatedAt: Date.now(),
  }, { merge: true });

  logger.info("createStaffLogin", { by: request.auth.uid, tenantId, uid: user.uid, reissued });
  return { uid: user.uid, email, role, tempPassword: password, reissued };
});
