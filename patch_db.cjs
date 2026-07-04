const fs = require('fs');
let db = fs.readFileSync('services/dbService.ts', 'utf8');

const target = `                try {
                    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(leanProjects));
                } catch (innerError) {
                    console.error("Still exceeding quota even after stripping images from all projects.", innerError);
                    alert("Local storage is full. Please delete some old projects to save new ones.");
                }`;

const replacement = `                try {
                    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(leanProjects));
                } catch (innerError) {
                    console.error("Still exceeding quota even after stripping images from all projects.", innerError);
                    if (isFirebaseConfigured()) {
                        console.warn("Firebase connected. Safely clearing older local projects...");
                        try {
                            // Keep only the most recent project (the one we are saving right now)
                            // or top 3 if possible
                            let sliced = leanProjects.slice(0, 3);
                            localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(sliced));
                        } catch(e3) {
                            try {
                                localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify([leanProjects[0]]));
                            } catch(e4) {
                                alert("Local storage is critically full. Please clear your browser cache/data.");
                            }
                        }
                    } else {
                        alert("Local storage is full. Please delete some old projects to save new ones.");
                    }
                }`;

db = db.replace(target, replacement);
fs.writeFileSync('services/dbService.ts', db);
console.log("Patched dbService.ts");
