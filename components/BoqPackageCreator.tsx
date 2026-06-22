import React, { useState } from 'react';
import { Item, BoqItem, ProjectContext, AIGeneratedBoqItem } from '../types';
import Card from './shared/Card';
import { generateBoqPackage, isAiAvailable } from '../services/geminiService';
import { SparklesIcon } from './Icons';
import { id as generateId } from '../lib/utils';

interface BoqPackageCreatorProps {
  projectContext: ProjectContext;
  bank: Item[];
  onPackageCreated: (items: BoqItem[]) => void;
}

const THEMES = ['modern', 'minimalist', 'classic', 'industrial', 'bohemian', 'luxury'];

const BoqPackageCreator: React.FC<BoqPackageCreatorProps> = ({ projectContext, bank, onPackageCreated }) => {
  const [selectedTheme, setSelectedTheme] = useState('modern');
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    if (!isAiAvailable()) {
      alert("AI Service is not available.");
      return;
    }
    if ((projectContext.rooms || []).length === 0) {
        alert("Please define rooms in the Project Context before generating a package.");
        return;
    }
    setIsLoading(true);
    const generatedItems = await generateBoqPackage(projectContext, selectedTheme, bank);
    
    // The service returns AIGeneratedBoqItem[], we need to map to BoqItem[]
    const boqItems: BoqItem[] = generatedItems.map((genItem): BoqItem | null => {
        const bankItem = bank.find(b => b.id === genItem.id);
        if (!bankItem) return null; // Should not happen if AI follows instructions
        
        return {
            id: generateId(), // Ensure unique ID for BOQ instance
            bankId: bankItem.id,
            qty: genItem.qty,
            // Force undefined margin override so it uses the bank item's markup
            marginOverride: undefined,
            roomId: genItem.roomId,
            rationale: genItem.rationale,
            baseRate: bankItem.materials,
        };
    }).filter((i): i is BoqItem => i !== null);

    onPackageCreated(boqItems);
    setIsLoading(false);
  };

  return (
    <Card title="AI BOQ Package Creator" titleIcon={<SparklesIcon className="w-4 h-4" />}>
      <p className="text-sm text-slate-600 mb-4">
        Automatically generate a complete BOQ based on your project context and a selected design theme. This will replace the contents of your currently <span className="font-bold">active</span> tier.
      </p>
      <div className="flex flex-wrap items-center gap-4 p-3 bg-slate-50 rounded-lg">
        <label htmlFor="theme" className="font-semibold text-slate-700">Select Theme:</label>
        <select
          id="theme"
          value={selectedTheme}
          onChange={(e) => setSelectedTheme(e.target.value)}
          className="p-2 border border-slate-300 rounded-lg bg-white"
        >
          {THEMES.map(theme => <option key={theme} value={theme}>{theme.charAt(0).toUpperCase() + theme.slice(1)}</option>)}
        </select>
        <button
          onClick={handleGenerate}
          disabled={isLoading || !isAiAvailable()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition"
        >
          {isLoading ? 'Generating Package...' : 'Generate & Replace Active Tier BOQ'}
        </button>
      </div>
      {!isAiAvailable() && <p className="text-xs text-amber-600 mt-2">AI service not available. This feature is disabled.</p>}
    </Card>
  );
};

export default BoqPackageCreator;
