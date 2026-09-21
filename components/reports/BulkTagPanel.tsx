import React, { useMemo, useState } from "react";
import { FullProjectData } from "../../types";
import { formatCompactINR } from "../../lib/utils";
import { getSingleProjectValue } from "../../lib/financialsUtils";
import { isEmptyShell } from "../../lib/projectClassification";
import { db } from "../../services/dbService";
import { X, Check, Sparkles, AlertTriangle, Loader2 } from "lucide-react";

/**
 * TAG THE UNTAGGED, IN ONE PLACE.
 *
 * Classification lives on each project's context card, which is the right home
 * for it -- but only while there are one or two to fix. This studio had
 * twenty-eight untagged projects, because the card used to show a tag it had
 * never saved, so nobody knew there was anything to do. Clearing that backlog
 * one card at a time is an afternoon.
 *
 * Nothing is written until Save, and nothing is pre-selected: a suggestion is
 * shown beside each row, but it is a suggestion, and an empty choice stays
 * empty. Pre-ticking the suggestion is exactly the mistake the context card
 * made -- it turns a guess into a stored fact that nobody actually made.
 *
 * Writes go through db.saveProject with the two context fields set, which is
 * the same path the status-transition modal already uses for this field. That
 * matters: a project over 800KB is stored compressed, so writing
 * `context.isDummy` directly onto the document would leave a stray key beside a
 * blob that still said something else.
 */

const BRAND = "#3D52A0";
const INK = "#0A1B33";

type Choice = "actual" | "dummy";

interface Props {
  /** Untagged projects only -- the caller decides what counts as untagged. */
  projects: FullProjectData[];
  onClose: () => void;
  /** Hands back the projects that were actually written, for the caller to merge. */
  onSaved?: (updated: FullProjectData[]) => void;
}

/** Only a hint. Deliberately never applied without a click. */
const suggest = (p: FullProjectData): Choice => {
  const name = (p.context?.name || "").toLowerCase();
  const client = (p.context?.clientName || "").toLowerCase();
  const looksTest = /sample|demo|test|template|canonical|bundle/.test(`${name} ${client}`);
  return looksTest ? "dummy" : "actual";
};

const BulkTagPanel: React.FC<Props> = ({ projects, onClose, onSaved }) => {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);

  const { substantive, empty } = useMemo(() => {
    const s: FullProjectData[] = [];
    const e: FullProjectData[] = [];
    for (const p of projects) (isEmptyShell(p, getSingleProjectValue) ? e : s).push(p);
    const byValue = (a: FullProjectData, b: FullProjectData) =>
      (getSingleProjectValue(b) || 0) - (getSingleProjectValue(a) || 0);
    return { substantive: s.sort(byValue), empty: e };
  }, [projects]);

  const pending = Object.keys(choices).length;

  const setAll = (list: FullProjectData[], choice: Choice) =>
    setChoices((prev) => {
      const next = { ...prev };
      list.forEach((p) => { next[p.id] = choice; });
      return next;
    });

  const save = async () => {
    setSaving(true);
    setDone(0);
    setFailed([]);
    const updated: FullProjectData[] = [];
    const bad: string[] = [];

    /* One at a time, not Promise.all: each save reads and rewrites the local
       copy of the whole library, so firing thirty at once would have them
       overwrite one another's work. */
    for (const p of projects) {
      const choice = choices[p.id];
      if (!choice) continue;
      const next: FullProjectData = {
        ...p,
        context: {
          ...p.context,
          isDummy: choice === "dummy",
          projectCategory: choice,
        },
      };
      try {
        await db.saveProject(next);
        updated.push(next);
      } catch {
        bad.push(p.context?.name || p.id);
      }
      setDone((n) => n + 1);
    }

    setFailed(bad);
    setSaving(false);
    if (updated.length) onSaved?.(updated);
    if (!bad.length) onClose();
  };

  const Row: React.FC<{ p: FullProjectData; compact?: boolean }> = ({ p, compact }) => {
    const c = p.context || ({} as any);
    const chosen = choices[p.id];
    const hint = suggest(p);
    const value = getSingleProjectValue(p) || 0;

    return (
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate" style={{ color: INK }}>
            {c.name || "Untitled"}
          </p>
          {!compact && (
            <p className="mt-0.5 text-[11.5px] text-slate-500 truncate">
              {c.status || "no status"}
              {c.clientName ? ` · ${c.clientName}` : " · no client"}
              {value > 0 ? ` · ${formatCompactINR(value)}` : ""}
            </p>
          )}
        </div>

        {!chosen && (
          <span className="shrink-0 text-[10.5px] text-slate-400 hidden sm:inline">
            looks {hint}
          </span>
        )}

        <div className="shrink-0 flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => setChoices((s) => ({ ...s, [p.id]: "actual" }))}
            className={`px-2.5 py-1.5 text-[11px] font-bold leading-none transition-colors cursor-pointer flex items-center gap-1 ${
              chosen === "actual" ? "bg-sky-600 text-white" : "bg-white text-slate-500 hover:bg-sky-50"
            }`}
          >
            <Check className="w-3 h-3" strokeWidth={2.6} />
            Actual
          </button>
          <button
            onClick={() => setChoices((s) => ({ ...s, [p.id]: "dummy" }))}
            className={`px-2.5 py-1.5 text-[11px] font-bold leading-none transition-colors cursor-pointer flex items-center gap-1 border-l border-slate-200 ${
              chosen === "dummy" ? "bg-amber-600 text-white" : "bg-white text-slate-500 hover:bg-amber-50"
            }`}
          >
            <Sparkles className="w-3 h-3" strokeWidth={2.4} />
            Dummy
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-2xl">
        {/* ── header ──────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: INK }}>
              Classify {projects.length} untagged {projects.length === 1 ? "project" : "projects"}
            </h2>
            <p className="mt-1 text-[12px] text-slate-500 leading-[1.5]">
              Nothing is saved until you press Save, and nothing is chosen for you — the grey hint is
              only a guess from the project's name.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={2.4} />
          </button>
        </div>

        {/* ── list ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {substantive.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  Worth classifying · {substantive.length}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAll(substantive, "actual")}
                    className="text-[11px] font-semibold cursor-pointer hover:underline"
                    style={{ color: BRAND }}
                  >
                    All actual
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    onClick={() => setAll(substantive, "dummy")}
                    className="text-[11px] font-semibold text-slate-500 cursor-pointer hover:underline"
                  >
                    All dummy
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                {substantive.map((p) => <Row key={p.id} p={p} />)}
              </div>
            </div>
          )}

          {empty.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                  Empty drafts · {empty.length}
                </p>
                <button
                  onClick={() => setAll(empty, "dummy")}
                  className="text-[11px] font-semibold text-slate-500 cursor-pointer hover:underline"
                >
                  Mark all dummy
                </button>
              </div>
              <p className="mb-2 text-[11.5px] text-slate-500 leading-[1.5]">
                No client, no value, no scope — abandoned "new project" clicks. Tagging them dummy keeps
                them out of reports; deleting them from the Projects screen is cleaner still.
              </p>
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                {empty.map((p) => <Row key={p.id} p={p} compact />)}
              </div>
            </div>
          )}
        </div>

        {/* ── footer ──────────────────────────────────────────────────── */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {failed.length > 0 ? (
              <p className="flex items-start gap-1.5 text-[11.5px] text-rose-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-[1px]" strokeWidth={2.4} />
                <span>
                  {failed.length} could not be saved: {failed.slice(0, 3).join(", ")}
                  {failed.length > 3 ? "…" : ""}. The rest were written.
                </span>
              </p>
            ) : (
              <p className="text-[11.5px] text-slate-500">
                {pending === 0
                  ? "Nothing chosen yet."
                  : `${pending} of ${projects.length} chosen · ${projects.length - pending} left untagged`}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-3.5 py-2 text-[12px] font-semibold rounded-xl text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || pending === 0}
              className="px-4 py-2 text-[12px] font-bold rounded-xl text-white transition-opacity cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
              style={{ background: BRAND }}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.6} />}
              {saving ? `Saving ${done}/${pending}…` : `Save ${pending || ""} ${pending === 1 ? "tag" : "tags"}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkTagPanel;
