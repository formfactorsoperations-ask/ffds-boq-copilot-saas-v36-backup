const fs = require('fs');
let code = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

code = code.replace(/import ValueEngineeringModal from '\.\/ValueEngineeringModal';\n?/g, '');
code = code.replace(/const \[isVEModalOpen, setIsVEModalOpen\] = useState\(false\);\n?/g, '');
code = code.replace(/<button[^>]*onClick=\{\(\) => setIsVEModalOpen\(true\)\}[\s\S]*?<\/button>/g, '');
code = code.replace(/\{activeTier && <ValueEngineeringModal[\s\S]*?onUpdateContext=\{onUpdateContext\}\s*\/>\}/g, '');

fs.writeFileSync('components/StudioDashboard.tsx', code);
