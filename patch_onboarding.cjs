const fs = require('fs');
let code = fs.readFileSync('components/client/ClientOnboarding.tsx', 'utf8');

const target1 = `                                                    const rowBaseOriginal = (m.lockedTaxableBase || taxableDesign) * (m.percentage / 100);`;
const replacement1 = `                                                    const rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || taxableDesign) * (m.percentage / 100);`;
code = code.replace(target1, replacement1);

const target2 = `                                                    const rowBaseOriginal = (m.lockedTaxableBase || taxableExecution) * (m.percentage / 100);`;
const replacement2 = `                                                    const rowBaseOriginal = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : (m.lockedTaxableBase || taxableExecution) * (m.percentage / 100);`;
code = code.replace(target2, replacement2);

fs.writeFileSync('components/client/ClientOnboarding.tsx', code);
