const fs = require('fs');

// 1. Fix StudioDashboard
let dash = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');
dash = dash.replace(
    'const [isModalOpen, setIsModalOpen] = useState(false);',
    'const [isModalOpen, setIsModalOpen] = useState(false);\n  const [isVEModalOpen, setIsVEModalOpen] = useState(false);'
);
// Make sure it actually replaced
fs.writeFileSync('components/StudioDashboard.tsx', dash);

// 2. Fix ValueEngineeringModal
let modal = fs.readFileSync('components/ValueEngineeringModal.tsx', 'utf8');
modal = modal.replace(
    'Object.entries(groupedItems).map(([cat, items]) => (',
    'Object.entries(groupedItems).map(([cat, items]: [string, FullBoqItem[]]) => ('
);
fs.writeFileSync('components/ValueEngineeringModal.tsx', modal);

console.log("Fixed TS errors");
