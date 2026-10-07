/*
  Platform admin: the questions only a privileged, server-side caller can answer.

  The admin screen used to count two collections in the browser and print a
  hardcoded "99.9%" for platform health. Anything genuinely useful about the
  platform — how close a project is to Firestore's document limit, which
  studios have gone quiet, whether a tenant's records are internally
  consistent — needs to read across every tenant, which no browser client is
  allowed to do and none should be.

  So these run with admin credentials and are gated on the caller's own
  `users/{uid}.role` being Super Admin. They only ever read; nothing here
  mutates a tenant's data.
*/

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

/*
  Resolved per call, not at import time. `admin.initializeApp()` runs in the
  body of index.ts while this module is evaluated by its import, so a handle
  taken here would be built before the default app exists the moment anyone
  moves the export above the init line — and the failure is a deploy-time
  "default Firebase app does not exist" that points at the wrong file.
*/
const db = () => admin.firestore();

/** Firestore refuses a document over 1 MiB. Everything here is measured against it. */
const DOC_LIMIT_BYTES = 1048576;

/** Warn well before the wall — a project this size is one upload from failing. */
const DOC_WARN_RATIO = 0.6;

/** A studio with no project touched in this long is treated as dormant. */
const DORMANT_DAYS = 60;

/*
  Who counts as the platform owner.

  Deliberately not `users/{uid}.role`. firestore.rules lets any non-Client user
  write the `role` field on their own document -- a documented decision, on the
  grounds that a studio user naming their own role inside their own tenant
  changes nothing they could not already do. That reasoning holds for the app.
  It does not hold here: these two functions are the only things in the system
  that read across every tenant, so a self-written role would have been a way
  for one studio's user to read every other studio's figures.

  The token email is signed by Firebase Auth and cannot be set by the caller,
  which is why firestore.rules uses exactly this check for isSuperAdmin(). To
  add an owner, add the address here and redeploy -- a deliberate, reviewable
  act rather than a document anyone can edit.
*/
const PLATFORM_OWNER_EMAILS = ["formfactors.operations@gmail.com"];

async function assertSuperAdmin(request: any): Promise<string> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  /*
    Not gated on email_verified. Firebase Auth holds one account per email
    address, and the owner's account already exists, so nobody else can
    register this address to reach the check. Requiring verification would
    instead lock out a password-provider owner who never clicked the link.
  */
  const email = String(request.auth.token?.email || "").toLowerCase();
  if (!PLATFORM_OWNER_EMAILS.includes(email)) {
    logger.warn("platformAdmin: refused", { uid: request.auth.uid, email });
    throw new HttpsError("permission-denied", "Platform admin access only.");
  }
  return request.auth.uid;
}

/**
 * Serialised size of a document, as Firestore would count it.
 *
 * Close enough for a warning threshold: the exact rule counts field names and
 * type overhead too, so this under-reports slightly, which is the safe
 * direction for a limit you do not want to hit.
 */
function approximateBytes(data: any): number {
  try {
    return Buffer.byteLength(JSON.stringify(data ?? {}), "utf8");
  } catch {
    return 0;
  }
}

/**
 * One read of the whole platform: tenants, people, projects, and the numbers
 * the old screen either faked or could not see.
 */
export const platformOverview = onCall(async (request) => {
  await assertSuperAdmin(request);

  const [orgsSnap, usersSnap, projectsSnap] = await Promise.all([
    db().collection("organizations").get(),
    db().collection("users").get(),
    db().collection("projects").get(),
  ]);

  const orgs = orgsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const now = Date.now();
  const perTenant: Record<string, any> = {};
  const oversized: any[] = [];
  let totalBytes = 0;
  let compressedCount = 0;

  projectsSnap.docs.forEach((d) => {
    const data = d.data() as any;
    const tenantId = data.tenantId || "(none)";
    const bytes = approximateBytes(data);
    totalBytes += bytes;
    if (data.isCompressed) compressedCount++;

    const t = (perTenant[tenantId] ||= {
      tenantId,
      projects: 0,
      bytes: 0,
      lastModified: 0,
      largestProjectKB: 0,
    });
    t.projects++;
    t.bytes += bytes;
    t.largestProjectKB = Math.max(t.largestProjectKB, Math.round(bytes / 1024));
    const lm = Number(data.lastModified) || 0;
    if (lm > t.lastModified) t.lastModified = lm;

    if (bytes >= DOC_LIMIT_BYTES * DOC_WARN_RATIO) {
      oversized.push({
        id: d.id,
        name: data.name || "(unnamed)",
        tenantId,
        kb: Math.round(bytes / 1024),
        pctOfLimit: Math.round((bytes / DOC_LIMIT_BYTES) * 100),
        compressed: !!data.isCompressed,
        lastModified: lm || null,
      });
    }
  });

  oversized.sort((a, b) => b.kb - a.kb);

  const tenants = orgs.map((o) => {
    const stats = perTenant[o.tenantId] || { projects: 0, bytes: 0, lastModified: 0, largestProjectKB: 0 };
    const seats = users.filter((u) => u.tenantId === o.tenantId);
    const daysSince = stats.lastModified
      ? Math.floor((now - stats.lastModified) / 86400000)
      : null;
    return {
      tenantId: o.tenantId,
      orgName: o.orgName || "(unnamed)",
      tierPlan: o.tierPlan || null,
      adminEmail: o.adminEmail || null,
      createdAt: o.createdAt || null,
      projects: stats.projects,
      storageKB: Math.round(stats.bytes / 1024),
      largestProjectKB: stats.largestProjectKB,
      seats: seats.length,
      roles: seats.reduce((acc: Record<string, number>, u: any) => {
        const r = u.role || "(none)";
        acc[r] = (acc[r] || 0) + 1;
        return acc;
      }, {}),
      lastActivity: stats.lastModified || null,
      daysSinceActivity: daysSince,
      dormant: stats.projects === 0 || (daysSince !== null && daysSince > DORMANT_DAYS),
    };
  });

  // Projects whose tenant has no matching organization document.
  const knownTenants = new Set(orgs.map((o) => o.tenantId));
  const orphanTenants = Object.keys(perTenant).filter((t) => t !== "(none)" && !knownTenants.has(t));

  return {
    generatedAt: now,
    totals: {
      organizations: orgs.length,
      users: users.length,
      projects: projectsSnap.size,
      storageKB: Math.round(totalBytes / 1024),
      compressedProjects: compressedCount,
    },
    tenants,
    documentWatch: {
      limitKB: Math.round(DOC_LIMIT_BYTES / 1024),
      warnAtPct: Math.round(DOC_WARN_RATIO * 100),
      atRisk: oversized.slice(0, 25),
      atRiskCount: oversized.length,
    },
    orphanTenants,
  };
});

/**
 * The quiet breakage: records that point at nothing, or carry nothing.
 *
 * None of this stops the app today, which is the problem — it surfaces months
 * later as a project nobody can open or a user who sees an empty studio.
 */
export const platformIntegritySweep = onCall(async (request) => {
  await assertSuperAdmin(request);

  const [orgsSnap, usersSnap, projectsSnap] = await Promise.all([
    db().collection("organizations").get(),
    db().collection("users").get(),
    db().collection("projects").get(),
  ]);

  const orgs = orgsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const tenantIds = new Set(orgs.map((o) => o.tenantId).filter(Boolean));
  const findings: any[] = [];

  const add = (severity: string, kind: string, detail: string, ref?: string) =>
    findings.push({ severity, kind, detail, ref: ref || null });

  // Organizations
  orgs.forEach((o) => {
    if (!o.tenantId) add("high", "org-missing-tenantId", `Organization ${o.id} has no tenantId`, o.id);
    if (o.tenantId && o.tenantId !== o.id) {
      add("low", "org-id-mismatch", `Organization doc id ${o.id} differs from tenantId ${o.tenantId}`, o.id);
    }
    if (!o.orgName) add("low", "org-unnamed", `Organization ${o.id} has no name`, o.id);
  });

  // Users
  usersSnap.docs.forEach((d) => {
    const u = d.data() as any;
    if (!u.tenantId) {
      add("high", "user-no-tenant", `User ${u.email || d.id} has no tenantId`, d.id);
    } else if (!tenantIds.has(u.tenantId)) {
      add("high", "user-orphan-tenant", `User ${u.email || d.id} points at unknown tenant ${u.tenantId}`, d.id);
    }
    if (!u.role) add("medium", "user-no-role", `User ${u.email || d.id} has no role`, d.id);
  });

  // Projects
  projectsSnap.docs.forEach((d) => {
    const p = d.data() as any;
    if (!p.tenantId) {
      add("high", "project-no-tenant", `Project ${p.name || d.id} has no tenantId — invisible to every studio`, d.id);
    } else if (!tenantIds.has(p.tenantId)) {
      add("high", "project-orphan-tenant", `Project ${p.name || d.id} points at unknown tenant ${p.tenantId}`, d.id);
    }
    if (p.isCompressed && !p.compressedData) {
      add("high", "project-compressed-empty", `Project ${p.name || d.id} is marked compressed but carries no data`, d.id);
    }
    if (!p.isCompressed && !p.context) {
      add("medium", "project-no-context", `Project ${p.name || d.id} has no context`, d.id);
    }
    if (!p.lastModified) add("low", "project-no-timestamp", `Project ${p.name || d.id} has no lastModified`, d.id);
  });

  const bySeverity = findings.reduce((acc: Record<string, number>, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  logger.info("platformIntegritySweep", { findings: findings.length, bySeverity });

  return {
    generatedAt: Date.now(),
    scanned: {
      organizations: orgs.length,
      users: usersSnap.size,
      projects: projectsSnap.size,
    },
    bySeverity,
    findings: findings.slice(0, 200),
    truncated: findings.length > 200,
  };
});
