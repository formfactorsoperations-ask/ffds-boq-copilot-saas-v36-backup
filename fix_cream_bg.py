with open('components/client/ClientBookletProposal.tsx', 'r') as f:
    content = f.read()

content = content.replace('bg-[#FAF6F0]', 'bg-slate-50')
content = content.replace('bg-[#FAF9F6]', 'bg-slate-50')
content = content.replace('bg-[#FDFBF7]', 'bg-slate-50')

with open('components/client/ClientBookletProposal.tsx', 'w') as f:
    f.write(content)
