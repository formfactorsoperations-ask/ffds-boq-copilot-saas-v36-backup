const fs = require('fs');
let code = fs.readFileSync('components/WeeklyProgressReportTab.tsx', 'utf8');

const newExec = `                    {/* Executive Summary */}
                    <div>
                        <div className="flex justify-between items-end mb-6 border-b border-[#d8b87e] pb-2">
                            <h3 className="text-[11px] font-bold text-[#5a6577] uppercase tracking-widest">Executive Summary</h3>
                            {!isClientView && currentPulse?.status !== 'published' && (
                                <button 
                                    onClick={async () => {
                                        setIsGenerating(true);
                                        const draft = await draftWeeklyReportContent(currentPulse, projectContext, projectData);
                                        if (draft.executiveBriefing) {
                                            updateCurrentPulse(p => ({ ...p, executiveBriefing: draft.executiveBriefing }));
                                        }
                                        setIsGenerating(false);
                                    }}
                                    disabled={isGenerating}
                                    className="text-[10px] font-bold text-indigo-600 uppercase flex items-center gap-1 hover:underline"
                                >
                                    {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                    Auto-Draft Narrative
                                </button>
                            )}
                        </div>
                        
                        {!isClientView && currentPulse?.status !== 'published' ? (
                            <textarea
                                className="w-full text-[14px] text-[#1a2332] leading-relaxed whitespace-pre-wrap font-serif border border-dashed border-slate-300 rounded p-4 min-h-[120px] focus:outline-none focus:border-[#d8b87e] bg-slate-50/50"
                                value={currentPulse.executiveBriefing || ''}
                                onChange={e => updateCurrentPulse(p => ({ ...p, executiveBriefing: e.target.value }))}
                                placeholder="Write the executive summary here..."
                            />
                        ) : (
                            <div className="text-[14px] text-[#1a2332] leading-relaxed whitespace-pre-wrap font-serif">
                                {currentPulse.executiveBriefing || 'No executive summary provided for this week.'}
                            </div>
                        )}
                    </div>`;

code = code.replace(
    /\{\/\* Executive Summary \*\/\}[\s\S]*?<\/div>\s*<\/div>/,
    newExec
);

fs.writeFileSync('components/WeeklyProgressReportTab.tsx', code);
console.log('Patched executive briefing');
