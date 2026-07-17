const fs = require('fs');
let content = fs.readFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', 'utf-8');

const search = `                                    <div key={\`drawing-\${drawing.id || idx}-\${idx}\`} className="grid grid-cols-12 py-4 border-b border-slate-200">
                                        <div className="col-span-5 text-slate-700 font-medium">{drawing.name}</div>
                                        <div className="col-span-2 text-slate-500">{currentRound.roundNumber} of 2</div>
                                        <div className={\`col-span-3 font-bold \${isApproved ? 'text-[#1e293b]' : 'text-slate-500'}\`}>
                                            {isApproved ? '● Approved' : \`○ \${currentRound.status.replace('_', ' ')}\`}
                                        </div>
                                        <div className="col-span-2 text-right text-slate-500">10 Jul</div>
                                    </div>`;

const replace = `                                    <div key={\`drawing-\${drawing.id || idx}-\${idx}\`} className="grid grid-cols-12 py-4 border-b border-slate-200">
                                        <div className="col-span-5 text-slate-700 font-medium">{drawing.name}</div>
                                        <div className="col-span-2 text-slate-500">Round {currentRound.roundNumber}</div>
                                        <div className={\`col-span-3 font-bold \${isApproved ? 'text-[#1e293b]' : 'text-slate-500'}\`}>
                                            {isApproved ? '● Approved' : \`○ \${currentRound.status.replace('_', ' ')}\`}
                                        </div>
                                        <div className="col-span-2 text-right text-slate-500">{currentRound.dateSent ? new Date(currentRound.dateSent).toLocaleDateString('en-IN', {day:'numeric', month:'short'}) : 'Pending'}</div>
                                    </div>`;

content = content.replace(search, replace);
fs.writeFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', content);
