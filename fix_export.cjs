const fs = require('fs');
let code = fs.readFileSync('components/client/ClientExportView.tsx', 'utf8');

const target = `            {/* Print Only Header/Footer */}
            <div className="print-header">
                <div className="font-bold tracking-tighter">{settings.companyName.toUpperCase()}</div>
                <div>{projectContext.name} • {projectContext.location}</div>
            </div>
            <div className="print-footer">
                <div>Confidential Proposal • {new Date().toLocaleDateString()}</div>
                <div>{settings.address} • {settings.email}</div>
            </div>`;

code = code.replace(target, "");

fs.writeFileSync('components/client/ClientExportView.tsx', code);
console.log("Patched export view header");
