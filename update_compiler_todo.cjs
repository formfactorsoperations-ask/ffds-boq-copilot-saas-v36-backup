const fs = require('fs');

const fileNames = ['services/weeklyReportCompiler.ts', 'functions/src/index.ts'];

for (const fileName of fileNames) {
    let code = fs.readFileSync(fileName, 'utf8');
    
    // Add the TODO block and null fields
    code = code.replace(
        /return \{ \.\.\.s, isNewThisWeek, chargeLine \};/,
        `// TODO: invoiceStatus and paymentGate are ABSENT per the audit. Leaving null.\n        return { ...s, isNewThisWeek, chargeLine, invoiceStatus: null, paymentGate: null };`
    );
    
    fs.writeFileSync(fileName, code);
}
console.log('Updated with TODO blocks');
