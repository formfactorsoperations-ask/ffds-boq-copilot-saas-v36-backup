import re

with open('components/BoqItemCard.tsx', 'r') as f:
    content = f.read()

# Add new imports
if 'AnimatePresence' not in content:
    content = content.replace("import { motion } from 'framer-motion';", "import { motion, AnimatePresence } from 'framer-motion';\nimport { TrendingUp, Coins, Tag, ChevronDown, ChevronUp, AlignLeft, Info, Sparkles, AlertCircle, Percent } from 'lucide-react';")

# 1. Advanced Settings Animation
advanced_settings_pattern = r"\{/\* Advanced Settings \*/\}\s*\{isAdvancedOpen && \(\s*<div className=\"mb-4 p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-3 shadow-inner\">"
advanced_settings_replacement = """{/* Advanced Settings */}
            <AnimatePresence>
            {isAdvancedOpen && (
                <MotionDiv 
                    initial={{height: 0, opacity: 0, marginTop: 0}} 
                    animate={{height: 'auto', opacity: 1, marginTop: 16}} 
                    exit={{height: 0, opacity: 0, marginTop: 0}} 
                    transition={{duration: 0.2}} 
                    className="overflow-hidden"
                >
                <div className="mb-2 p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-4 shadow-inner relative">"""

content = re.sub(advanced_settings_pattern, advanced_settings_replacement, content)

# Close the motion div for advanced settings
advanced_close_pattern = r"                    \}\s*</div>\s*\)\}"
advanced_close_replacement = """                    }
                </div>
                </MotionDiv>
            )}
            </AnimatePresence>"""
content = re.sub(advanced_close_pattern, advanced_close_replacement, content)

# 2. Redesign the hover settings button for the new advanced setting toggle
hover_button_pattern = r"<MotionButton whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={\(\) => setIsAdvancedOpen\(!isAdvancedOpen\)} className={`p-1.5 rounded-md shadow-sm border transition-colors \${isAdvancedOpen \? 'bg-sky-50 text-\[#0066CC\] border-sky-200' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'}`} title=\"Advanced Settings\">\s*<span className=\"text-xs font-bold px-1\">⚙️</span>\s*</MotionButton>"
hover_button_replacement = """<MotionButton whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className={`p-1.5 rounded-md shadow-sm border transition-colors flex items-center justify-center ${isAdvancedOpen ? 'bg-[#0066CC] text-white border-[#0066CC]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-[#0066CC]'}`} title="Advanced Settings">
                {isAdvancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </MotionButton>"""
content = re.sub(hover_button_pattern, hover_button_replacement, content)

# 3. Enhance the Footer (Bento Style) -> Premium Financials Bar
footer_pattern = r"\{/\* Financials & Quantity Footer \(Bento Style\) \*/\}[\s\S]*?(?=</MotionDiv>)"

new_footer = """{/* Premium Financials Footer */}
        <div className="bg-gradient-to-r from-slate-50 to-white border-t border-slate-100 p-3 px-4 flex flex-wrap items-center justify-between gap-4 relative overflow-hidden">
            
            {/* Visual Profit Progress Bar Background (Subtle) */}
            <div className="absolute bottom-0 left-0 h-0.5 bg-slate-100 w-full">
                <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: `${Math.min(100, Math.max(0, (sellPrice - (item.materials + item.labor)) / sellPrice * 100))}%` }} 
                    className="h-full bg-emerald-400"
                    transition={{ duration: 1, ease: "easeOut" }}
                />
            </div>

            {/* Rates Area */}
            <div className="flex items-center gap-5 relative z-10">
                <div className="group/cost cursor-help">
                     <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                        <Coins className="w-2.5 h-2.5" /> Base Cost
                     </div>
                     <div className="font-semibold text-slate-600 text-xs transition-colors group-hover/cost:text-slate-900">{formatCurrency(item.materials + item.labor)}</div>
                </div>
                <div className="w-px h-6 bg-slate-200"></div>
                <div className="group/margin">
                     <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                        <TrendingUp className="w-2.5 h-2.5 text-emerald-500" /> Margin
                     </div>
                     <div className="flex items-center gap-1.5 font-bold text-emerald-600 text-xs">
                        <EditableField 
                            value={item.margin.toFixed(1)} 
                            onChange={v => onUpdate(item.id, 'marginOverride', v)} 
                            onBlur={() => {}}
                            inputType="number"
                            className="w-12 text-center bg-white border border-emerald-200 hover:border-emerald-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded py-0.5 shadow-sm transition-all"
                        />
                        <span className="text-[10px] text-emerald-500/70">%</span>
                     </div>
                </div>
                <div className="w-px h-6 bg-slate-200"></div>
                <div className="group/sell">
                     <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                        <Tag className="w-2.5 h-2.5" /> Sell Rate
                     </div>
                     <div className="flex items-center gap-2">
                        <div className="font-bold text-slate-800 text-xs group-hover/sell:text-[#0066CC] transition-colors">{formatCurrency(sellPrice)}</div>
                        {/* Profit Tag */}
                        <div className="hidden sm:flex items-center gap-0.5 text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold border border-emerald-100" title="Profit per item">
                            +{formatCurrency(sellPrice - (item.materials + item.labor))}
                        </div>
                     </div>
                </div>
            </div>

            {/* Total Area */}
            <div className="flex items-center gap-4 bg-white py-1.5 px-3 rounded-lg border border-slate-200 shadow-sm relative z-10 transition-transform hover:scale-[1.02] hover:shadow-md duration-200">
                <div className="flex items-center gap-2 pr-3 border-r border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Qty</span>
                    <div className="flex items-center gap-1">
                        <EditableField 
                            value={item.qty}
                            onChange={v => onUpdate(item.id, 'qty', v)}
                            onBlur={() => {}}
                            inputType="number"
                            className="w-12 font-bold text-sm bg-sky-50/50 border border-transparent hover:border-sky-200 focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] focus:bg-white rounded text-center text-[#0066CC] py-0.5 transition-all shadow-inner"
                        />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.unit}</span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[9px] font-bold uppercase text-slate-400 tracking-widest mb-0.5">Total Value</div>
                    <motion.div 
                        key={totalLineItem}
                        initial={{ scale: 1.1, color: '#0066CC' }}
                        animate={{ scale: 1, color: '#0f172a' }}
                        transition={{ duration: 0.3 }}
                        className="font-black text-lg text-slate-900 tracking-tight leading-none"
                    >
                        {formatCurrency(totalLineItem)}
                    </motion.div>
                </div>
            </div>
        </div>
    """

content = re.sub(footer_pattern, new_footer, content)

with open('components/BoqItemCard.tsx', 'w') as f:
    f.write(content)
