const fs = require('fs');
let lines = fs.readFileSync('components/WeeklyProgressReportTab.tsx', 'utf8').split('\n');

const opsConsoleStart = lines.findIndex(l => l.includes('const renderOpsConsole = () => {'));
let returnLine = lines.length - 1;
for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('return (')) {
        returnLine = i;
        break;
    }
}

console.log('opsConsoleStart:', opsConsoleStart, 'returnLine:', returnLine);

lines.splice(opsConsoleStart, returnLine - opsConsoleStart);

fs.writeFileSync('components/WeeklyProgressReportTab.tsx', lines.join('\n'));
