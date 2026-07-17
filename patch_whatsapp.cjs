const fs = require('fs');
let code = fs.readFileSync('components/WeeklyProgressReportTab.tsx', 'utf8');

// import generateWhatsAppDigest
if (!code.includes('import { generateWhatsAppDigest }')) {
    code = `import { generateWhatsAppDigest } from '../services/whatsappService';\n` + code;
}

// update the button
code = code.replace(
    /onClick=\{\(\) => \{ \/\* TODO handle whatsapp digest \*\/ \}\} className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-100 transition-colors"/,
    `onClick={async () => {
                            const digest = generateWhatsAppDigest(currentPulse);
                            await navigator.clipboard.writeText(digest);
                            alert('WhatsApp digest copied to clipboard!');
                        }} className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-100 transition-colors"`
);

fs.writeFileSync('components/WeeklyProgressReportTab.tsx', code);
console.log('Patched WhatsApp button');
