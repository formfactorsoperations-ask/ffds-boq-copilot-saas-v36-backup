with open('components/OperationsTab.tsx', 'r') as f:
    content = f.read()

target = """    return (
        <div className="space-y-6">
            <div className="flex justify-end"> 
                <button 
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-700 transition-all text-sm"
                >
                    <FileSpreadsheetIcon className="w-4 h-4" /> Import Excel Option
                </button>
            </div>

            <TierManager
                tiers={tiers}
                setTiers={setTiers}
                activeTierId={activeTierId}
                setActiveTierId={setActiveTierId}
                projectContext={projectContext}
                setProjectContext={setProjectContext}
                setActiveTab={setActiveTab}
            />"""

replacement = """    return (
        <div className="space-y-6">
            <TierManager
                tiers={tiers}
                setTiers={setTiers}
                activeTierId={activeTierId}
                setActiveTierId={setActiveTierId}
                projectContext={projectContext}
                setProjectContext={setProjectContext}
                setActiveTab={setActiveTab}
                onImportClick={() => setIsImportModalOpen(true)}
            />"""

if target in content:
    with open('components/OperationsTab.tsx', 'w') as f:
        f.write(content.replace(target, replacement))
    print("Success")
else:
    print("Failed to find target")
