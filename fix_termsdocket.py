import re

with open('./components/client/TermsDocketPage.tsx', 'r') as f:
    content = f.read()

# Replace dark tabs (bg-sky-900) to sky blue (#0066CC)
content = content.replace('bg-sky-900', 'bg-[#0066CC]')

# Replace bg-white backgrounds with glass-light
content = content.replace('bg-white border text-center', 'glass-light border text-center')
content = content.replace('bg-white rounded-lg', 'glass-light rounded-lg')
content = content.replace('bg-white border border-slate-200/80 rounded-3xl', 'glass-light border border-slate-200/80 rounded-3xl')
content = content.replace('bg-white p-4 rounded-2xl', 'glass-light p-4 rounded-2xl')
content = content.replace('bg-white border border-slate-200/80 p-3 rounded-2xl', 'glass-light border border-slate-200/80 p-3 rounded-2xl')
content = content.replace('bg-white p-4 rounded-xl', 'glass-light p-4 rounded-xl')
content = content.replace('bg-white rounded-xl border', 'glass-light rounded-xl border')
content = content.replace('bg-white p-3 rounded-lg', 'glass-light p-3 rounded-lg')

# Replace bg-[#e2e8f0] preview mode background
content = content.replace("bg-[#e2e8f0]", "glass-light")

with open('./components/client/TermsDocketPage.tsx', 'w') as f:
    f.write(content)
