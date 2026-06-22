const fs = require('fs');

const f = fs.readFileSync('components/RevisionStudio.tsx', 'utf8');

const targetLine = "let summaryToPrint = summaryText || '';";

const summaryTextDefinition = `let summaryText = customSummary;
      if (!summaryText) {
        const isIncrease = netDelta > 0;
        const toneSummaries: Record<string, string> = {
          'Partnership': \`As your execution partner, \${orgData?.orgName || 'we'} are committed to complete transparency. Following our recent design discussions and site evaluations, we have updated the Bill of Quantities (BOQ) to reflect the exact scope we agreed upon. Compared to the earlier estimate, the current revision shows a net cost \${isIncrease ? 'increase' : 'reduction'} of \${formatINR(Math.abs(netDelta))}, driven by scope optimization and design upgrades. The design fee has also been adjusted accordingly. This revision ensures that there are no surprises during execution and that our procurement aligns perfectly with your expectations.\`,
          'Neutral': \`The revised BOQ reflects scope alignment based on finalised design discussions. Compared to the earlier estimate, the current revision shows a net cost \${isIncrease ? 'addition' : 'reduction'} of \${formatINR(Math.abs(netDelta))}. The design fee has also been adjusted accordingly.\`,
          'Firm': \`This document contains the finalised revised BOQ for the project. To ensure complete transparency and maintain our execution schedule, all discussed scope changes have been incorporated. The revised BOQ total reflects a net cost \${isIncrease ? 'addition' : 'reduction'} of \${formatINR(Math.abs(netDelta))} from the original estimate.\`,
          'Payment-aligned': \`Following our recent design discussions, we have updated the Bill of Quantities (BOQ) to reflect the exact scope we agreed upon. The revised project estimate shows a net \${isIncrease ? 'addition' : 'reduction'} of \${formatINR(Math.abs(netDelta))}. As our payment schedule is directly tied to the BOQ value, the upcoming payment milestones have been adjusted accordingly.\`
        };
        summaryText = toneSummaries[summaryTone] || toneSummaries['Partnership'];
      }
      let summaryToPrint = summaryText || '';`;

if (f.includes(targetLine)) {
  fs.writeFileSync('components/RevisionStudio.tsx', f.replace(targetLine, summaryTextDefinition));
  console.log("Patched successfully");
} else {
  console.log("Could not find target line");
}
