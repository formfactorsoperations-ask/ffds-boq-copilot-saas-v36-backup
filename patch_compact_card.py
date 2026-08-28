import re

with open('components/BoqItemCard.tsx', 'r') as f:
    content = f.read()

# 1. Main card wrapper: p-5 to p-4
content = content.replace('className={`glass-light rounded-2xl p-5 group relative', 'className={`glass-light rounded-xl p-3 group relative')

# 2. Header flex row: gap-4 pr-16 mb-4 -> gap-3 pr-12 mb-3
content = content.replace('className="flex items-start gap-4 pr-16 mb-4"', 'className="flex items-start gap-3 pr-12 mb-3"')

# 3. Icon size: w-10 h-10 to w-8 h-8, text-xl to text-lg
content = content.replace('w-10 h-10 rounded-xl flex items-center justify-center text-xl', 'w-8 h-8 rounded-lg flex items-center justify-center text-lg')

# 4. Title mb-1.5 -> mb-0.5, text-base to text-sm
content = content.replace('className="text-base font-bold text-slate-800 leading-tight mb-1.5"', 'className="text-sm font-bold text-slate-800 leading-tight mb-0.5"')

# 5. Category and Room pills on the same row!
content = content.replace('className="text-xs font-medium flex flex-col gap-1.5 mt-1"', 'className="text-xs font-medium flex flex-wrap items-center gap-1.5 mt-1"')

# 6. Specs wrapper mb-5 -> mb-3
content = content.replace('className="relative group/specs mb-5"', 'className="relative group/specs mb-3"')

# 7. Specs textarea: p-2.5 -> p-2, min-h-[50px] -> min-h-[36px], rows={2} -> rows={1}
content = content.replace('className="w-full text-xs text-slate-600 leading-relaxed bg-slate-50/50 hover:bg-white focus:bg-white p-2.5 rounded-lg border border-slate-200/50 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none resize-y min-h-[50px] transition-all"', 'className="w-full text-xs text-slate-600 leading-relaxed bg-slate-50/50 hover:bg-white focus:bg-white p-2 rounded-md border border-slate-200/50 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none resize-y min-h-[36px] transition-all"')
content = content.replace('rows={2}', 'rows={1}')

# 8. Advanced Settings Panel mb-5 p-3 -> mb-3 p-2
content = content.replace('className="mb-5 p-3 bg-sky-50/50 border border-sky-100 rounded-xl space-y-3"', 'className="mb-3 p-2 bg-sky-50/50 border border-sky-100 rounded-lg space-y-2"')

# 9. Financials Grid mb-5 p-2 -> mb-3 p-1.5
content = content.replace('className="grid grid-cols-3 gap-2 text-center text-xs mb-5 p-2 bg-slate-50/30 rounded-xl border border-slate-100"', 'className="grid grid-cols-3 gap-2 text-center text-xs mb-3 p-1.5 bg-slate-50/30 rounded-lg border border-slate-100"')

# 10. Footer pt-4 -> pt-3
content = content.replace('className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100"', 'className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100"')

# 11. Footer Total text-xl -> text-lg
content = content.replace('className="font-black text-xl text-slate-900 tracking-tight leading-none mt-0.5"', 'className="font-black text-lg text-slate-900 tracking-tight leading-none mt-0.5"')

with open('components/BoqItemCard.tsx', 'w') as f:
    f.write(content)
