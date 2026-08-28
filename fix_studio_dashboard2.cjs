const fs = require('fs');
let content = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

// Find the start of usePageHeader
const startIdx = content.indexOf('usePageHeader({');
if (startIdx !== -1) {
    const endStr = '  }, [activeTier?.name, activeTier?.boq?.length, rooms.length, viewMode, isSaving, isGlobalMarkupOpen, globalMarkupValue]);';
    const endIdx = content.indexOf(endStr, startIdx);
    if (endIdx !== -1) {
        const fullCall = content.substring(startIdx, endIdx + endStr.length);
        // Remove it from current position
        content = content.replace(fullCall, '');

        // Remove title and subtitle from it
        let fixedCall = fullCall.replace(/title: "BOQ Editor",\n\s*subtitle: "Build and refine your scope room by room",\n\s*/, '');
        
        // Find main return
        const returnIdx = content.indexOf('  if (!activeTier) return <div>Please select a proposal tier.</div>;');
        
        if (returnIdx !== -1) {
            content = content.substring(0, returnIdx) + fixedCall + '\n\n' + content.substring(returnIdx);
        } else {
            console.log("Could not find return statement");
        }
    } else {
        console.log("Could not find end of usePageHeader call");
    }
} else {
    console.log("Could not find usePageHeader call");
}

fs.writeFileSync('components/StudioDashboard.tsx', content, 'utf8');
