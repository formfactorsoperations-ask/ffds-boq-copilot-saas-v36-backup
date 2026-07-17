const fs = require('fs');
let content = fs.readFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', 'utf-8');

const searchRev = `                {currentPulse?.sectionVisibility.revisions && (
                    <div className="mb-12">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6">Revisions This Week</h3>
                        <div className="w-full text-left text-[13px]">
                            <div className="grid grid-cols-12 pb-3 border-b border-[#1e293b] font-bold uppercase tracking-widest text-[10px] text-[#1e293b]">
                                <div className="col-span-3">Drawing</div>
                                <div className="col-span-5">Change</div>
                                <div className="col-span-2">Category</div>
                                <div className="col-span-2 text-right">Charge</div>
                            </div>
                            <div className="grid grid-cols-12 py-4 border-b border-slate-200">
                                <div className="col-span-3 text-slate-700">Elevation — Master Bedroom</div>
                                <div className="col-span-5 text-slate-700">Wardrobe internal layout did not reflect the loft storage in the approved BOQ</div>
                                <div className="col-span-2 text-slate-500">Studio correction</div>
                                <div className="col-span-2 text-right text-slate-500">No charge</div>
                            </div>
                        </div>
                    </div>
                )}`;

const replaceRev = `                {currentPulse?.sectionVisibility.revisions && currentPulse?.revisions && currentPulse.revisions.length > 0 && (
                    <div className="mb-12">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6">Revisions This Week</h3>
                        <div className="w-full text-left text-[13px]">
                            <div className="grid grid-cols-12 pb-3 border-b border-[#1e293b] font-bold uppercase tracking-widest text-[10px] text-[#1e293b]">
                                <div className="col-span-3">Drawing</div>
                                <div className="col-span-5">Change</div>
                                <div className="col-span-2">Category</div>
                                <div className="col-span-2 text-right">Charge</div>
                            </div>
                            {currentPulse.revisions.map((rev, idx) => (
                                <div key={\`client-rev-\${rev.id}-\${idx}\`} className="grid grid-cols-12 py-4 border-b border-slate-200">
                                    <div className="col-span-3 text-slate-700 font-bold">{rev.drawing}</div>
                                    <div className="col-span-5 text-slate-700 pr-4">{rev.change}</div>
                                    <div className="col-span-2 text-slate-500">{rev.category}</div>
                                    <div className="col-span-2 text-right text-slate-500">{rev.charge}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}`;

content = content.replace(searchRev, replaceRev);

const searchSel = `                {currentPulse?.sectionVisibility.selections && (
                    <div className="mb-12">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6">Selections & Order Forms (SOF)</h3>
                        <div className="w-full text-left text-[13px]">
                            <div className="grid grid-cols-12 pb-3 border-b border-[#1e293b] font-bold uppercase tracking-widest text-[10px] text-[#1e293b]">
                                <div className="col-span-6">Category</div>
                                <div className="col-span-3">Selected</div>
                                <div className="col-span-3 text-right">Pending Your Selection</div>
                            </div>
                            <div className="grid grid-cols-12 py-4 border-b border-slate-200">
                                <div className="col-span-6 text-slate-700">Laminates & veneers</div>
                                <div className="col-span-3 text-slate-700">6 of 8</div>
                                <div className="col-span-3 text-right text-slate-500">2 — due 16 Jul</div>
                            </div>
                            <div className="grid grid-cols-12 py-4 border-b border-slate-200">
                                <div className="col-span-6 text-slate-700">Sanitaryware</div>
                                <div className="col-span-3 text-slate-700">0 of 4</div>
                                <div className="col-span-3 text-right text-slate-500">4 — due 18 Jul</div>
                            </div>
                        </div>
                    </div>
                )}`;

const replaceSel = `                {currentPulse?.sectionVisibility.selections && currentPulse?.selections && currentPulse.selections.length > 0 && (
                    <div className="mb-12">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6">Selections & Order Forms (SOF)</h3>
                        <div className="w-full text-left text-[13px]">
                            <div className="grid grid-cols-12 pb-3 border-b border-[#1e293b] font-bold uppercase tracking-widest text-[10px] text-[#1e293b]">
                                <div className="col-span-6">Category</div>
                                <div className="col-span-3">Selected</div>
                                <div className="col-span-3 text-right">Pending Your Selection</div>
                            </div>
                            {currentPulse.selections.map((sel, idx) => (
                                <div key={\`client-sel-\${sel.id}-\${idx}\`} className="grid grid-cols-12 py-4 border-b border-slate-200">
                                    <div className="col-span-6 text-slate-700 font-bold">{sel.category}</div>
                                    <div className="col-span-3 text-slate-700">{sel.selectedCount} of {sel.totalCount}</div>
                                    <div className="col-span-3 text-right text-slate-500">{sel.pendingText}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}`;

content = content.replace(searchSel, replaceSel);

fs.writeFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', content);
