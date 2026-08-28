import re
with open('components/OperationsTab.tsx', 'r') as f:
    content = f.read()

pattern = r'<div className="flex justify-end">\s*<button\s*onClick=\{\(\) => setIsImportModalOpen\(true\)\}\s*className="[^"]*"\s*>\s*<FileSpreadsheetIcon className="w-4 h-4" /> Import Excel Option\s*</button>\s*</div>'
content = re.sub(pattern, '', content)

pattern2 = r'(<TierManager[^>]*?setActiveTab={setActiveTab})'
content = re.sub(pattern2, r'\1\n                onImportClick={() => setIsImportModalOpen(true)}', content)

with open('components/OperationsTab.tsx', 'w') as f:
    f.write(content)
print("Done")
