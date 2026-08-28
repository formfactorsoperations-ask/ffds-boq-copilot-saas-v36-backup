import re

with open('components/ClientPortal.tsx', 'r') as f:
    content = f.read()

# Define the target block to replace
target = r"\{activeTab === 'scope' && \(\s*<motion\.div\s*key=\"scope\".*?\{/\* Tab 8: FINANCIALS & INVOICES \*/\}"

# Define the new aesthetic
replacement = """{activeTab === 'scope' && (
                            <motion.div
                                key="scope"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm space-y-8">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-slate-100 pb-6">
                                        <div>
                                            <h3 className="font-black text-slate-900 text-xl tracking-tight flex items-center gap-3">
                                                <Layers className="w-5 h-5 text-amber-600" />
                                                Approved Scope of Work
                                            </h3>
                                            <p className="text-sm text-slate-500 mt-1 max-w-lg leading-relaxed">
                                                The finalized, itemized Bill of Quantities (BOQ) for your project. This document serves as the master reference for all execution deliverables.
                                            </p>
                                        </div>
                                        <div className="relative w-full sm:w-72">
                                            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                value={boqSearchQuery}
                                                onChange={(e) => setBoqSearchQuery(e.target.value)}
                                                placeholder="Search rooms or items..."
                                                className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all shadow-inner"
                                            />
                                        </div>
                                    </div>

                                    {Object.keys(boqByCategory).length === 0 ? (
                                        <div className="py-16 text-center">
                                            <div className="w-16 h-16 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center mx-auto mb-4">
                                                <FileText className="w-8 h-8 text-slate-300" />
                                            </div>
                                            <p className="font-bold text-slate-900 text-lg">No Items Found</p>
                                            <p className="text-slate-500 text-sm mt-1">Your formal BOQ has not been uploaded yet.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-8">
                                            {Object.entries(boqByCategory).map(([category, items]: [string, any]) => {
                                                const filteredItems = (items as any[]).filter((i: any) => 
                                                    !boqSearchQuery || 
                                                    i.item.toLowerCase().includes(boqSearchQuery.toLowerCase()) ||
                                                    (i.description && i.description.toLowerCase().includes(boqSearchQuery.toLowerCase())) ||
                                                    category.toLowerCase().includes(boqSearchQuery.toLowerCase())
                                                );

                                                if (filteredItems.length === 0) return null;

                                                return (
                                                    <div key={category} className="group">
                                                        <h4 className="font-black text-slate-900 text-sm uppercase tracking-widest mb-4 flex items-center gap-3">
                                                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                                            {category}
                                                            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-auto">
                                                                {filteredItems.length} items
                                                            </span>
                                                        </h4>
                                                        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                                                            <table className="w-full text-left border-collapse">
                                                                <thead>
                                                                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] uppercase tracking-wider font-black text-slate-500">
                                                                        <th className="px-5 py-3 w-16 text-center">#</th>
                                                                        <th className="px-5 py-3 w-1/3">Item / Description</th>
                                                                        <th className="px-5 py-3">Specification Details</th>
                                                                        <th className="px-5 py-3 w-24 text-right">Quantity</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100 bg-white">
                                                                    {filteredItems.map((item: any, idx: number) => (
                                                                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                                                            <td className="px-5 py-4 text-center text-xs font-bold text-slate-400">
                                                                                {(idx + 1).toString().padStart(2, '0')}
                                                                            </td>
                                                                            <td className="px-5 py-4 align-top">
                                                                                <p className="font-bold text-slate-900 text-sm">{item.item}</p>
                                                                            </td>
                                                                            <td className="px-5 py-4 align-top">
                                                                                {item.description ? (
                                                                                    <p className="text-slate-600 text-xs leading-relaxed max-w-prose">
                                                                                        {item.description}
                                                                                    </p>
                                                                                ) : (
                                                                                    <span className="text-slate-300 text-xs italic">No additional details</span>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-5 py-4 text-right align-top">
                                                                                <div className="inline-flex items-baseline gap-1 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                                                                                    <span className="font-black text-slate-900 text-sm">{item.qty}</span>
                                                                                    <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wide">{item.unit}</span>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* Tab 8: FINANCIALS & INVOICES */}"""

content = re.sub(target, replacement, content, flags=re.DOTALL)

with open('components/ClientPortal.tsx', 'w') as f:
    f.write(content)
