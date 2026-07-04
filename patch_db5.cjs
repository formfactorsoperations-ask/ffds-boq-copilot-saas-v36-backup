const fs = require('fs');
let code = fs.readFileSync('services/dbService.ts', 'utf8');

const target = `                        // Compress lean version`;

const replacement = `                        // Strip Execution updates images
                        if (leanProject.activeProject?.executionData?.updates) {
                            leanProject.activeProject.executionData.updates = leanProject.activeProject.executionData.updates.map(u => ({
                                ...u,
                                images: undefined
                            }));
                        }
                        
                        // Compress lean version`;

code = code.replace(target, replacement);
fs.writeFileSync('services/dbService.ts', code);
