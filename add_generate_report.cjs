const fs = require('fs');
let content = fs.readFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', 'utf-8');

const importSearch = `import { formatCurrency, formatINR } from '../lib/utils';`;
const importReplace = `import { formatCurrency, formatINR } from '../lib/utils';
import { generateComprehensiveWeeklyReport } from '../services/geminiService';`;

content = content.replace(importSearch, importReplace);

const loaderSearch = `import { Calendar, ChevronLeft, ChevronRight, Share2, Printer, Eye, Sliders, MessageCircle, Wand2, Plus, CheckCircle2, Copy } from 'lucide-react';`;
const loaderReplace = `import { Calendar, ChevronLeft, ChevronRight, Share2, Printer, Eye, Sliders, MessageCircle, Wand2, Plus, CheckCircle2, Copy, Loader2 } from 'lucide-react';`;

content = content.replace(loaderSearch, loaderReplace);

const stateSearch = `    const [activeViewMode, setActiveViewMode] = useState<'ops' | 'client'>('ops');`;
const stateReplace = `    const [activeViewMode, setActiveViewMode] = useState<'ops' | 'client'>('ops');
    const [isGenerating, setIsGenerating] = useState(false);`;

content = content.replace(stateSearch, stateReplace);

const funcSearch = `    // Render Ops Console`;
const funcReplace = `    const handleRegenerateBriefing = async () => {
        setIsGenerating(true);
        try {
            const financialSummary = \`Design Advances: \${countCleared(designAdvances)} of \${designAdvances.length} cleared. Execution Advances: \${countCleared(execAdvances)} of \${execAdvances.length} cleared.\`;
            const designSummary = \`Drawings Approved: \${drawingsApproved}. With Client: \${drawingsWithClient}. In Revision: \${drawingsInRevision}. Total: \${totalDrawings}. Design completion: \${designCompletionPct}%\`;
            
            const siteProgressArr = (projectContext.rooms || []).map(r => \`\${r.name}: \${currentPulse?.roomProgress?.[r.name] || 0}%\`);
            const executionSummary = \`Room Progress: \${siteProgressArr.join(', ')}\`;
            
            const decisionsSummary = \`Governance T&C Ack: \${govData.tcAck || 'Pending'}, Execution Signed: \${govData.executionSigned || 'Pending'}, BOQ Baseline: \${govData.boqBaseline}\`;
            
            const summary = await generateComprehensiveWeeklyReport(
                projectContext,
                selectedWeek,
                activeWeekRange.dateRange,
                financialSummary,
                designSummary,
                executionSummary,
                decisionsSummary
            );
            
            if (summary && summary.trim().length > 0) {
                updateCurrentPulse(p => ({ ...p, executiveBriefing: summary }));
            }
        } catch (e) {
            console.error("Failed to generate briefing", e);
        } finally {
            setIsGenerating(false);
        }
    };

    // Render Ops Console`;

content = content.replace(funcSearch, funcReplace);

const btnSearch = `                            <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-2">
                                <Wand2 className="w-3.5 h-3.5" /> Regenerate
                            </button>`;
const btnReplace = `                            <button 
                                onClick={handleRegenerateBriefing}
                                disabled={isGenerating}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-2 disabled:opacity-50"
                            >
                                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                                {isGenerating ? 'Generating...' : 'Regenerate'}
                            </button>`;

content = content.replace(btnSearch, btnReplace);

fs.writeFileSync('/app/applet/components/WeeklyProgressReportTab.tsx', content);
