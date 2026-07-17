const fs = require('fs');
let code = fs.readFileSync('components/WeeklyProgressReportTab.tsx', 'utf8');

const replacement = `
                                        {(projectContext.rooms || []).map((r, idx) => {
                                            const currentProg = currentPulse?.roomProgress?.[r.name] || 0;
                                            const prevPulse = weeksList.find(w => w.weekNumber === currentPulse.weekNumber - 1);
                                            const prevProg = prevPulse?.roomProgress?.[r.name] || 0;
                                            
                                            // Handle builder mode inputs
                                            const isBuilder = !isClientView && currentPulse?.status !== 'published';
                                            
                                            return (
                                                <tr key={\`client-room-\${idx}\`} className="hover:bg-slate-50/50">
                                                    <td className="px-5 py-4 font-medium text-slate-800">{r.name}</td>
                                                    <td className="px-5 py-4">
                                                        {isBuilder ? (
                                                            <div className="flex flex-col gap-2">
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
                                                                {currentProg < prevProg && (
                                                                    <input 
                                                                        type="text" 
                                                                        placeholder={\`Reason for decrease from \${prevProg}%...\`} 
                                                                        className="text-xs p-1.5 border border-red-300 bg-red-50 rounded"
                                                                    />
                                                                )}
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
`;

code = code.replace(
    /\{\(projectContext\.rooms \|\| \[\]\)\.map\(\(r, idx\) => \{[\s\S]*?\}\)\}/,
    replacement.trim()
);

fs.writeFileSync('components/WeeklyProgressReportTab.tsx', code);
