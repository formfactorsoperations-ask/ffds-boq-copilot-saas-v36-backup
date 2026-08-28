const fs = require('fs');
let content = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

const oldVitals = `    vitals: [
        { label: "ITEMS", value: String(activeTier?.boq?.length || 0) },
        { label: "ROOMS", value: String(rooms.length || 0) }
    ],`;

const newVitals = `    vitals: [
        { label: "AREA", value: (projectContext.area || 0) + ' sq ft' },
        { label: "CONFIG", value: projectContext.config || 'N/A' },
        { label: "STYLE", value: projectContext.theme || 'N/A' },
        { label: "ITEMS", value: String(activeTier?.boq?.length || 0) },
        { label: "ROOMS", value: String(rooms.length || 0) }
    ].filter(Boolean),`;

content = content.replace(oldVitals, newVitals);
fs.writeFileSync('components/StudioDashboard.tsx', content, 'utf8');
