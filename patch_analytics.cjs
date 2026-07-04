const fs = require('fs');
let code = fs.readFileSync('components/AnalyticsTab.tsx', 'utf8');

code = code.replace(/import ValueEngineering from '\.\/ValueEngineering';\n?/g, '');
code = code.replace(/<ValueEngineering boq=\{boq\} setBoq=\{setBoq\} \/>/g, '');

fs.writeFileSync('components/AnalyticsTab.tsx', code);
