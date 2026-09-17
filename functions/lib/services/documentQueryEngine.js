"use strict";
/**
 * DOCUMENT QUERY ENGINE
 *
 * A client who will not sign is either confused or negotiating. Without a way to
 * say which, the studio sees only silence and chases with a generic reminder.
 *
 * A clause query carries the exact words the client was reading, so the studio
 * can answer the actual objection — usually the difference between a week of
 * silence and a ten-minute phone call.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQueries = exports.getOpenQueries = exports.closeQuery = exports.replyToQuery = exports.raiseQuery = void 0;
const emptyState = () => ({ issues: [], queries: [], lastViewedAt: {} });
function raiseQuery(args) {
    const now = Date.now();
    const query = {
        id: `q-${now}`,
        issueId: args.issueId,
        documentKind: args.documentKind,
        clauseRef: args.clauseRef,
        // Trimmed, but never paraphrased — the studio must see what the client saw.
        clauseExcerpt: args.clauseExcerpt.slice(0, 2000),
        raisedBy: args.raisedBy,
        raisedAt: now,
        question: args.question,
        status: 'open',
        replies: [],
        resolvedByIssueId: null
    };
    return (prev) => {
        const base = prev || {};
        const state = base.documents || emptyState();
        return Object.assign(Object.assign({}, base), { documents: Object.assign(Object.assign({}, state), { queries: [...(state.queries || []), query] }) });
    };
}
exports.raiseQuery = raiseQuery;
function replyToQuery(queryId, text, by, side) {
    const now = Date.now();
    return (prev) => {
        const base = prev || {};
        const state = base.documents || emptyState();
        return Object.assign(Object.assign({}, base), { documents: Object.assign(Object.assign({}, state), { queries: (state.queries || []).map(q => q.id === queryId
                    ? Object.assign(Object.assign({}, q), { 
                        // A studio reply answers it; a client reply reopens the thread.
                        status: side === 'studio' ? 'answered' : 'open', replies: [...q.replies, { at: now, by, side, text }] }) : q) }) });
    };
}
exports.replyToQuery = replyToQuery;
function closeQuery(queryId, resolution, resolvedByIssueId) {
    return (prev) => {
        const base = prev || {};
        const state = base.documents || emptyState();
        return Object.assign(Object.assign({}, base), { documents: Object.assign(Object.assign({}, state), { queries: (state.queries || []).map(q => q.id === queryId
                    ? Object.assign(Object.assign({}, q), { status: resolution, resolvedByIssueId: resolvedByIssueId || q.resolvedByIssueId || null }) : q) }) });
    };
}
exports.closeQuery = closeQuery;
/** Open queries, optionally narrowed to one document. */
function getOpenQueries(context, kind) {
    var _a;
    const all = ((_a = context === null || context === void 0 ? void 0 : context.documents) === null || _a === void 0 ? void 0 : _a.queries) || [];
    return all
        .filter(q => q.status === 'open' && (!kind || q.documentKind === kind))
        .sort((a, b) => b.raisedAt - a.raisedAt);
}
exports.getOpenQueries = getOpenQueries;
/** Every query on a document, newest first — open threads above resolved ones. */
function getQueries(context, kind) {
    var _a;
    const all = ((_a = context === null || context === void 0 ? void 0 : context.documents) === null || _a === void 0 ? void 0 : _a.queries) || [];
    return all
        .filter(q => !kind || q.documentKind === kind)
        .sort((a, b) => {
        if ((a.status === 'open') !== (b.status === 'open'))
            return a.status === 'open' ? -1 : 1;
        return b.raisedAt - a.raisedAt;
    });
}
exports.getQueries = getQueries;
//# sourceMappingURL=documentQueryEngine.js.map