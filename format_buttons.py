import re

with open('./components/StudioDashboard.tsx', 'r') as f:
    content = f.read()

# Remove handleRunAudit block
content = re.sub(r'  const handleRunAudit = async \(\) => \{.*?\n  \}\n', '', content, flags=re.DOTALL)

# Remove the Smart Audit button
content = re.sub(r'<button\s+onClick=\{handleRunAudit\}.*?Smart Audit</\}</button>', '', content, flags=re.DOTALL)

# Remove the Audit Result Banner
content = re.sub(r'\{\/\* Audit Result Banner \*\/\}.*?\{auditResult && \(.*?</MotionDiv>\s*\)\}', '', content, flags=re.DOTALL)
content = re.sub(r'\{\/\* Audit Result Banner \*\/\}\s*<AnimatePresence>.*?<\/AnimatePresence>', '', content, flags=re.DOTALL)

# Let's remove variables: isAuditing, auditResult, auditError
content = re.sub(r'const \[isAuditing, setIsAuditing\] = useState.*?;\n', '', content)
content = re.sub(r'const \[auditResult, setAuditResult\] = useState.*?;\n', '', content)
content = re.sub(r'const \[auditError, setAuditError\] = useState.*?;\n', '', content)

# Remove the small JSON save button
content = re.sub(r'<button\s+onClick=\{onSaveProject\}\s+className="p-2.5 bg-white border[^>]*>\s+<SaveIcon[^>]*/>\s+</button>', '', content)

# Standardize buttons
# Global Margin: p-2.5 rounded-xl -> p-2 rounded-lg
content = content.replace('className={`p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl', 'className={`p-2 bg-white border border-slate-200 text-slate-500 rounded-lg')
content = content.replace('<CalculatorIcon className="w-5 h-5" />', '<CalculatorIcon className="w-4 h-4" />')

# Import Excel: px-3 py-2 rounded-xl text-xs -> px-3 py-1.5 rounded-lg text-xs
content = content.replace('className="px-3 py-2 bg-sky-50 border border-sky-200 text-[#0055B3] font-bold rounded-xl hover:bg-sky-100 hover:shadow-md transition-all self-start text-xs flex items-center gap-2"', 'className="px-3 py-1.5 bg-sky-50 border border-sky-200 text-[#0055B3] font-bold rounded-lg hover:bg-sky-100 hover:shadow-md transition-all self-start text-xs flex items-center gap-2"')

# Excel Export: p-2.5 rounded-xl -> p-2 rounded-lg
content = content.replace('className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl hover:bg-emerald-100 hover:shadow-md transition-all self-start"', 'className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 hover:shadow-md transition-all self-start"')
content = content.replace('<ExportIcon className="w-5 h-5" />', '<ExportIcon className="w-4 h-4" />')

with open('./components/StudioDashboard.tsx', 'w') as f:
    f.write(content)
