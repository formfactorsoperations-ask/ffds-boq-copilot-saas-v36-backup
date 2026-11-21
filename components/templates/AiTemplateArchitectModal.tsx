import React, { useState } from 'react';
import { Item, AIStrategy } from '../../types';
import { generateAiTemplate, AiGeneratedTemplateResult } from '../../services/geminiService';
import { Sparkles, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { formatINR } from '../../lib/utils';
import { pickable } from '../../lib/bankMatch';
import BankModal from '../bank/BankModal';
import { Button, Chip, SummaryStrip, INPUT, LABEL } from '../ui/kit';

/*
  Standard templates → AI architect: describe a home, and AI drafts a typology
  from the Item bank: the rooms, the items in each, and any item the bank lacks.
  Nothing is added until "Add to templates".
*/

interface AiTemplateArchitectModalProps {
  isOpen: boolean;
  onClose: () => void;
  bank: Item[];
  existingConfigs: string[];
  aiStrategy?: AIStrategy;
  onApplyTemplate: (result: AiGeneratedTemplateResult, autoAddBankItems: boolean) => void;
}

const INDUSTRY_PRESETS = [
  {
    label: "3-BHK Modern Luxury",
    category: "Residential",
    prompt: "A 3-BHK modern luxury apartment for IT leadership family in Bangalore. High-end veneer & acrylic wardrobes, fluted wall panelling, cove false ceilings, profile lighting, kitchen with quartz breakfast counter, bespoke vanity counters, and kids study unit."
  },
  {
    label: "2-BHK Premium Rental Turnkey",
    category: "Rental",
    prompt: "A 2-BHK turnkey interior package optimized for high-rental yield in Mumbai/Pune. Durable 1mm laminates, modular kitchen with SS baskets, full false ceiling in living, CNC partition, two 3-door wardrobes, electrical provisions, and site protection."
  },
  {
    label: "4-BHK Penthouse / Villa",
    category: "Luxury",
    prompt: "Ultra-luxury 4-BHK duplex penthouse. Master bedroom with walk-in wardrobe and PU fluted headboard, formal living with marble cladding, home theatre acoustic panelling, bar counter, powder room vanity, servant room basics, and balcony deck."
  },
  {
    label: "1-BHK / Studio Space Optimizer",
    category: "Compact",
    prompt: "Compact 1-BHK / Studio apartment with multi-functional space saving interior. Murphy bed with integrated sofa, collapsible study desk, compact modular kitchen with tall storage, full height sliding wardrobe with loft, and mood lighting."
  },
  {
    label: "Complete Master Bath Remodel",
    category: "Renovation",
    prompt: "Turnkey master bathroom complete renovation. BBC civil dismantling, full waterproof membrane, 4x2 vitrified wall & floor dado, wall-hung WC with concealed cistern, LED backlit mirror, quartz vanity, and CP sanitary actuals."
  },
  {
    label: "Boutique Design Studio Office",
    category: "Commercial",
    prompt: "Contemporary boutique design studio & creative office for 10-15 team members. Reception backdrop with backlit metal logo, conference room acoustic baffle ceiling, executive cabin modular credenza, sample material display library, and pantry."
  }
];

export const AiTemplateArchitectModal: React.FC<AiTemplateArchitectModalProps> = ({
  isOpen,
  onClose,
  bank,
  existingConfigs,
  aiStrategy = 'balanced',
  onApplyTemplate
}) => {
  const [promptText, setPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<AiGeneratedTemplateResult | null>(null);
  const [autoAddMissingItems, setAutoAddMissingItems] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bankMap = React.useMemo(() => new Map<string, Item>(bank.map(i => [i.id, i])), [bank]);

  if (!isOpen) return null;

  const handleGenerate = async (customPrompt?: string) => {
    const textToUse = customPrompt || promptText;
    if (!textToUse.trim()) return;

    setIsGenerating(true);
    setErrorMessage(null);
    setGeneratedResult(null);

    try {
      // Chosen from the items, never a copy of one (lib/bankMatch.ts).
      const result = await generateAiTemplate(textToUse, pickable(bank), existingConfigs, aiStrategy as AIStrategy);
      setGeneratedResult(result);
    } catch (err: any) {
      console.error("AI Template Architect error:", err);
      setErrorMessage(err?.message || "AI could not draft the typology. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (!generatedResult) return;
    onApplyTemplate(generatedResult, autoAddMissingItems);
    onClose();
  };

  const rooms = generatedResult ? Object.entries(generatedResult.rooms) : [];
  const newItems = generatedResult?.newItemsNeeded || [];
  const itemCount = rooms.reduce((n, [, ids]) => n + (Array.isArray(ids) ? ids.length : 0), 0);

  return (
    <BankModal
      label="AI architect" eyebrow="Standard templates" title="AI architect"
      blurb="Describe the home. AI drafts a typology from your Item bank: the rooms, and the items in each. Nothing is added until you say so."
      size="2xl" onClose={onClose} locked={isGenerating}
      footer={
        <>
          <Button onClick={onClose} disabled={isGenerating}>Cancel</Button>
          <span className="flex items-center gap-2">
            {generatedResult && <Button icon={RefreshCw} onClick={() => handleGenerate()} disabled={isGenerating}>Draft again</Button>}
            <Button variant="primary" icon={Check} onClick={handleApply} disabled={!generatedResult || isGenerating}
              title={!generatedResult ? 'Draft a typology first' : undefined}>Add to templates</Button>
          </span>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label htmlFor="architect-brief" className={`${LABEL} block mb-1.5`}>The home, in your words</label>
          <textarea id="architect-brief" value={promptText} onChange={(e) => setPromptText(e.target.value)} rows={3}
            placeholder="e.g. 3-BHK apartment for a young family. Full modular kitchen in acrylic, floor-to-ceiling wardrobe in the master bedroom, fluted TV unit, false ceiling in the dry areas."
            className={INPUT} />
          <div className="mt-2 flex justify-end">
            <Button variant="primary" onClick={() => handleGenerate()} disabled={isGenerating || !promptText.trim()}>
              <Sparkles className={`w-4 h-4 ${isGenerating ? 'motion-safe:animate-pulse' : ''}`} aria-hidden />
              {isGenerating ? 'Drafting…' : 'Draft the typology'}
            </Button>
          </div>
        </div>

        {!generatedResult && (
          <div>
            <span className={`${LABEL} block mb-1.5`}>Or start from one of these</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {INDUSTRY_PRESETS.map((preset, i) => (
                <button key={preset.label} type="button" disabled={isGenerating}
                  onClick={() => { setPromptText(preset.prompt); handleGenerate(preset.prompt); }}
                  className="group hud-row-in p-3 text-left rounded-xl border border-slate-200 bg-white transition-colors hover:border-[#3D52A0]/40 hover:bg-[#3D52A0]/5 disabled:opacity-50 motion-safe:active:scale-[0.98]"
                  style={{ animationDelay: `${i * 30}ms` }}>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-[#3D52A0]">{preset.label}</span>
                    <Chip tone="slate">{preset.category}</Chip>
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-500 line-clamp-3">{preset.prompt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isGenerating && (
          <div className="rounded-xl border border-slate-200 p-4 flex items-center gap-3 hud-scanning" role="status">
            <span className="w-4 h-4 border-2 border-[#3D52A0] border-t-transparent rounded-full motion-safe:animate-spin shrink-0" />
            <span className="text-xs text-slate-600">Choosing rooms and items from the Item bank. This can take a little while.</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 flex items-start gap-2 text-xs text-rose-800" role="alert">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden />
            <span>{errorMessage}</span>
          </div>
        )}

        {generatedResult && (
          <div className="space-y-4 pt-5 border-t border-slate-100 hud-panel-in">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">The draft</p>
              <h4 className="font-bold text-slate-800 mt-1">{generatedResult.configName}</h4>
              {generatedResult.description && <p className="text-xs text-slate-500 mt-0.5">{generatedResult.description}</p>}
            </div>

            <SummaryStrip stats={[
              { label: 'Rooms', value: rooms.length, sub: `${itemCount} items in all` },
              { label: 'Trades covered', value: `${generatedResult.tradeCoverageScore}%`, sub: 'As AI judges it', tone: generatedResult.tradeCoverageScore >= 80 ? 'good' : 'warn' },
              { label: 'New for the bank', value: newItems.length, sub: newItems.length ? 'Items the bank does not have' : 'Everything is in the bank', tone: newItems.length ? 'warn' : 'good' },
            ]} />

            {generatedResult.designRationale && (
              <div>
                <span className={`${LABEL} block mb-1`}>Why it is built this way</span>
                <p className="text-xs text-slate-600">{generatedResult.designRationale}</p>
              </div>
            )}

            {/* Every room and every item: nothing is cut, and no box to scroll inside. */}
            <div>
              <span className={`${LABEL} block mb-1.5`}>Rooms and their items</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                {rooms.map(([roomName, rawIds], i) => {
                  const itemIds = (Array.isArray(rawIds) ? rawIds : []) as string[];
                  return (
                    <div key={roomName} className="hud-row-in rounded-xl border border-slate-200" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100 rounded-t-xl">
                        <span className="text-sm font-semibold text-slate-800 capitalize">{roomName.replace(/_/g, ' ')}</span>
                        <Chip tone="slate">{itemIds.length} {itemIds.length === 1 ? 'item' : 'items'}</Chip>
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {itemIds.map((id) => {
                          const item = bankMap.get(id);
                          return (
                            <li key={id} className="px-3 py-1.5 flex items-start justify-between gap-3 text-xs">
                              <span className={`min-w-0 break-words font-semibold ${item ? 'text-slate-700' : 'text-rose-700'}`}>{item ? item.name : `Not in the bank: ${id}`}</span>
                              <span className="text-[11px] text-slate-500 shrink-0">{item?.cat || ''}</span>
                            </li>
                          );
                        })}
                        {itemIds.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">No items.</li>}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>

            {newItems.length > 0 && (
              <div className="rounded-xl border border-slate-200">
                <div className="px-3 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">Items the bank does not have</p>
                    <p className="text-[11px] text-slate-500">AI's rates are a starting point. Check them in the Item bank before pricing with them.</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={autoAddMissingItems} onChange={(e) => setAutoAddMissingItems(e.target.checked)} className="accent-[#3D52A0]" />
                    Add them to the Item bank
                  </label>
                </div>
                <ul className="divide-y divide-slate-100">
                  {newItems.map((newItem, idx) => (
                    <li key={idx} className="px-3 py-2 flex items-start justify-between gap-3 text-xs">
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-800 break-words">{newItem.name}</span>
                        <span className="block text-[11px] text-slate-500">{newItem.cat} · per {newItem.unit}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block font-bold text-slate-800 tabular-nums">{formatINR(newItem.materials + newItem.labor)}</span>
                        <span className="block text-[11px] text-slate-500 tabular-nums">{newItem.margin}% margin</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </BankModal>
  );
};
