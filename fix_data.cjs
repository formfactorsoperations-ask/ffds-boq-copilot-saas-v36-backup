const fs = require('fs');

let code = fs.readFileSync('components/StudioDashboard.tsx', 'utf8');

// remove versions state
code = code.replace(/const \[operativeBoq, setOperativeBoq\] = useState<any>\(null\);\n/, '');
code = code.replace(/const \[showVersions, setShowVersions\] = useState\(false\);\n/, '');
code = code.replace(/const \[boqVersions, setBoqVersions\] = useState<any\[\]>\(\[\]\);\n/, '');
code = code.replace(/const \[isLoadingVersions, setIsLoadingVersions\] = useState\(false\);\n/, '');
code = code.replace(/const \[approvalEvidence, setApprovalEvidence\] = useState\(''\);\n/, '');
code = code.replace(/const \[isCreatingBaseline, setIsCreatingBaseline\] = useState\(false\);\n/, '');
code = code.replace(/const \[baselineStatusMsg, setBaselineStatusMsg\] = useState<.*>\(null\);\n/, '');
code = code.replace(/const \[packsCount, setPacksCount\] = useState\(0\);\n/, '');

// Remove lens state
code = code.replace(/const \[lensEnabled, setLensEnabled\] = useState\(\(\) => \{\s*return isOwner && localStorage.getItem\('ffds_margin_lens'\) === 'true';\s*\}\);\n/, '');

// Remove packs count effect
code = code.replace(/useEffect\(\(\) => \{\s*if \(projectId && db\) \{\s*const q = query\(collection\(db, `organizations\/\$\{orgData\.tenantId\}\/projects\/\$\{projectId\}\/bookingPacks`\)\);\s*const unsub = onSnapshot\(q, \(snap\) => setPacksCount\(snap\.size\)\);\s*return unsub;\s*\}\s*\}, \[projectId, orgData\.tenantId, db\]\);\n\n/m, '');

// Remove operative Boq effect
code = code.replace(/useEffect\(\(\) => \{\s*if \(projectId && functions && activeTierId\) \{[\s\S]*?catch\(err => \{[\s\S]*?\}\);\s*\}\s*\}, \[projectId, projectContext\.operativeBoqVersion, activeTierId, orgData\.tenantId\]\);\n\n/m, '');

// Remove loadVersions
code = code.replace(/const loadVersions = \(\) => \{[\s\S]*?setIsLoadingVersions\(false\)\);\s*\};\n\n/m, '');

// Remove Baseline publishing (handleCreateBaseline)
code = code.replace(/const handleCreateBaseline = async \(evidence: string\) => \{[\s\S]*?finally \{\s*setIsCreatingBaseline\(false\);\s*\}\s*\};\n\n/m, '');

// The baseline controls in UI
code = code.replace(/\{\/\* Action Options \*\/\}\s*<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">[\s\S]*?<\/div>\s*<\/div>/, '');

// Remove toggleLens method
code = code.replace(/const toggleLens = \(\) => \{\s*if \(!isOwner\) return;\s*const next = !lensEnabled;\s*setLensEnabled\(next\);\s*localStorage.setItem\('ffds_margin_lens', String\(next\)\);\s*\};\n/, '');

// Replace operativeBoq ternary in UI
code = code.replace(/\{operativeBoq \? `v\$\{\s*operativeBoq\.versionNumber\s*\}` : 'Draft'\}/g, "'Draft'");

fs.writeFileSync('components/StudioDashboard.tsx', code);
console.log('done');
