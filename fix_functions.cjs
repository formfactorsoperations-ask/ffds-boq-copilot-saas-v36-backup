const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// 1. Replace paths
code = code.replace(/organizations\/\$\{orgId\}\/projects/g, 'projects');
code = code.replace(/organizations\/\{orgId\}\/projects/g, 'projects');

// 2. Fix the get items logic in createBaselineVersion
code = code.replace(
    'const itemsRef = projectRef.collection("boqItems");\n        const itemsSnap = await t.get(itemsRef);\n        const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));',
    'const tier = (projectData.tiers || []).find((t: any) => t.id === projectData.activeTierId || t.name.startsWith(\'Annexure\'));\n        const items = tier?.boq || [];'
);

// 3. Fix the get items logic in runBoqHealthCheck
code = code.replace(
    'const itemsSnap = await projectRef.collection("boqItems").get();\n    const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));',
    'const tier = (projectData.tiers || []).find((t: any) => t.id === projectData.activeTierId || t.name.startsWith(\'Annexure\'));\n    const items = tier?.boq || [];'
);

// 4. Fix getOperativeBoq
code = code.replace(
    'const versionNumber = projectDoc.data()?.operativeBoqVersion;\n    if (!versionNumber) return { versionNumber: null, itemsSnapshot: [], totalsSnapshot: null };\n\n    const versionDoc = await db.collection(`projects/${projectId}/boqVersions`).doc(versionNumber).get();\n    if (!versionDoc.exists) throw new HttpsError("not-found", "Operative BOQ version document not found.");\n    \n    return versionDoc.data();',
    'const projectData = projectDoc.data() || {};\n    let targetId = request.data.targetVersionId || projectData.context?.operativeBoqVersion;\n    if (!targetId) return { versionNumber: null, itemsSnapshot: [], totalsSnapshot: null };\n    const tier = (projectData.tiers || []).find((t: any) => t.id === projectData.activeTierId || t.name.startsWith(\'Annexure\'));\n    const items = tier?.boq || [];\n    const totalsSnapshot = projectData.context?.designSummary || {};\n    return { versionNumber: targetId, itemsSnapshot: items, totalsSnapshot: { grandTotal: totalsSnapshot.totalSell || 0, firmTotal: totalsSnapshot.totalRevenue || 0, estimateExposure: 0, excludedValue: 0 } };'
);

// 5. Fix exportAnnexureA
code = code.replace(
    'const versionDoc = await projectRef.collection("boqVersions").doc(targetVersionId).get();\n    if (!versionDoc.exists) throw new HttpsError("not-found", "Operative BOQ version document not found.");\n    \n    const versionData = versionDoc.data();\n    const items = versionData?.itemsSnapshot || [];\n    const totals = versionData?.totalsSnapshot || {};',
    'const projectData = projectDoc.data() || {};\n    const versionData = { versionNumber: targetVersionId, contentHash: projectData.id };\n    const tier = (projectData.tiers || []).find((t: any) => t.id === projectData.activeTierId || t.name.startsWith(\'Annexure\'));\n    const items = tier?.boq || [];\n    const totalsSnapshot = projectData.context?.designSummary || {};\n    const totals = { grandTotal: totalsSnapshot.totalSell || 0, firmTotal: totalsSnapshot.totalRevenue || 0, estimateExposure: 0, excludedValue: 0 };'
);

fs.writeFileSync('functions/src/index.ts', code);
