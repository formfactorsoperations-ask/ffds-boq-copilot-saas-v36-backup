const fs = require('fs');
let content = fs.readFileSync('components/client/ClientDecisionLock.tsx', 'utf8');

content = content.replace(
  "interface ClientDecisionLockProps {",
  "interface ClientDecisionLockProps {\n    level?: string;"
);

const newOptionsBlock = `    const OPTIONS = level === 'LEVEL_1_5' ? [
        {
            title: "Approve Interim Scope",
            description: "Confirm that the updated scope and layout directions align with your expectations. This allows us to proceed to final material selections and 3D visualization.",
            nextSteps: ["Final Material Selection", "3D Visualization", "Final BOQ Generation", "Site Execution Kick-off"],
            clarification: "You have already completed the Project Initiation (₹4,999). No payment is required at this stage.",
            buttonText: "Approve & Proceed",
            waMessage: \`Hi \${companyFirstName}, I approve the Interim Design & Scope Update for \${encodedProjectName}. Let's move to material selections!\`
        },
        {
            title: "Request Scope Revisions",
            description: "If you feel certain items need to be added or removed before we lock the layout.",
            nextSteps: ["Review specific additions/removals", "Update Commercials", "Final Alignment"],
            buttonText: "Request Revisions",
            waMessage: \`Hi \${companyFirstName}, I've reviewed the Interim Proposal for \${encodedProjectName} but need some revisions to the scope before we proceed.\`
        }
    ] : [
        {
            title: "Proceed with Design-Only Engagement",`;

content = content.replace(
  "    const OPTIONS = [\n        {\n            title: \"Proceed with Design-Only Engagement\",",
  newOptionsBlock
);

fs.writeFileSync('components/client/ClientDecisionLock.tsx', content);
console.log('patched ClientDecisionLock');
