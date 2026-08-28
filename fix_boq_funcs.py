import re

with open('./components/StudioDashboard.tsx', 'r') as f:
    content = f.read()

# I will use a simple regex replacement to remove the block
pattern_to_remove = r"  const handleProcessCommand = async \(command: string\) => \{.*?\};(\n|\r)*  const handlePackageCreated = \(newBoq: BoqItem\[\]\) => \{.*?\}(\n|\r)*"
content = re.sub(pattern_to_remove, '', content, flags=re.DOTALL)

with open('./components/StudioDashboard.tsx', 'w') as f:
    f.write(content)
