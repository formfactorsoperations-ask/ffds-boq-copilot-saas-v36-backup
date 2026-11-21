import React from 'react';
import { Item } from '../../types';
import { TemplateData } from '../../lib/standardPackages';
import { roomScopesOf } from '../../lib/templateOptions';
import { Sparkles, ShieldCheck, Eye, Copy, Trash2, Download, Upload, SlidersHorizontal } from 'lucide-react';
import { Button, Chip, LABEL } from '../ui/kit';

/*
  Standard templates: what can be done to the open typology, and which trades
  it covers (DESIGN.md "Item bank motion", Standard templates). The figures
  that used to sit here are tiles on the screen now.
*/

interface TemplateMetricsBarProps {
  /** There is more than one typology, so this one may be deleted. */
  canDelete: boolean;
  onOpenAiArchitect: () => void;
  onOpenAiAudit: () => void;
  onOpenTierPreview: () => void;
  onDuplicateConfig: () => void;
  onDeleteConfig: () => void;
  onExportTemplates: () => void;
  onImportTemplates: () => void;
  /** Opens Option setup: the figures that separate the three options (lib/optionSetup). */
  onOpenOptionSetup?: () => void;
  /** The studio has changed a figure from the standard. */
  setupChanged?: boolean;
}

const ICON = 'p-1.5 rounded-lg text-slate-400 transition-colors hover:text-[#3D52A0] hover:bg-[#3D52A0]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30';

export const TemplateMetricsBar: React.FC<TemplateMetricsBarProps> = ({
  canDelete, onOpenAiArchitect, onOpenAiAudit, onOpenTierPreview, onDuplicateConfig, onDeleteConfig,
  onExportTemplates, onImportTemplates, onOpenOptionSetup, setupChanged,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <Button size="sm" icon={ShieldCheck} onClick={onOpenAiAudit} title="Look for what this typology is missing">AI audit</Button>
    <Button size="sm" icon={Eye} onClick={onOpenTierPreview} title="See the three options this typology makes">Preview the options</Button>
    {onOpenOptionSetup && (
      <Button size="sm" icon={SlidersHorizontal} onClick={onOpenOptionSetup} title="The figures that separate Essential, Comfort and Harmony">
        Option setup
        {setupChanged && <span className="w-1.5 h-1.5 rounded-full bg-[#3D52A0]" title="Changed from the standard" />}
      </Button>
    )}
    <span className="flex items-center gap-0.5 px-1" role="group" aria-label="This typology">
      <button type="button" onClick={onDuplicateConfig} title="Duplicate this typology" aria-label="Duplicate this typology" className={ICON}><Copy className="w-4 h-4" /></button>
      <button type="button" onClick={onExportTemplates} title="Export every typology as a file" aria-label="Export the templates" className={ICON}><Download className="w-4 h-4" /></button>
      <button type="button" onClick={onImportTemplates} title="Import typologies from a file" aria-label="Import templates" className={ICON}><Upload className="w-4 h-4" /></button>
      {canDelete && (
        <button type="button" onClick={onDeleteConfig} title="Delete this typology" aria-label="Delete this typology" className={`${ICON} hover:!text-rose-600 hover:!bg-rose-50`}><Trash2 className="w-4 h-4" /></button>
      )}
    </span>
    <Button size="sm" variant="primary" icon={Sparkles} onClick={onOpenAiArchitect} title="Have AI draft a new typology from the Item bank">AI architect</Button>
  </div>
);

const CORE_TRADES = [
  { name: 'Carpentry', match: ['wood', 'carpentry', 'modular', 'furniture'] },
  { name: 'Electrical', match: ['electrical', 'light', 'wire'] },
  { name: 'Civil / Wet', match: ['civil', 'plumbing', 'tile', 'bath', 'waterproof'] },
  { name: 'Painting', match: ['paint', 'polish', 'punning'] },
  { name: 'Protection', match: ['protection', 'cleaning', 'debris', 'general'] },
];

/** The five trades a full interior needs, and whether this typology has an item in each. */
export const TradeCoverage: React.FC<{ templates: TemplateData; activeConfig: string; bank: Item[] }> = ({ templates, activeConfig, bank }) => {
  const byId = new Map<string, Item>(bank.map((i) => [i.id, i]));
  const cats = new Set<string>();
  Object.values(roomScopesOf(templates[activeConfig] || {})).forEach((ids) => (ids || []).forEach((id) => {
    const cat = byId.get(id)?.cat;
    if (cat) cats.add(cat.toLowerCase());
  }));
  const covered = (match: string[]) => [...cats].some((c) => match.some((m) => c.includes(m)));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={LABEL}>Trades covered</span>
      {CORE_TRADES.map((t) => {
        const on = covered(t.match);
        return <Chip key={t.name} tone={on ? 'brand' : 'slate'} title={on ? `${activeConfig} has ${t.name.toLowerCase()} items` : `${activeConfig} has no ${t.name.toLowerCase()} item yet`} className={on ? '' : '!text-slate-400'}>{t.name}</Chip>;
      })}
    </div>
  );
};
