const fs = require('fs');
let code = fs.readFileSync('components/WeeklyProgressReportTab.tsx', 'utf8');

const newSiteProgress = `                    {/* Room Progress */}
                    {currentPulse.sectionVisibility.siteProgress && (
                        <div>
                            <h3 className="text-[11px] font-bold text-[#5a6577] uppercase tracking-widest mb-6 border-b border-[#d8b87e] pb-2">Site Progress By Room</h3>
                            <div className="overflow-hidden border border-slate-200 rounded-xl">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Room / Area</th>
                                            <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider w-1/3">Progress</th>
                                            <th className="px-5 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider text-right w-1/4">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {(projectContext.rooms || []).map((r, idx) => {
                                            const currentProg = currentPulse?.roomProgress?.[r.name] || 0;
                                            
                                            // Handle builder mode inputs
                                            const isBuilder = !isClientView && currentPulse?.status !== 'published';
                                            
                                            return (
                                                <tr key={\`client-room-\${idx}\`} className="hover:bg-slate-50/50">
                                                    <td className="px-5 py-4 font-medium text-slate-800">{r.name}</td>
                                                    <td className="px-5 py-4">
                                                        {isBuilder ? (
                                                            <div className="flex items-center gap-2">
                                                                <input 
                                                                    type="range" 
                                                                    min="0" max="100" step="5"
                                                                    value={currentProg}
                                                                    onChange={e => {
                                                                        const val = parseInt(e.target.value);
                                                                        updateCurrentPulse(p => ({
                                                                            ...p,
                                                                            roomProgress: { ...(p.roomProgress || {}), [r.name]: val }
                                                                        }));
                                                                    }}
                                                                    className="flex-1 accent-indigo-600"
                                                                />
                                                                <input 
                                                                    type="number"
                                                                    value={currentProg}
                                                                    onChange={e => {
                                                                        const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                                                                        updateCurrentPulse(p => ({
                                                                            ...p,
                                                                            roomProgress: { ...(p.roomProgress || {}), [r.name]: val }
                                                                        }));
                                                                    }}
                                                                    className="w-14 text-sm text-right bg-slate-50 border border-slate-200 rounded p-1"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-[#1e293b] rounded-full transition-all duration-500" style={{ width: \`\${currentProg}%\` }} />
                                                                </div>
                                                                <span className="text-xs font-bold text-slate-700 min-w-[2.5rem]">{currentProg}%</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-4 text-right">
                                                        <span className={\`text-xs font-medium px-2.5 py-1 rounded-full \${currentProg === 100 ? 'bg-green-100 text-green-700' : currentProg === 0 ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'}\`}>
                                                            {currentProg === 100 ? 'Completed' : currentProg === 0 ? 'Pending' : 'In Progress'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}`;

code = code.replace(
    /\{\/\* Room Progress \*\/\}[\s\S]*?(?=\{\/\* Studio Notes)/,
    newSiteProgress + '\n\n                    '
);

fs.writeFileSync('components/WeeklyProgressReportTab.tsx', code);
console.log('Patched room progress');
