import re

with open('components/ClientPortal.tsx', 'r') as f:
    content = f.read()

roadmap_target = r"(\{\[\s*\{\s*num: 1, title: 'Concept.*?\]\.map\(step => \()"

roadmap_replacement = """{(() => {
                                            const status = context.status || 'lead';
                                            const isExecution = ['execution', 'completed', 'work_paused'].includes(status);
                                            const bundle = context.currentExecutionBundle || 'pre_execution';
                                            
                                            // Determine current active step (1-6)
                                            let currentStep = 1;
                                            if (context.briefFrozenAt) currentStep = 2;
                                            if (context.designApprovedAt) currentStep = 3;
                                            if (isExecution) {
                                                if (bundle === 'pre_execution') currentStep = 3;
                                                else if (bundle === 'civil_mep') currentStep = 4;
                                                else if (bundle === 'false_ceiling') currentStep = 4; // Or 5
                                                else if (bundle === 'finishes_carpentry') currentStep = 5;
                                                else if (bundle === 'handover' || status === 'completed' || context.handoverDate) currentStep = 6;
                                            }
                                            
                                            if (context.handoverDate || status === 'completed') {
                                                currentStep = 7; // all done
                                            }

                                            const getStatus = (num) => {
                                                if (num < currentStep) return 'completed';
                                                if (num === currentStep) return 'in_progress';
                                                return 'upcoming';
                                            };

                                            return [
                                                { num: 1, title: 'Concept & Brief Freeze', desc: 'Space planning, moodboards, initial BOQ estimates', status: getStatus(1) },
                                                { num: 2, title: 'Design Development & 3D Renders', desc: 'Detailed 2D layout drawings, 3D visualisations, material selections', status: getStatus(2) },
                                                { num: 3, title: 'BOQ Freeze & Execution Advance', desc: 'Final scope lock, E1 advance clearance, site kickoff', status: getStatus(3) },
                                                { num: 4, title: 'Civil, Electrical & First-Fix', desc: 'Wall demolition, wiring, plumbing, false ceiling framework', status: getStatus(4) },
                                                { num: 5, title: 'Carpentry & Finishing Stage', desc: 'Modular furniture assembly, painting, stone countertops', status: getStatus(5) },
                                                { num: 6, title: 'Snag List & Final Handover', desc: 'Quality inspection, final clearance, key handover', status: getStatus(6) },
                                            ];
                                        })().map(step => ("""

content = re.sub(roadmap_target, roadmap_replacement, content, flags=re.DOTALL)

with open('components/ClientPortal.tsx', 'w') as f:
    f.write(content)
