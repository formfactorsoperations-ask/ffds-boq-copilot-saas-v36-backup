import re

with open('components/SiteOpsTab.tsx', 'r') as f:
    content = f.read()

# Update tab button
tab_btn_pattern = r"(<FolderOpen className=\"w-4 h-4 text-sky-500\" />\s*)[\w\s]+ Vault"
content = re.sub(tab_btn_pattern, r"\g<1>3D Renders & Drawings", content)

# Update header
header_pattern = r"(<FolderOpen className=\"w-5 h-5 text-sky-500\" /> )Good For Construction \(GFC\) drawings"
content = re.sub(header_pattern, r"\g<1>3D Renders & Design Drawings", content)

# Update subtitle
subtitle_pattern = r"Upload, access, and reference approved PDFs and layouts. Accessible by all site leads."
content = re.sub(subtitle_pattern, "Upload, access, and share 3D renders, GFCs, and 2D layouts with the client.", content)

with open('components/SiteOpsTab.tsx', 'w') as f:
    f.write(content)
