import re

with open('./components/LeadBrainTab.tsx', 'r') as f:
    content = f.read()

# Replace the black (#1B2A4A) with sky blue (#0066CC) for tabs and buttons
content = content.replace('#1B2A4A', '#0066CC')

# Replace the main container bg-white with glass-light
content = content.replace('bg-white border border-[#B5945B]/15 rounded-2xl p-6 shadow-[0_2px_18px_rgba(0,0,0,0.01)] grid', 'glass-light border border-sky-200/50 rounded-2xl p-6 shadow-sm grid')
content = content.replace('bg-white p-6 rounded-2xl border border-[#B5945B]/15', 'glass-light p-6 rounded-2xl border border-sky-200/50')
content = content.replace('bg-[#FAF9F6] p-1 rounded-xl border border-slate-200/60', 'glass-light p-1 rounded-xl border border-sky-100')

with open('./components/LeadBrainTab.tsx', 'w') as f:
    f.write(content)
