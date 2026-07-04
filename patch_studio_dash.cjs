const fs = require('fs');
let code = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

code = code.replace(/import \{ exportValueEngineeringExcel \} from '\.\.\/lib\/veExport';\n?/g, '');
code = code.replace(/import \{ exportBoqToExcel \} from '\.\.\/lib\/excelExport';\n?/g, '');

code = code.replace(/<button[^>]*onClick=\{\(\) => exportBoqToExcel[\s\S]*?<\/button>/g, '');

fs.writeFileSync('components/StudioDashboard.tsx', code);
