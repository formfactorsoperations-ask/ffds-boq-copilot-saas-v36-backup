import React, { useState } from 'react';
import { Plus, Check } from 'lucide-react';
import BankModal from '../bank/BankModal';
import { Button, INPUT, LABEL } from '../ui/kit';

/*
  Standard templates → Add room: a room to hold items in the open typology.
  Pick a usual one, or name another.
*/

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

/** A room's name as it is stored: lower case, underscores for spaces. */
const keyOf = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

export const AddRoomScopeModal: React.FC<AddRoomScopeModalProps> = ({ isOpen, onClose, existingRooms, onAddRoom }) => {
  const [name, setName] = useState('');

  if (!isOpen) return null;

  const key = keyOf(name);
  /* Why the typed name cannot be added, said under the field as it is typed. */
  const problem = !name.trim() ? null : !key ? 'Use letters or numbers in the name.' : existingRooms.includes(key) ? 'This typology already has that room.' : null;
  const add = (k: string) => { onAddRoom(k); setName(''); onClose(); };

  return (
    <BankModal label="Add a room" eyebrow="Standard templates" title="Add a room" blurb="A room holds the items a new BOQ gets for it. Pick a usual one, or name another." size="md" onClose={onClose}>
      <div className="space-y-5">
        <form onSubmit={(e) => { e.preventDefault(); if (key && !problem) add(key); }}>
          <label htmlFor="room-name" className={`${LABEL} block mb-1.5`}>Another room</label>
          <div className="flex gap-2">
            <input id="room-name" autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Terrace deck" className={INPUT} aria-invalid={!!problem} />
            <Button type="submit" variant="primary" icon={Plus} disabled={!key || !!problem} className="shrink-0">Add</Button>
          </div>
          {problem && <p role="alert" className="text-xs text-rose-700 mt-1.5">{problem}</p>}
        </form>

        <div>
          <span className={`${LABEL} block mb-1.5`}>Usual rooms</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {COMMON_ROOM_SUGGESTIONS.map((s, i) => {
              const has = existingRooms.includes(s.key);
              return (
                <button key={s.key} type="button" disabled={has} onClick={() => add(s.key)}
                  className={`group hud-row-in px-3 py-2 rounded-xl border text-left text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${has ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-200 bg-white text-slate-700 hover:border-[#3D52A0]/40 hover:bg-[#3D52A0]/5 motion-safe:active:scale-[0.98]'}`}
                  style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}>
                  <span className="min-w-0 truncate">{s.label}</span>
                  {has
                    ? <span className="flex items-center gap-1 text-[11px] font-semibold shrink-0"><Check className="w-3 h-3" aria-hidden />Added</span>
                    : <Plus className="w-3.5 h-3.5 text-[#3D52A0] shrink-0 transition-transform group-hover:rotate-90" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BankModal>
  );
};
