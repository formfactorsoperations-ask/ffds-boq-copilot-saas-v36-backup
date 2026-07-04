const fs = require('fs');
let code = fs.readFileSync('components/ValueEngineeringModal.tsx', 'utf8');

code = code.replace(/import \{ exportValueEngineeringExcel \} from '\.\.\/lib\/veExport';\n?/g, '');
code = code.replace(/exportValueEngineeringExcel\(tier, projectContext\);/g, '');

fs.writeFileSync('components/ValueEngineeringModal.tsx', code);
