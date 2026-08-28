with open('components/ProjectWorkspace.tsx', 'r') as f:
    content = f.read()

# Row 2 Fix
target_row2 = """                      className={`flex items-center gap-1 sm:gap-1.5 transition-all duration-200 cursor-pointer shrink-0 py-1.5 px-3 rounded-lg ${
                        isSelectedStage
                          ? 'bg-[#0066CC]/90 text-white font-bold shadow-md shadow-sky-600/20 backdrop-blur-md border border-white/20'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >"""

replacement_row2 = """                      className={`relative flex items-center gap-1 sm:gap-1.5 transition-all duration-300 cursor-pointer shrink-0 py-1.5 px-3 rounded-lg z-0 ${
                        isSelectedStage
                          ? 'text-white font-bold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 tracking-normal hover:tracking-[0.01em]'
                      }`}
                    >
                      {isSelectedStage && (
                          <motion.div
                              layoutId="activePhaseIndicatorPill"
                              className="absolute inset-0 bg-[#0066CC]/90 shadow-md shadow-sky-600/20 backdrop-blur-md border border-white/20 rounded-lg -z-10"
                              transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                      )}"""

content = content.replace(target_row2, replacement_row2)

# Also fix the number badge inside Row 2
target_row2_badge = """                      <span className={`relative w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isCompleted ? 'bg-slate-100 text-slate-700' :
                        isActive ? 'bg-slate-200 text-[#0F172A] border border-slate-300' :
                        isSelectedStage ? 'bg-slate-800 text-white shadow-sm' :
                        'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>"""
replacement_row2_badge = """                      <span className={`relative w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors duration-300 ${
                        isSelectedStage ? 'bg-white/20 text-white shadow-sm border border-white/30' :
                        isCompleted ? 'bg-slate-100 text-slate-700' :
                        isActive ? 'bg-slate-200 text-[#0F172A] border border-slate-300' :
                        'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>"""

content = content.replace(target_row2_badge, replacement_row2_badge)

# Row 3 Fix
target_row3 = """                return (
                  <motion.button
                    key={item.route}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setActiveTab(item.route)}
                    className={`relative px-2 py-1 lg:px-3 lg:py-1.5 rounded-xl text-xs transition-all flex items-center gap-1 lg:gap-1.5 shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-[#0066CC]/90 text-white shadow-md shadow-sky-600/20 font-bold backdrop-blur-md border border-white/20'
                        : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200'
                    }`}
                    title={item.label}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeSubTabIndicatorPill"
                        className="absolute inset-0 rounded-xl bg-[#0066CC]/90 backdrop-blur-md border border-white/20 -z-10"
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}"""

replacement_row3 = """                return (
                  <button
                    key={item.route}
                    onClick={() => setActiveTab(item.route)}
                    className={`relative px-2 py-1 lg:px-3 lg:py-1.5 rounded-xl text-xs transition-all duration-150 flex items-center gap-1 lg:gap-1.5 shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-[#0066CC]/90 text-white shadow-md shadow-sky-600/20 font-bold backdrop-blur-md border border-white/20'
                        : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-[#0055B3] border border-slate-200 tracking-normal hover:tracking-[0.01em]'
                    }`}
                    title={item.label}
                  >"""

content = content.replace(target_row3, replacement_row3)

# Remove the closing motion.button from row 3
content = content.replace("</motion.button>", "</button>")

with open('components/ProjectWorkspace.tsx', 'w') as f:
    f.write(content)

print("Fixed ProjectWorkspace.tsx")
