import re

with open('./components/StudioDashboard.tsx', 'r') as f:
    content = f.read()

# Replace the broken part
content = content.replace("  };\n;\n      }));\n  }\n  const handleRunAudit = async () => {", "  };\n\n  const handleRunAudit = async () => {")
# Just to be sure, check for another variation
content = content.replace("  };\n;\n      }));\n  }\n\n  const handleRunAudit = async () => {", "  };\n\n  const handleRunAudit = async () => {")

with open('./components/StudioDashboard.tsx', 'w') as f:
    f.write(content)
