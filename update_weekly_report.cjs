const fs = require('fs');
let content = fs.readFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', 'utf-8');

// Replace Ops View Site Progress
const opsSiteProgressSearch = `                        <div className="space-y-4">
                            {(projectContext.rooms || []).map((r, idx) => (
                                <div key={\`room-\${r.name || idx}-\${idx}\`} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                    <span className="font-bold text-slate-800 text-sm w-1/3">{r.name}</span>
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs text-slate-400">last wk 0%</span>
                                        <div className="flex items-center gap-2">
                                            <button className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600">-</button>
                                            <span className="font-bold text-sm w-12 text-center">0%</span>
                                            <button className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600">+</button>
                                        </div>
                                        <span className="text-xs font-bold text-slate-400 uppercase w-20">In Progress</span>
                                    </div>
                                </div>
                            ))}
                            {(!projectContext.rooms || projectContext.rooms.length === 0) && (
                                <div className="p-4 text-center text-slate-500 text-sm">No rooms defined in project context.</div>
                            )}
                        </div>`;

const opsSiteProgressReplace = `                        <div className="space-y-4">
                            {(projectContext.rooms || []).map((r, idx) => {
                                const currentProg = currentPulse?.roomProgress?.[r.name] || 0;
                                const prevPulse = weeksList.find(w => w.weekNumber === selectedWeek - 1);
                                const prevProg = prevPulse?.roomProgress?.[r.name] || 0;
                                return (
                                <div key={\`room-\${r.name || idx}-\${idx}\`} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                    <span className="font-bold text-slate-800 text-sm w-1/3">{r.name}</span>
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs text-slate-400">last wk {prevProg}%</span>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => updateCurrentPulse(p => ({
                                                    ...p,
                                                    roomProgress: {
                                                        ...(p.roomProgress || {}),
                                                        [r.name]: Math.max(0, currentProg - 5)
                                                    }
                                                }))}
                                                className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600">-</button>
                                            <span className="font-bold text-sm w-12 text-center">{currentProg}%</span>
                                            <button 
                                                onClick={() => updateCurrentPulse(p => ({
                                                    ...p,
                                                    roomProgress: {
                                                        ...(p.roomProgress || {}),
                                                        [r.name]: Math.min(100, currentProg + 5)
                                                    }
                                                }))}
                                                className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600">+</button>
                                        </div>
                                        <span className="text-xs font-bold text-slate-400 uppercase w-20">
                                            {currentProg === 100 ? 'Finished' : currentProg === 0 ? 'Not Started' : 'In Progress'}
                                        </span>
                                    </div>
                                </div>
                                );
                            })}
                            {(!projectContext.rooms || projectContext.rooms.length === 0) && (
                                <div className="p-4 text-center text-slate-500 text-sm">No rooms defined in project context.</div>
                            )}
                        </div>`;

content = content.replace(opsSiteProgressSearch, opsSiteProgressReplace);

// Replace Client View Site Progress
const clientSiteProgressSearch = `                {currentPulse?.sectionVisibility.siteProgress && (
                    <div className="mb-12">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6">This Week's Activity</h3>
                        <div className="w-full text-left text-[13px]">
                            <div className="grid grid-cols-12 py-3 border-b border-slate-200">
                                <div className="col-span-2 font-bold text-[#1e293b]">Mon 29</div>
                                <div className="col-span-10 text-slate-700">Material Procurement milestone payment received — with thanks.</div>
                            </div>
                            <div className="grid grid-cols-12 py-3 border-b border-slate-200">
                                <div className="col-span-2 font-bold text-[#1e293b]">Tue 30</div>
                                <div className="col-span-10 text-slate-700">Kitchen Detail Drawing approved (Round 2 of 2).</div>
                            </div>
                            <div className="grid grid-cols-12 py-3 border-b border-slate-200">
                                <div className="col-span-2 font-bold text-[#1e293b]">Thu 2</div>
                                <div className="col-span-10 text-slate-700">Living & Dining finishing work completed on site.</div>
                            </div>
                        </div>

                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6 mt-12">Design Velocity</h3>
                        <div className="grid grid-cols-4 gap-4 mb-12">
                            <div className="border border-slate-200 p-6 bg-white">
                                <div className="text-3xl font-bold text-[#1e293b] tracking-tight">8 / 8</div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-2 leading-tight">GFC Drawings<br/>Issued</div>
                                <div className="text-xs text-slate-400 mt-1">complete</div>
                            </div>
                            <div className="border border-slate-200 p-6 bg-white">
                                <div className="text-3xl font-bold text-[#1e293b] tracking-tight">3.1 d</div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-2 leading-tight">Studio Turnaround</div>
                                <div className="text-xs text-slate-400 mt-1">issue → revision, avg</div>
                            </div>
                            <div className="border border-slate-200 p-6 bg-white">
                                <div className="text-3xl font-bold text-[#1e293b] tracking-tight">5.4 d</div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-2 leading-tight">Your Review Time</div>
                                <div className="text-xs text-slate-400 mt-1">issue → feedback, avg</div>
                            </div>
                            <div className="border border-slate-200 p-6 bg-white">
                                <div className="text-3xl font-bold text-[#1e293b] tracking-tight">45</div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-2 leading-tight">Revisions Handled</div>
                                <div className="text-xs text-slate-400 mt-1">since project start</div>
                            </div>
                        </div>

                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6">Progress By Category</h3>
                        <div className="w-full text-left text-[13px]">
                            <div className="grid grid-cols-12 pb-3 border-b border-[#1e293b] font-bold uppercase tracking-widest text-[10px] text-[#1e293b]">
                                <div className="col-span-5">Category</div>
                                <div className="col-span-3 text-right">Rooms Covered</div>
                                <div className="col-span-2 text-right">Progress</div>
                                <div className="col-span-2 text-right">Status</div>
                            </div>
                            <div className="grid grid-cols-12 py-4 border-b border-slate-200">
                                <div className="col-span-5 text-slate-700">Carpentry & wardrobes</div>
                                <div className="col-span-3 text-right text-slate-700">3 of 3</div>
                                <div className="col-span-2 text-right font-bold text-[#1e293b]">100%</div>
                                <div className="col-span-2 text-right font-bold text-[#1e293b]">● Finished</div>
                            </div>
                            <div className="grid grid-cols-12 py-4 border-b border-slate-200">
                                <div className="col-span-5 text-slate-700">Modular kitchen</div>
                                <div className="col-span-3 text-right text-slate-700">1 of 1</div>
                                <div className="col-span-2 text-right font-bold text-[#1e293b]">85%</div>
                                <div className="col-span-2 text-right text-slate-500">○ Counter installation</div>
                            </div>
                        </div>
                    </div>
                )}`;

const clientSiteProgressReplace = `                {currentPulse?.sectionVisibility.siteProgress && (
                    <div className="mb-12">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6">Site Progress By Room</h3>
                        <div className="w-full text-left text-[13px]">
                            <div className="grid grid-cols-12 pb-3 border-b border-[#1e293b] font-bold uppercase tracking-widest text-[10px] text-[#1e293b]">
                                <div className="col-span-5">Room / Area</div>
                                <div className="col-span-3 text-right">Weekly Change</div>
                                <div className="col-span-2 text-right">Progress</div>
                                <div className="col-span-2 text-right">Status</div>
                            </div>
                            {(projectContext.rooms || []).map((r, idx) => {
                                const currentProg = currentPulse?.roomProgress?.[r.name] || 0;
                                const prevPulse = weeksList.find(w => w.weekNumber === selectedWeek - 1);
                                const prevProg = prevPulse?.roomProgress?.[r.name] || 0;
                                const diff = currentProg - prevProg;
                                
                                return (
                                    <div key={\`client-room-\${r.name || idx}-\${idx}\`} className="grid grid-cols-12 py-4 border-b border-slate-200">
                                        <div className="col-span-5 text-slate-700 font-medium">{r.name}</div>
                                        <div className="col-span-3 text-right text-slate-500">
                                            {diff > 0 ? \`+\${diff}%\` : diff < 0 ? \`\${diff}%\` : '-'}
                                        </div>
                                        <div className="col-span-2 text-right font-bold text-[#1e293b]">{currentProg}%</div>
                                        <div className={\`col-span-2 text-right \${currentProg === 100 ? 'font-bold text-[#1e293b]' : 'text-slate-500'}\`}>
                                            {currentProg === 100 ? '● Finished' : currentProg === 0 ? '○ Not Started' : '○ In Progress'}
                                        </div>
                                    </div>
                                );
                            })}
                            {(!projectContext.rooms || projectContext.rooms.length === 0) && (
                                <div className="py-4 text-center text-slate-500">No rooms defined in project context.</div>
                            )}
                        </div>
                    </div>
                )}`;

content = content.replace(clientSiteProgressSearch, clientSiteProgressReplace);

fs.writeFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', content);
