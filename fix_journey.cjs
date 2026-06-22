const fs = require('fs');

let content = fs.readFileSync('constants/journeyConstants.ts', 'utf8');

// Remove lead_profiled block
content = content.replace(/\s*\{\s*id:\s*"lead_profiled"[\s\S]*?\},/g, '');

// Change prerequisite
content = content.replace(/prerequisiteIds:\s*\["lead_profiled"\]/g, 'prerequisiteIds: []');

// Decrement all n values
content = content.replace(/n:\s*(\d+)/g, (match, p1) => {
    return 'n: ' + (parseInt(p1) - 1);
});

fs.writeFileSync('constants/journeyConstants.ts', content);
console.log('Fixed journeyConstants.ts');
