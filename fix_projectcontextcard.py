import re

with open('./components/ProjectContextCard.tsx', 'r') as f:
    content = f.read()

# Replace all gold with sky blue theme colors
content = content.replace('#B5945B', '#0066CC')
content = content.replace('#A3834F', '#0055B3')

# Replace bg-white and other off-white backgrounds with glass-light
content = content.replace('bg-white rounded-2xl', 'glass-light rounded-2xl')
content = content.replace('bg-[#FAF9F6]', 'glass-light')
content = content.replace('bg-[#FDFBF7]', 'bg-sky-50/50')
content = content.replace('bg-white border', 'glass-light border')

# Also, there are black tabs/buttons in ProjectContextCard too? Let's check `#1B2A4A`.
content = content.replace('#1B2A4A', '#0066CC')

with open('./components/ProjectContextCard.tsx', 'w') as f:
    f.write(content)
