const fs = require('fs');

// Patch TermsDocketPage.tsx
let terms = fs.readFileSync('components/client/TermsDocketPage.tsx', 'utf8');
terms = terms.replace(
    /let latestDocket = dockets\[dockets\.length - 1\];\s*if \(isLocked && lockedSnapshot\?\.termsSettings\) \{/,
    `let latestDocket = dockets[dockets.length - 1];\n\n    if (latestDocket && engagement) {\n        latestDocket = { ...latestDocket, status: engagement.status };\n    }\n\n    if (isLocked && lockedSnapshot?.termsSettings) {`
);
fs.writeFileSync('components/client/TermsDocketPage.tsx', terms);

// Patch PaymentSchedulePage.tsx
let payments = fs.readFileSync('components/client/PaymentSchedulePage.tsx', 'utf8');
payments = payments.replace(
    /let latestSchedule = sortedHistory\.find[^\n]+;\s*if \(isLocked && lockedSnapshot\?\.paymentStructure && !selectedScheduleId\) \{/,
    `let latestSchedule = sortedHistory.find(s => selectedScheduleId ? s.id === selectedScheduleId : !s.supersededBy) || sortedHistory[0];\n    if (latestSchedule && engagement) {\n        latestSchedule = { ...latestSchedule, status: engagement.status };\n    }\n    if (isLocked && lockedSnapshot?.paymentStructure && !selectedScheduleId) {`
);
fs.writeFileSync('components/client/PaymentSchedulePage.tsx', payments);

console.log('Patched pages');
