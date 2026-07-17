const fs = require('fs');
let content = fs.readFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', 'utf-8');

const clientActionsReplace = `
                {currentPulse?.sectionVisibility.siteProgress && (
                    <div className="mb-12">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6">Site Progress By Room</h3>`;

const withClientActions = `
                {currentPulse?.manualActions && currentPulse.manualActions.length > 0 && (
                    <div className="mb-12">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6">Action Required From You</h3>
                        <div className="space-y-3">
                            {currentPulse.manualActions.map((action, idx) => (
                                <div key={\`client-action-\${action.id}-\${idx}\`} className="flex items-start gap-3 bg-amber-50/50 border border-amber-200/60 p-4 rounded-xl">
                                    <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    </div>
                                    <p className="text-[#1e293b] text-sm leading-relaxed">{action.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {currentPulse?.sectionVisibility.siteProgress && (
                    <div className="mb-12">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-6">Site Progress By Room</h3>`;

content = content.replace(clientActionsReplace, withClientActions);
fs.writeFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', content);
