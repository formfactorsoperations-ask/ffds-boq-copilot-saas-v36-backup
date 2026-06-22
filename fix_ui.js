import fs from 'fs';

let content = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

// Remove Margin Lens Toggle 
content = content.replace(
    /\s*\{\/\* Margin Lens Toggle \*\/\}\s*\{isOwner && \(\s*<button[\s\S]*?◐ Margin Lens\s*<\/button>\s*\)\}/g,
    ''
);

// Remove Incl Margin PDF
content = content.replace(
    /\s*\{isOwner && \(\s*<div className="flex bg-white border border-slate-200 rounded-xl p-1\.5 items-center shadow-sm self-start gap-2 h-\[38px\]">[\s\S]*?<label htmlFor="include-margin"[\s\S]*?<\/div>\s*\)\}/g,
    ''
);

// Remove Version Bar
content = content.replace(
    /\s*\{\/\* Version Bar \*\/\}\s*<div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm print:hidden">[\s\S]*?<\/div>\s*<\/div>/,
    ''
);

// Remove View Versions Panel
content = content.replace(
    /\s*\{\/\* View Versions Panel \*\/\}\s*<AnimatePresence>[\s\S]*?<\/AnimatePresence>/,
    ''
);

fs.writeFileSync('components/StudioDashboard.tsx', content);

console.log("Cleanup done.");
