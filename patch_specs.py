import re

with open('components/BoqItemCard.tsx', 'r') as f:
    content = f.read()

# Remove the state variables
content = re.sub(r'  const \[isEditingSpecs, setIsEditingSpecs\] = useState\(false\);\n', '', content)
content = re.sub(r'  const \[specInput, setSpecInput\] = useState\(item\.specs \|\| \'\'\);\n', '', content)
content = re.sub(r'  // Keep specInput in sync with item\.specs when it changes from outside\n  useEffect\(\(\) => \{\n    setSpecInput\(item\.specs \|\| \'\'\);\n  \}, \[item\.specs\]\);\n', '', content)

# Replace the specs block
target = """        {/* Specs */}
        <div className="relative group/specs mb-5">
            {isEditingSpecs ? (
                <textarea
                    autoFocus
                    value={specInput}
                    onChange={(e) => setSpecInput(e.target.value)}
                    onBlur={() => {
                        setIsEditingSpecs(false);
                        onUpdate(item.id, 'specs', specInput);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            setIsEditingSpecs(false);
                            onUpdate(item.id, 'specs', specInput);
                        }
                    }}
                    className="w-full text-xs text-slate-600 leading-relaxed bg-white p-2.5 rounded-lg border-2 border-sky-400 outline-none resize-y min-h-[80px]"
                    placeholder="Enter scope notes..."
                />
            ) : !item.specs && sellPrice > 0 ? (
                <div 
                    onClick={() => setIsEditingSpecs(true)}
                    className="text-xs text-slate-400 italic leading-relaxed bg-slate-50/30 p-2.5 rounded-lg border border-dashed border-slate-300 cursor-pointer hover:bg-slate-50 hover:border-sky-300 hover:text-[#0066CC] transition-colors"
                >
                    No description — tap to add scope notes
                </div>
            ) : (
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 bg-slate-50/50 p-2.5 rounded-lg border border-slate-200/50 group-hover:bg-white group-hover:border-sky-100 transition-colors">
                    {highlightText(item.specs || '', searchQuery)}
                </p>
            )}
            {/* Rationale Display */}"""

replacement = """        {/* Specs */}
        <div className="relative group/specs mb-5">
            <textarea
                value={item.specs || ''}
                onChange={(e) => onUpdate(item.id, 'specs', e.target.value)}
                className="w-full text-xs text-slate-600 leading-relaxed bg-slate-50/50 hover:bg-white focus:bg-white p-2.5 rounded-lg border border-slate-200/50 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none resize-y min-h-[50px] transition-all"
                placeholder="Enter scope notes..."
                rows={2}
            />
            {/* Rationale Display */}"""

content = content.replace(target, replacement)

with open('components/BoqItemCard.tsx', 'w') as f:
    f.write(content)
