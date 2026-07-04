
import React, { useMemo, useState } from 'react';
import { BoqItem, Room, FullBoqItem } from '../types';
import { formatCurrency, calculateSellPrice } from '../lib/utils';
import BoqItemCard from './BoqItemCard';
import { AddToCartIcon } from './Icons';
import { motion, AnimatePresence } from 'framer-motion';

interface RoomCardProps {
  room: Room;
  items: FullBoqItem[];
  allRooms: Room[]; // Added this prop to know about all possible rooms
  searchQuery?: string;
  onUpdate: (itemId: string, fieldOrUpdates: keyof BoqItem | Partial<BoqItem>, value?: any) => void;
  onBulkUpdate?: (updates: {itemId: string, updates: Partial<BoqItem>}[]) => void;
  onDelete: (itemId: string) => void;
  onAddItem: (room: Room) => void;
  onViewInBank: (bankId: string) => void;
}

const RoomCard: React.FC<RoomCardProps> = ({ room, items, allRooms, searchQuery, onUpdate, onBulkUpdate, onDelete, onAddItem, onViewInBank }) => {
  const [isMarkupOpen, setIsMarkupOpen] = useState(false);
  const [markupValue, setMarkupValue] = useState(20);

  const roomTotal = useMemo(() => {
    return items.reduce((total, item) => {
      const itemSell = calculateSellPrice(item.materials, item.labor, item.margin) * item.qty;
      return total + itemSell;
    }, 0);
  }, [items]);

  const handleApplyMarkup = () => {
      const hasZeroMarginItems = items.some(i => i.margin === 0 && (i.materials > 0 || i.labor > 0));
      let includeZero = true;
      if (hasZeroMarginItems) {
          includeZero = window.confirm("Some items have 0% markup. Include them?");
      }

      const updates: { itemId: string, updates: Partial<BoqItem> }[] = [];
      items.forEach(item => {
          if (!includeZero && item.margin === 0) return;
          if (!item.materials && !item.labor) return; // skip items without cost
          updates.push({
              itemId: item.id,
              updates: { marginOverride: markupValue }
          });
      });

      if (updates.length > 0) {
          if (onBulkUpdate) {
              onBulkUpdate(updates);
          } else {
              // fallback if onBulkUpdate is not provided
              updates.forEach(u => onUpdate(u.itemId, u.updates));
          }
      }
      setIsMarkupOpen(false);
  };

  const cleanSearchQuery = (searchQuery || '').trim().toLowerCase();
  const searchActive = cleanSearchQuery.length >= 2;

  const matchedItems = useMemo(() => {
    if (!searchActive) return new Set(items.map(item => item.id));
    const matchingIds = new Set<string>();
    items.forEach(item => {
        const itemStr = `${item.name} ${item.cat} ${item.specs || ''}`.toLowerCase();
        if (itemStr.includes(cleanSearchQuery)) {
            matchingIds.add(item.id);
        }
    });
    return matchingIds;
  }, [items, searchActive, cleanSearchQuery]);

  const MotionDiv = motion.div as any;

  return (
    <div className="mb-10">
      <div className="p-4 mb-4 glass rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-4 z-10">
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/60 rounded-xl flex items-center justify-center shadow-sm text-xl backdrop-blur-md">
                🏠
            </div>
            <div>
                <h4 className="font-bold text-lg text-indigo-900 leading-tight">{room.name}</h4>
                {room.size > 0 && <p className="text-xs font-medium text-slate-500 bg-white/30 inline-block px-2 py-0.5 rounded-md mt-0.5 border border-white/30">{room.size} {room.unit}</p>}
            </div>
        </div>
        <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
            <div className="text-right">
                <p className="font-black text-lg text-indigo-900 tracking-tight">{formatCurrency(roomTotal)}</p>
                <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                    {searchActive ? `${matchedItems.size} of ${items.length} match` : `${items.length} items`}
                </p>
            </div>
            
            <div className="flex items-center gap-2 relative">
                {items.length > 0 && (
                    <>
                        <button 
                            onClick={() => setIsMarkupOpen(!isMarkupOpen)}
                            className="px-3 py-2 bg-white text-slate-600 font-bold rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-all text-xs whitespace-nowrap">
                            Set markup
                        </button>
                        
                        {isMarkupOpen && (
                            <div className="absolute top-full right-0 mt-2 p-4 bg-white rounded-xl shadow-xl border border-slate-200 z-50 w-64 origin-top-right animate-in fade-in zoom-in duration-200">
                                <label className="block text-xs font-bold text-slate-700 mb-2 whitespace-normal break-words">Set markup % for all items in this room</label>
                                <input 
                                   type="number" 
                                   value={markupValue}
                                   onChange={e => setMarkupValue(Number(e.target.value))}
                                   className="w-full border border-slate-300 rounded-lg p-2 text-sm mb-3 focus:outline-none focus:border-indigo-500" 
                                />
                                <div className="flex justify-end gap-2 text-xs">
                                    <button onClick={() => setIsMarkupOpen(false)} className="px-3 py-1.5 text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
                                    <button onClick={handleApplyMarkup} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-sm">Apply</button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {room.name !== 'Unassigned' && (
                    <button 
                        onClick={() => onAddItem(room)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600/90 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-105 transition-all text-xs backdrop-blur-sm whitespace-nowrap">
                        <AddToCartIcon className="w-3.5 h-3.5"/> Add Item
                    </button>
                )}
            </div>
        </div>
      </div>
      
      <div className="px-2">
        {items.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <AnimatePresence>
                    {items.map(item => {
                        const isMatch = matchedItems.has(item.id);
                        return (
                        <MotionDiv 
                            key={item.id}
                            style={{ display: searchActive && !isMatch ? 'none' : 'block' }}
                        >
                            <BoqItemCard
                                item={item}
                                rooms={allRooms} // Pass the full list of rooms down
                                searchQuery={searchActive ? cleanSearchQuery : ''}
                                onUpdate={onUpdate}
                                onDelete={onDelete}
                                onViewInBank={onViewInBank}
                            />
                        </MotionDiv>
                    )})}
                </AnimatePresence>
            </div>
        ) : (
            <div className="py-8 text-center border-2 border-dashed border-white/40 rounded-2xl bg-white/10">
                <p className="text-slate-500 font-medium mb-3 text-sm">This room is empty.</p>
                 {room.name !== 'Unassigned' && (
                    <button onClick={() => onAddItem(room)} className="text-indigo-600 text-xs font-bold hover:text-indigo-800 hover:bg-indigo-50/50 px-3 py-1.5 rounded-lg transition-colors">
                        + Add items
                    </button>
                 )}
            </div>
        )}
      </div>
    </div>
  );
};

export default RoomCard;
