const fs = require('fs');
let code = fs.readFileSync('components/client/ClientTab.tsx', 'utf8');

code = code.replace(/import \{ exportValueEngineeringExcel \} from '\.\.\/\.\.\/lib\/veExport';\n?/g, '');
code = code.replace(/<button[^>]*onClick=\{\(\) => exportValueEngineeringExcel[\s\S]*?<\/button>/g, '');

fs.writeFileSync('components/client/ClientTab.tsx', code);
