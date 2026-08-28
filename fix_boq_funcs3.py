import re

with open('./components/StudioDashboard.tsx', 'r') as f:
    content = f.read()

# Replace using regex to catch varying whitespace
content = re.sub(r'  \};\s*;\s*\}\)\);\s*\}\s*const handleRunAudit', r'  };\n\n  const handleRunAudit', content)

with open('./components/StudioDashboard.tsx', 'w') as f:
    f.write(content)
