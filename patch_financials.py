import re

with open('components/BoqItemCard.tsx', 'r') as f:
    content = f.read()

target = """        {/* Financials Grid */}
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

replacement = """        {/* Financials & Quantity (Flattened) */}
        <div className="flex flex-wrap items-end justify-between gap-3 pt-3 border-t border-slate-100 mt-1">
            <div className="flex gap-4">
                <div>
                     <div className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Cost</div>
                     <div className="font-semibold text-slate-600 text-[11px]">{formatCurrency(item.materials + item.labor)}</div>
                </div>
                <div>
                     <div className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Margin</div>
                     <div className="flex items-center gap-1 font-bold text-emerald-600 text-[11px]">
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

content = content.replace(target, replacement)

with open('components/BoqItemCard.tsx', 'w') as f:
    f.write(content)
