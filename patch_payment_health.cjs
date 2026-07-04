const fs = require('fs');
let code = fs.readFileSync('components/PaymentHealth.tsx', 'utf8');

const target1 = `    if (health.paymentMilestones && health.paymentMilestones.length > 0) {
        health.paymentMilestones.forEach((m: any) => {
            const baseAmount = m.lockedTaxableBase || cv;
            const amount = baseAmount * ((m.percentage || 0) / 100);`;

const replacement1 = `    if (health.paymentMilestones && health.paymentMilestones.length > 0) {
        health.paymentMilestones.forEach((m: any) => {
            const baseAmount = m.lockedTaxableBase || cv;
            const amount = m.isFixedAmount && m.fixedAmount !== undefined ? m.fixedAmount : baseAmount * ((m.percentage || 0) / 100);`;

code = code.replace(target1, replacement1);
fs.writeFileSync('components/PaymentHealth.tsx', code);
