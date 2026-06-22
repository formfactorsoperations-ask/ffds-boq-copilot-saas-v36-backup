import React from 'react';
import { MaterialSuggestion } from '../../types';

interface ClientMaterialsProps {
    suggestions: MaterialSuggestion[];
}

const ClientMaterials: React.FC<ClientMaterialsProps> = ({ suggestions }) => {

    const isValidHex = (hex: string) => /^#[0-9A-F]{6}$/i.test(hex);

    return (
        <section className="mt-16 pt-10 border-t-2 border-slate-200">
            <div className="flex items-center gap-4 mb-8">
                <h2 className="text-3xl font-bold text-slate-800">Design & Material Palette</h2>
                <div className="h-px bg-gradient-to-r from-slate-300 to-transparent flex-grow"></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {suggestions.map((room, roomIdx) => (
                    <div key={roomIdx} className="glass p-6 rounded-3xl">
                        <h3 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-200/50 pb-2">{room.roomName}</h3>
                        
                        <div className="mb-8">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Color Palette</h4>
                            <div className="flex gap-4">
                                {room.colorPalette.map((color, cIdx) => (
                                    <div key={cIdx} className="text-center">
                                        <div 
                                            className="w-14 h-14 rounded-2xl shadow-md border-2 border-white ring-1 ring-slate-100 mb-2"
                                            style={{ backgroundColor: isValidHex(color.hex) ? color.hex : '#e2e8f0' }}
                                        ></div>
                                        <p className="text-[10px] font-medium text-slate-700 w-20 truncate">{color.name}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Material Selection</h4>
                            <div className="space-y-3">
                                {room.materials.map((mat, mIdx) => (
                                    <div key={mIdx} className="flex items-start gap-3 bg-white/40 p-3 rounded-2xl border border-white/50">
                                        <div className="w-1.5 h-full min-h-[40px] bg-indigo-400 rounded-full"></div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">{mat.name}</p>
                                            <p className="text-xs text-slate-600 leading-relaxed">{mat.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default ClientMaterials;