const fs = require('fs');
let content = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

const hook = `  usePageHeader({
    badge: activeTier?.name || '',
    vitals: [
        { label: "ITEMS", value: String(activeTier?.boq?.length || 0) },
        { label: "ROOMS", value: String(rooms.length || 0) }
    ],
    views: (
        <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <button 
                onClick={() => setViewMode('interactive')}
                className={\`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all \${viewMode === 'interactive' ? 'bg-[#0066CC] text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}\`}
            >
                <Sparkles className="w-4 h-4" /> Focus Editor
            </button>
            <button 
                onClick={() => setViewMode('excel')}
                className={\`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all \${viewMode === 'excel' ? 'bg-sky-50 text-[#0055B3] shadow-inner' : 'text-slate-400 hover:text-slate-600'}\`}
            >
                <ListIcon className="w-4 h-4" /> Excel
            </button>
            <button 
                onClick={() => setViewMode('cards')}
                className={\`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all \${viewMode === 'cards' ? 'bg-sky-50 text-[#0055B3] shadow-inner' : 'text-slate-400 hover:text-slate-600'}\`}
            >
                <GridIcon className="w-4 h-4" /> Cards
            </button>
            <button 
                onClick={() => setViewMode('takeoff')}
                className={\`px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all \${viewMode === 'takeoff' ? 'bg-[#0066CC] text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}\`}
            >
                <ListIcon className="w-4 h-4" /> Plan Takeoff
            </button>
        </div>
    ),
    actions: (
        <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col items-end mr-2">
                <button 
                    onClick={handleManualSave}
                    disabled={isSaving}
                    className={\`px-4 py-1.5 text-xs border font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 \${isSaving ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'}\`}
                    title="Save current changes locally"
                >
                    {isSaving ? (
                        <>
                            <div className="w-4 h-4 border-2 border-slate-300 border-t-sky-600 rounded-full animate-spin"></div>
                            Saving...
                        </>
                    ) : (
                        <>
                            <CheckIcon className="w-4 h-4" /> Save Changes
                        </>
                    )}
                </button>
                <span className="text-[10px] text-slate-400 font-medium mt-1 pr-1 absolute translate-y-8">
                    {isSaving ? 'Syncing...' : \`All changes saved\`}
                </span>
            </div>

            <div className="relative self-start">
                <button
                    onClick={() => setIsGlobalMarkupOpen(!isGlobalMarkupOpen)}
                    className={\`p-2 bg-white border border-slate-200 text-slate-500 rounded-lg hover:text-[#0066CC] hover:border-sky-200 hover:shadow-md transition-all \${isGlobalMarkupOpen ? 'ring-2 ring-sky-200 border-sky-300 text-[#0066CC]' : ''}\`}
                    title="Set Global Margin"
                >
                    <CalculatorIcon className="w-4 h-4" />
                </button>
                {isGlobalMarkupOpen && (
                    <div className="absolute top-full right-0 mt-2 p-4 bg-white rounded-xl shadow-xl border border-slate-200 z-50 w-64 origin-top-right animate-in fade-in zoom-in duration-200">
                        <label className="block text-xs font-bold text-slate-700 mb-2 whitespace-normal break-words">Set global margin % for ALL items</label>
                        <input 
                            type="number" 
                            value={globalMarkupValue}
                            onChange={e => setGlobalMarkupValue(Number(e.target.value))}
                            className="w-full border border-slate-300 rounded-lg p-2 text-sm mb-3 focus:outline-none focus:border-[#0066CC]" 
                        />
                        <div className="flex justify-end gap-2 text-xs">
                            <button onClick={() => setIsGlobalMarkupOpen(false)} className="px-3 py-1.5 text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
                            <button onClick={handleApplyGlobalMarkup} className="px-3 py-1.5 bg-[#0066CC] text-white rounded-lg hover:bg-[#0055B3] font-bold shadow-sm">Apply All</button>
                        </div>
                    </div>
                )}
            </div>

            <button 
                onClick={() => setIsImportModalOpen(true)}
                className="px-3 py-1.5 bg-sky-50 border border-sky-200 text-[#0055B3] font-bold rounded-lg hover:bg-sky-100 hover:shadow-md transition-all text-xs flex items-center gap-2"
                title="Paste or upload items from Excel"
            >
                <ListIcon className="w-4 h-4" /> Import Excel
            </button>

            <button 
                onClick={handleExportExcelWithFormulas}
                className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 hover:shadow-md transition-all"
                title="Export Excel with Live Formulas"
            >
                <ExportIcon className="w-4 h-4" />
            </button>
        </div>
    )
  }, [activeTier?.name, activeTier?.boq?.length, rooms.length, viewMode, isSaving, isGlobalMarkupOpen, globalMarkupValue, handleManualSave, handleApplyGlobalMarkup, handleExportExcelWithFormulas]);`;

const returnIdx = content.indexOf('  if (!activeTier) return <div>Please select a proposal tier.</div>;');
if (returnIdx !== -1) {
    content = content.substring(0, returnIdx) + hook + '\n\n' + content.substring(returnIdx);
    fs.writeFileSync('components/StudioDashboard.tsx', content, 'utf8');
} else {
    console.log("Could not find return statment!");
}
