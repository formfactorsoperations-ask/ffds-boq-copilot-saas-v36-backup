with open('./components/Header.tsx', 'r') as f:
    content = f.read()

content = content.replace('bg-white/70 backdrop-blur-sm', 'bg-transparent')
content = content.replace('bg-white/70', 'bg-transparent')

with open('./components/Header.tsx', 'w') as f:
    f.write(content)
