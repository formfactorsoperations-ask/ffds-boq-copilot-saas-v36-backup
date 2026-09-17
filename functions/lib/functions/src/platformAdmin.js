"use strict";
/*
  Shrink project documents that are close to Firestore's 1 MiB limit.

  The write paths that caused the bloat are fixed, but a fix to a write path
  only helps the next write. The documents that are already large stay large
  until something rewrites them, and several are close enough to the cap that
  the next floor plan or proposal version is the one that fails.

  Three things account for nearly all of it, measured across the ten projects
  the platform console flagged:

    settingsHash   `JSON.stringify({termsSettings, paymentStructure, orgData,
                   projectContext})` stored in a field named "hash" -- up to
                   509KB, kept again in every history entry, and never read.
    tier contexts  Each proposal version snapshotting the whole project context,
                   images included, when six fields of it are ever read.
    inline media   Floor plans, logos and one 706KB PDF held as base64.

  Nothing here deletes anything. Media moves to Storage and the document keeps
  the URL; the settings blob becomes a real hash of itself. A project that is
  already small is left alone.
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformRepairDocuments = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const crypto = require("crypto");
const pako = require("pako");
const db = () => admin.firestore();
const DOC_LIMIT_BYTES = 1048576;
/** Only touch documents above this share of the limit. */
const REPAIR_ABOVE_RATIO = 0.5;
/** Anything longer than this in a *Hash field is the old whole-object form. */
const LEGACY_HASH_MIN = 128;
/** Base64 payloads at least this large are worth moving to Storage. */
const MEDIA_MIN_CHARS = 20000;
/** Cap the work per call so a run cannot outlive the function timeout. */
const MAX_PROJECTS_PER_RUN = 25;
const PLATFORM_OWNER_EMAILS = ["formfactors.operations@gmail.com"];
async function assertSuperAdmin(request) {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign in first.");
    const email = String(((_a = request.auth.token) === null || _a === void 0 ? void 0 : _a.email) || "").toLowerCase();
    if (!PLATFORM_OWNER_EMAILS.includes(email)) {
        logger.warn("platformRepair: refused", { uid: request.auth.uid, email });
        throw new https_1.HttpsError("permission-denied", "Platform admin access only.");
    }
    return request.auth.uid;
}
function bytesOf(value) {
    try {
        return Buffer.byteLength(JSON.stringify(value !== null && value !== void 0 ? value : {}), "utf8");
    }
    catch (_a) {
        return 0;
    }
}
/** The six fields anything actually reads off a version's context snapshot. */
function leanTierContext(ctx) {
    if (!ctx || typeof ctx !== "object")
        return ctx;
    return {
        name: ctx.name,
        clientName: ctx.clientName,
        area: ctx.area,
        config: ctx.config,
        rooms: ctx.rooms,
        approvedTierId: ctx.approvedTierId,
        gstRate: ctx.gstRate,
    };
}
/**
 * Replace whole-object "hashes" with a hash of themselves.
 *
 * Recursive because the same blob sits in the live snapshot, in every history
 * entry, and inside each tier's copy of the context. Returns how many bytes it
 * reclaimed so a dry run can report honestly.
 */
function rehashSettings(node) {
    if (!node || typeof node !== "object")
        return 0;
    let saved = 0;
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (key === "settingsHash" && typeof value === "string" && value.length >= LEGACY_HASH_MIN) {
            const digest = crypto.createHash("sha256").update(value).digest("hex");
            saved += value.length - digest.length;
            node[key] = digest;
        }
        else if (value && typeof value === "object") {
            saved += rehashSettings(value);
        }
    }
    return saved;
}
function sniffContentType(base64) {
    if (base64.startsWith("/9j/"))
        return "image/jpeg";
    if (base64.startsWith("iVBORw0KGgo"))
        return "image/png";
    if (base64.startsWith("JVBERi0"))
        return "application/pdf";
    if (base64.startsWith("R0lGODdh") || base64.startsWith("R0lGODlh"))
        return "image/gif";
    if (base64.startsWith("UklGR"))
        return "image/webp";
    return "application/octet-stream";
}
const EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/pdf": "pdf",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/octet-stream": "bin",
};
/**
 * Put a base64 payload in Storage and return a URL the app can read.
 *
 * The admin SDK has no `getDownloadURL`, so the download token is written
 * directly into the object's metadata — that is what the client SDK's URLs
 * carry, so the result is the same kind of link, readable without a signed
 * request or a public bucket.
 */
async function moveToStorage(tenantId, projectId, field, base64) {
    const bucket = admin.storage().bucket();
    const contentType = sniffContentType(base64);
    const token = crypto.randomUUID();
    const path = `studios/${tenantId || "unknown"}/plans/${projectId}-${field}-${Date.now()}.${EXT[contentType] || "bin"}`;
    await bucket.file(path).save(Buffer.from(base64, "base64"), {
        contentType,
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}
/**
 * One project, repaired in memory.
 *
 * Returns the actions taken so both modes report the same thing — a dry run is
 * only trustworthy if it runs the identical code.
 */
async function repairProject(projectId, tenantId, project, apply) {
    const actions = [];
    const before = bytesOf(project);
    if (Array.isArray(project.tiers)) {
        let trimmed = 0;
        project.tiers = project.tiers.map((tier) => {
            const next = Object.assign({}, tier);
            delete next.fullBoq;
            delete next.groupedBoq;
            if (next.projectContext && bytesOf(next.projectContext) > 4096) {
                next.projectContext = leanTierContext(next.projectContext);
                trimmed++;
            }
            return next;
        });
        if (trimmed)
            actions.push(`lean context on ${trimmed} version${trimmed === 1 ? "" : "s"}`);
    }
    const rehashed = rehashSettings(project);
    if (rehashed > 0)
        actions.push(`hashed settings blob (${Math.round(rehashed / 1024)}KB)`);
    const ctx = project.context;
    if (ctx && typeof ctx === "object") {
        /*
          The two fields are not interchangeable, and getting it wrong breaks the
          client proposal.
    
          `logoImage` is read in ten places as `<img src={ctx.logoImage}>`, holding a
          full data: URI. An https URL works in exactly the same expression, so it
          is replaced where it stands and no reader changes.
    
          `floorplanImage` holds raw base64 and its one reader builds the data: URI
          itself, so a URL cannot go in the same field — it moves to
          `floorplanImageUrl`, which the setup wizard reads.
        */
        for (const field of ["floorplanImage", "logoImage"]) {
            const value = ctx[field];
            if (typeof value !== "string" || value.length < MEDIA_MIN_CHARS)
                continue;
            if (value.startsWith("http"))
                continue; // already moved
            // Either shape: a bare base64 payload, or a data: URI carrying one.
            const raw = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
            const kb = Math.round((raw.length * 3) / 4 / 1024);
            if (field === "logoImage") {
                if (apply)
                    ctx[field] = await moveToStorage(tenantId, projectId, field, raw);
                else
                    ctx[field] = "https://storage/…";
            }
            else {
                if (apply)
                    ctx.floorplanImageUrl = await moveToStorage(tenantId, projectId, field, raw);
                delete ctx[field];
            }
            actions.push(`${field} → Storage (${kb}KB)`);
        }
        // Legacy shape: nothing in the current app writes or reads floorPlanData,
        // but one project holds a 706KB PDF plan there and it is the client's.
        const planData = ctx.floorPlanData;
        if (planData && typeof planData.fileUrl === "string" && planData.fileUrl.startsWith("data:")) {
            const raw = planData.fileUrl.slice(planData.fileUrl.indexOf(",") + 1);
            const kb = Math.round((raw.length * 3) / 4 / 1024);
            if (apply) {
                planData.fileUrl = await moveToStorage(tenantId, projectId, "floorPlanData", raw);
            }
            else {
                planData.fileUrl = "";
            }
            actions.push(`floorPlanData → Storage (${kb}KB)`);
        }
    }
    return { actions, savedKB: Math.round((before - bytesOf(project)) / 1024) };
}
/**
 * Repair the documents closest to the limit.
 *
 * Dry by default. `apply: true` is the only thing that writes, and it writes a
 * project back in the same shape it was found — compressed if it was
 * compressed, so nothing downstream has to learn a new format.
 */
exports.platformRepairDocuments = (0, https_1.onCall)({ timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
    var _a, _b, _c, _d, _e;
    await assertSuperAdmin(request);
    const apply = ((_a = request.data) === null || _a === void 0 ? void 0 : _a.apply) === true;
    const onlyProjectId = ((_b = request.data) === null || _b === void 0 ? void 0 : _b.projectId) || null;
    const snap = await db().collection("projects").get();
    const candidates = snap.docs
        .filter((d) => (onlyProjectId ? d.id === onlyProjectId : bytesOf(d.data()) >= DOC_LIMIT_BYTES * REPAIR_ABOVE_RATIO))
        .sort((a, b) => bytesOf(b.data()) - bytesOf(a.data()))
        .slice(0, MAX_PROJECTS_PER_RUN);
    const results = [];
    for (const docSnap of candidates) {
        const raw = docSnap.data();
        const beforeKB = Math.round(bytesOf(raw) / 1024);
        const wasCompressed = !!(raw.isCompressed && raw.compressedData);
        let project;
        try {
            project = wasCompressed
                ? JSON.parse(Buffer.from(pako.inflate(Buffer.from(raw.compressedData, "base64"))).toString("utf-8"))
                : raw;
        }
        catch (e) {
            results.push({ id: docSnap.id, name: raw.name || "(unnamed)", beforeKB, error: `could not decode: ${(e === null || e === void 0 ? void 0 : e.message) || e}` });
            continue;
        }
        const tenantId = raw.tenantId || project.tenantId || "unknown";
        try {
            const { actions } = await repairProject(docSnap.id, tenantId, project, apply);
            if (!actions.length) {
                results.push({ id: docSnap.id, name: raw.name || ((_c = project === null || project === void 0 ? void 0 : project.context) === null || _c === void 0 ? void 0 : _c.name) || "(unnamed)", beforeKB, afterKB: beforeKB, actions: [], applied: false });
                continue;
            }
            let payload;
            if (wasCompressed) {
                const deflated = pako.deflate(JSON.stringify(Object.assign(Object.assign({}, project), { lastModified: Date.now() })));
                payload = {
                    id: docSnap.id,
                    tenantId,
                    name: ((_d = project === null || project === void 0 ? void 0 : project.context) === null || _d === void 0 ? void 0 : _d.name) || raw.name || "(unnamed)",
                    lastModified: Date.now(),
                    isCompressed: true,
                    compressedData: Buffer.from(deflated).toString("base64"),
                };
            }
            else {
                payload = Object.assign(Object.assign({}, project), { tenantId, lastModified: Date.now() });
            }
            const afterKB = Math.round(bytesOf(payload) / 1024);
            if (apply)
                await docSnap.ref.set(payload);
            results.push({
                id: docSnap.id,
                name: ((_e = project === null || project === void 0 ? void 0 : project.context) === null || _e === void 0 ? void 0 : _e.name) || raw.name || "(unnamed)",
                beforeKB,
                afterKB,
                pctOfLimitBefore: Math.round((beforeKB * 1024 * 100) / DOC_LIMIT_BYTES),
                pctOfLimitAfter: Math.round((afterKB * 1024 * 100) / DOC_LIMIT_BYTES),
                actions,
                applied: apply,
            });
        }
        catch (e) {
            results.push({ id: docSnap.id, name: raw.name || "(unnamed)", beforeKB, error: (e === null || e === void 0 ? void 0 : e.message) || String(e) });
        }
    }
    const reclaimedKB = results.reduce((sum, r) => sum + (r.afterKB != null ? r.beforeKB - r.afterKB : 0), 0);
    logger.info("platformRepairDocuments", { apply, examined: candidates.length, reclaimedKB });
    return {
        generatedAt: Date.now(),
        apply,
        examined: candidates.length,
        totalProjects: snap.size,
        reclaimedKB,
        results,
    };
});
//# sourceMappingURL=platformAdmin.js.map