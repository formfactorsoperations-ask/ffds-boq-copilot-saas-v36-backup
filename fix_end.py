import re

with open('./components/StudioDashboard.tsx', 'r') as f:
    content = f.read()

content = content.replace("          )}\n          </div>\n  );\n};", "          )}\n      </AnimatePresence>\n          </div>\n  );\n};")

with open('./components/StudioDashboard.tsx', 'w') as f:
    f.write(content)
