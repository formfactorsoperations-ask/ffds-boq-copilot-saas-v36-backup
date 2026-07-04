const fs = require('fs');

let header = fs.readFileSync('components/Header.tsx', 'utf8');

header = header.replace(
    /\{tab\.id === 'boq-editor' && projectContext\?\.boqFrozen && \([\s\S]*?<\/span>\s*\)\}/,
    `{tab.id === 'boq-editor' && (
                                <span className={\`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg \${
                                  projectContext?.boqFrozen ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-amber-600 bg-amber-100/80 border border-amber-200'
                                }\`}>
                                  {projectContext?.boqFrozen ? 'Frozen' : 'WIP'}
                                </span>
                              )}`
);

header = header.replace(
    /\{tab\.id === 'materials' && projectContext\?\.sofFreezeDate && \([\s\S]*?<\/span>\s*\)\}/,
    `{tab.id === 'materials' && (
                                <span className={\`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg \${
                                  projectContext?.sofFreezeDate ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-amber-600 bg-amber-100/80 border border-amber-200'
                                }\`}>
                                  {projectContext?.sofFreezeDate ? 'Frozen' : 'WIP'}
                                </span>
                              )}`
);

header = header.replace(
    /\{tab\.id === 'client' && projectContext\?\.approvedTierId && \([\s\S]*?<\/span>\s*\)\}/,
    `{tab.id === 'client' && (
                                <span className={\`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg \${
                                  projectContext?.approvedTierId ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-rose-600 bg-rose-100/80 border border-rose-200'
                                }\`}>
                                  {projectContext?.approvedTierId ? 'Approved' : 'Pending'}
                                </span>
                              )}`
);

header = header.replace(
    /\{tab\.id === 'timeline' && projectContext\?\.timelinePhases && projectContext\.timelinePhases\.length > 0 && \([\s\S]*?<\/span>\s*\)\}/,
    `{tab.id === 'timeline' && (
                                <span className={\`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg \${
                                  projectContext?.timelinePhases?.length ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-amber-600 bg-amber-100/80 border border-amber-200'
                                }\`}>
                                  {projectContext?.timelinePhases?.length ? 'Set' : 'Pending'}
                                </span>
                              )}`
);

// add handover-docket
header = header.replace(
    /\{tab\.id === 'payment-schedule' && \([\s\S]*?<\/span>\s*\)\}/,
    `$&
                              {tab.id === 'handover-docket' && (
                                <span className={\`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg \${
                                  projectContext?.handoverDate ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-rose-600 bg-rose-100/80 border border-rose-200'
                                }\`}>
                                  {projectContext?.handoverDate ? 'Issued' : 'Draft'}
                                </span>
                              )}`
);

fs.writeFileSync('components/Header.tsx', header);
console.log('Patched header');
