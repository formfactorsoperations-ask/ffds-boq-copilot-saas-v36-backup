import re

with open('./components/Header.tsx', 'r') as f:
    content = f.read()

# Replace sidebar background
content = content.replace('bg-[#F8FAFC]', 'glass-light')

with open('./components/Header.tsx', 'w') as f:
    f.write(content)

with open('./components/home/ClockCalendar.tsx', 'r') as f:
    content = f.read()

# Replace Live Track background
content = content.replace('bg-stone-50/40', 'glass-light')

with open('./components/home/ClockCalendar.tsx', 'w') as f:
    f.write(content)
