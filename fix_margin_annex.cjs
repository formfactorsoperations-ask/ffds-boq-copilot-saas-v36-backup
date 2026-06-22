const fs = require('fs');

let content = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

// remove lines 944 to 1017 approximately
content = content.replace(/\s*\{\/\* Margin Annex Page.*?\}\s*\{exportIncludeMargin && marginAnalytics && \([\s\S]*?<div className="hidden print:block page-break-before[\s\S]*?<\/div>\s*\)\}/, '');

fs.writeFileSync('components/StudioDashboard.tsx', content);

console.log('done');
