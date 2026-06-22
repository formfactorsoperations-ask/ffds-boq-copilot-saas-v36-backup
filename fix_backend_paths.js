import fs from 'fs';

let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// The trigger
code = code.replace(
    'onDocumentWritten("projects/{projectId}/boqItems/{itemId}",',
    'onDocumentWritten("organizations/{orgId}/projects/{projectId}/boqItems/{itemId}",'
);

// We know `orgId` is available in `calculateBoqTotalsAndValidateRules` as `event.params.orgId`.
code = code.replace(
    /db\.collection\(`projects\/\$\{projectId\}\/boqItems`\)/g,
    'db.collection(`organizations/${orgId}/projects/${projectId}/boqItems`)'
);
code = code.replace(
    /db\.collection\(`projects\/\$\{projectId\}\/marginAnalytics`\)/g,
    'db.collection(`organizations/${orgId}/projects/${projectId}/marginAnalytics`)'
);
code = code.replace(
    /db\.collection\(`projects`\)\.doc\(projectId\)/g,
    'db.collection(`organizations/${orgId}/projects`).doc(projectId)'
);

// Other onCall functions (createBaselineVersion, applyChangeOrder, runBoqHealthCheck, getBoqVersions, getOperativeBoq, exportAnnexureA, generateBookingPack) all have `const { orgId, projectId... } = request.data`. They can safely use `orgId` and `projectId`.

code = code.replace(
    /db\.collection\(`projects\/\$\{projectId\}\/healthChecks`\)/g,
    'db.collection(`organizations/${orgId}/projects/${projectId}/healthChecks`)'
);

code = code.replace(
    /db\.collection\(`projects\/\$\{projectId\}\/boqVersions`\)/g,
    'db.collection(`organizations/${orgId}/projects/${projectId}/boqVersions`)'
);

// And generateBookingPack, exportAnnexureA: 
// The storage paths can just remain `projects/` for storage if we want but it doesn't hurt. I'll leave them alone for now or change them. (Wait, the storage path is not `db.collection`, it's just a string path `projects/${projectId}/bookingPacks...`. That's fine)

// Also fix `generateBookingPack` signature:
// It previously had const tokenDoc = await db.collection("publicProposals").doc(token).get(); (Wait no, that's getOperativeBoq that had publicProposals, or exportAnnexureA?)
// I'll run this replace:
code = code.replace(
    /db\.collection\(`projects`\)/g, 
    'db.collection(`organizations/${orgId}/projects`)'
);

fs.writeFileSync('functions/src/index.ts', code);
console.log("Fixed paths in functions/src/index.ts");
