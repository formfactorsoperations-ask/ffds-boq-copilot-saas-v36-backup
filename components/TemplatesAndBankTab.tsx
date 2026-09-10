/*
  The studio library: standard templates, the item bank, and the vendor directory.

  Rebuilt to sit alongside studio settings and the platform console rather than
  looking like a different product. What was here used an indigo-to-violet
  gradient pill for the active tab, a serif heading inside the vendors panel,
  and its own card treatment -- none of which appear anywhere else in the app.

  The three tabs each get the shared console header, and each reports something
  true about its own contents. A dial that shows a number nobody can act on is
  decoration; these show the gap between what the library holds and what it can
  actually be used for -- items with no cost, templates with nothing in them,
  suppliers nobody can ring.
*/

import React, { useState, useMemo, useCallback, useDeferredValue } from 'react';
import TemplateEditorTab from './TemplateEditorTab';
import BankTab from './BankTab';
import VendorsManager from './VendorsManager';
import ConsoleHeader from './ui/ConsoleHeader';
import { Layers, Boxes, Store } from 'lucide-react';

type TabId = 'templates' | 'bank' | 'vendors';

/*
  Ordered by how often the studio reaches for them: rates get edited constantly,
  templates occasionally, vendors rarely. The item bank also opens first for the
  same reason -- the screen used to land on the vendor directory, which is the
  one people came here for least.
*/
const TABS: { id: TabId; label: string; icon: React.ComponentType<any> }[] = [
  { id: 'bank', label: 'Item bank', icon: Boxes },
  { id: 'templates', label: 'Standard templates', icon: Layers },
  { id: 'vendors', label: 'Vendor directory', icon: Store },
];

export default function TemplatesAndBankTab({
  bank, setBank, templates, setTemplates, isDraftBankMode, setIsDraftBankMode,
  draftBank, setDraftBank, aiStrategy, highlightedBankItemId, setHighlightedBankItemId, projects = [],
}: any) {
  const [tab, setTab] = useState<TabId>('bank');
  /*
    Switching tab looked broken because it was slow, not because it was stuck.

    Every view of the item bank puts all 288 items in the DOM at once -- 289
    rows, ~24,000 nodes, 4,300 form controls -- so React spends between one and
    four seconds tearing that down and building the next tab. During it the
    click had no visible effect at all, which reads as a dead button.

    As a transition, the pill and the header update on the click while the heavy
    child renders behind it, and `isPending` gives the tab something honest to
    say in the meantime. This does not make the render faster -- see the node
    counts above; that needs the grid to stop rendering rows nobody is looking
    at -- but it stops the UI lying about whether it heard you.
  */
  const deferredTab = useDeferredValue(tab);
  const isPending = deferredTab !== tab;
  const [vendorStats, setVendorStats] = useState({ total: 0, active: 0, reachable: 0 });

  // Identity-stable, or VendorsManager's effect would fire on every render here.
  const handleVendorStats = useCallback(
    (s: { total: number; active: number; reachable: number }) => setVendorStats(s),
    [],
  );

  const activeBank = isDraftBankMode ? draftBank : bank;

  /*
    An item with no materials and no labour cost prices at zero wherever it is
    used, which is the quiet way a BOQ comes out short.
  */
  const bankStats = useMemo(() => {
    const items: any[] = Array.isArray(activeBank) ? activeBank : [];
    const priced = items.filter((i) => (Number(i?.materials) || 0) + (Number(i?.labor) || 0) > 0).length;
    return { total: items.length, priced, pct: items.length ? Math.round((priced / items.length) * 100) : 0 };
  }, [activeBank]);

  /*
    Templates are keyed typology -> room -> items, not a flat list: the first
    version of this counted an array that never existed and reported "0 of 0"
    over a library holding four typologies. A typology with no items in any of
    its rooms starts a project from nothing, which is the thing worth showing.
  */
  const templateStats = useMemo(() => {
    const map: Record<string, any> =
      templates && typeof templates === 'object' && !Array.isArray(templates) ? templates : {};
    const configs = Object.keys(map);
    const filled = configs.filter((config) =>
      Object.values(map[config] || {}).some((items: any) => Array.isArray(items) && items.length > 0),
    ).length;
    return { total: configs.length, filled, pct: configs.length ? Math.round((filled / configs.length) * 100) : 0 };
  }, [templates]);

  const header = () => {
    if (tab === 'bank') {
      const tone = bankStats.pct === 100 ? 'ok' : bankStats.pct >= 60 ? 'warn' : 'bad';
      return (
        <ConsoleHeader
          title="Item bank"
          state={isDraftBankMode ? 'Draft sandbox' : 'Live bank'}
          tone={isDraftBankMode ? 'warn' : tone}
          blurb="Every rate the studio prices from. What is here decides what a BOQ can say."
          gauge={{
            pct: bankStats.pct,
            label: 'Rates set',
            sub: `${bankStats.priced} of ${bankStats.total} items carry a cost`,
          }}
          actions={
            <>
              <span className="text-xs font-semibold text-slate-500">
                Editing{' '}
                <span className={isDraftBankMode ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                  {isDraftBankMode ? 'the draft sandbox' : 'the live bank'}
                </span>
              </span>
              <button
                onClick={() => setIsDraftBankMode(!isDraftBankMode)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  isDraftBankMode
                    ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                Switch to {isDraftBankMode ? 'live bank' : 'draft sandbox'}
              </button>
              {isDraftBankMode ? (
                <button
                  onClick={() => {
                    if (window.confirm('Overwrite the LIVE item bank with the draft sandbox? This changes the rates new projects are priced from.')) {
                      setBank(draftBank);
                      setIsDraftBankMode(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0066CC] text-white text-xs font-bold hover:bg-[#0055B3]"
                >
                  Publish draft to live
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (window.confirm('This replaces your sandbox draft with a copy of the live bank. Continue?')) {
                      setDraftBank(bank);
                      setIsDraftBankMode(true);
                    }
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                >
                  Copy live into draft
                </button>
              )}
            </>
          }
        />
      );
    }

    if (tab === 'templates') {
      return (
        <ConsoleHeader
          title="Standard templates"
          state={templateStats.total === 0 ? 'Empty' : `${templateStats.total} typologies`}
          tone={templateStats.total === 0 ? 'warn' : templateStats.pct === 100 ? 'ok' : 'warn'}
          blurb="Ready-made scopes a new project starts from, so a proposal does not begin at nothing."
          gauge={{
            pct: templateStats.pct,
            label: 'Ready to use',
            sub: `${templateStats.filled} of ${templateStats.total} typologies carry a scope`,
          }}
        />
      );
    }

    const reachPct = vendorStats.total ? Math.round((vendorStats.reachable / vendorStats.total) * 100) : 0;
    return (
      <ConsoleHeader
        title="Vendor directory"
        state={vendorStats.total === 0 ? 'Empty' : `${vendorStats.active} active`}
        tone={vendorStats.total === 0 ? 'warn' : reachPct === 100 ? 'ok' : 'warn'}
        blurb="Material suppliers, trade contractors and turnkey partners the studio buys from."
        gauge={{
          pct: reachPct,
          label: 'Contactable',
          sub: `${vendorStats.reachable} of ${vendorStats.total} have a phone or email`,
        }}
      />
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-1 sm:px-2 pb-8">
        {header()}

        {/* Tabs, in the studio's blue — the rail treatment settings uses. */}
        <nav className="flex flex-wrap gap-2 mb-6" role="tablist">
          {TABS.map((t, i) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                id={`tab-btn-${t.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors hud-row-in ${
                  isActive
                    ? 'bg-[#0066CC] text-white shadow-sm hud-rail-active'
                    : 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-50'
                }`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{t.label}</span>
                {isActive && isPending && (
                  <span className="text-[10px] font-semibold opacity-80">loading…</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Keyed on the tab so switching re-runs the entrance rather than cutting. */}
        <div key={deferredTab} className={`hud-swap ${isPending ? 'opacity-60 transition-opacity' : ''}`}>
          {deferredTab === 'templates' && (
            <TemplateEditorTab
              bank={bank}
              setBank={setBank}
              templates={templates}
              setTemplates={setTemplates}
              aiStrategy={aiStrategy}
            />
          )}
          {deferredTab === 'vendors' && (
            <VendorsManager projects={projects} onStats={handleVendorStats} />
          )}
          {deferredTab === 'bank' && (
            <BankTab
              bank={activeBank}
              setBank={isDraftBankMode ? setDraftBank : setBank}
              aiStrategy={aiStrategy}
              highlightedBankItemId={highlightedBankItemId}
              onHighlightClear={() => setHighlightedBankItemId(null)}
              projects={projects}
            />
          )}
        </div>
      </div>
    </div>
  );
}
