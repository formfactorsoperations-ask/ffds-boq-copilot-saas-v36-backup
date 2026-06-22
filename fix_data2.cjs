const fs = require('fs');

let code = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

// remove handleRestoreVersion
code = code.replace(/const handleRestoreVersion = async \(versionNumber: string\) => \{[\s\S]*?\} catch \(e: any\) \{[\s\S]*?\}\s*\};\n/m, '');

// remove lensEnabled
code = code.replace(/lensEnabled=\{lensEnabled\}/g, '');

fs.writeFileSync('components/StudioDashboard.tsx', code);
console.log('done fixing second wave of deleted features');
