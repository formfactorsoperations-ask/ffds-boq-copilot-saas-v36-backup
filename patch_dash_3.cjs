const fs = require('fs');
let code = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

code = code.replace(/\{activeTier && <ValueEngineeringModal[\s\S]*?\/>\}/g, '');

fs.writeFileSync('components/StudioDashboard.tsx', code);
