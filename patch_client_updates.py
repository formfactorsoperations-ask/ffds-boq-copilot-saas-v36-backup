import re

with open('components/ops/ClientUpdatesManager.tsx', 'r') as f:
    content = f.read()

# Add import
if 'import { useOrg } from' not in content:
    content = content.replace("import WeeklyPulseDashboard from './WeeklyPulseDashboard';", "import WeeklyPulseDashboard from './WeeklyPulseDashboard';\nimport { useOrg } from '../../contexts/OrgContext';")

# Add to component
target = "export default function ClientUpdatesManager({ projectContext, setProjectContext, activeProject }: ClientUpdatesManagerProps) {\n    const [activeSubTab"
replacement = "export default function ClientUpdatesManager({ projectContext, setProjectContext, activeProject }: ClientUpdatesManagerProps) {\n    const { orgData } = useOrg();\n    const [activeSubTab"

content = content.replace(target, replacement)

with open('components/ops/ClientUpdatesManager.tsx', 'w') as f:
    f.write(content)
