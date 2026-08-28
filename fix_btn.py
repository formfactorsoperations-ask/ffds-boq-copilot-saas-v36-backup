import re

with open('./components/StudioDashboard.tsx', 'r') as f:
    content = f.read()

content = re.sub(r'<button\s+onClick=\{handleRunAudit\}.*?</button>', '', content, flags=re.DOTALL)

with open('./components/StudioDashboard.tsx', 'w') as f:
    f.write(content)
