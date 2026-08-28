const fs = require('fs');
let content = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');
content = content.replace(/handleManualSave, handleApplyGlobalMarkup, handleExportExcelWithFormulas\]\);\n\n  const bankMap = useMemo\(\(\) => \{/g, 'handleManualSave, handleApplyGlobalMarkup, handleExportExcelWithFormulas, activeTier]);\n\n  const bankMap = useMemo(() => {');
fs.writeFileSync('components/StudioDashboard.tsx', content, 'utf8');
