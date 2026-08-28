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

import { ProjectContext, ClauseQuery, ClientDocumentKind, ProjectDocumentState } from '../types';

const emptyState = (): ProjectDocumentState => ({ issues: [], queries: [], lastViewedAt: {} });

export function raiseQuery(args: {
  issueId: string;
  documentKind: ClientDocumentKind;
  clauseRef: string;
  clauseExcerpt: string;
  question: string;
  raisedBy: string;
}): (prev: ProjectContext) => ProjectContext {
  const now = Date.now();
  const query: ClauseQuery = {
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

  return (prev: ProjectContext): ProjectContext => {
    const base = prev || ({} as ProjectContext);
    const state = base.documents || emptyState();
    return {
      ...base,
      documents: { ...state, queries: [...(state.queries || []), query] }
    };
  };
}

export function replyToQuery(
  queryId: string,
  text: string,
  by: string,
  side: 'studio' | 'client'
): (prev: ProjectContext) => ProjectContext {
  const now = Date.now();
  return (prev: ProjectContext): ProjectContext => {
    const base = prev || ({} as ProjectContext);
    const state = base.documents || emptyState();
    return {
      ...base,
      documents: {
        ...state,
        queries: (state.queries || []).map(q =>
          q.id === queryId
            ? {
                ...q,
                // A studio reply answers it; a client reply reopens the thread.
                status: side === 'studio' ? ('answered' as const) : ('open' as const),
                replies: [...q.replies, { at: now, by, side, text }]
              }
            : q
        )
      }
    };
  };
}

export function closeQuery(
  queryId: string,
  resolution: 'answered' | 'amended' | 'withdrawn',
  resolvedByIssueId?: string
): (prev: ProjectContext) => ProjectContext {
  return (prev: ProjectContext): ProjectContext => {
    const base = prev || ({} as ProjectContext);
    const state = base.documents || emptyState();
    return {
      ...base,
      documents: {
        ...state,
        queries: (state.queries || []).map(q =>
          q.id === queryId
            ? { ...q, status: resolution, resolvedByIssueId: resolvedByIssueId || q.resolvedByIssueId || null }
            : q
        )
      }
    };
  };
}

/** Open queries, optionally narrowed to one document. */
export function getOpenQueries(
  context: ProjectContext,
  kind?: ClientDocumentKind
): ClauseQuery[] {
  const all = context?.documents?.queries || [];
  return all
    .filter(q => q.status === 'open' && (!kind || q.documentKind === kind))
    .sort((a, b) => b.raisedAt - a.raisedAt);
}

/** Every query on a document, newest first — open threads above resolved ones. */
export function getQueries(
  context: ProjectContext,
  kind?: ClientDocumentKind
): ClauseQuery[] {
  const all = context?.documents?.queries || [];
  return all
    .filter(q => !kind || q.documentKind === kind)
    .sort((a, b) => {
      if ((a.status === 'open') !== (b.status === 'open')) return a.status === 'open' ? -1 : 1;
      return b.raisedAt - a.raisedAt;
    });
}
