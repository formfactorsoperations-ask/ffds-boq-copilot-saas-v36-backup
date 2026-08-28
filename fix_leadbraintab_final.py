import re

with open('./components/LeadBrainTab.tsx', 'r') as f:
    content = f.read()

# Replace all gold with sky blue theme colors
content = content.replace('#B5945B', '#0066CC')
content = content.replace('#A3834F', '#0055B3')
content = content.replace('text-[#1E293B]', 'text-sky-950')
content = content.replace('bg-[#111C30]', 'glass-light') # Change dark blue card to glass
content = content.replace('text-white', 'text-sky-900') # Fix text color for the glass-light card

# But wait, buttons that use text-white (like the submit button and active tab) should still have text-white.
# So let's NOT blindly replace text-white. We'll do it manually.

