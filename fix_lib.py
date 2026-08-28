with open('components/InteractiveBoqEditor.tsx', 'r') as f:
    content = f.read()

content = content.replace("'bg-slate-900 text-white shadow-sm'", "'bg-[#0066CC] text-white shadow-sm'")

with open('components/InteractiveBoqEditor.tsx', 'w') as f:
    f.write(content)
