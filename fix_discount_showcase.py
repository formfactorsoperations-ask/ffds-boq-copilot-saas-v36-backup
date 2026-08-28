with open('components/client/ClientDiscountShowcase.tsx', 'r') as f:
    content = f.read()

# Container background
content = content.replace('bg-gradient-to-br from-emerald-900 to-teal-900 text-white', 'bg-slate-900 text-white')

# Sparkles background
content = content.replace('text-emerald-400', 'text-slate-800')
content = content.replace('bg-emerald-500/20 rounded-full blur-3xl', 'bg-slate-800 rounded-full blur-3xl')

# Border and title styling
content = content.replace('border-emerald-800/50', 'border-slate-800')
content = content.replace('bg-emerald-500/20 text-emerald-300 rounded-lg shadow-sm backdrop-blur-sm border border-emerald-500/30', 'bg-slate-800/50 text-slate-300 rounded border border-slate-700')
content = content.replace('text-emerald-300 uppercase', 'text-slate-400 uppercase')
content = content.replace('text-emerald-100/80', 'text-slate-400')
content = content.replace('text-emerald-200', 'text-slate-400')

# Card styling
content = content.replace('bg-white text-slate-800 p-4 rounded-xl flex items-center justify-between shadow-sm group border-l-4 border-emerald-500', 'bg-slate-50 text-slate-800 p-4 rounded-lg flex items-center justify-between shadow-sm border border-slate-200 border-l-4 border-l-slate-400')
content = content.replace('bg-teal-900 rounded-full', 'bg-slate-900 rounded-full border-l border-slate-200')

# Card target label
content = content.replace('bg-blue-600', 'bg-slate-200 text-slate-600')
content = content.replace('bg-slate-600', 'bg-slate-200 text-slate-600')

with open('components/client/ClientDiscountShowcase.tsx', 'w') as f:
    f.write(content)
