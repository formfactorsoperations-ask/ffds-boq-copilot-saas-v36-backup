const fs = require('fs');
let content = fs.readFileSync('lib/unifiedExcelExport.ts', 'utf8');

// Fix 1: isHandoverAdvance
content = content.replace(
    /a\.isHandoverAdvance/g,
    '(a as any).isHandoverAdvance'
);

fs.writeFileSync('lib/unifiedExcelExport.ts', content);
console.log("Fixed unifiedExcelExport.ts TS issues");
