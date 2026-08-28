import re

with open('components/ClientPortal.tsx', 'r') as f:
    content = f.read()

# 1. Fix the Room Progress default from 65% to 0%.
# Also ensure if status is not 'execution', it strictly shows 0% and 'Pending Start'.
room_progress_pattern = r"const progress = roomData\[activeStage\]\?\.progress \?\? 65;"
room_progress_replacement = """const progress = roomData[activeStage]?.progress ?? 0;
            const isExecutionStarted = ['execution', 'work_paused', 'completed'].includes(context.status || '');
            const finalProgress = isExecutionStarted ? progress : 0;
            const finalStage = isExecutionStarted ? (roomData[activeStage]?.stage || 'Site Preparation') : 'Pending Execution Start';"""
content = re.sub(room_progress_pattern, room_progress_replacement, content)

progress_clamp_pattern = r"progress: Math\.min\(100, Math\.max\(10, progress\)\),"
progress_clamp_replacement = "progress: Math.min(100, Math.max(0, finalProgress)),"
content = re.sub(progress_clamp_pattern, progress_clamp_replacement, content)

stage_clamp_pattern = r"stage: roomData\[activeStage\]\?\.stage \|\| 'Execution & Assembly'"
stage_clamp_replacement = "stage: finalStage"
content = re.sub(stage_clamp_pattern, stage_clamp_replacement, content)


# 2. Overhaul the Overview UI completely
overview_tab_target = r"\{/\* Tab 1: OVERVIEW \*/\}[\s\S]*?\{/\* Tab 2: LIVE SITE FEED \*/\}"

new_overview = """{/* Tab 1: OVERVIEW */}
                    <AnimatePresence mode="wait">
                        {activeTab === 'overview' && (
                            <motion.div
                                key="overview"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="space-y-6"
                            >
                                {/* Sleek Hero Banner */}
                                <div className="bg-[#0f172a] rounded-2xl p-8 sm:p-10 shadow-lg relative overflow-hidden flex flex-col justify-end min-h-[280px]">
                                    <div className="absolute inset-0 opacity-40 mix-blend-overlay">
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/80 to-transparent z-10" />
                                        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#c2a265] rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 opacity-20 pointer-events-none" />
                                        {/* Optional background texture could go here */}
                                    </div>
                                    
                                    <div className="relative z-20 max-w-3xl space-y-4">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-white/10 text-[#c2a265] border border-white/10 backdrop-blur-md">
                                            <Sparkles className="w-3.5 h-3.5" />
                                            Client Portal
                                        </div>
                                        <h3 className="text-4xl font-black text-white tracking-tight leading-tight">
                                            {context.name}
                                        </h3>
                                        <p className="text-slate-300 text-sm leading-relaxed max-w-2xl font-light">
                                            {settings?.clientPortalConfig?.introMessage ||
                                              `Welcome to your dedicated project space by ${studioCompanyName}. Track live progress, review designs, and access your project's financial overview in one unified dashboard.`}
                                        </p>
                                    </div>
                                </div>

                                {/* Main Dashboard Grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    
                                    {/* Left Column (Wider) */}
                                    <div className="lg:col-span-2 space-y-6">
                                        
                                        {/* Execution Progress Overhaul */}
                                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                                            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 uppercase tracking-wide">
                                                    <Activity className="w-4 h-4 text-[#c2a265]" />
                                                    Execution Progress Matrix
                                                </h4>
                                                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold bg-slate-200/50 px-2 py-0.5 rounded-sm">Live Sync</span>
                                            </div>
                                            
                                            {roomProgressData.length > 0 ? (
                                                <div className="p-6">
                                                    {/* Overall Progress Summary */}
                                                    <div className="flex items-center gap-4 mb-8">
                                                        <div className="w-16 h-16 rounded-full border-[4px] border-slate-100 flex items-center justify-center relative">
                                                            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                                                                <path
                                                                    className="text-[#0066CC]"
                                                                    strokeDasharray={`${roomProgressData.reduce((acc, r) => acc + r.progress, 0) / (roomProgressData.length || 1)}, 100`}
                                                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    strokeWidth="4"
                                                                    strokeLinecap="round"
                                                                />
                                                            </svg>
                                                            <span className="text-sm font-black text-slate-800">
                                                                {Math.round(roomProgressData.reduce((acc, r) => acc + r.progress, 0) / (roomProgressData.length || 1))}%
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <h5 className="text-sm font-bold text-slate-900">Total Project Completion</h5>
                                                            <p className="text-xs text-slate-500 mt-0.5">Aggregated from room-by-room status</p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                                                        {roomProgressData.map((room, roomIdx) => (
                                                            <div key={room.id || `room-${roomIdx}`} className="group">
                                                                <div className="flex justify-between items-end mb-2">
                                                                    <div>
                                                                        <span className="font-bold text-slate-800 text-sm block">{room.name}</span>
                                                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{room.stage}</span>
                                                                    </div>
                                                                    <span className="font-bold text-[#c2a265] text-xs bg-amber-50 px-1.5 py-0.5 rounded">{room.progress}%</span>
                                                                </div>
                                                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-gradient-to-r from-[#c2a265] to-amber-400 rounded-full transition-all duration-1000 ease-out"
                                                                        style={{ width: `${room.progress}%` }}
                                                                    ></div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="p-12 text-center text-slate-400 text-sm">
                                                    No rooms defined in this project yet.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Column (Narrower Info Panels) */}
                                    <div className="space-y-6">
                                        
                                        {/* Project Details Card */}
                                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm">
                                            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                                                <h4 className="font-bold text-slate-900 text-xs flex items-center gap-2 uppercase tracking-wide">
                                                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                                    Project Information
                                                </h4>
                                            </div>
                                            <div className="p-5 space-y-4">
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Property Location</p>
                                                    <p className="font-medium text-slate-800 text-sm">{(context as any).clientAddress || (context as any).address || 'Location On File'}</p>
                                                </div>
                                                <div className="pt-3 border-t border-slate-100">
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Primary Client</p>
                                                    <p className="font-medium text-slate-800 text-sm">{context.clientName || 'Valued Client'}</p>
                                                    <p className="text-slate-500 text-xs mt-0.5">{context.clientEmail}</p>
                                                </div>
                                                <div className="pt-3 border-t border-slate-100">
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Current Status</p>
                                                    <span className="inline-block mt-1 px-2.5 py-1 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-sky-50 text-[#0066CC] border border-sky-100">
                                                        {context.status?.replace('_', ' ') || 'Initiation'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Quick Links / Actions */}
                                        <div className="bg-slate-900 rounded-2xl p-5 shadow-lg relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#0066CC]/20 rounded-full blur-[40px] pointer-events-none" />
                                            <h4 className="font-bold text-white text-xs uppercase tracking-wide mb-4 flex items-center gap-2">
                                                <FolderOpen className="w-4 h-4 text-sky-400" />
                                                Quick Access
                                            </h4>
                                            <div className="space-y-2">
                                                <button onClick={() => setActiveTab('feed')} className="w-full text-left px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/5 text-sm text-white font-medium transition-colors flex items-center justify-between group">
                                                    View Live Site Feed
                                                    <ChevronRight className="w-4 h-4 text-white/40 group-hover:text-white/80 transition-colors" />
                                                </button>
                                                <button onClick={() => setActiveTab('boq')} className="w-full text-left px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/5 text-sm text-white font-medium transition-colors flex items-center justify-between group">
                                                    Review Financials
                                                    <ChevronRight className="w-4 h-4 text-white/40 group-hover:text-white/80 transition-colors" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        {/* Tab 2: LIVE SITE FEED */}"""

content = re.sub(overview_tab_target, new_overview, content)

with open('components/ClientPortal.tsx', 'w') as f:
    f.write(content)
