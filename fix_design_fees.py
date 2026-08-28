with open('components/client/ClientDesignFees.tsx', 'r') as f:
    content = f.read()

# Replace band colors
content = content.replace('bandColor = "bg-blue-100 text-blue-700";', 'bandColor = "border border-slate-300 text-slate-700 bg-white";')
content = content.replace('bandColor = "bg-sky-100 text-[#0055B3]";', 'bandColor = "border border-slate-300 text-slate-700 bg-white";')
content = content.replace('bandColor = "bg-purple-100 text-purple-700";', 'bandColor = "border border-slate-300 text-slate-700 bg-white";')
content = content.replace('bandColor = "bg-slate-100 text-slate-600";', 'bandColor = "border border-slate-300 text-slate-700 bg-white";')

# General layout styles
content = content.replace('bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white text-xs font-bold rounded-full mb-3', 'border border-[#C5A880] text-[#C5A880] text-[10px] font-bold uppercase tracking-widest rounded-full mb-3')
content = content.replace('border-2 border-[#0055B3] rounded-3xl overflow-hidden shadow-lg', 'border border-slate-200 rounded-xl overflow-hidden shadow-sm')

# Toggle PMC switch
content = content.replace('peer-checked:bg-[#0066CC]', 'peer-checked:bg-slate-800')
content = content.replace('group-hover:text-blue-600', 'group-hover:text-slate-900')

# PMC styling
content = content.replace('bg-sky-50/50 p-2 -mx-2 rounded-lg border border-sky-100/50', 'bg-slate-50 p-2 -mx-2 rounded-lg border border-slate-100')
content = content.replace('text-blue-600', 'text-slate-900')

# Right side panel (Total)
content = content.replace('bg-[#0066CC]/90 backdrop-blur-md border border-white/20 p-8 flex flex-col justify-center items-center text-center text-white relative overflow-hidden', 'bg-slate-900 border border-slate-800 p-8 flex flex-col justify-center items-center text-center text-white relative overflow-hidden')

# Discount / Adjustment block inside Total
content = content.replace('bg-sky-900 text-[10px] font-bold text-slate-300 uppercase tracking-wide border border-slate-700', 'bg-slate-800 text-[10px] font-bold text-slate-300 uppercase tracking-widest border border-slate-700')
content = content.replace('text-emerald-400 bg-emerald-900/30 px-3 py-1 rounded-lg border border-emerald-800', 'text-slate-300 bg-slate-800/50 px-3 py-1 rounded border border-slate-700')

with open('components/client/ClientDesignFees.tsx', 'w') as f:
    f.write(content)
