const fs = require('fs');
let code = fs.readFileSync('components/WeeklyProgressReportTab.tsx', 'utf8');

const newNote = `                    {/* Studio Notes */}
                    {!isClientView && currentPulse?.status !== 'published' ? (
                        <div className="mt-8 pt-8 border-t border-slate-200">
                            <h3 className="text-[11px] font-bold text-[#5a6577] uppercase tracking-widest mb-4">Studio Notes (Optional)</h3>
                            <textarea
                                className="w-full text-sm text-[#1a2332] leading-relaxed whitespace-pre-wrap font-sans border border-slate-300 rounded p-4 min-h-[100px] focus:outline-none focus:border-[#d8b87e] bg-slate-50/50"
                                value={currentPulse.studioNotes?.general || ''}
                                onChange={e => updateCurrentPulse(p => ({
                                    ...p,
                                    studioNotes: { ...(p.studioNotes || {}), general: e.target.value }
                                }))}
                                placeholder="Add an optional note from the studio here..."
                            />
                        </div>
                    ) : (
                        currentPulse?.studioNotes?.general && (
                            <div className="mt-8 pt-8 border-t border-slate-200">
                                <h3 className="text-[11px] font-bold text-[#5a6577] uppercase tracking-widest mb-4">Studio Note</h3>
                                <div className="text-sm text-[#1a2332] leading-relaxed whitespace-pre-wrap font-sans bg-slate-50 p-4 rounded-lg">
                                    {currentPulse.studioNotes.general}
                                </div>
                            </div>
                        )
                    )}`;

code = code.replace(
    /\{\/\* Upcoming Focus \*\/\}/,
    newNote + '\n\n                    {/* Upcoming Focus */}'
);

fs.writeFileSync('components/WeeklyProgressReportTab.tsx', code);
console.log('Patched studio note');
