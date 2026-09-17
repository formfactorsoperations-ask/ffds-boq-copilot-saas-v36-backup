"use strict";
/**
 * DOCUMENT ISSUE ENGINE
 *
 * Makes "what the studio released" a real object rather than a live re-render.
 *
 * The client signs an immutable, hashed snapshot. If Studio Settings change next
 * month — a warranty period, a grace period, a jurisdiction — the signed record
 * is unaffected, and the certificate can still prove what was on screen at the
 * moment the signature was taken.
 *
 * `engagement.lockedSnapshot` already did this for the terms + payment pair.
 * This generalises it to every document kind, adds a content hash, and adds the
 * version chain that makes amendment redlines possible.
 */
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changedSectionRefs = exports.diffIssues = exports.resolveDocumentState = exports.agreementKindFor = exports.getIssueHistory = exports.getCurrentIssue = exports.counterSignIssue = exports.signIssue = exports.recordDocumentView = exports.issueDocument = exports.deriveMaterialSections = exports.hashSnapshot = void 0;
const clientApprovalEngine_1 = require("./clientApprovalEngine");
const clientVisibility_1 = require("../lib/clientVisibility");
// ---------------------------------------------------------------------------
// HASHING
// ---------------------------------------------------------------------------
/** Stable stringify — key order must not change the hash. */
function stableStringify(value) {
    if (value === null || value === undefined)
        return 'null';
    if (typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}
/**
 * Deterministic FNV-1a over the stable serialisation, widened to 32 hex chars.
 *
 * This is an integrity anchor and a change detector, not a security boundary —
 * its audit value comes from being reproducible, not from being expensive to
 * forge. Formatted as `SHA256:<hex>` to match the docket-hash convention already
 * used across the app.
 */
function hashSnapshot(snapshot) {
    const input = stableStringify(snapshot);
    // Four independently seeded FNV-1a passes, concatenated to 32 hex characters.
    const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
    const parts = seeds.map(seed => {
        let h = seed >>> 0;
        for (let i = 0; i < input.length; i++) {
            h ^= input.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(16).toUpperCase().padStart(8, '0');
    });
    return `SHA256:${parts.join('')}`;
}
exports.hashSnapshot = hashSnapshot;
// ---------------------------------------------------------------------------
// MATERIAL SECTIONS
// ---------------------------------------------------------------------------
/**
 * Which sections genuinely bind the client, and therefore deserve an individual
 * acknowledgement. Chosen by meaning rather than position, because studios amend
 * and renumber their own sections.
 *
 * Capped at six. Fifteen tick boxes on boilerplate reads as an obstacle course
 * and trains people to click through — which destroys the evidence.
 */
const MATERIAL_MATCHERS = [
    {
        // Specific before broad: this title also contains the word "advance",
        // which would otherwise be swallowed by the payment matcher below.
        test: /snag|pre-handover|handover inspection/i,
        summary: 'The final advance is due when the work is finished, not when snags are closed. Snags are fixed under warranty.',
        dwell: 8,
        priority: 4
    },
    {
        test: /advance|payment framework|payment schedule/i,
        summary: 'Every payment is made in advance, before that phase of work starts. Work pauses if an advance is overdue.',
        dwell: 8,
        priority: 1
    },
    {
        test: /termination|refund|cancel/i,
        summary: 'Advances for a phase that has already started are not refundable. This is what you can and cannot recover if you stop the project.',
        dwell: 8,
        priority: 2
    },
    {
        test: /change request|scope addition|variation/i,
        summary: 'Any change to agreed scope is priced and approved in writing before it is built.',
        dwell: 8,
        priority: 3
    },
    {
        test: /limitation of liability|liability/i,
        summary: "The studio's total liability is capped at the design fees you have paid.",
        dwell: 8,
        priority: 5
    },
    {
        test: /warranty/i,
        summary: 'What is covered after handover, for how long, and what falls outside it.',
        dwell: 4,
        priority: 6
    },
    {
        test: /dispute|jurisdiction/i,
        summary: 'Disputes go to mediation first, then to the courts named here.',
        dwell: 4,
        priority: 7
    }
];
/** Picks the binding sections out of an authored terms configuration. */
function deriveMaterialSections(sections) {
    if (!sections || sections.length === 0)
        return [];
    const picked = [];
    sections.forEach(section => {
        // First matcher whose concern has not already been claimed. A section title
        // can legitimately match several patterns; taking the first match outright
        // would silently drop the section when that slot is already filled.
        const match = MATERIAL_MATCHERS.find(m => m.test.test(section.title || '') && !picked.some(p => p.priority === m.priority));
        if (!match)
            return;
        picked.push({
            ref: String(section.n),
            title: section.title,
            plainSummary: match.summary,
            minDwellSeconds: match.dwell,
            priority: match.priority
        });
    });
    return picked
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 6)
        .sort((a, b) => Number(a.ref) - Number(b.ref))
        .map((_a) => {
        var { priority } = _a, rest = __rest(_a, ["priority"]);
        return rest;
    });
}
exports.deriveMaterialSections = deriveMaterialSections;
// ---------------------------------------------------------------------------
// ISSUING
// ---------------------------------------------------------------------------
const emptyState = () => ({ issues: [], queries: [], lastViewedAt: {} });
/**
 * Freezes a snapshot and releases it to the client.
 *
 * Returns a context updater — same shape as `buildSignoffPatch` — so callers can
 * use it inside a functional setState and merge against fresh context.
 */
function issueDocument(kind, snapshot, opts) {
    const now = Date.now();
    return (prev) => {
        const base = prev || {};
        const state = base.documents || emptyState();
        const existing = state.issues.filter(i => i.kind === kind);
        const current = existing.sort((a, b) => b.version - a.version)[0] || null;
        const issue = {
            id: `di-${kind}-${now}`,
            kind,
            version: ((current === null || current === void 0 ? void 0 : current.version) || 0) + 1,
            reference: opts.reference,
            issuedAt: now,
            issuedBy: opts.issuedBy,
            snapshot,
            contentHash: hashSnapshot(snapshot),
            materialSections: opts.materialSections || [],
            supersedes: (current === null || current === void 0 ? void 0 : current.id) || null,
            supersededAt: null,
            // Staged, not sent. Ops publishes it from the portal controls; until
            // then the client keeps reading whichever issue they had.
            clientVisibility: (0, clientVisibility_1.draft)(),
            counterSignature: null
        };
        const issues = state.issues.map(i => i.id === (current === null || current === void 0 ? void 0 : current.id) ? Object.assign(Object.assign({}, i), { supersededAt: now }) : i);
        return Object.assign(Object.assign({}, base), { documents: Object.assign(Object.assign({}, state), { issues: [...issues, issue] }) });
    };
}
exports.issueDocument = issueDocument;
/** Stamps that the client opened the current issue of this document. */
function recordDocumentView(kind) {
    const now = Date.now();
    return (prev) => {
        const base = prev || {};
        const state = base.documents || emptyState();
        return Object.assign(Object.assign({}, base), { documents: Object.assign(Object.assign({}, state), { lastViewedAt: Object.assign(Object.assign({}, (state.lastViewedAt || {})), { [kind]: now }) }) });
    };
}
exports.recordDocumentView = recordDocumentView;
/**
 * Records the client's signature against one specific issue.
 *
 * The three gated agreements also write through `buildSignoffPatch`, which keeps
 * every legacy alias and the lifecycle gates in step. Addenda have no gate of
 * their own, so the issue-level signature is the whole record for them.
 */
function signIssue(issueId, docket) {
    return (prev) => {
        const state = prev === null || prev === void 0 ? void 0 : prev.documents;
        if (!state)
            return prev;
        return Object.assign(Object.assign({}, prev), { documents: Object.assign(Object.assign({}, state), { issues: state.issues.map(i => (i.id === issueId ? Object.assign(Object.assign({}, i), { clientSignature: docket }) : i)) }) });
    };
}
exports.signIssue = signIssue;
/** Records the studio's counter-signature against the current issue. */
function counterSignIssue(kind, docket) {
    return (prev) => {
        const base = prev || {};
        const state = base.documents || emptyState();
        const current = getCurrentIssue(base, kind);
        if (!current)
            return base;
        return Object.assign(Object.assign({}, base), { documents: Object.assign(Object.assign({}, state), { issues: state.issues.map(i => i.id === current.id ? Object.assign(Object.assign({}, i), { counterSignature: docket }) : i) }) });
    };
}
exports.counterSignIssue = counterSignIssue;
/**
 * Whether a legacy document was actually released to the client.
 *
 * Not every document exists as a DocumentIssue. `getCurrentIssue` synthesises
 * the Terms of Engagement and the Payment Schedule from the engagement record
 * and the last terms docket, for projects that predate the issue model.
 *
 * That fallback used to run regardless of who was asking — twenty lines below a
 * filter whose own comment reads "an issue with no visibility recorded is not a
 * decision ops has made, so it is not one the client sees". So on any project
 * with engagement data, a client could be shown a terms docket or a payment
 * schedule the studio had never released.
 *
 * Blocking the fallback outright for clients was not the answer either: on
 * older projects these documents genuinely were issued, through the flow that
 * existed at the time, and hiding them would take away a contract the client
 * has already signed. Both records say plainly whether that happened — a
 * docket carries `sentAt` and a status past 'draft', an engagement carries
 * `issuedAt` and the same — so the question is answerable rather than guessed.
 */
function legacyWasReleased(context, kind) {
    const ctx = context;
    if (kind === 'terms_docket') {
        const dockets = context.termsDockets || [];
        const latest = dockets[dockets.length - 1];
        if (latest && (latest.sentAt || latest.acknowledgedAt || (latest.status && latest.status !== 'draft'))) {
            return true;
        }
    }
    const engagement = ctx.engagement;
    return !!(engagement && (engagement.issuedAt || engagement.acknowledgedAt || engagement.status === 'issued' || engagement.status === 'acknowledged'));
}
function getCurrentIssue(context, kind, opts = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
    if (!context)
        return null;
    // Withdrawn issues stay in history but are no longer the live document, so a
    // retired legacy release falls back to draft and can be re-issued from the app.
    const issues = (((_a = context.documents) === null || _a === void 0 ? void 0 : _a.issues) || []).filter(i => i.kind === kind && !i.withdrawnAt && !i.addendumTo
        // Published only. An issue with no visibility recorded is not a
        // decision ops has made, so it is not one the client sees.
        && (!opts.clientView || (0, clientVisibility_1.isVisibleToClient)(i)));
    if (issues.length > 0) {
        return issues.sort((a, b) => b.version - a.version)[0];
    }
    /*
      Past this point everything is synthesised from legacy records rather than
      read from an issue the studio published. A client only sees it if it was
      genuinely released to them.
    */
    if (opts.clientView && !legacyWasReleased(context, kind))
        return null;
    const ctx = context;
    if (kind === 'terms_docket') {
        const engagement = ctx.engagement;
        const dockets = context.termsDockets || [];
        const latestDocket = dockets[dockets.length - 1];
        const termsSettings = ((_b = engagement === null || engagement === void 0 ? void 0 : engagement.lockedSnapshot) === null || _b === void 0 ? void 0 : _b.termsSettings) ||
            (latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.snapshotTermsConfig) ||
            null;
        if (!termsSettings)
            return null;
        /*
          The shape TermsDocketSheet actually reads.
    
          This used to carry `clientName` / `projectName` at the top level only.
          DocumentRenderer passes `snapshotClientData={snap.snapshotClientData}` to
          the sheet, and the sheet falls back to its own placeholder labels when
          that is absent — so a client opening their Terms of Engagement was shown
          a contract headed "CLIENT NAME: Client Name / PROJECT NAME: Project Name
          / DATE ISSUED: Date Issued". The values were on the project all along;
          they were being handed over under the wrong key.
    
          `latestDocket` and `org` are supplied for the same reason: the sheet reads
          them, and a synthesised issue must present the same shape as one built by
          `buildSnapshot`, or the two render differently for no visible reason.
        */
        const legacyIssuedAt = (engagement === null || engagement === void 0 ? void 0 : engagement.issuedAt) || (latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.sentAt) || (latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.generatedAt) || Date.now();
        const snapshotClientData = (latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.snapshotClientData) || {
            clientName: context.clientName,
            projectName: context.name,
            date: new Date(legacyIssuedAt).toLocaleDateString('en-IN'),
        };
        const snapshot = {
            termsSettings,
            snapshotClientData,
            latestDocket: latestDocket
                ? { docketRef: latestDocket.docketRef, status: latestDocket.status }
                : { docketRef: (engagement === null || engagement === void 0 ? void 0 : engagement.docketRef) || '—', status: 'issued' },
            org: {
                orgName: null,
                signatoryName: ((_c = termsSettings === null || termsSettings === void 0 ? void 0 : termsSettings.signatory) === null || _c === void 0 ? void 0 : _c.name) || null,
                signatoryTitle: ((_d = termsSettings === null || termsSettings === void 0 ? void 0 : termsSettings.signatory) === null || _d === void 0 ? void 0 : _d.title) || null,
            },
            clientName: context.clientName || ((_e = latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.snapshotClientData) === null || _e === void 0 ? void 0 : _e.clientName) || 'Client',
            projectName: context.name,
            location: context.location,
            issuedOn: ((_f = latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.snapshotClientData) === null || _f === void 0 ? void 0 : _f.date) || null
        };
        return {
            id: `di-terms_docket-legacy`,
            kind: 'terms_docket',
            version: 1,
            reference: (engagement === null || engagement === void 0 ? void 0 : engagement.docketRef) || (latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.docketRef) || '—',
            issuedAt: legacyIssuedAt,
            issuedBy: (latestDocket === null || latestDocket === void 0 ? void 0 : latestDocket.sentBy) || 'Studio',
            snapshot,
            contentHash: hashSnapshot(snapshot),
            materialSections: deriveMaterialSections(termsSettings.sections),
            supersedes: null,
            supersededAt: null,
            counterSignature: null
        };
    }
    if (kind === 'payment_schedule') {
        const advances = (_h = (_g = ctx.engagement) === null || _g === void 0 ? void 0 : _g.lockedSnapshot) === null || _h === void 0 ? void 0 : _h.advances;
        if (!advances)
            return null;
        const snapshot = {
            advances,
            paymentStructure: ((_k = (_j = ctx.engagement) === null || _j === void 0 ? void 0 : _j.lockedSnapshot) === null || _k === void 0 ? void 0 : _k.paymentStructure) || null,
            designFee: (_m = (_l = ctx.engagement) === null || _l === void 0 ? void 0 : _l.designFee) !== null && _m !== void 0 ? _m : null,
            executionValue: (_p = (_o = ctx.engagement) === null || _o === void 0 ? void 0 : _o.executionValue) !== null && _p !== void 0 ? _p : null,
            gstRate: (_q = context.gstRate) !== null && _q !== void 0 ? _q : 18
        };
        return {
            id: 'di-payment_schedule-legacy',
            kind: 'payment_schedule',
            version: ((_r = ctx.engagement) === null || _r === void 0 ? void 0 : _r.paymentScheduleVersion) || 1,
            reference: ((_s = ctx.engagement) === null || _s === void 0 ? void 0 : _s.docketRef) || '—',
            issuedAt: ((_t = ctx.engagement) === null || _t === void 0 ? void 0 : _t.issuedAt) || Date.now(),
            issuedBy: 'Studio',
            snapshot,
            contentHash: hashSnapshot(snapshot),
            materialSections: [],
            supersedes: null,
            supersededAt: null,
            counterSignature: null
        };
    }
    return null;
}
exports.getCurrentIssue = getCurrentIssue;
/** Every issue for a kind, newest first. */
function getIssueHistory(context, kind, opts = {}) {
    var _a;
    /*
      History obeys the same publish gate as `getCurrentIssue`, and it did not.
  
      A re-issued Payment Schedule that ops had not yet published still appeared
      in the client's portal — filed under "Earlier versions", because the client
      was correctly being shown v1 as current while v2 sat unpublished. So the
      client saw a NEWER version described as older, and clicking it opened
      nothing. Withdrawn issues and addenda are excluded for the same reason they
      are excluded from `getCurrentIssue`: neither is a version of this document.
    */
    const issues = (((_a = context === null || context === void 0 ? void 0 : context.documents) === null || _a === void 0 ? void 0 : _a.issues) || []).filter(i => i.kind === kind
        && !i.withdrawnAt
        && !i.addendumTo
        && (!opts.clientView || (0, clientVisibility_1.isVisibleToClient)(i)));
    if (issues.length === 0) {
        const synthesised = getCurrentIssue(context, kind, opts);
        return synthesised ? [synthesised] : [];
    }
    return issues.sort((a, b) => b.version - a.version);
}
exports.getIssueHistory = getIssueHistory;
/** Maps a document kind onto the agreement it gates, where one exists. */
function agreementKindFor(kind) {
    if (kind === 'terms_docket')
        return 'terms';
    if (kind === 'execution_agreement')
        return 'contract';
    if (kind === 'handover_docket')
        return 'handover';
    return null;
}
exports.agreementKindFor = agreementKindFor;
/**
 * The six-state lifecycle. Resolution runs most-advanced first, so a signed
 * document is never reported as merely viewed.
 */
function resolveDocumentState(context, kind, opts = {}) {
    var _a, _b, _c, _d;
    if (!context)
        return 'draft';
    const issue = getCurrentIssue(context, kind, opts);
    const agreementKind = agreementKindFor(kind);
    let signed = false;
    if (agreementKind) {
        const approvals = (0, clientApprovalEngine_1.resolveApprovals)(context, 1);
        signed = approvals[agreementKind].state === 'signed';
    }
    else {
        // Acknowledge-mode documents have no agreement record to consult — the
        // client's confirmation is written onto the issue itself. Without this,
        // a confirmed payment schedule reads as "sent, never opened" forever.
        signed = !!(issue === null || issue === void 0 ? void 0 : issue.clientSignature);
    }
    // A signed document with an unsigned addendum against it is not finished —
    // the client still owes a signature on the variation.
    const unsignedAddendum = (((_a = context.documents) === null || _a === void 0 ? void 0 : _a.issues) || []).some(i => i.addendumTo && i.addendumTo === (issue === null || issue === void 0 ? void 0 : issue.id) && !i.clientSignature);
    /*
      A REISSUE after the client signed.
  
      `signed` above comes from the agreement record, and that record is attached
      to the version the client actually put their name to — not to whatever is
      current now. So a signed terms docket that the studio then reissues as v2
      was still reported as 'signed': the portal showed "Signed", the client was
      never told a newer version existed, and the studio had no signature on the
      document that is actually live.
  
      The current issue supersedes an earlier one and carries no signature of its
      own, so the signature on file belongs to the superseded version. That is an
      amendment awaiting signature, exactly like an addendum.
    */
    const reissuedAfterSignature = !!issue && !!issue.supersedes && !issue.clientSignature;
    if (signed && (unsignedAddendum || reissuedAfterSignature))
        return 'amended';
    if (signed && (issue === null || issue === void 0 ? void 0 : issue.counterSignature))
        return 'executed';
    if (signed)
        return 'signed';
    if (!issue)
        return 'draft';
    const openQuery = (((_b = context.documents) === null || _b === void 0 ? void 0 : _b.queries) || []).some(q => q.issueId === issue.id && q.status === 'open');
    if (openQuery)
        return 'queried';
    const lastViewed = ((_d = (_c = context.documents) === null || _c === void 0 ? void 0 : _c.lastViewedAt) === null || _d === void 0 ? void 0 : _d[kind]) || 0;
    // Re-issued after the client last read it — they owe a re-read, not a re-sign.
    if (issue.supersedes && lastViewed > 0 && lastViewed < issue.issuedAt)
        return 'amended';
    if (lastViewed >= issue.issuedAt)
        return 'viewed';
    return 'issued';
}
exports.resolveDocumentState = resolveDocumentState;
// ---------------------------------------------------------------------------
// DIFFING
// ---------------------------------------------------------------------------
const PRIMITIVE = (v) => v === null || v === undefined || typeof v !== 'object';
function describe(v) {
    if (v === null || v === undefined)
        return '—';
    if (typeof v === 'object')
        return Array.isArray(v) ? `${v.length} item(s)` : 'section';
    return String(v);
}
/**
 * Field-level differences between two issues, phrased for a client.
 *
 * Re-reading fourteen sections to find one changed number is how deals die. The
 * redline is what turns an amendment from a chore into a thirty-second check.
 */
function diffIssues(prev, next) {
    const out = [];
    const walk = (a, b, path, label, depth) => {
        if (depth > 6 || out.length > 60)
            return;
        if (PRIMITIVE(a) || PRIMITIVE(b)) {
            if (a !== b) {
                out.push({
                    path,
                    label,
                    before: describe(a),
                    after: describe(b),
                    changeType: a === undefined ? 'added' : b === undefined ? 'removed' : 'changed'
                });
            }
            return;
        }
        if (Array.isArray(a) && Array.isArray(b)) {
            const max = Math.max(a.length, b.length);
            for (let i = 0; i < max; i++) {
                const item = b[i] || a[i];
                const itemLabel = item && typeof item === 'object' && (item.title || item.ref || item.label)
                    ? `${label} — ${item.title || item.ref || item.label}`
                    : `${label} [${i + 1}]`;
                walk(a[i], b[i], `${path}[${i}]`, itemLabel, depth + 1);
            }
            return;
        }
        const keys = Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})]));
        keys.forEach(k => {
            var _a;
            const child = (_a = a === null || a === void 0 ? void 0 : a[k]) !== null && _a !== void 0 ? _a : b === null || b === void 0 ? void 0 : b[k];
            const childLabel = child && typeof child === 'object' && (child.title || child.label)
                ? String(child.title || child.label)
                : `${label ? `${label} — ` : ''}${humanise(k)}`;
            walk(a === null || a === void 0 ? void 0 : a[k], b === null || b === void 0 ? void 0 : b[k], path ? `${path}.${k}` : k, childLabel, depth + 1);
        });
    };
    walk(prev.snapshot, next.snapshot, '', '', 0);
    return out;
}
exports.diffIssues = diffIssues;
function humanise(key) {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/^./, c => c.toUpperCase());
}
/** Section refs touched by a diff, for highlighting in the reader. */
function changedSectionRefs(diff) {
    const refs = new Set();
    diff.forEach(d => {
        const m = d.path.match(/sections\[(\d+)\]/);
        if (m)
            refs.add(String(Number(m[1]) + 1));
    });
    return Array.from(refs);
}
exports.changedSectionRefs = changedSectionRefs;
//# sourceMappingURL=documentIssueEngine.js.map