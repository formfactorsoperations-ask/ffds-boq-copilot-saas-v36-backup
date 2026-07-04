const fs = require('fs');
let content = fs.readFileSync('components/PaymentGatesTab.tsx', 'utf8');
content = content.replace(
    "const dateStr = gate.invoice_raised_date ? new Date(gate.invoice_raised_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'recently';",
    "const dateStr = gate.invoice_raised_date ? new Date(gate.invoice_raised_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : 'recently';"
);
fs.writeFileSync('components/PaymentGatesTab.tsx', content);
