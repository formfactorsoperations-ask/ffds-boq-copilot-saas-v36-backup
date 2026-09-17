import React, { useState } from 'react';
import { Plus, X, Layers, Check } from 'lucide-react';

interface AddRoomScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingRooms: string[];
  onAddRoom: (roomKey: string) => void;
}

const COMMON_ROOM_SUGGESTIONS = [
  { key: 'foyer', label: 'Foyer / Entrance' },
  { key: 'living', label: 'Living Room' },
  { key: 'dining', label: 'Dining Area' },
  { key: 'kitchen', label: 'Modular Kitchen' },
  { key: 'utility', label: 'Utility / Dry Balcony' },
  { key: 'master_bedroom', label: 'Master Bedroom' },
  { key: 'bedroom', label: 'Standard Bedroom' },
  { key: 'kids_bedroom', label: 'Kids Bedroom' },
  { key: 'guest_bedroom', label: 'Guest Bedroom' },
  { key: 'parents_bedroom', label: 'Parents Bedroom' },
  { key: 'bathroom', label: 'Bathroom / Toilet' },
  { key: 'master_bathroom', label: 'Master Bathroom' },
  { key: 'powder_room', label: 'Powder Room' },
  { key: 'pooja', label: 'Pooja / Mandir Room' },
  { key: 'balcony', label: 'Balcony / Deck' },
  { key: 'home_office', label: 'Home Office / Study' },
  { key: 'dressing_area', label: 'Walk-in Dressing Area' },
  { key: 'servant_room', label: 'Servant / Staff Room' },
  { key: 'general', label: 'General / Whole House MEP' }
];

export const AddRoomScopeModal: React.FC<AddRoomScopeModalProps> = ({
  isOpen,
  onClose,
  existingRooms,
  onAddRoom
}) => {
  const [customRoomKey, setCustomRoomKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAdd = (rawKey: string) => {
    const cleanKey = rawKey.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!cleanKey) {
      setError('Please enter a valid room identifier');
      return;
    }
    if (existingRooms.includes(cleanKey)) {
      setError(`Room scope "${cleanKey}" already exists in this template`);
      return;
    }
    onAddRoom(cleanKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 bg-gradient-to-r from-slate-900 to-sky-950 text-white flex items-center justify-between border-b border-sky-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/20 rounded-xl text-sky-300">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Add Room Scope</h3>
              <p className="text-xs text-sky-200">Create a room partition in this template</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Custom Room Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customRoomKey}
                onChange={(e) => {
                  setCustomRoomKey(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. powder_room, terrace_deck, study"
                className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3D52A0]"
              />
              <button
                type="button"
                onClick={() => handleAdd(customRoomKey)}
                disabled={!customRoomKey.trim()}
                className="px-4 py-2 bg-[#3D52A0] hover:bg-[#334486] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shrink-0"
              >
                Add Custom
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Quick Suggestions
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
              {COMMON_ROOM_SUGGESTIONS.map(s => {
                const isExisting = existingRooms.includes(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={isExisting}
                    onClick={() => handleAdd(s.key)}
                    className={`p-2 rounded-xl text-left text-xs font-semibold border transition-all flex items-center justify-between ${
                      isExisting
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-[#3D52A0] hover:bg-sky-50'
                    }`}
                  >
                    <span className="truncate mr-1">{s.label}</span>
                    {isExisting ? (
                      <span className="text-[10px] text-slate-400">Added</span>
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-[#3D52A0] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
