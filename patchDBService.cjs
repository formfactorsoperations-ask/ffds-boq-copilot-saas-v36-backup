const fs = require('fs');

const f = fs.readFileSync('services/dbService.ts', 'utf8');

// 1. Add getCurrentTenantId
const importAddIndex = f.indexOf("import { collection, getDocs, doc, setDoc, deleteDoc, getDoc }");
const newImports = "import { collection, getDocs, doc, setDoc, deleteDoc, getDoc, query, where } from 'firebase/firestore';\n\n// Multi-tenant Helper\nconst getCurrentTenantId = () => {\n    try {\n        const saved = localStorage.getItem('ffds_org_context');\n        if (saved) {\n            const org = JSON.parse(saved);\n            return org.tenantId || 'demo-tenant-01';\n        }\n    } catch(e) {}\n    return 'demo-tenant-01';\n};\n\nconst getTenantDocId = (baseName: string) => {\n    const tid = getCurrentTenantId();\n    return tid === 'demo-tenant-01' ? baseName : `${baseName}_${tid}`;\n};\n";

let updated = f.replace("import { collection, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';", newImports);

// 2. Update getProjects
const getProjectsStart = `    getProjects: async () => {
        if (!firestore) return LocalStrategy.getProjects();
        try {
            const querySnapshot = await getDocs(collection(firestore, "projects"));`;

const getProjectsReplacement = `    getProjects: async () => {
        if (!firestore) return LocalStrategy.getProjects();
        try {
            const tenantId = getCurrentTenantId();
            let querySnapshot;
            if (tenantId === 'demo-tenant-01') {
                // FFDS fallback: fetch all and filter in-memory to include old documents without tenantId
                querySnapshot = await getDocs(collection(firestore, "projects"));
            } else {
                const q = query(collection(firestore, "projects"), where("tenantId", "==", tenantId));
                querySnapshot = await getDocs(q);
            }
`;

updated = updated.replace(getProjectsStart, getProjectsReplacement);

// 3. Update getProjects mapping to filter FFDS tenant
const mapStart = `            const projects = querySnapshot.docs.map(doc => {
                const data = doc.data();`;

const mapReplacement = `            const tenantId = getCurrentTenantId();
            const projects = querySnapshot.docs
                .filter(d => {
                    const t = d.data().tenantId;
                    if (tenantId === 'demo-tenant-01') return !t || t === 'demo-tenant-01';
                    return t === tenantId;
                })
                .map(doc => {
                const data = doc.data();`;

updated = updated.replace(mapStart, mapReplacement);

// 4. Update saveProject to embed tenantId
const savePayloadStart = `                    payload = {
                        id: project.id,
                        lastModified: project.lastModified,
                        name: project.context.name, // Metadata for listing without decompressing
                        isCompressed: true,
                        compressedData: compressedString
                    };`;

const savePayloadReplacement = `                    payload = {
                        id: project.id,
                        tenantId: getCurrentTenantId(),
                        lastModified: project.lastModified,
                        name: project.context.name, // Metadata for listing without decompressing
                        isCompressed: true,
                        compressedData: compressedString
                    };`;

updated = updated.replace(savePayloadStart, savePayloadReplacement);

const saveLeanStart = `                                payload = {
                                    id: project.id,
                                    lastModified: project.lastModified,
                                    name: project.context.name,
                                    isCompressed: true,
                                    compressedData: leanCompressed,
                                    warning: "Images stripped due to cloud size limits"
                                };`;

const saveLeanReplacement = `                                payload = {
                                    id: project.id,
                                    tenantId: getCurrentTenantId(),
                                    lastModified: project.lastModified,
                                    name: project.context.name,
                                    isCompressed: true,
                                    compressedData: leanCompressed,
                                    warning: "Images stripped due to cloud size limits"
                                };`;

updated = updated.replace(saveLeanStart, saveLeanReplacement);

const uncompressedPayloadStart = `            let payload: any = JSON.parse(jsonString);`;
const uncompressedPayloadReplacement = `            let payload: any = JSON.parse(jsonString);
            payload.tenantId = getCurrentTenantId();`;
updated = updated.replace(uncompressedPayloadStart, uncompressedPayloadReplacement);

// 5. Update master_data accesses
updated = updated.replace(/doc\(firestore, "master_data", "item_bank"\)/g, 'doc(firestore, "master_data", getTenantDocId("item_bank"))');
updated = updated.replace(/doc\(firestore, "master_data", "draft_item_bank"\)/g, 'doc(firestore, "master_data", getTenantDocId("draft_item_bank"))');
updated = updated.replace(/doc\(firestore, "master_data", "templates"\)/g, 'doc(firestore, "master_data", getTenantDocId("templates"))');

fs.writeFileSync('services/dbService.ts', updated);
console.log("Services rewritten incrementally!");
