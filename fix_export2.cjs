const fs = require('fs');
let code = fs.readFileSync('components/client/ClientExportView.tsx', 'utf8');

const target = `            <div className="print-footer">\n                <div>Confidential Proposal • {new Date().toLocaleDateString()}</div>\n                <div>{settings.address} • {settings.email}</div>\n            </div>`;

code = code.replace(target, "");

fs.writeFileSync('components/client/ClientExportView.tsx', code);
console.log("Patched export view footer");
