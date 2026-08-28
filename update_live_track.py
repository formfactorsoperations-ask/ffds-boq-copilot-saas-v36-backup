with open('./components/home/ClockCalendar.tsx', 'r') as f:
    content = f.read()

content = content.replace('bg-stone-50/40 p-6 rounded-2xl', 'glass-light p-6 rounded-2xl')

with open('./components/home/ClockCalendar.tsx', 'w') as f:
    f.write(content)
