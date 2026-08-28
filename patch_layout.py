import re

with open('components/BoqItemCard.tsx', 'r') as f:
    content = f.read()

# 1. Replace the tiles with a compact select
target_tiles = """                    <div className="flex flex-wrap gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); onUpdate(item.id, 'roomId', undefined); }}
                            className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded border transition-colors ${!item.roomId || item.roomId === 'Unassigned' ? 'bg-[#0066CC] text-white border-[#0066CC]' : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-[#0066CC] hover:text-[#0066CC]'}`}
                        >
                            Unassigned
                        </button>
                        {rooms.map(r => (
                            <button
                                key={r.name}
                                onClick={(e) => { e.stopPropagation(); onUpdate(item.id, 'roomId', r.name); }}
                                className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded border transition-colors max-w-[100px] truncate ${item.roomId === r.name ? 'bg-[#0066CC] text-white border-[#0066CC]' : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-[#0066CC] hover:text-[#0066CC]'}`}
                                title={r.name}
                            >
                                {r.name}
                            </button>
                        ))}
                    </div>"""

replacement_select = """                    <select 
                        value={item.roomId || 'Unassigned'} 
                        onChange={(e) => onUpdate(item.id, 'roomId', e.target.value === 'Unassigned' ? undefined : e.target.value)}
                        className="bg-slate-50 border border-slate-200 text-slate-600 hover:border-[#0066CC] hover:text-[#0066CC] focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] outline-none rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide max-w-[140px] cursor-pointer transition-colors"
                        onClick={(e) => e.stopPropagation()}
                        title="Assign to Room"
                    >
                        <option value="Unassigned">Unassigned</option>
                        {rooms.map(r => (
                            <option key={r.name} value={r.name}>{r.name}</option>
                        ))}
                    </select>"""

content = content.replace(target_tiles, replacement_select)

# 2. Replace the financials grid and footer with a single flattened row
target_footer = """        {/* Financials Grid */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3 p-1.5 bg-slate-50/30 rounded-lg border border-slate-100">
            <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Cost</label>
                <p className="font-semibold text-slate-600 mt-0.5">{formatCurrency(item.materials + item.labor)}</p>
            </div> 
            <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Margin</label>
                <div className="font-bold text-emerald-600 mt-0.5 flex flex-col items-center gap-1">
                    <EditableField 
                        value={item.margin.toFixed(1)} 
                        onChange={v => onUpdate(item.id, 'marginOverride', v)} 
                        onBlur={() => {}}
                        inputType="number"
                        suffix="%"
                        className="px-1.5"
                    />
                    <MarginDeviationIndicator margin={item.margin} />
                </div>
            </div> 
            <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase">Sell</label>
                <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(sellPrice)}</p>
            </div>
        </div>

        {/* Footer: Quantity & Total */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 rounded-lg px-3 py-1.5 gap-2 border border-slate-200">
                    <EditableField 
                        value={item.qty}
                        onChange={v => onUpdate(item.id, 'qty', v)}
                        onBlur={() => {}}
                        inputType="number"
                        className="w-12 font-bold text-sm bg-transparent text-slate-900"
                    />
                    <span className="text-[10px] font-bold text-slate-400 border-l border-slate-300 pl-2">
                        {item.unit}
                    </span>
                </div>
            </div>
            <div className="text-right">
                <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Total</div>
                <div className="font-black text-lg text-slate-900 tracking-tight leading-none mt-0.5">{formatCurrency(totalLineItem)}</div>
            </div>
        </div>"""

replacement_footer = """        {/* Financials & Quantity */}
        <div className="flex flex-wrap items-end justify-between gap-3 pt-3 border-t border-slate-100 mt-1">
            <div className="flex gap-4">
                <div>
                     <div className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Cost</div>
                     <div className="font-semibold text-slate-600 text-[11px]">{formatCurrency(item.materials + item.labor)}</div>
                </div>
                <div>
                     <div className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Margin</div>
                     <div className="flex items-center gap-0.5 font-bold text-emerald-600 text-[11px]">
                        <EditableField 
                            value={item.margin.toFixed(1)} 
                            onChange={v => onUpdate(item.id, 'marginOverride', v)} 
                            onBlur={() => {}}
                            inputType="number"
                            className="w-10 text-center bg-emerald-50 rounded"
                        />
                        <span className="text-[9px]">%</span>
                     </div>
                </div>
                <div>
                     <div className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Sell</div>
                     <div className="font-bold text-slate-800 text-[11px]">{formatCurrency(sellPrice)}</div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                    <div className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Qty</div>
                    <div className="flex items-center bg-slate-100 rounded px-1.5 py-0.5 border border-slate-200">
                        <EditableField 
                            value={item.qty}
                            onChange={v => onUpdate(item.id, 'qty', v)}
                            onBlur={() => {}}
                            inputType="number"
                            className="w-10 font-bold text-sm bg-transparent text-slate-900 text-center"
                        />
                        <span className="text-[9px] font-bold text-slate-400 border-l border-slate-300 pl-1.5 ml-0.5 uppercase">
                            {item.unit}
                        </span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mb-0.5">Total</div>
                    <div className="font-black text-base text-slate-900 tracking-tight leading-none">{formatCurrency(totalLineItem)}</div>
                </div>
            </div>
        </div>"""

content = content.replace(target_footer, replacement_footer)

with open('components/BoqItemCard.tsx', 'w') as f:
    f.write(content)
