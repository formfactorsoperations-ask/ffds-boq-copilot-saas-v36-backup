const fs = require('fs');
let code = fs.readFileSync('components/WeeklyProgressReportTab.tsx', 'utf8');

console.log(code.includes('CorrectionAffordance'));
