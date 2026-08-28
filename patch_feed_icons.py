import re

with open('components/ClientPortal.tsx', 'r') as f:
    content = f.read()

# Update icons
icon_pattern = r"(item\.type === 'project_update' \? <GitMerge className=\"w-5 h-5 text-\[\#0066CC\]\" /> :)"
icon_replacement = r"\1\n                                                             item.type === 'meeting' ? <Users className=\"w-5 h-5 text-indigo-600\" /> :"
content = re.sub(icon_pattern, icon_replacement, content)

# Update badge colors
badge_pattern = r"(item\.type === 'site_update' \? 'bg-amber-100 text-amber-800' :)"
badge_replacement = r"\1\n                                                        item.type === 'meeting' ? 'bg-indigo-100 text-indigo-800' :\n"
content = re.sub(badge_pattern, badge_replacement, content)

# Also check for Users import. It might be missing.
if "import { Users" not in content and "Users," not in content:
    import_pattern = r"    import { \n"
    content = re.sub(r"    ArrowUpRight,\n    FolderOpen\n\} from 'lucide-react';", r"    ArrowUpRight,\n    FolderOpen,\n    Users\n} from 'lucide-react';", content)

with open('components/ClientPortal.tsx', 'w') as f:
    f.write(content)
