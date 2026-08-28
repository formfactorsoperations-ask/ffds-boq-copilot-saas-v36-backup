import re

with open('components/BoqItemCard.tsx', 'r') as f:
    content = f.read()

# 1. Sharper Container
container_pattern = r"className=\{\`bg-white rounded-xl border transition-all duration-300 hover:shadow-lg \$\{isSelected \? 'ring-2 ring-\[\#0066CC\] border-transparent shadow-md' : 'border-slate-200 hover:border-slate-300'\} flex flex-col overflow-hidden relative group\`\}"
container_replacement = "className={`bg-white rounded-md border transition-all duration-200 hover:shadow-md ${isSelected ? 'ring-2 ring-[#0066CC] border-transparent shadow-sm' : 'border-slate-300 hover:border-slate-400'} flex flex-col overflow-hidden relative group`}"
content = re.sub(container_pattern, container_replacement, content)

# 2. Sharper Advanced Settings Container
advanced_container_pattern = r"className=\"mb-2 p-3\.5 bg-slate-50 border border-slate-100 rounded-xl space-y-4 shadow-inner relative\""
advanced_container_replacement = "className=\"mb-2 p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-4 shadow-sm relative\""
content = re.sub(advanced_container_pattern, advanced_container_replacement, content)

# 3. Add BOQ Status Badge
boq_status_badge = """                        <span className={`px-2 py-0.5 rounded-sm text-[9px] uppercase font-bold tracking-wide ${categoryStyle} bg-opacity-20 border border-transparent`}>
                            {highlightText(item.cat, searchQuery)}
                        </span>
                        
                        {/* BOQ Status Badge */}
                        <div className="relative inline-block">
                            <select 
                                value={item.boqStatus || 'included_ffds_scope'}
                                onChange={(e) => onUpdate(item.id, 'boqStatus', e.target.value)}
                                className={`appearance-none border text-[9px] font-bold uppercase tracking-wide cursor-pointer transition-colors max-w-[150px] px-2.5 py-0.5 pr-6 rounded-sm outline-none focus:ring-1 focus:ring-[#0066CC] ${
                                    item.boqStatus === 'excluded' || item.boqStatus === 'deleted' ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100' :
                                    item.boqStatus === 'client_procured' ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100' :
                                    item.boqStatus === 'approved_variation' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' :
                                    item.boqStatus === 'pending_finalisation' || item.boqStatus === 'on_hold' ? 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100' :
                                    'bg-[#0066CC]/5 text-[#0066CC] border-[#0066CC]/20 hover:bg-[#0066CC]/10'
                                }`}
                                onClick={(e) => e.stopPropagation()}
                                title="BOQ Status"
                            >
                                <option value="included_ffds_scope">FFDS Scope</option>
                                <option value="pending_finalisation">Pending Fin.</option>
                                <option value="client_procured">Client Procured</option>
                                <option value="as_actuals">As Actuals</option>
                                <option value="provisional_sum">Provisional Sum</option>
                                <option value="approved_variation">Approved Var.</option>
                                <option value="on_hold">On Hold</option>
                                <option value="substituted">Substituted</option>
                                <option value="excluded">Excluded</option>
                                <option value="deleted">Deleted</option>
                            </select>
                            <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 ${
                                item.boqStatus === 'excluded' || item.boqStatus === 'deleted' ? 'text-rose-400' :
                                item.boqStatus === 'client_procured' ? 'text-amber-400' :
                                item.boqStatus === 'approved_variation' ? 'text-emerald-400' :
                                item.boqStatus === 'pending_finalisation' || item.boqStatus === 'on_hold' ? 'text-orange-400' :
                                'text-[#0066CC]/60'
                            }`}>
                                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>"""

status_badge_target = r"<span className=\{\`px-2 py-0\.5 rounded text-\[9px\] uppercase font-bold tracking-wide \$\{categoryStyle\} bg-opacity-20 border border-transparent\`\}>\s*\{highlightText\(item\.cat, searchQuery\)\}\s*</span>"
content = re.sub(status_badge_target, boq_status_badge, content)


# 4. Rounding adjustment for Room Selector
room_selector_target = r"className=\"appearance-none bg-slate-100 hover:bg-slate-200 border border-transparent text-slate-600 focus:border-\[\#0066CC\] focus:ring-1 focus:ring-\[\#0066CC\] outline-none rounded-full px-2\.5 py-0\.5 pr-6 text-\[10px\] font-bold uppercase tracking-wide cursor-pointer transition-colors max-w-\[140px\]\""
room_selector_replacement = "className=\"appearance-none bg-slate-100 hover:bg-slate-200 border border-transparent text-slate-600 focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] outline-none rounded-sm px-2.5 py-0.5 pr-6 text-[9px] font-bold uppercase tracking-wide cursor-pointer transition-colors max-w-[140px]\""
content = re.sub(room_selector_target, room_selector_replacement, content)

# 5. Rounding adjustment for Lumpsum tag
lumpsum_tag_target = r"<span className=\"px-2 py-0\.5 rounded text-\[9px\] uppercase font-bold tracking-wide bg-slate-100 text-slate-500\">"
lumpsum_tag_replacement = "<span className=\"px-2 py-0.5 rounded-sm text-[9px] uppercase font-bold tracking-wide bg-slate-100 text-slate-500\">"
content = re.sub(lumpsum_tag_target, lumpsum_tag_replacement, content)


# 6. Dimensions Calculator
dimensions_target = r"(<div className=\"grid grid-cols-2 gap-3\">\s*<div>\s*<label className=\"text-\[9px\] font-bold text-slate-400 uppercase tracking-wider mb-1 block\">Inclusions</label>[\s\S]*?</div>\s*</div>)"

dimensions_ui = """\\1
                    {/* Dimensions Calculator */}
                    <div className="p-2.5 bg-white rounded-md border border-slate-200 shadow-sm mt-3">
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1.5">
                                <span className="text-[11px] bg-slate-100 p-0.5 rounded">📐</span> Auto-Calculate Quantity
                            </label>
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                L × W × Mult = <span className="text-[#0066CC]">Qty</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 mb-1 block uppercase tracking-wider">Length (L)</label>
                                <input 
                                    type="number"
                                    value={item.calcLength || ''}
                                    onChange={e => handleCalcChange('l', Number(e.target.value))}
                                    placeholder="0"
                                    className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-sm px-2 py-1.5 text-slate-700 font-medium outline-none focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 mb-1 block uppercase tracking-wider">Width (W)</label>
                                <input 
                                    type="number"
                                    value={item.calcWidth || ''}
                                    onChange={e => handleCalcChange('w', Number(e.target.value))}
                                    placeholder="0"
                                    className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-sm px-2 py-1.5 text-slate-700 font-medium outline-none focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 mb-1 block uppercase tracking-wider" title="Wastage or Area Multiplier">Multiplier (M)</label>
                                <input 
                                    type="number"
                                    value={item.calcMultiplier || 1}
                                    onChange={e => handleCalcChange('m', Number(e.target.value))}
                                    step="0.1"
                                    className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-sm px-2 py-1.5 text-slate-700 font-medium outline-none focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] transition-all"
                                />
                            </div>
                        </div>
                    </div>"""

content = re.sub(dimensions_target, dimensions_ui, content)


with open('components/BoqItemCard.tsx', 'w') as f:
    f.write(content)
