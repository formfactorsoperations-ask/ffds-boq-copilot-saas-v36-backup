with open('components/InteractiveBoqEditor.tsx', 'r') as f:
    content = f.read()

content = content.replace("'bg-slate-900 border-slate-900 text-white shadow-md'", "'bg-[#0066CC] border-[#0066CC] text-white shadow-md'")

with open('components/InteractiveBoqEditor.tsx', 'w') as f:
    f.write(content)
