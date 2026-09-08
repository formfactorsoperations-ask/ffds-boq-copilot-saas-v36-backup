/**
 * CLIENT QUERY INBOX
 *
 * Where the studio sees what the client actually got stuck on.
 *
 * Before this, an unsigned document told the team nothing — they could not
 * distinguish "never opened it" from "read it three times and is worried about
 * clause 7.2". A query arrives with the clause quoted verbatim, so the reply can
 * address the real objection rather than a paraphrase of it.
 *
 * Two ways out of a query: answer it, or change the clause. Changing it on a
 * document the client has already signed produces an addendum, never an edit.
 */

import React, { useMemo, useState } from 'react';
import { ProjectContext, ClauseQuery, ClientDocumentKind, DocumentIssue } from '../../types';
import { getQueries, replyToQuery, closeQuery } from '../../services/documentQueryEngine';
import { getCurrentIssue } from '../../services/documentIssueEngine';
import { issueAddendum, documentTitle } from '../../services/documentReleaseEngine';
import {
  MessageCircleQuestion,
  Send,
  Check,
  FileEdit,
  Clock,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  X
} from 'lucide-react';

interface ClientQueryInboxProps {
  projectContext: ProjectContext;
  setProjectContext: (updater: any) => void;
  currentUserName?: string;
  /** Narrow to one document; omit for every query on the project. */
  kind?: ClientDocumentKind;
}

const timeAgo = (ts: number) => {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
};

const ClientQueryInbox: React.FC<ClientQueryInboxProps> = ({
  projectContext,
  setProjectContext,
  currentUserName = 'Studio',
  kind
}) => {
  const queries = useMemo(
    () => getQueries(projectContext, kind),
    [projectContext, kind]
  );

  const [expanded, setExpanded] = useState<string | null>(
    queries.find(q => q.status === 'open')?.id || null
  );
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [amending, setAmending] = useState<ClauseQuery | null>(null);
  const [newWording, setNewWording] = useState('');
  const [amendSummary, setAmendSummary] = useState('');

  const openCount = queries.filter(q => q.status === 'open').length;

  const sendReply = (q: ClauseQuery) => {
    const text = (replyText[q.id] || '').trim();
    if (!text) return;
    setProjectContext(replyToQuery(q.id, text, currentUserName, 'studio'));
    setReplyText(prev => ({ ...prev, [q.id]: '' }));
  };

  const startAmend = (q: ClauseQuery) => {
    setAmending(q);
    setNewWording('');
    setAmendSummary('');
  };

  const submitAmendment = () => {
    if (!amending || !newWording.trim() || !amendSummary.trim()) return;

    const parent: DocumentIssue | null = getCurrentIssue(projectContext, amending.documentKind);
    if (!parent) return;

    setProjectContext(
      issueAddendum(parent, {
        amendsClauses: [amending.clauseRef],
        amendmentSummary: amendSummary.trim(),
        revisedClauses: [
          {
            ref: amending.clauseRef,
            title: `Clause ${amending.clauseRef}`,
            before: amending.clauseExcerpt,
            after: newWording.trim()
          }
        ],
        issuedBy: currentUserName
      })
    );
    setProjectContext(closeQuery(amending.id, 'amended'));

    setAmending(null);
    setNewWording('');
    setAmendSummary('');
  };

  if (queries.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
        <MessageCircleQuestion className="w-8 h-8 mx-auto text-slate-300" />
        <p className="text-sm font-bold text-slate-700">No client questions</p>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          When a client questions a clause while reading a document, it lands here with the
          exact wording they were looking at.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <MessageCircleQuestion className="w-4 h-4 text-[#0066CC]" />
          Client questions
        </h3>
        {openCount > 0 && (
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-900">
            {openCount} awaiting your reply
          </span>
        )}
      </div>

      {queries.map(q => {
        const isOpen = expanded === q.id;
        const unanswered = q.status === 'open';

        return (
          <div
            key={q.id}
            className={`rounded-2xl border overflow-hidden transition-colors ${
              unanswered ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'
            }`}
          >
            <button
              onClick={() => setExpanded(isOpen ? null : q.id)}
              className="w-full px-4 py-3 flex items-start gap-3 text-left cursor-pointer"
            >
              <span className="mt-0.5 shrink-0">
                {unanswered ? (
                  <Clock className="w-4 h-4 text-amber-600" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                )}
              </span>

              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900">
                    Clause {q.clauseRef} — {documentTitle(q.documentKind)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      q.status === 'open'
                        ? 'bg-amber-500 text-white'
                        : q.status === 'amended'
                          ? 'bg-[#0066CC] text-white'
                          : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {q.status === 'open'
                      ? 'Needs a reply'
                      : q.status === 'amended'
                        ? 'Resolved by addendum'
                        : q.status === 'withdrawn'
                          ? 'Withdrawn'
                          : 'Answered'}
                  </span>
                </span>
                <span className="block text-[11px] text-slate-600 mt-0.5 line-clamp-1">
                  {q.question}
                </span>
                <span className="block text-[10px] text-slate-400 mt-0.5">
                  {q.raisedBy} · {timeAgo(q.raisedAt)}
                </span>
              </span>

              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              )}
            </button>

            {isOpen && (
              <div className="px-4 pb-4 space-y-3.5 border-t border-slate-200/70 pt-3.5">
                {/* The clause, exactly as the client read it */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    What they were reading
                  </p>
                  <blockquote className="text-[11px] text-slate-700 leading-relaxed border-l-2 border-slate-300 pl-3 italic bg-white/70 py-2 rounded-r">
                    {q.clauseExcerpt}
                  </blockquote>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Their question
                  </p>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">{q.question}</p>
                </div>

                {q.replies.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Thread
                    </p>
                    {q.replies.map((r, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-xl text-[11px] leading-relaxed ${
                          r.side === 'studio'
                            ? 'bg-[#0066CC]/8 border border-[#0066CC]/20'
                            : 'bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <p className="font-bold text-slate-800 mb-0.5">
                          {r.by}
                          <span className="font-normal text-slate-400 ml-2">{timeAgo(r.at)}</span>
                        </p>
                        <p className="text-slate-700">{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {q.status !== 'amended' && q.status !== 'withdrawn' && (
                  <div className="space-y-2">
                    <textarea
                      value={replyText[q.id] || ''}
                      onChange={e => setReplyText(prev => ({ ...prev, [q.id]: e.target.value }))}
                      rows={3}
                      placeholder="Answer the question. The client sees this in their portal, under the clause."
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#0066CC] resize-none bg-white"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => sendReply(q)}
                        disabled={!(replyText[q.id] || '').trim()}
                        className="px-3.5 py-2 bg-[#0066CC] hover:bg-[#0055B3] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Reply
                      </button>

                      <button
                        onClick={() => startAmend(q)}
                        className="px-3.5 py-2 bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        Change the clause
                      </button>

                      {q.status === 'open' && (
                        <button
                          onClick={() => setProjectContext(closeQuery(q.id, 'answered'))}
                          className="px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer"
                        >
                          Mark answered
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Amendment composer */}
      {amending && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 bg-amber-50 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                <FileEdit className="w-4 h-4" />
                Change clause {amending.clauseRef}
              </h3>
              <button
                onClick={() => setAmending(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Current wording
                </p>
                <p className="text-[11px] text-slate-700 leading-relaxed italic">
                  {amending.clauseExcerpt}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  Replacement wording
                </label>
                <textarea
                  value={newWording}
                  onChange={e => setNewWording(e.target.value)}
                  rows={6}
                  autoFocus
                  placeholder="The full replacement text for this clause."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                  What is changing, in plain English
                </label>
                <input
                  value={amendSummary}
                  onChange={e => setAmendSummary(e.target.value)}
                  placeholder="e.g. Payment grace period extended from 7 to 14 days."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  This is the line the client sees first. Write it so they can decide whether to
                  read further without opening the document.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#0066CC]/8 border border-[#0066CC]/20">
                <p className="text-[11px] text-slate-700 leading-relaxed">
                  <strong>This creates an addendum, not an edit.</strong> The signed document keeps
                  its wording, its signature and its reading record exactly as they are. The
                  addendum names the clause it varies and is sent to the client to sign
                  separately — the same way a variation works on paper.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                onClick={() => setAmending(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={submitAmendment}
                disabled={!newWording.trim() || !amendSummary.trim()}
                className="px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Issue addendum
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientQueryInbox;
