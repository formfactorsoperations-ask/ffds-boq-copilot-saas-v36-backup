import React, { useState } from 'react';
import { Item, AIStrategy } from '../../types';
import { generateAiTemplate, AiGeneratedTemplateResult } from '../../services/geminiService';
import { Sparkles, Wand2, Plus, Check, Loader2, X, AlertCircle, Layers, Building, RefreshCw, FileCheck } from 'lucide-react';
import { formatINR } from '../../lib/utils';

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
      const result = await generateAiTemplate(textToUse, bank, existingConfigs, aiStrategy as AIStrategy);
      setGeneratedResult(result);
    } catch (err: any) {
      console.error("AI Template Architect error:", err);
      setErrorMessage(err?.message || "Failed to generate template with AI. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (!generatedResult) return;
    onApplyTemplate(generatedResult, autoAddMissingItems);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 p-6 text-white flex items-center justify-between border-b border-sky-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-400/20 text-amber-300 rounded-xl border border-amber-400/30">
              <Wand2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold tracking-tight">AI Template Architect</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wider">
                  Gemini 3.7
                </span>
              </div>
              <p className="text-xs text-sky-200 mt-0.5">
                Describe your target apartment typology or commercial space to construct a standard BOQ package.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {/* Prompt Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                1. Specify Typology & Design Scope
              </label>
              <span className="text-[11px] text-slate-400">Natural language prompt or choose preset</span>
            </div>

            <div className="relative">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g. 3-BHK luxury apartment in Whitefield for high-income couple. Needs full modular kitchen with acrylic finish, floor to ceiling master wardrobe, fluted TV console, false ceiling in all dry areas, and smart electrical provisions..."
                rows={3}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC] focus:border-transparent transition-all"
              />
              <button
                onClick={() => handleGenerate()}
                disabled={isGenerating || !promptText.trim()}
                className="absolute bottom-3 right-3 px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md transition-all"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Synthesizing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    Build Template
                  </>
                )}
              </button>
            </div>

            {/* Presets */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 mb-2">Or pick a studio architectural preset:</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {INDUSTRY_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setPromptText(preset.prompt);
                      handleGenerate(preset.prompt);
                    }}
                    disabled={isGenerating}
                    className="p-2.5 text-left border border-slate-200 rounded-xl bg-white hover:border-[#0066CC] hover:bg-sky-50/50 transition-all text-xs group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-800 group-hover:text-[#0066CC]">{preset.label}</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">{preset.category}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{preset.prompt}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-sm text-red-700">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Generated Result Preview */}
          {generatedResult && (
            <div className="space-y-4 pt-4 border-t border-slate-200 animate-in fade-in-50 duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-base font-black text-slate-800 flex items-center gap-2">
                    <Check className="w-5 h-5 text-emerald-500" />
                    Generated Package: {generatedResult.configName}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">{generatedResult.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                    Trade Coverage: {generatedResult.tradeCoverageScore}%
                  </span>
                  <span className="px-3 py-1 bg-sky-50 text-[#0055B3] border border-sky-200 rounded-full text-xs font-bold">
                    {Object.keys(generatedResult.rooms).length} Room Scopes
                  </span>
                </div>
              </div>

              {/* Design Rationale */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 leading-relaxed">
                <span className="font-bold">Architectural Strategy: </span>
                {generatedResult.designRationale}
              </div>

              {/* Room Scopes Breakdown */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Configured Room Item Mappings
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(generatedResult.rooms).map(([roomName, rawIds]) => {
                    const itemIds = (Array.isArray(rawIds) ? rawIds : []) as string[];
                    return (
                      <div key={roomName} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                            {roomName} Scope
                          </span>
                          <span className="text-[10px] font-semibold bg-white border px-1.5 py-0.5 rounded text-slate-600">
                            {itemIds.length} items
                          </span>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                          {itemIds.map((id: string) => {
                            const item = bankMap.get(id);
                            return (
                              <div key={id} className="text-xs bg-white p-1.5 rounded border border-slate-100 flex items-center justify-between">
                                <span className="font-medium text-slate-700 truncate mr-2">
                                  {item ? item.name : id}
                                </span>
                                <span className="text-[10px] text-slate-400 shrink-0">
                                  {item?.cat || 'Item'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* New Bank Items Needed */}
              {generatedResult.newItemsNeeded && generatedResult.newItemsNeeded.length > 0 && (
                <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-sky-900">
                        Recommended New Master Bank Items ({generatedResult.newItemsNeeded.length})
                      </p>
                      <p className="text-[11px] text-sky-700">
                        The AI identified items missing from your Master Bank that this typology requires:
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-sky-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoAddMissingItems}
                        onChange={(e) => setAutoAddMissingItems(e.target.checked)}
                        className="rounded text-[#0066CC] focus:ring-sky-400"
                      />
                      Auto-create in Item Bank
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {generatedResult.newItemsNeeded.map((newItem, idx) => (
                      <div key={idx} className="bg-white p-2.5 rounded-lg border border-sky-100 text-xs flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-800">{newItem.name}</p>
                          <p className="text-[10px] text-slate-500">{newItem.cat} • {newItem.unit}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-700">{formatINR(newItem.materials + newItem.labor)}</p>
                          <p className="text-[10px] text-emerald-600 font-medium">+{newItem.margin}% margin</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            {generatedResult && (
              <button
                onClick={() => handleGenerate()}
                disabled={isGenerating}
                className="px-3 py-2 border border-slate-300 text-slate-700 hover:bg-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerate
              </button>
            )}
            <button
              onClick={handleApply}
              disabled={!generatedResult || isGenerating}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-700/20 transition-all"
            >
              <FileCheck className="w-4 h-4" />
              Adopt Template into Studio Library
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
