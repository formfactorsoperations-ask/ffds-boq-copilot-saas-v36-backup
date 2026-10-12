import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';
import { isClientRelationsRole, isLimitedRole, seesStudioFinance } from '../../lib/roleAccess';
import { paymentsOf } from '../../lib/homeStories';
import { teamToday } from '../../lib/homeWidgets';
import { opsSettingsOf } from '../../lib/opsDesk';
import { businessDate } from '../../lib/peopleDesk';
import { studioRecord, suggestionsFor } from '../../lib/studioAsk';
import { formatCompactINR } from '../../lib/utils';
import { askStudio, assistAvailable } from '../../services/opsAssistService';
import { usePeople } from '../../services/peopleService';
import type { HomeFeeds } from './useHomeFeeds';
import type { AttentionRow } from './useAttention';

/*
  ASK THE STUDIO (DESIGN.md → "Ask the studio"): a question about the studio,
  answered from what Home already holds for this person (lib/studioAsk.ts).
  Money goes in only for finance roles; a designer is asked about their own
  projects. The answer names what it was read from.
*/

type Reply = { q: string; answer?: string; sources?: string[]; failed?: boolean };

export default function AskStudio({ feeds, projects, rows, role, roles }: {
  feeds: HomeFeeds; projects: any[]; rows: AttentionRow[]; role: string; roles?: string[];
}) {
  const org: any = useOrg();
  const who = roles?.length ? roles : role;
  const finance = seesStudioFinance(who);
  const view: 'studio' | 'designer' = isLimitedRole(who) && !isClientRelationsRole(who) && feeds.desk && !feeds.reviewer ? 'designer' : 'studio';
  const { snapshot } = usePeople(feeds.people);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => suggestionsFor(view, finance), [view, finance]);
  if (!assistAvailable()) return null;

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setQ(text); setBusy(true); setReply({ q: text });
    try {
      const now = Date.now();
      const record = studioRecord({
        view, finance, today: businessDate(new Date()), projects, rows: feeds.rows, visits: feeds.visits,
        attention: rows, team: feeds.people && snapshot ? teamToday(snapshot) : null,
        payments: finance ? paymentsOf(projects, opsSettingsOf(org?.orgData).paymentDueDays, now) : [],
        money: formatCompactINR,
      });
      const a = await askStudio(record, text);
      setReply({ q: text, ...a });
    } catch {
      setReply({ q: text, failed: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Ask the studio" className="max-w-[880px] mx-auto w-full flex flex-col gap-3">
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }}
        className="flex items-center gap-2.5 rounded-[18px] bg-white border border-[#D5DCEE] pl-4 pr-2 py-2 shadow-[0_18px_30px_-24px_rgba(61,82,160,0.7)] focus-within:border-[#3D52A0]/50 transition-colors">
        <Sparkles className="w-[18px] h-[18px] shrink-0 text-[#3D52A0]" />
        <label htmlFor="ask-studio" className="sr-only">Ask the studio</label>
        <input id="ask-studio" ref={input} value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} autoComplete="off"
          placeholder={view === 'designer' ? 'Ask: "what is due this week?"' : 'Ask the studio: "which projects are blocked?"'}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400 py-1.5" />
        <button type="submit" disabled={busy || !q.trim()}
          className="pp-press shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-[#3D52A0] to-[#5F79D6] disabled:opacity-50">
          {busy ? 'Reading…' : 'Ask'}<ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button key={s} type="button" disabled={busy} onClick={() => ask(s)}
            className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#3D52A0]/40 hover:text-[#3D52A0] transition-colors disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {reply && (
          <motion.article key={reply.q + (reply.answer ? ':a' : reply.failed ? ':f' : ':l')}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}
            className="relative rounded-2xl bg-white border border-[#E3E8F4] p-5 shadow-[0_10px_20px_0_#D3D8E6] text-left">
            <button type="button" aria-label="Clear the answer" onClick={() => { setReply(null); setQ(''); input.current?.focus(); }}
              className="absolute right-3 top-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-4 h-4" /></button>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pr-8">You asked</p>
            <p className="text-sm font-bold text-slate-800 pr-8">{reply.q}</p>
            {!reply.answer && !reply.failed ? (
              <div className="mt-3 space-y-2" aria-live="polite">
                <div className="pp-shimmer h-3.5 rounded-full w-11/12" /><div className="pp-shimmer h-3.5 rounded-full w-9/12" />
                <span className="sr-only">Reading the studio</span>
              </div>
            ) : reply.failed ? (
              <p className="mt-3 text-sm text-rose-700" aria-live="polite">The assistant could not be reached. Try again in a moment.</p>
            ) : (
              <>
                <p className="mt-3 text-sm leading-relaxed text-slate-700 whitespace-pre-line" aria-live="polite">{reply.answer}</p>
                {!!reply.sources?.length && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">From</span>
                    {reply.sources.map((s) => <span key={s} className="px-2 py-0.5 rounded-full bg-[#3D52A0]/10 text-[#3D52A0] text-[10px] font-bold">{s}</span>)}
                  </div>
                )}
              </>
            )}
          </motion.article>
        )}
      </AnimatePresence>
    </section>
  );
}
