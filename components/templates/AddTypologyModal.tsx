import React, { useState } from 'react';
import { Check } from 'lucide-react';
import BankModal from '../bank/BankModal';
import { Button, Chip, Segmented, INPUT, LABEL } from '../ui/kit';

/*
  Standard templates → New typology: a named set of rooms a new project starts
  from. It starts with the rooms of a usual kind of home, empty, or as a copy
  of a typology the studio already has.
*/

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
const FIRST = Object.keys(DEFAULT_ROOM_SETS)[0];

export const AddTypologyModal: React.FC<AddTypologyModalProps> = ({ isOpen, onClose, existingConfigs, onAddConfig }) => {
  const [name, setName] = useState('');
  const [from, setFrom] = useState<'preset' | 'copy'>('preset');
  const [preset, setPreset] = useState(FIRST);
  const [copyOf, setCopyOf] = useState(existingConfigs[0] || '');

  if (!isOpen) return null;

  const clean = name.trim();
  const taken = !!clean && existingConfigs.some((c) => c.toLowerCase() === clean.toLowerCase());
  const copying = from === 'copy' && !!copyOf;
  const create = () => {
    if (!clean || taken) return;
    onAddConfig(clean, DEFAULT_ROOM_SETS[preset] || DEFAULT_ROOM_SETS[FIRST], copying ? copyOf : undefined);
    setName('');
    onClose();
  };

  return (
    <BankModal
      label="New typology" eyebrow="Standard templates" title="New typology"
      blurb="A typology is the set of rooms, and what goes in each, that a new project of that kind starts from."
      size="md" onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} onClick={create} disabled={!clean || taken} title={!clean ? 'Give it a name' : taken ? 'That name is taken' : undefined}>Create typology</Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <div>
          <label htmlFor="typology-name" className={`${LABEL} block mb-1.5`}>Name</label>
          <input id="typology-name" autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 4-BHK, Studio, Duplex villa" className={INPUT} aria-invalid={taken} />
          {taken && <p role="alert" className="text-xs text-rose-700 mt-1.5">The studio already has a typology with this name.</p>}
        </div>

        <div>
          <span className={`${LABEL} block mb-1.5`}>Start from</span>
          <Segmented label="Start from" value={from} onChange={setFrom}
            options={[{ id: 'preset', label: 'Empty rooms' }, ...(existingConfigs.length ? [{ id: 'copy' as const, label: 'A copy of another' }] : [])]} />
        </div>

        <div key={from} className="hud-swap">
          {from === 'copy' ? (
            <div>
              <label htmlFor="typology-copy" className={`${LABEL} block mb-1.5`}>Copy the rooms and items of</label>
              <select id="typology-copy" value={copyOf} onChange={(e) => setCopyOf(e.target.value)} className={`${INPUT} bg-white cursor-pointer`}>
                {existingConfigs.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-[11px] text-slate-500 mt-1.5">Its option marks come with it. Changing the copy does not change the original.</p>
            </div>
          ) : (
            <div role="radiogroup" aria-label="Rooms to start with" className="space-y-1.5">
              {Object.entries(DEFAULT_ROOM_SETS).map(([label, rooms]) => {
                const on = preset === label;
                return (
                  <button key={label} type="button" role="radio" aria-checked={on} onClick={() => setPreset(label)}
                    className={`w-full p-3 rounded-xl border text-left flex items-start gap-3 transition-colors ${on ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/15 bg-[#3D52A0]/[0.03]' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                    <span className={`mt-0.5 w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 transition-colors ${on ? 'border-[#3D52A0]' : 'border-slate-300'}`}>
                      {on && <span className="w-2 h-2 rounded-full bg-[#3D52A0]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">{label}<Chip tone="slate">{rooms.length} rooms</Chip></span>
                      <span className="block text-[11px] text-slate-500 mt-0.5 capitalize">{rooms.map((r) => r.replace(/_/g, ' ')).join(' · ')}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </form>
    </BankModal>
  );
};
