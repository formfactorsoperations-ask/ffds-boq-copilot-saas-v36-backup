const fs = require('fs');
let content = fs.readFileSync('components/PaymentGatesTab.tsx', 'utf8');
content = content.replace(
    "const clientName = projectContext?.name || 'Client';",
    "const clientName = projectContext?.clientName || 'Client';"
);
fs.writeFileSync('components/PaymentGatesTab.tsx', content);
