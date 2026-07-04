const fs = require('fs');
let code = fs.readFileSync('components/Dashboard.tsx', 'utf8');

const target1 = `    if (health.paymentMilestones && health.paymentMilestones.length > 0) {
        health.paymentMilestones.forEach((m: any) => {
            const baseAmount = m.lockedTaxableBase || 0;
            const amount = baseAmount * ((m.percentage || 0) / 100);`;

const replacement1 = `    if (health.paymentMilestones && health.paymentMilestones.length > 0) {
        health.paymentMilestones.forEach((m: any) => {
            const baseAmount = m.lockedTaxableBase || 0;
            const amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * ((m.percentage || 0) / 100);`;

code = code.replace(target1, replacement1);
fs.writeFileSync('components/Dashboard.tsx', code);
