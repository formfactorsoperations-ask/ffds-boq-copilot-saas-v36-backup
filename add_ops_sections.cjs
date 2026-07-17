const fs = require('fs');
let content = fs.readFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', 'utf-8');

const search = `                    {/* Section Visibility */}`;

const replace = `                    {/* Revisions (Editable) */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60">
                        <div className="flex justify-between items-center mb-6">
                            <h4 className="font-bold text-slate-800 text-sm tracking-wide uppercase">Revisions</h4>
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-md uppercase tracking-wider">Editable</span>
                        </div>
                        <div className="space-y-4">
                            {currentPulse?.revisions?.map((rev, idx) => (
                                <div key={\`rev-\${rev.id}-\${idx}\`} className="flex flex-col gap-2 pb-3 border-b border-slate-100">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-slate-800">{rev.drawing}</span>
                                        <button 
                                            onClick={() => updateCurrentPulse(p => ({
                                                ...p,
                                                revisions: p.revisions?.filter(r => r.id !== rev.id)
                                            }))}
                                            className="text-xs font-bold text-red-500 hover:text-red-700"
                                        >Remove</button>
                                    </div>
                                    <div className="text-sm text-slate-600">{rev.change}</div>
                                    <div className="flex gap-2">
                                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{rev.category}</span>
                                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{rev.charge}</span>
                                    </div>
                                </div>
                            ))}
                            <button 
                                onClick={() => {
                                    const drawing = prompt("Drawing name:");
                                    if (!drawing) return;
                                    const change = prompt("Change description:");
                                    const category = prompt("Category (e.g. Studio correction, Client change):");
                                    const charge = prompt("Charge (e.g. No charge, Chargeable):");
                                    updateCurrentPulse(p => ({
                                        ...p,
                                        revisions: [...(p.revisions || []), { id: 'rev-'+Date.now(), drawing, change: change || '', category: category || '', charge: charge || '' }]
                                    }));
                                }}
                                className="text-indigo-600 text-sm font-bold flex items-center gap-2 hover:text-indigo-800"
                            >
                                <Plus className="w-4 h-4" /> Add Revision
                            </button>
                        </div>
                    </div>

                    {/* Selections (Editable) */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60">
                        <div className="flex justify-between items-center mb-6">
                            <h4 className="font-bold text-slate-800 text-sm tracking-wide uppercase">Selections (SOF)</h4>
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-md uppercase tracking-wider">Editable</span>
                        </div>
                        <div className="space-y-4">
                            {currentPulse?.selections?.map((sel, idx) => (
                                <div key={\`sel-\${sel.id}-\${idx}\`} className="flex flex-col gap-2 pb-3 border-b border-slate-100">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-slate-800">{sel.category}</span>
                                        <button 
                                            onClick={() => updateCurrentPulse(p => ({
                                                ...p,
                                                selections: p.selections?.filter(s => s.id !== sel.id)
                                            }))}
                                            className="text-xs font-bold text-red-500 hover:text-red-700"
                                        >Remove</button>
                                    </div>
                                    <div className="text-sm text-slate-600">{sel.selectedCount} of {sel.totalCount} selected</div>
                                    <div className="text-sm text-slate-500">{sel.pendingText}</div>
                                </div>
                            ))}
                            <button 
                                onClick={() => {
                                    const category = prompt("Category (e.g. Laminates):");
                                    if (!category) return;
                                    const selectedCount = parseInt(prompt("Selected count:") || "0");
                                    const totalCount = parseInt(prompt("Total count:") || "0");
                                    const pendingText = prompt("Pending text (e.g. 2 - due 16 Jul):");
                                    updateCurrentPulse(p => ({
                                        ...p,
                                        selections: [...(p.selections || []), { id: 'sel-'+Date.now(), category, selectedCount, totalCount, pendingText: pendingText || '' }]
                                    }));
                                }}
                                className="text-indigo-600 text-sm font-bold flex items-center gap-2 hover:text-indigo-800"
                            >
                                <Plus className="w-4 h-4" /> Add Selection Status
                            </button>
                        </div>
                    </div>

                    {/* Section Visibility */}`;

content = content.replace(search, replace);
fs.writeFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', content);
