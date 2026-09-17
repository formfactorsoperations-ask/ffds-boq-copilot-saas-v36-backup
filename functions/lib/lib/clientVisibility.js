"use strict";
/**
 * What the client is allowed to see.
 *
 * ── The problem this replaces ────────────────────────────────────────────────
 * The portal decided what to hide by checking, in six separate places, five
 * different fields: `isInternal`, `isPrivate`, `clientVisible === false`,
 * `shareWithClient === false`, and `visibility === 'internal' | 'private'`.
 *
 * Every one was a *hide* flag, so anything ops created was visible to the
 * client by default and stayed visible unless someone remembered the right one
 * of five names. For a surface carrying financials, drawings and contracts,
 * that is the wrong default and the wrong number of names.
 *
 * ── The model ───────────────────────────────────────────────────────────────
 * One field, `clientVisibility`, on every publishable item. Absent means draft
 * means the client sees nothing. Ops publishes deliberately, and every publish
 * is stamped with who and when so "I was never shown this" has an answer.
 *
 * Read state through `isVisibleToClient`. Never test the raw field, and never
 * add a sixth alias.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.visibilityBreakdown = exports.publishEverythingUpTo = exports.migrateVisibility = exports.draft = exports.hide = exports.publish = exports.isUnmigrated = exports.isVisibleToClient = void 0;
/**
 * The legacy hide-flags, in the order the portal used to check them. Retained
 * only so un-migrated records still behave sanely; nothing new should set them.
 */
function legacyWantsHidden(item) {
    return ((item === null || item === void 0 ? void 0 : item.isInternal) === true ||
        (item === null || item === void 0 ? void 0 : item.isPrivate) === true ||
        (item === null || item === void 0 ? void 0 : item.clientVisible) === false ||
        (item === null || item === void 0 ? void 0 : item.shareWithClient) === false ||
        (item === null || item === void 0 ? void 0 : item.visibility) === 'internal' ||
        (item === null || item === void 0 ? void 0 : item.visibility) === 'private');
}
/**
 * Whether an item may be shown to the client.
 *
 * The single gate. Every client-facing read path goes through this, so the rule
 * lives in one place and can be changed in one place.
 */
function isVisibleToClient(item) {
    if (!item)
        return false;
    const v = item.clientVisibility;
    // Migrated items answer for themselves.
    if (v === null || v === void 0 ? void 0 : v.state)
        return v.state === 'published';
    // Un-migrated: an explicit legacy hide still hides. Everything else is
    // treated as draft — not visible — because defaulting to visible is exactly
    // the leak this model exists to close.
    if (legacyWantsHidden(item))
        return false;
    return false;
}
exports.isVisibleToClient = isVisibleToClient;
/** True when the item has not yet been through the migration. */
function isUnmigrated(item) {
    var _a;
    return !!item && !((_a = item.clientVisibility) === null || _a === void 0 ? void 0 : _a.state);
}
exports.isUnmigrated = isUnmigrated;
function publish(by) {
    return { state: 'published', publishedAt: new Date().toISOString(), publishedBy: by };
}
exports.publish = publish;
function hide(reason, prior) {
    return Object.assign(Object.assign({}, (prior || { state: 'hidden' })), { state: 'hidden', hiddenAt: new Date().toISOString(), hiddenReason: reason });
}
exports.hide = hide;
function draft() {
    return { state: 'draft' };
}
exports.draft = draft;
/**
 * Move one legacy record onto the model.
 *
 * Anything the old flags explicitly hid becomes `hidden`, keeping ops' original
 * intent. Everything else becomes `draft` — deliberately not `published`. The
 * old default was "visible unless flagged", so publishing wholesale would carry
 * forward every item nobody remembered to hide.
 */
function migrateVisibility(item) {
    var _a;
    if ((_a = item === null || item === void 0 ? void 0 : item.clientVisibility) === null || _a === void 0 ? void 0 : _a.state)
        return item.clientVisibility;
    return legacyWantsHidden(item)
        ? { state: 'hidden', hiddenAt: new Date().toISOString(), hiddenReason: 'Carried over from previous internal-only flag' }
        : { state: 'draft' };
}
exports.migrateVisibility = migrateVisibility;
/**
 * The bulk restore: publish everything a project already had, up to a cut-off.
 *
 * Migration leaves live portals empty, which is safe but abrupt for a client
 * mid-project. This is the one click that puts back what they could already
 * see, without also publishing anything ops had hidden on purpose.
 *
 * `dateOf` reads whatever timestamp that item type carries; items with no date
 * are included, since an undated record is usually older than the cut-off.
 */
function publishEverythingUpTo(items, cutoff, by, dateOf = (i) => i.date || i.createdAt || i.issuedAt) {
    const stamp = publish(by);
    return (items || []).map((item) => {
        var _a, _b;
        const current = (_b = (_a = item.clientVisibility) === null || _a === void 0 ? void 0 : _a.state) !== null && _b !== void 0 ? _b : migrateVisibility(item).state;
        // Never resurrect something ops deliberately hid.
        if (current === 'hidden')
            return item;
        const raw = dateOf(item);
        const when = raw ? new Date(raw).getTime() : 0;
        if (raw && !isNaN(when) && when > cutoff.getTime())
            return item;
        return Object.assign(Object.assign({}, item), { clientVisibility: stamp });
    });
}
exports.publishEverythingUpTo = publishEverythingUpTo;
/** Convenience for ops-facing lists: how a project's items break down. */
function visibilityBreakdown(items) {
    const out = { published: 0, draft: 0, hidden: 0, unmigrated: 0 };
    (items || []).forEach((i) => {
        var _a, _b;
        if (isUnmigrated(i))
            out.unmigrated++;
        const s = (_b = (_a = i.clientVisibility) === null || _a === void 0 ? void 0 : _a.state) !== null && _b !== void 0 ? _b : migrateVisibility(i).state;
        if (s === 'published')
            out.published++;
        else if (s === 'hidden')
            out.hidden++;
        else
            out.draft++;
    });
    return out;
}
exports.visibilityBreakdown = visibilityBreakdown;
//# sourceMappingURL=clientVisibility.js.map