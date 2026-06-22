import fs from 'fs';

let text = fs.readFileSync('components/Dashboard.tsx', 'utf-8');

const startMarker = '{/* CONDENSED HERO HEADER STRIP */}';
const endMarker = '{/* Blast Radius Network (Full Width or part of another grid) */}';
const startIndex = text.indexOf(startMarker);
const endIndex = text.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.log("MARKERS NOT FOUND");
    process.exit(1);
}

let newText = text.substring(0, startIndex);

const replacement = `{/* LIVE MARQUEE AT TOP */}
            <div className="bg-[#0f172a] text-slate-300 py-1.5 px-4 rounded-t-2xl md:rounded-t-[2rem] text-xs font-medium tracking-wide flex items-center shadow-inner mt-4 mx-0 md:mx-4 relative overflow-hidden">
                <div className="flex items-center gap-2 mr-4 shrink-0 relative z-10 bg-[#0f172a] pr-4">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-bold text-emerald-400">LIVE</span>
                </div>
                <div className="flex-1 overflow-hidden">
                    <LiveMarquee items={feedItems} onNavigate={setActiveTab} dark={true} />
                </div>
            </div>

            {/* CONDENSED HERO HEADER STRIP */}
            <div className="bg-white rounded-b-2xl md:rounded-b-[2rem] p-6 border border-slate-200/60 shadow-sm flex flex-col gap-6 mx-0 md:mx-4 mb-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="text-xs text-slate-500 mb-1 font-medium tracking-wide">
                            All Projects > <span className="text-slate-900">{projectContext.name || 'Unnamed Project'}</span>
                        </div>
                        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            {projectContext.name || 'Unnamed Project'}
                        </h1>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full text-[10px] font-bold text-slate-600 flex items-center gap-1.5">
                                <span className="text-indigo-600">👤</span> {projectContext.clientName || 'No Client'}
                            </span>
                            <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full text-[10px] font-bold text-slate-600 flex items-center gap-1.5">
                                <span className="text-orange-500">🏠</span> {projectContext.config || 'N/A'} • {area} sqft
                            </span>
                            <span className="px-2.5 py-1 bg-slate-900 text-white rounded-full text-[10px] font-bold flex items-center gap-1.5 shadow-sm">
                                <span className="text-yellow-400">🏆</span> Client-BOQ • {(projectContext.createdAt || new Date().toISOString()).substring(0, 10)}
                            </span>
                        </div>
                    </div>

                    {/* PRIMARY CTA FOR CURRENT LIFECYCLE STAGE */}
                    <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                        <button className="px-4 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold rounded-full shadow-sm transition-colors flex items-center gap-1.5">
                            ↗ Share update
                        </button>
                        {projectContext.status === 'work_paused' && (
                            <button
                                onClick={async () => {
                                    setProjectContext((prev: any) => ({...prev, status: 'execution'}));
                                    if (projectId && db) {
                                        await updateDoc(doc(db, 'projects', projectId), { status: 'execution' }).catch(() => {});
                                    }
                                }}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-full shadow-sm transition-colors"
                            >
                                Resume Project
                            </button>
                        )}
                        {currentStage === 'pre_sales' && (
                            <button
                                onClick={() => advanceLifecycle('design', 'won')}
                                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5"
                            >
                                Start Design Phase
                            </button>
                        )}
                        {currentStage === 'design' && (
                            <button
                                onClick={() => advanceLifecycle('execution', 'execution')}
                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5"
                            >
                                Start Execution Phase 🚀
                            </button>
                        )}
                        {currentStage === 'execution' && (
                            <button
                                onClick={() => advanceLifecycle('handover', 'execution')}
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5"
                            >
                                Begin Handover 🔑
                            </button>
                        )}
                        {currentStage === 'handover' && (
                            <button
                                onClick={() => advanceLifecycle('completed', 'completed')}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-full shadow-sm transition-all flex items-center gap-1.5"
                            >
                                Complete Project 🔐
                            </button>
                        )}
                        {currentStage === 'completed' && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-full text-xs font-bold text-emerald-700">
                                ✓ Completed
                            </div>
                        )}
                    </div>
                </div>

                {/* PHASE STEPPER */}
                <div className="w-full pt-6 border-t border-slate-100 relative mt-2">
                    <div className="absolute top-[48px] left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0">
                        <div className="h-full bg-emerald-600 transition-all duration-700 ease-in-out" 
                            style={{ width: currentStage === 'completed' ? '100%' : currentStage === 'handover' ? '100%' : currentStage === 'execution' ? '66%' : currentStage === 'design' ? '33%' : '0%' }}></div>
                    </div>
                    <div className="flex items-center justify-between relative z-10 px-4 md:px-12">
                        {[
                            { id: 'pre_sales', label: 'PRE-SALES', i: 1 },
                            { id: 'design', label: 'DESIGN', i: 2 },
                            { id: 'execution', label: 'EXECUTION', i: 3 },
                            { id: 'handover', label: 'HANDOVER', i: 4 }
                        ].map((phase, idx) => {
                            const isPast = ['completed', 'handover', 'execution', 'design'].includes(currentStage) && (
                                phase.id === 'pre_sales' || 
                                (phase.id === 'design' && ['completed', 'handover', 'execution'].includes(currentStage)) || 
                                (phase.id === 'execution' && ['completed', 'handover'].includes(currentStage)) ||
                                (phase.id === 'handover' && currentStage === 'completed')
                            );
                            const isActive = currentStage === phase.id;
                            
                            return (
                                <div key={phase.id} className="flex flex-col items-center gap-3 bg-white px-2">
                                    <div className={\`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors \${
                                        isActive ? 'bg-indigo-600 text-white shadow-md scale-110 ring-4 ring-indigo-50' : 
                                        isPast ? 'bg-emerald-600 text-white' : 
                                        'bg-white text-slate-400 border border-slate-200'
                                    }\`}>
                                        {isPast ? '✓' : phase.i}
                                    </div>
                                    <span className={\`text-[9px] md:text-[10px] font-bold uppercase tracking-widest \${isActive ? 'text-indigo-600' : isPast ? 'text-slate-800' : 'text-slate-400'}\`}>
                                        {phase.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Main Bento Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mx-0 md:mx-4">
                
                {/* LEFT COLUMN */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* QUICK ACTIONS */}
                    <motion.div variants={itemVariants} className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/60 shadow-sm">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                            <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Quick Actions</h2>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <button 
                                onClick={() => setActiveTab('comms-tracker')}
                                className="p-4 rounded-2xl border border-indigo-100 bg-indigo-600 hover:bg-indigo-700 text-white transition-all text-center group flex flex-col justify-center items-center gap-3 shadow-sm min-h-[110px]"
                            >
                                <div className="text-xl">💬</div>
                                <h3 className="font-semibold text-xs leading-tight">Update client feed</h3>
                            </button>
                            <button 
                                onClick={() => setActiveTab('materials')}
                                className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 transition-all text-center group flex flex-col justify-center items-center gap-3 shadow-sm min-h-[110px]"
                            >
                                <div className="text-xl text-emerald-500">✅</div>
                                <h3 className="font-semibold text-xs leading-tight">Log decision</h3>
                            </button>
                            <button 
                                onClick={() => { setSiteVisitType('site_visit'); setSiteVisitModalOpen(true); }}
                                className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 transition-all text-center group flex flex-col justify-center items-center gap-3 shadow-sm min-h-[110px]"
                            >
                                <div className="text-xl text-slate-800">🏗️</div>
                                <h3 className="font-semibold text-xs leading-tight">Log site visit</h3>
                            </button>
                            <button 
                                onClick={() => { setSiteVisitType('client_meeting'); setSiteVisitModalOpen(true); }}
                                className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 transition-all text-center group flex flex-col justify-center items-center gap-3 shadow-sm min-h-[110px]"
                            >
                                <div className="text-xl text-slate-800">📝</div>
                                <h3 className="font-semibold text-xs leading-tight">Log meeting + MoM</h3>
                            </button>
                        </div>
                    </motion.div>

                    {/* FINANCIALS & SCOPE */}
                    <motion.div variants={itemVariants} className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/60 shadow-sm">
                        <div className="flex items-center gap-2 mb-6">
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Financials & Scope</h3>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">CONTRACT VALUE</p>
                                <p className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 mb-1">{formatINR(displayContractValue)}</p>
                                {isExecution && (
                                    <span className="text-[9px] font-semibold text-emerald-600 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Contracted
                                    </span>
                                )}
                            </div>
                            <div className="px-4 border-l border-emerald-100 bg-emerald-50/30 rounded-r-xl">
                                <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-1">COLLECTED</p>
                                <p className="text-xl md:text-2xl font-bold tracking-tight text-emerald-600 mb-1">{formatINR(health.collected)}</p>
                                <p className="text-[9px] text-slate-500 leading-tight">
                                    Design {formatINR(health.designFee)} <br/> Exec {formatINR(health.collected - health.designFee)}
                                </p>
                            </div>
                            <div className="px-4 border-l border-slate-100">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">DUE NOW</p>
                                <p className="text-xl md:text-2xl font-bold tracking-tight text-emerald-600 mb-1">{formatINR(health.overdueAmount)}</p>
                                <p className="text-[9px] text-slate-500 loading-tight">No outstanding invoices</p>
                            </div>
                            <div className="px-4 border-l border-slate-100">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">UNBILLED</p>
                                <p className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 mb-1">{formatINR(health.unbilledAmount)}</p>
                                <p className="text-[9px] text-slate-500 loading-tight">Remaining to invoice</p>
                            </div>
                        </div>

                        {/* Progress Bar Container */}
                        <div className="mt-8">
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500" style={{ width: \`\${Math.min(100, (health.collected / displayContractValue) * 100 || 0)}%\` }}></div>
                            </div>
                            <div className="flex justify-between items-center mt-2">
                                <span className="text-[10px] text-slate-500">{Math.round((health.collected / displayContractValue) * 100) || 0}% collected</span>
                                <span className="text-[10px] text-slate-500">Payment ledger: <span className={health.isHealthy ? 'text-emerald-600 font-bold' : 'text-amber-500 font-bold'}>{health.isHealthy ? 'Healthy' : 'Attention'}</span></span>
                            </div>
                        </div>
                    </motion.div>

                    {/* PROJECT JOURNEY */}
                    <motion.div variants={itemVariants} className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/60 shadow-sm">
                        <div className="flex items-center gap-2 mb-6">
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Project Journey</h3>
                        </div>
                        
                        <div className="flex flex-col md:flex-row items-center gap-6">
                            <div className="text-4xl md:text-5xl font-light text-indigo-600 tracking-tighter">
                                {currentStage === 'completed' ? '100%' : currentStage === 'handover' ? '90%' : currentStage === 'execution' ? '63%' : '25%'}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-slate-900 mb-1">Overall completion • 25 of 34 steps</p>
                                <p className="text-xs text-slate-600 mb-3">Active phase: <span className="font-semibold">Phase {currentStage === 'execution' ? '5' : '4'} — {currentStage.charAt(0).toUpperCase() + currentStage.slice(1)}</span></p>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-600" style={{ width: \`\${currentStage === 'completed' ? 100 : currentStage === 'handover' ? 90 : currentStage === 'execution' ? 63 : 25}%\` }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 text-sm text-indigo-900">
                            <span className="font-bold">Next action:</span> {currentStage === 'execution' ? "Execution underway — schedule pre-handover walkthrough when site is substantially complete" : "Continue working on current phase items"}
                        </div>
                    </motion.div>

                    {/* OPS INTELLIGENCE (4 QUADRANTS) */}
                    <motion.div variants={itemVariants} className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/60 shadow-sm flex flex-col">
                        <div className="flex items-center gap-2 mb-6">
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Ops Intelligence</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Execution Velocity */}
                            <div className="p-5 border border-slate-100 rounded-2xl flex flex-col">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Execution Velocity</p>
                                <div className="text-3xl font-light text-indigo-600 tracking-tight mb-2">
                                    {velocityPct}%
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-auto">
                                    <TrendingUpIcon className="w-3.5 h-3.5 text-indigo-400" />
                                    {velocityDiff === 0 ? 'Exactly on baseline' : \`\${Math.abs(velocityDays)} days \${velocityDiff > 0 ? 'ahead of' : 'behind'} baseline\`}
                                </div>
                            </div>

                            {/* Cash Flow Risk */}
                            <div className="p-5 border border-slate-100 rounded-2xl flex flex-col">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Cash Flow Risk</p>
                                <div className={\`text-2xl font-bold tracking-tight mb-2 \${health.isHealthy ? 'text-emerald-600' : 'text-amber-500'}\`}>
                                    {health.isHealthy ? 'Healthy' : 'Elevated'}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-auto">
                                    Collections ahead of execution burn
                                </div>
                            </div>

                            {/* Margin Leakage */}
                            <div className="p-5 border border-slate-100 rounded-2xl flex flex-col">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Margin Leakage</p>
                                <div className={\`text-3xl font-light tracking-tight mb-4 \${marginLeakage > 0 ? 'text-rose-500' : 'text-emerald-600'}\`}>
                                    {marginLeakage > 0 ? \`-\${formatINR(marginLeakage)}\` : '₹0'}
                                </div>
                                <div className="mt-auto space-y-1.5 text-[10px] text-slate-500">
                                    <div className="flex justify-between items-center">
                                        <span>Idle labour risk</span>
                                        <span className="font-semibold text-slate-700">₹{idleLaborRisk}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span>Absorbed changes</span>
                                        <span className="font-semibold text-slate-700">₹{absorbedCost}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Material Pipeline */}
                            <div className="p-5 border border-slate-100 rounded-2xl flex flex-col cursor-pointer hover:border-slate-300 transition-colors" onClick={() => setActiveTab('materials')}>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Material Pipeline</p>
                                <div className="text-2xl font-bold tracking-tight text-emerald-600 mb-4 flex items-center gap-2">
                                    {sofSummary.frozen} Locked
                                </div>
                                <div className="mt-auto space-y-1.5 text-[10px] text-slate-500">
                                    <div className="flex justify-between items-center">
                                        <span>To select</span>
                                        <span className="font-semibold text-slate-700">{sofSummary.pending}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span>Pending signoff</span>
                                        <span className="font-semibold text-slate-700">{sofSummary.pendingSignoff}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span>Delayed</span>
                                        <span className="font-semibold text-rose-500">{sofSummary.delayed}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="space-y-6">
                    
                    {/* WHAT TO DO TODAY */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60">
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">WHAT TO DO TODAY</h3>
                        <div className="space-y-4">
                            {finalTodayItems.length === 0 ? (
                                <div className="text-center py-6 text-slate-500 text-sm">
                                    All clear! ✓
                                </div>
                            ) : (
                                finalTodayItems.map((item, idx) => (
                                    <div key={idx} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => setActiveTab(item.route)}>
                                        <div className="mt-0.5 text-amber-500 text-lg">
                                            {item.title.toLowerCase().includes('handover') ? '🔑' : '📄'}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-900 leading-snug">{item.title}</h4>
                                            <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                                            <button className="mt-2 text-xs font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg group-hover:bg-indigo-700 transition-colors shadow-sm">
                                                {item.btnText}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* SITE ACTIVITY */}
                    {isExecution && (
                        <div className="bg-white rounded-3xl p-0 shadow-sm border border-slate-200/60 overflow-hidden">
                            <SiteActivityWidget 
                                projectId={projectId || ''}
                                studioId={orgData?.tenantId || 'demo-tenant-01'}
                                projectContextName={projectContext.name}
                                studioSettings={orgData}
                                onOpenHistory={() => setShowSiteVisitHistory(true)}
                                onNavigateSettings={() => setActiveTab('settings')}
                            />
                        </div>
                    )}

                    {/* COMMS TRACKER */}
                    {projectId && (
                        <div className="bg-white rounded-3xl p-0 shadow-sm border border-slate-200/60 overflow-hidden">
                            <CommunicationTrackerWidget 
                                projectId={projectId} 
                                studioId={orgData?.tenantId || 'demo-tenant-01'} 
                                onClick={() => setActiveTab('comms-tracker')} 
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Blast`;

let finalText = newText + replacement + text.substring(endIndex + endMarker.length);
fs.writeFileSync('components/Dashboard.tsx', finalText);
console.log("Migration finished");
