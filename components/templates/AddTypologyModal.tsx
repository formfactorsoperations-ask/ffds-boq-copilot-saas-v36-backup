import React, { useState } from 'react';
import { Plus, X, Building, Layers, Check } from 'lucide-react';

interface AddTypologyModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingConfigs: string[];
  onAddConfig: (configName: string, initialRooms: string[], cloneFromConfig?: string) => void;
}

const DEFAULT_ROOM_SETS: Record<string, string[]> = {
  'Standard Residential (1BHK/2BHK/3BHK)': ['living', 'bedroom', 'kitchen', 'bathroom', 'dining', 'general'],
  'Luxury Residential (4BHK/Villa)': ['foyer', 'living', 'dining', 'kitchen', 'master_bedroom', 'kids_bedroom', 'guest_bedroom', 'master_bathroom', 'common_bathroom', 'balcony', 'general'],
  'Bathroom Remodel': ['bathroom', 'general'],
  'Kitchen Overhaul': ['kitchen', 'dining', 'general'],
  'Commercial / Boutique Office': ['reception', 'conference', 'director_cabin', 'workstation_area', 'pantry', 'restroom', 'general']
};

export const AddTypologyModal: React.FC<AddTypologyModalProps> = ({
  isOpen,
  onClose,
  existingConfigs,
  onAddConfig
}) => {
  const [configName, setConfigName] = useState('');
  const [selectedPresetKey, setSelectedPresetKey] = useState('Standard Residential (1BHK/2BHK/3BHK)');
  const [cloneFrom, setCloneFrom] = useState<string>('none');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = configName.trim();
    if (!cleanName) {
      setError('Please enter a template / typology name');
      return;
    }
    if (existingConfigs.some(c => c.toLowerCase() === cleanName.toLowerCase())) {
      setError('A configuration with this name already exists');
      return;
    }

    const roomsToUse = DEFAULT_ROOM_SETS[selectedPresetKey] || ['living', 'bedroom', 'kitchen', 'bathroom', 'general'];
    onAddConfig(cleanName, roomsToUse, cloneFrom !== 'none' ? cloneFrom : undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 bg-gradient-to-r from-slate-900 to-sky-950 text-white flex items-center justify-between border-b border-sky-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/20 rounded-xl text-sky-300">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">New Standard Template</h3>
              <p className="text-xs text-sky-200">Add a custom typology or package</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Template / Typology Name
            </label>
            <input
              type="text"
              required
              value={configName}
              onChange={(e) => {
                setConfigName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. 4-BHK Luxury, Studio-1RK, Duplex-Villa"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Clone from Existing (Optional)
            </label>
            <select
              value={cloneFrom}
              onChange={(e) => setCloneFrom(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
            >
              <option value="none">Start Fresh with Standard Preset</option>
              {existingConfigs.map(c => (
                <option key={c} value={c}>Clone scopes from: {c}</option>
              ))}
            </select>
          </div>

          {cloneFrom === 'none' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Initial Room Scope Preset
              </label>
              <div className="space-y-2">
                {Object.entries(DEFAULT_ROOM_SETS).map(([presetName, rooms]) => (
                  <label
                    key={presetName}
                    onClick={() => setSelectedPresetKey(presetName)}
                    className={`p-2.5 rounded-xl border flex items-start justify-between cursor-pointer transition-all ${
                      selectedPresetKey === presetName
                        ? 'border-[#0066CC] bg-sky-50/60 ring-1 ring-[#0066CC]'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-800">{presetName}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{rooms.join(', ')}</p>
                    </div>
                    {selectedPresetKey === presetName && (
                      <Check className="w-4 h-4 text-[#0066CC] shrink-0 mt-0.5" />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white rounded-lg text-xs font-bold shadow-md shadow-sky-600/20"
            >
              Create Template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
