const fs = require('fs');
let code = fs.readFileSync('components/WeeklyProgressReportTab.tsx', 'utf8');

const mainReturnRegex = /return \(\s*<div className="space-y-6 pb-20">[\s\S]*?\);\s*\};\s*$/;
const renderOpsConsoleRegex = /const renderOpsConsole = \(\) => \{[\s\S]*?(?=const renderCorrectionsPanel)/;

// Let's create the new top control bar
const newTopBar = `
    return (
        <div className="space-y-6 pb-20">
            {!isClientView && (
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
                            disabled={selectedWeek <= 1}
                            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-40"
                        >
                            <ChevronLeft className="w-5 h-5 text-indigo-950" />
                        </button>
                        <div className="min-w-[180px] text-center md:text-left">
                            <h4 className="font-bold text-indigo-950 text-sm">Week {currentPulse?.weekNumber || 1}</h4>
                            <p className="text-xs text-slate-500 font-semibold">{activeWeekRange.dateRange}</p>
                        </div>
                        <button 
                            onClick={() => setSelectedWeek(Math.min(weeksList.length, selectedWeek + 1))}
                            disabled={selectedWeek >= weeksList.length}
                            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-40"
                        >
                            <ChevronRight className="w-5 h-5 text-indigo-950" />
                        </button>
                        <button 
                            onClick={handleCreateNextWeek}
                            className="ml-2 flex items-center gap-1 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                        >
                            <Plus className="w-3 h-3" /> New
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {currentPulse && (
                            <div className="text-xs text-slate-500 flex flex-col items-end mr-4">
                                <span>Synced: {currentPulse.syncedAt ? new Date(currentPulse.syncedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Never'}</span>
                                <button onClick={handleManualSync} disabled={isSyncing} className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
                                    {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sliders className="w-3 h-3" />} Sync Now
                                </button>
                            </div>
                        )}
                        <button className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors">
                            <Eye className="w-4 h-4" /> Preview
                        </button>
                        <button className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-100 transition-colors">
                            <Share2 className="w-4 h-4" /> WhatsApp
                        </button>
                        <button 
                            onClick={togglePublish}
                            className={\`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors \${currentPulse?.publishedAt ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-indigo-600 text-white hover:bg-indigo-700'}\`}
                        >
                            {currentPulse?.publishedAt ? <><CheckCircle2 className="w-4 h-4" /> Published</> : 'Publish'}
                        </button>
                    </div>
                </div>
            )}
            <AnimatePresence mode="wait">
                <motion.div
                    key={selectedWeek}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {renderClientView()}
                    {!isClientView && renderCorrectionsPanel()}
                    {renderCorrectionModal()}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};
`;

code = code.replace(mainReturnRegex, newTopBar);
code = code.replace(renderOpsConsoleRegex, "");

fs.writeFileSync('components/WeeklyProgressReportTab.tsx', code);
console.log('Replaced main return and removed ops console');
