import React from 'react';
import { Item } from '../../types';
import { TemplateData } from '../../lib/standardPackages';
import { formatINR, calculateSellPrice } from '../../lib/utils';
import { Sparkles, ShieldCheck, Layers, Eye, Copy, Trash2, Download, Upload, CheckCircle2 } from 'lucide-react';

interface TemplateMetricsBarProps {
  activeConfig: string;
  templates: TemplateData;
  bank: Item[];
  onOpenAiArchitect: () => void;
  onOpenAiAudit: () => void;
  onOpenTierPreview: () => void;
  onDuplicateConfig: () => void;
  onDeleteConfig: () => void;
  onExportTemplates: () => void;
  onImportTemplates: () => void;
}

export const TemplateMetricsBar: React.FC<TemplateMetricsBarProps> = ({
  activeConfig,
  templates,
  bank,
  onOpenAiArchitect,
  onOpenAiAudit,
  onOpenTierPreview,
  onDuplicateConfig,
  onDeleteConfig,
  onExportTemplates,
  onImportTemplates
}) => {
  const bankMap = new Map<string, Item>(bank.map(i => [i.id, i]));
  const currentConfigRooms = templates[activeConfig] || {};
  
  // Compute aggregate stats for current template
  const allItemIds = (Object.values(currentConfigRooms).flat() as unknown as string[]);
  const uniqueItemIds = Array.from(new Set(allItemIds));
  
  let totalSellEstimate = 0;
  let totalBaseCost = 0;
  const categoriesPresent = new Set<string>();

  uniqueItemIds.forEach(id => {
    const item = bankMap.get(id);
    if (item) {
      const baseCost = (item.materials || 0) + (item.labor || 0);
      const sellRate = calculateSellPrice(item.materials, item.labor, item.margin || 20);
      totalBaseCost += baseCost;
      totalSellEstimate += sellRate;
      if (item.cat) categoriesPresent.add(item.cat);
    }
  });

  const coreTrades = [
    { name: 'Carpentry', match: ['wood', 'carpentry', 'modular', 'furniture'] },
    { name: 'Electrical', match: ['electrical', 'light', 'wire'] },
    { name: 'Civil / Wet', match: ['civil', 'plumbing', 'tile', 'bath', 'waterproof'] },
    { name: 'Painting', match: ['paint', 'polish', 'punning'] },
    { name: 'Protection', match: ['protection', 'cleaning', 'debris', 'general'] }
  ];

  return (
    <div className="hud-well p-4 rounded-2xl border space-y-3 shrink-0 hud-panel-in">
      {/* Top row: Metrics + Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="pr-4 border-r border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Configured Scope
            </span>
            <span className="text-sm font-black text-slate-800">
              {Object.keys(currentConfigRooms).length} Rooms • {allItemIds.length} Total Items
            </span>
          </div>

          <div className="pr-4 border-r border-slate-200">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Unique Bank SKUs
            </span>
            <span className="text-sm font-black text-slate-800">
              {uniqueItemIds.length} Master Items
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Trade Coverage
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {coreTrades.map(trade => {
                const isCovered = Array.from(categoriesPresent).some(cat => 
                  trade.match.some(m => cat.toLowerCase().includes(m))
                );
                return (
                  <span
                    key={trade.name}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isCovered
                        ? 'bg-[#3D52A0]/10 text-[#334486] border-[#3D52A0]/25'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    {trade.name}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenAiArchitect}
            className="px-3.5 py-1.5 bg-[#3D52A0] text-white rounded-xl text-xs font-bold hover:bg-[#334486] transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Architect
          </button>

          <button
            onClick={onOpenAiAudit}
            className="px-3 py-1.5 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            AI Audit
          </button>

          <button
            onClick={onOpenTierPreview}
            className="px-3 py-1.5 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            3-Tier Simulation
          </button>

          <div className="h-4 w-px bg-slate-200 mx-1" />

          <button
            onClick={onDuplicateConfig}
            title="Duplicate this template"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Copy className="w-4 h-4" />
          </button>

          <button
            onClick={onExportTemplates}
            title="Export templates as JSON"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={onImportTemplates}
            title="Import templates from JSON"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
          </button>

          {Object.keys(templates).length > 1 && (
            <button
              onClick={onDeleteConfig}
              title="Delete this template"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
