import React, { useMemo, useState } from "react";
import { ArrowUpDown, ExternalLink, FileText, Loader2, Search, Trash2 } from "@/lib/lucide-shim";
import { Button, Chip, EmptyState, INPUT, LABEL, Segmented, SummaryStrip, type Tone } from "../ui/kit";
import { CountUp } from "../ui/HudBits";
import { AUDIENCE_LABEL, fmtShortDay, type ChipTone, type MeetingAudience } from "../../lib/minutes";
import { buildRegister, registerCounts, registerRow, PILE_LABEL, type RegisterFilter } from "../../lib/minutesRegister";

/*
  ALL MINUTES for one project, as one register: four figures that filter it,
  a status and meeting switch, search, and the minutes grouped by month with
  one line each -- when, what, how many decisions and actions, where it stands.
*/

const TONE: Record<ChipTone, Tone> = { brand: "brand", slate: "slate", amber: "warn", emerald: "good", rose: "bad" };

const COLS = "lg:grid-cols-[64px_minmax(0,1fr)_130px_170px_190px_190px]";

const dayOf = (ms: number) => ms
  ? {
    day: new Date(ms).toLocaleDateString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" }),
    week: new Date(ms).toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" }),
  }
  : { day: "–", week: "" };

export function MinutesRegister({ moms, loading, pile, onPile, onOpen, onDelete }: {
  moms: any[];
  loading: boolean;
  pile: RegisterFilter;
  onPile: (p: RegisterFilter) => void;
  onOpen: (momId: string) => void;
  onDelete: (momId: string) => void;
}) {
  const [audience, setAudience] = useState<"all" | MeetingAudience>("all");
  const [search, setSearch] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);

  const rows = useMemo(() => moms.map(registerRow), [moms]);
  const counts = useMemo(() => registerCounts(rows), [rows]);
  const groups = useMemo(() => buildRegister(rows, { pile, audience, search, newestFirst }), [rows, pile, audience, search, newestFirst]);
  const shown = groups.reduce((n, g) => n + g.rows.length, 0);
  const latest = rows.reduce((t, r) => Math.max(t, r.at), 0);
  const filtered = pile !== "all" || audience !== "all" || !!search.trim();
  const clear = () => { onPile("all"); setAudience("all"); setSearch(""); };
  const toggle = (p: RegisterFilter) => onPile(pile === p ? "all" : p);

  if (loading) {
    return <p className="text-xs text-slate-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading the minutes…</p>;
  }
  if (!rows.length) {
    return <EmptyState icon={FileText} title="No minutes yet" text="Record your first meeting and its minutes start this list." />;
  }

  const kinds = (Object.keys(counts.audience) as MeetingAudience[]).filter((k) => counts.audience[k]);
  let n = 0;

  return (
    <div className="space-y-4">
      <SummaryStrip stats={[
        { label: "All minutes", value: <CountUp value={counts.total} />, sub: latest ? `Latest ${fmtShortDay(latest)}` : "No date yet", onClick: () => onPile("all") },
        { label: PILE_LABEL.draft, value: <CountUp value={counts.pile.draft} />, tone: counts.pile.draft ? "warn" : "good",
          sub: counts.pile.draft ? "Still being written" : "Nothing half-written", onClick: () => toggle("draft") },
        { label: PILE_LABEL.client, value: <CountUp value={counts.pile.client} />, tone: counts.corrections ? "bad" : counts.pile.client ? "warn" : "good",
          sub: counts.corrections ? `${counts.corrections} with a correction asked` : counts.pile.client ? "Sent, not confirmed yet" : "Nothing waiting on the client",
          onClick: () => toggle("client") },
        { label: PILE_LABEL.settled, value: <CountUp value={counts.pile.settled} />, tone: "good",
          sub: counts.pile.studio ? `${counts.pile.studio} with the studio to approve or send` : "Confirmed or in the project log", onClick: () => toggle("settled") },
      ]} />

      <div className="flex flex-col xl:flex-row xl:items-center gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Segmented size="sm" label="Where the minutes stand" value={pile} onChange={onPile} options={[
            { id: "all", label: "All", count: counts.total },
            ...(["draft", "studio", "client", "settled"] as const)
              .filter((p) => counts.pile[p] || pile === p)
              .map((p) => ({ id: p, label: PILE_LABEL[p], count: counts.pile[p] })),
          ]} />
          {kinds.length > 1 && (
            <Segmented size="sm" label="Kind of meeting" value={audience} onChange={setAudience} options={[
              { id: "all", label: "Every meeting" },
              ...kinds.map((k) => ({ id: k, label: AUDIENCE_LABEL[k], count: counts.audience[k] })),
            ]} />
          )}
        </div>
        <div className="xl:ml-auto flex flex-wrap sm:flex-nowrap items-center gap-2">
          <div className="relative w-full sm:w-auto sm:flex-1 xl:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the minutes"
              placeholder="Search titles, refs, decisions" className={`${INPUT} pl-9`} />
          </div>
          <Button variant="secondary" size="sm" icon={ArrowUpDown} onClick={() => setNewestFirst((v) => !v)}>
            {newestFirst ? "Newest first" : "Oldest first"}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {filtered ? `${shown} of ${counts.total} minutes` : `${counts.total} minutes on record`}
        </p>
        {filtered && <button type="button" onClick={clear} className="text-xs font-bold text-[#3D52A0] hover:text-[#334486]">Clear filters</button>}
      </div>

      {!groups.length ? (
        <EmptyState icon={Search} title="No minutes match" text="Try another word, or clear the filters to see every minutes."
          action={<Button variant="secondary" size="sm" onClick={clear}>Clear filters</Button>} />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className={`hidden lg:grid ${COLS} gap-4 px-4 py-2 bg-slate-50 border-b border-slate-200`}>
            <span className={LABEL}>Date</span>
            <span className={LABEL}>Meeting</span>
            <span className={LABEL}>Kind</span>
            <span className={LABEL}>Decisions · actions</span>
            <span className={LABEL}>Where it stands</span>
            <span className={`${LABEL} sr-only`}>Open</span>
          </div>
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <p className={`${LABEL} px-4 py-2 bg-slate-50 border-b border-slate-100`}>{g.label} · {g.rows.length}</p>
              <ul className="divide-y divide-slate-100 border-b border-slate-100 last:border-b-0">
                {g.rows.map((r) => {
                  const d = dayOf(r.at);
                  const i = n++;
                  return (
                    <li key={r.id} className={`group grid grid-cols-[48px_minmax(0,1fr)] ${COLS} gap-x-4 gap-y-2 px-4 py-3 items-center hover:bg-slate-50 transition-colors hud-row-in`}
                      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                      <div className="text-center leading-tight row-span-2 lg:row-span-1 self-start lg:self-center">
                        <span className="block text-lg font-black text-slate-800 tabular-nums">{d.day}</span>
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{d.week}</span>
                      </div>
                      <button type="button" onClick={() => onOpen(r.id)} className="min-w-0 text-left">
                        <span className="block text-sm font-semibold text-slate-800 truncate group-hover:text-[#3D52A0]">{r.title}</span>
                        <span className="block text-[11px] text-slate-500 truncate">
                          {[r.ref, r.rev ? `revision ${r.rev + 1}` : "", r.attendees ? `${r.attendees} ${r.attendees === 1 ? "person" : "people"}` : "", r.earlierFormat ? "earlier format" : ""].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                      <div className="col-start-2 lg:col-start-auto flex flex-wrap items-center gap-2">
                        <Chip tone={r.audience === "client" ? "brand" : "slate"}>{AUDIENCE_LABEL[r.audience]}</Chip>
                        <span className="lg:hidden"><Chip tone={TONE[r.chip.tone]}>{r.chip.label}</Chip></span>
                      </div>
                      <p className="col-start-2 lg:col-start-auto text-xs text-slate-500 tabular-nums">
                        <span className="font-semibold text-slate-700">{r.decisions}</span> {r.decisions === 1 ? "decision" : "decisions"}
                        {" · "}<span className="font-semibold text-slate-700">{r.actions}</span> {r.actions === 1 ? "action" : "actions"}
                        {r.open > 0 && <span className="block font-semibold text-amber-700">{r.open} still open</span>}
                      </p>
                      <div className="hidden lg:block"><Chip tone={TONE[r.chip.tone]}>{r.chip.label}</Chip></div>
                      <div className="col-start-2 lg:col-start-auto flex items-center gap-1 lg:justify-end">
                        <Button variant="secondary" size="sm" icon={ExternalLink} onClick={() => onOpen(r.id)}>
                          {r.draft ? "Carry on writing" : "Open"}
                        </Button>
                        <button type="button" onClick={() => onDelete(r.id)} title="Delete these minutes" aria-label={`Delete ${r.ref || r.title}`}
                          className="p-2 rounded-lg text-slate-300 group-hover:text-slate-400 hover:!text-rose-600 hover:bg-slate-100 focus-visible:text-rose-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
