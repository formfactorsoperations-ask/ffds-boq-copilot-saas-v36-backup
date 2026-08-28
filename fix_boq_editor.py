import re

with open('./components/StudioDashboard.tsx', 'r') as f:
    content = f.read()

# Remove the AI Tools Section
content = re.sub(r'\s*\{/\* AI Tools Section \(Bottom\) \*/\}\s*<div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-200">\s*<CommandBar [^>]*/>\s*<BoqPackageCreator [^>]*/>\s*</div>', '', content)

# Remove the imports
content = re.sub(r'import CommandBar from \'\./CommandBar\';\n', '', content)
content = re.sub(r'import BoqPackageCreator from \'\./BoqPackageCreator\';\n', '', content)

with open('./components/StudioDashboard.tsx', 'w') as f:
    f.write(content)
