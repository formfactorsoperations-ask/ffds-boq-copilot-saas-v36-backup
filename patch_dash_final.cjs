const fs = require('fs');
let code = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

code = code.replace(/import \{ exportValueEngineeringExcel \} from '\.\.\/lib\/veExport';\n?/g, '');
code = code.replace(/import \{ exportBoqToExcel \} from '\.\.\/lib\/excelExport';\n?/g, '');

code = code.replace(/<button[^>]*onClick=\{\(\) => setIsVEModalOpen\(true\)\}[\s\S]*?<\/button>/g, '');
code = code.replace(/<button[^>]*onClick=\{\(\) => exportBoqToExcel[\s\S]*?<\/button>/g, '');
code = code.replace(/\{\/\* Export to Excel \*\/\}/g, '');
code = code.replace(/const \[isVEModalOpen, setIsVEModalOpen\] = useState\(false\);\n?/g, '');

fs.writeFileSync('components/StudioDashboard.tsx', code);
