import React, { useState } from 'react';
import { ProjectContext, FullBoqItem } from '../../types';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDownIcon } from '../Icons';

interface ClientRoomDetailsProps {
  rooms: { [key:string]: FullBoqItem[] };
  projectContext: ProjectContext;
  selectedOptions: Set<string>;
  onToggleOption: (itemId: string) => void;
}

const ClientRoomDetails: React.FC<ClientRoomDetailsProps> = ({ rooms, projectContext, selectedOptions, onToggleOption }) => {
  // State to track expanded rooms. Default all open or specific logic.
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set(Object.keys(rooms || {})));

  const toggleRoom = (roomName: string) => {
    setExpandedRooms(prev => {
        const newSet = new Set(prev);
        if (newSet.has(roomName)) newSet.delete(roomName);
        else newSet.add(roomName);
        return newSet;
    })
  }

  const MotionDiv = motion.div as any;

  return (
    <section>
      <div className="space-y-4">
        {Object.entries(rooms || {}).map(([roomName, items]: [string, FullBoqItem[]]) => {
          // Recalculate room total based on selected options
          const roomTotal = items.reduce((sum, item) => {
              if (!item.optional || selectedOptions.has(item.id)) {
                  return sum + calculateSellPrice(item.materials, item.labor, item.margin) * item.qty;
              }
              return sum;
          }, 0);

          const roomContext = projectContext.rooms.find(r => r.name === roomName);
          const isExpanded = expandedRooms.has(roomName);

          return (
            <div key={roomName} className="glass rounded-2xl overflow-hidden transition-all duration-300 border border-white/40">
              <div 
                onClick={() => toggleRoom(roomName)}
                className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${isExpanded ? 'bg-indigo-50/50' : 'hover:bg-white/40'}`}
              >
                  <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-indigo-100 text-indigo-600' : 'text-slate-400'}`}>
                          <ChevronDownIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-slate-800">{roomName}</h3>
                        {roomContext && <p className="text-xs text-slate-500">{roomContext.size} {roomContext.unit}</p>}
                      </div>
                  </div>
                  <div className="text-right">
                      <p className="font-bold text-slate-800">{formatCurrency(roomTotal)}</p>
                      <p className="text-xs text-slate-500">{items.length} items</p>
                  </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                    <MotionDiv 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-slate-100">
                            <table className="w-full text-sm">
                            <thead className="bg-slate-50/50 text-xs uppercase text-slate-400">
                                <tr>
                                <th className="p-3 pl-6 text-left font-bold">Description</th>
                                <th className="p-3 text-right font-bold">Qty</th>
                                <th className="p-3 text-right font-bold">Rate</th>
                                <th className="p-3 pr-6 text-right font-bold">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => {
                                const rate = calculateSellPrice(item.materials, item.labor, item.margin);
                                const total = rate * item.qty;
                                const isSelected = !item.optional || selectedOptions.has(item.id);

                                return (
                                    <tr key={item.id} className={`border-b border-slate-100 last:border-0 transition-colors ${isSelected ? '' : 'bg-slate-50/50 text-slate-400 line-through'}`}>
                                    <td className="p-3 pl-6 align-top">
                                        <div className="flex items-start gap-3">
                                            {item.optional && (
                                                <input 
                                                    type="checkbox" 
                                                    checked={isSelected}
                                                    onChange={(e) => { e.stopPropagation(); onToggleOption(item.id); }}
                                                    className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                />
                                            )}
                                            <div>
                                                <p className={`font-bold text-sm ${isSelected ? 'text-slate-800' : ''}`}>{item.name}</p>
                                                <p className={`text-xs leading-relaxed mt-0.5 ${isSelected ? 'text-slate-500' : 'text-slate-400'}`}>{item.specs}</p>
                                                {item.optional && <span className="inline-block mt-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Optional Add-on</span>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-3 text-right align-top whitespace-nowrap text-slate-600">{item.qty.toFixed(2)} <span className="text-[10px]">{item.unit}</span></td>
                                    <td className="p-3 text-right align-top whitespace-nowrap text-slate-600">{formatCurrency(rate)}</td>
                                    <td className="p-3 pr-6 text-right align-top font-bold whitespace-nowrap text-slate-800">{formatCurrency(total)}</td>
                                    </tr>
                                );
                                })}
                            </tbody>
                            </table>
                        </div>
                    </MotionDiv>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default ClientRoomDetails;