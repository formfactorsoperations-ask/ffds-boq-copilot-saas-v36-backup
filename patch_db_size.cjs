const fs = require('fs');
let code = fs.readFileSync('services/dbService.ts', 'utf8');

const target = `                        const leanCompressed = compressData(superLeanProject);
                        if (leanCompressed) {
                            payload = {`;

const replacement = `                        let leanCompressed = compressData(superLeanProject);
                        
                        if (leanCompressed && leanCompressed.length > 900000) {
                             console.warn("Still huge! Stripping BOQs from non-active tiers...");
                             if (superLeanProject.tiers) {
                                 superLeanProject.tiers = superLeanProject.tiers.map(t => {
                                     if (t.id === superLeanProject.activeTierId) return t; // Keep active
                                     return { ...t, boq: [] };
                                 });
                             }
                             leanCompressed = compressData(superLeanProject);
                        }

                        if (leanCompressed && leanCompressed.length > 900000) {
                             console.warn("Still huge! Keeping only active tier...");
                             if (superLeanProject.tiers) {
                                 superLeanProject.tiers = superLeanProject.tiers.filter(t => t.id === superLeanProject.activeTierId);
                             }
                             leanCompressed = compressData(superLeanProject);
                        }

                        if (leanCompressed) {
                            payload = {`;

code = code.replace(target, replacement);

const target2 = `            if (payload.compressedData && payload.compressedData.length > 1048400) {
                console.error("Payload still too large for Firestore after aggressive stripping!");
                throw new Error("Project data is too large for Cloud Sync. Saved locally only.");
            }`;

const replacement2 = `            if (payload.compressedData && payload.compressedData.length > 1048400) {
                console.error("Payload still too large for Firestore after aggressive stripping!");
                // Just clear the compressedData to avoid breaking the app, but save metadata
                payload.compressedData = "";
                payload.warning = "Project too large for cloud sync. Saved locally only.";
                payload.isCloudSyncFailed = true;
            }`;

code = code.replace(target2, replacement2);

fs.writeFileSync('services/dbService.ts', code);
console.log("Patched dbService.ts with tiered stripping strategy");
