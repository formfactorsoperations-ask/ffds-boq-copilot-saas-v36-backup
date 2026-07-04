const fs = require('fs');
let code = fs.readFileSync('services/dbService.ts', 'utf8');

const target = `                        // Strip Design Summary images
                        if (leanProject.context && leanProject.context.designSummary) {`;

const replacement = `                        // Remove fullBoq and groupedBoq from tiers (derived data)
                        if (leanProject.tiers) {
                            leanProject.tiers = leanProject.tiers.map(t => {
                                const newT = { ...t };
                                delete newT.fullBoq;
                                delete newT.groupedBoq;
                                return newT;
                            });
                        }

                        // Strip Design Summary images
                        if (leanProject.context && leanProject.context.designSummary) {`;

code = code.replace(target, replacement);
fs.writeFileSync('services/dbService.ts', code);
console.log("Patched dbService.ts for fullBoq stripping");
