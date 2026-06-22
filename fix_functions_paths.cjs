const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// The naive replace I did previously was:
// code = code.replace(/organizations\/\$\{orgId\}\/projects/g, 'projects');
// code = code.replace(/organizations\/\{orgId\}\/projects/g, 'projects');

// Now, I want to reverse it safely where possible.
// Wait, I can just use a regex replace in code.
code = code.replace(/db\.collection\(\`projects\//g, 'db.collection(`organizations/${orgId}/projects/');
code = code.replace(/db\.collection\('projects\//g, "db.collection('organizations/${orgId}/projects/");
code = code.replace(/db\.collection\("projects\//g, 'db.collection("organizations/${orgId}/projects/');

// BUT in triggers like calculateBoqTotalsAndValidateRules, we don't have orgId!
// Wait! Previously `calculateBoqTotalsAndValidateRules = onDocumentWritten("organizations/{orgId}/projects/{projectId}/boqItems/{itemId}"...`
// I replaced `organizations/{orgId}/projects` with `projects`!
code = code.replace(/"projects\/\{projectId\}\//g, '"organizations/{orgId}/projects/{projectId}/');

// Let's also fix exportAnnexureA, it might not have orgId in scope if I replaced it. It does have `const { orgId, projectId ... } = request.data;`

code = code.replace(/generateBookingPack", async \(request\) => \{/g, 'generateBookingPack", async (request) => {\n    const { orgId, projectId } = request.data;');
fs.writeFileSync('functions/src/index.ts', code);
