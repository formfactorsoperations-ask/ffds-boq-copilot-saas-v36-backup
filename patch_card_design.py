import re

with open('components/BoqItemCard.tsx', 'r') as f:
    content = f.read()

# Define the new return block
new_return = """  return (
    <MotionDiv 
        initial={{ opacity: 0, scale: 0.9, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
        whileHover={{ y: -2, transition: { duration: 0.2 } }}
        className={`bg-white rounded-xl border transition-all duration-300 hover:shadow-lg ${isSelected ? 'ring-2 ring-[#0066CC] border-transparent shadow-md' : 'border-slate-200 hover:border-slate-300'} flex flex-col overflow-hidden relative group`}
    >
        {/* Hover Actions */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200 flex gap-1.5 z-10">
             <MotionButton whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className={`p-1.5 rounded-md shadow-sm border transition-colors ${isAdvancedOpen ? 'bg-sky-50 text-[#0066CC] border-sky-200' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'}`} title="Advanced Settings">
                <span className="text-xs font-bold px-1">⚙️</span>
            </MotionButton>
             <MotionButton whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={() => onViewInBank(item.bankId)} className="p-1.5 bg-white text-slate-400 rounded-md shadow-sm border border-slate-200 hover:border-slate-300 hover:text-[#0066CC]" title="View in Bank">
                <LinkIcon className="w-3.5 h-3.5" />
            </MotionButton>
            <MotionButton whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={() => onDelete(item.id)} className="p-1.5 bg-white text-rose-400 rounded-md shadow-sm border border-slate-200 hover:border-rose-200 hover:text-rose-500 hover:bg-rose-50" title="Remove Item">
                <DeleteIcon className="w-3.5 h-3.5" />
            </MotionButton>
        </div>

        <div className="p-4 flex-1">
            {/* Header Area */}
            <div className="flex gap-3 items-start mb-3">
                {onSelectToggle && (
                    <div className="pt-1.5" onClick={(e) => e.stopPropagation()}>
                        <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onSelectToggle()}
                            className="w-4 h-4 rounded text-[#0066CC] focus:ring-[#0066CC] border-slate-300 cursor-pointer shadow-sm transition-all"
                        />
                    </div>
                )}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-sm ${categoryStyle} bg-opacity-20 shrink-0`}>
                    {getCategoryEmoji(item.cat)}
                </div>
                <div className="flex-1 pr-24">
                    <h3 className="text-[13px] font-bold text-slate-800 leading-tight mb-2 tracking-tight">
                        {highlightText(item.name, searchQuery)}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wide ${categoryStyle} bg-opacity-20 border border-transparent`}>
                            {highlightText(item.cat, searchQuery)}
                        </span>
                        <div className="relative inline-block">
                            <select 
                                value={item.roomId || 'Unassigned'} 
                                onChange={(e) => onUpdate(item.id, 'roomId', e.target.value === 'Unassigned' ? undefined : e.target.value)}
                                className="appearance-none bg-slate-100 hover:bg-slate-200 border border-transparent text-slate-600 focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] outline-none rounded-full px-2.5 py-0.5 pr-6 text-[10px] font-bold uppercase tracking-wide cursor-pointer transition-colors max-w-[140px]"
                                onClick={(e) => e.stopPropagation()}
                                title="Assign to Room"
                            >
                                <option value="Unassigned">Unassigned</option>
                                {rooms.map(r => (
                                    <option key={r.name} value={r.name}>{r.name}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wide bg-slate-100 text-slate-500">
                            {isLumpsum ? 'Lumpsum' : 'Itemized'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Specs Area */}
            <div className="relative group/specs mb-3">
                <textarea
                    value={item.specs}
                    onChange={(e) => onUpdate(item.id, 'specs', e.target.value)}
                    placeholder="Enter item specifications..."
                    className="w-full text-[11px] text-slate-600 leading-relaxed bg-transparent hover:bg-slate-50 focus:bg-white p-2 rounded border border-transparent hover:border-slate-200 focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] outline-none resize-y min-h-[48px] transition-all"
                />
                {item.rationale && (
                    <p className="text-[10px] text-[#0066CC] mt-1 italic px-2 font-medium bg-sky-50/50 py-1 rounded">
                        {item.rationale}
                    </p>
                )}
                
                {/* AI Refine Button */}
                <button 
                    onClick={handleMagicRationale}
                    disabled={isRefining}
                    className="absolute bottom-1 right-2 bg-white border border-slate-200 text-[#0066CC] p-1.5 rounded shadow-sm hover:border-[#0066CC] hover:bg-sky-50 transition-all opacity-0 group-hover/specs:opacity-100 z-10"
                    title="AI Enhance Specs"
                >
                    <WandIcon className={`w-3 h-3 ${isRefining ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Advanced Settings */}
            {isAdvancedOpen && (
                <div className="mb-4 p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-3 shadow-inner">
                    <div className="grid grid-cols-4 gap-3">
                        {/* Type */}
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Type</label>
                            <EditableField 
                                value={item.type}
                                onChange={v => onUpdate(item.id, 'type', v)}
                                onBlur={() => {}}
                                className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium"
                            />
                        </div>
                        {/* Cost */}
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Cost (₹)</label>
                            <div className="flex gap-1">
                                <EditableField 
                                    value={item.materials}
                                    onChange={v => onUpdate(item.id, 'materials', v)}
                                    onBlur={() => {}}
                                    inputType="number"
                                    className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium text-center"
                                    placeholder="Mat"
                                />
                                <EditableField 
                                    value={item.labor}
                                    onChange={v => onUpdate(item.id, 'labor', v)}
                                    onBlur={() => {}}
                                    inputType="number"
                                    className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium text-center"
                                    placeholder="Lab"
                                />
                            </div>
                        </div>
                        {/* Selected Rate */}
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Selected Rate (₹)</label>
                            <EditableField 
                                value={item.selectedRate}
                                onChange={v => onUpdate(item.id, 'selectedRate', v)}
                                onBlur={() => {}}
                                inputType="number"
                                className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium"
                            />
                        </div>
                        {/* Assumption Tag */}
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Assumption Tag</label>
                            <select 
                                value={item.assumptionTag || 'none'}
                                onChange={e => onUpdate(item.id, 'assumptionTag', e.target.value === 'none' ? undefined : e.target.value)}
                                className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium outline-none focus:border-[#0066CC]"
                            >
                                <option value="none">None</option>
                                <option value="client_to_provide">Client to Provide</option>
                                <option value="provisional_sum">Provisional Sum</option>
                                <option value="site_measurement">Site Measurement</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Inclusions</label>
                            <EditableField 
                                value={item.inclusions?.join(', ') || ''}
                                onChange={(v) => handleArrayChange('inclusions', String(v))}
                                onBlur={() => {}}
                                className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium block text-left"
                                placeholder="e.g., Hardware, Polish"
                            />
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Exclusions</label>
                            <EditableField 
                                value={item.exclusions?.join(', ') || ''}
                                onChange={(v) => handleArrayChange('exclusions', String(v))}
                                onBlur={() => {}}
                                className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium block text-left"
                                placeholder="e.g., Civil changes"
                            />
                        </div>
                    </div>
                    {/* Lumpsum Breakdown */}
                    {isLumpsum && (
                        <div className="pt-2 border-t border-slate-200">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[9px] font-bold text-[#0066CC] uppercase tracking-wider">Lumpsum Breakdown</label>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={handleGenerateBreakdown} 
                                        disabled={isGeneratingBreakdown}
                                        className="text-[10px] font-bold text-[#0066CC] hover:text-[#0055B3] bg-sky-50 hover:bg-sky-100 px-2 py-1 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                                    >
                                        <WandIcon className={`w-3 h-3 ${isGeneratingBreakdown ? 'animate-spin' : ''}`} />
                                        AI Breakdown
                                    </button>
                                    <button onClick={addBreakdownItem} className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-2 py-1 rounded transition-colors">
                                        + Add Item
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {(item.lumpsumBreakdown || []).map((breakdown, idx) => (
                                    <div key={breakdown.id} className="flex items-center gap-2 bg-white p-1.5 rounded border border-slate-200">
                                        <span className="text-[9px] font-bold text-slate-400 w-4 text-center">{idx + 1}.</span>
                                        <input 
                                            type="text" 
                                            value={breakdown.description || ''} 
                                            onChange={e => updateBreakdownItem(breakdown.id, 'description', e.target.value)}
                                            placeholder="Description"
                                            className="flex-1 text-[11px] outline-none bg-transparent font-medium text-slate-700"
                                        />
                                        <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                                            <span className="text-[10px] text-slate-400">₹</span>
                                            <input 
                                                type="number" 
                                                value={breakdown.estimatedValue || ''} 
                                                onChange={e => updateBreakdownItem(breakdown.id, 'estimatedValue', Number(e.target.value))}
                                                placeholder="Value"
                                                className="w-16 text-[11px] outline-none bg-transparent text-right font-bold text-slate-700"
                                            />
                                        </div>
                                        <button onClick={() => removeBreakdownItem(breakdown.id)} className="text-rose-400 hover:text-rose-600 p-1">
                                            <DeleteIcon className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                {(!item.lumpsumBreakdown || item.lumpsumBreakdown.length === 0) && (
                                    <p className="text-[10px] text-slate-400 italic text-center py-2 bg-white rounded border border-slate-100">No breakdown provided.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Financials & Quantity Footer (Bento Style) */}
        <div className="bg-slate-50 border-t border-slate-100 p-3 px-4 flex flex-wrap items-center justify-between gap-4">
            {/* Rates Area */}
            <div className="flex items-center gap-5">
                <div>
                     <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Base Cost</div>
                     <div className="font-medium text-slate-600 text-xs">{formatCurrency(item.materials + item.labor)}</div>
                </div>
                <div className="w-px h-6 bg-slate-200"></div>
                <div>
                     <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Margin</div>
                     <div className="flex items-center gap-1.5 font-bold text-emerald-600 text-xs">
                        <EditableField 
                            value={item.margin.toFixed(1)} 
                            onChange={v => onUpdate(item.id, 'marginOverride', v)} 
                            onBlur={() => {}}
                            inputType="number"
                            className="w-12 text-center bg-white border border-emerald-100 hover:border-emerald-300 focus:border-emerald-500 rounded py-0.5 shadow-sm transition-colors"
                        />
                        <span className="text-[10px]">%</span>
                     </div>
                </div>
                <div className="w-px h-6 bg-slate-200"></div>
                <div>
                     <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Sell Rate</div>
                     <div className="font-bold text-slate-800 text-xs">{formatCurrency(sellPrice)}</div>
                </div>
            </div>

            {/* Total Area */}
            <div className="flex items-center gap-4 bg-white py-1.5 px-3 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 pr-3 border-r border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Qty</span>
                    <div className="flex items-center gap-1">
                        <EditableField 
                            value={item.qty}
                            onChange={v => onUpdate(item.id, 'qty', v)}
                            onBlur={() => {}}
                            inputType="number"
                            className="w-12 font-bold text-sm bg-slate-50 border border-transparent hover:border-slate-300 focus:border-[#0066CC] focus:bg-white rounded text-center text-[#0066CC] py-0.5 transition-colors"
                        />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.unit}</span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[9px] font-bold uppercase text-slate-400 tracking-widest mb-0.5">Total Value</div>
                    <div className="font-black text-lg text-slate-900 tracking-tight leading-none">{formatCurrency(totalLineItem)}</div>
                </div>
            </div>
        </div>
    </MotionDiv>
  );
}"""

pattern = r"  return \(\s*<MotionDiv[\s\S]*?  \);\s*};\s*export default BoqItemCard;"
content = re.sub(pattern, new_return + "\nexport default BoqItemCard;", content)

with open('components/BoqItemCard.tsx', 'w') as f:
    f.write(content)
