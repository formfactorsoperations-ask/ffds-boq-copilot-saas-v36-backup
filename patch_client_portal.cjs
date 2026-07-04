const fs = require('fs');
let code = fs.readFileSync('components/ClientPortal.tsx', 'utf8');

const target = `        const rowBaseOriginal = baseAmount * (m.percentage / 100);`;
const replacement = `        const rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * (m.percentage / 100);`;
code = code.replace(target, replacement);

fs.writeFileSync('components/ClientPortal.tsx', code);
