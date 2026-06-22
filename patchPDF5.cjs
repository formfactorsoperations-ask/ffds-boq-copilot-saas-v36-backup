const fs = require('fs');

const f = fs.readFileSync('components/RevisionStudio.tsx', 'utf8');

const startIndex = f.indexOf('      // ---- 2. EXECUTIVE SUMMARY ----');
const endIndex = f.indexOf('      // ---- 4. HIGHLIGHTS & OUT-OF-SCOPE ITEMS ----');

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find start or end index");
  process.exit(1);
}

const replacement = `      // ---- 2. CALCULATIONS FOR FINANCIALS (Needed for Hero & Cards) ----
      const pdfOriginalExecution = originalNetExecution;
      const pdfRevisedExecution = revisedTotal;

      const discounts = projectContext?.financials?.discounts || [];
      const calculateDiscountValue = (base, target) => {
        let deduction = 0;
        discounts.filter(d => d.target === target).forEach(d => {
          deduction += d.type === 'percentage' ? base * (d.value / 100) : d.value;
        });
        return deduction;
      };

      const gstRate = projectContext?.gstRate || 18;
      const origExecGst = projectContext?.financials?.executionGstEnabled !== false ? pdfOriginalExecution * (gstRate / 100) : 0;
      const revExecGst = projectContext?.financials?.executionGstEnabled !== false ? pdfRevisedExecution * (gstRate / 100) : 0;
      
      const designFeePercentage = projectContext?.financials?.designFeePercentage || 8;
      const calculateDesignFee = (executionValue) => {
        if (projectContext?.designFeeType === 'fixed_lumpsum') return projectContext.designFee || 0;
        if (projectContext?.designFeeType === 'fixed_sqft') return (projectContext.designFee || 0) * (projectContext.area || 0);
        return executionValue * (designFeePercentage / 100);
      };

      const pOriginalTotal = baselineBoq.reduce((sum, item) => sum + item.total, 0);
      const origDesignFee = calculateDesignFee(pOriginalTotal);
      const origDesignNet = Math.max(0, origDesignFee - calculateDiscountValue(origDesignFee, 'design'));
      const origDesignGst = origDesignNet * (gstRate / 100);
      const finalOriginalTotal = pdfOriginalExecution + origExecGst + origDesignNet + origDesignGst;

      const pRawRevisedDesignBaseTotal = currentRevisionBoq.reduce((sum, item) => {
        if (item.status === 'Pending Decision') return sum;
        return sum + item.total;
      }, 0);
      
      const revDesignFee = calculateDesignFee(pRawRevisedDesignBaseTotal);
      const revDesignNet = Math.max(0, revDesignFee - calculateDiscountValue(revDesignFee, 'design'));
      const revDesignGst = revDesignNet * (gstRate / 100);
      const finalRevisedTotal = pdfRevisedExecution + revExecGst + revDesignNet + revDesignGst;
      const grandTotalVariance = finalRevisedTotal - finalOriginalTotal;

      const itemsPendingDec = currentRevisionBoq.filter(i => i.status === 'Pending Decision');
      const pendingCount = itemsPendingDec.length;
      const totalItemsCount = currentRevisionBoq.length;
      
      // ---- 3. HERO STATES ----
      if (pendingCount > 0) {
          // STATE A: Pending Items
          const amberDark = [99, 56, 6];   // #633806
          const amberMed = [133, 79, 11];  // #854f0b
          
          writeText("YOUR INPUT NEEDED", marginX, currentY, 10, amberMed, 'helvetica', 'bold');
          currentY += 8;
          
          const pluralS = pendingCount === 1 ? '' : 's';
          const verb = pendingCount === 1 ? 'needs' : 'need';
          writeText(\`\${pendingCount} item\${pluralS} \${verb} your confirmation\`, marginX, currentY, 20, amberDark, 'helvetica', 'bold');
          currentY += 8;
          
          itemsPendingDec.forEach(item => {
              const itemText = \`· \${item.item}   ·   \${formatINR(item.total)}\`.replace(/₹/g, 'Rs. ');
              writeText(itemText, marginX, currentY, 13, amberMed, 'helvetica', 'normal');
              currentY += 6;
          });
          currentY += 2;
          
          writeText(\`All other \${totalItemsCount - pendingCount} items are confirmed.\`, marginX, currentY, 13, [100, 116, 139], 'helvetica', 'normal');
          currentY += 16;
      } else {
          // STATE B: Confirm & Final
          writeText("REVISED PROJECT TOTAL", marginX, currentY, 10, [100, 116, 139], 'helvetica', 'bold');
          currentY += 10;
          writeText(formatINR(finalRevisedTotal).replace(/₹/g, 'Rs. '), marginX, currentY, 28, [26, 26, 46], 'helvetica', 'bold');
          currentY += 8;
          writeText(\`Incl. \${gstRate}% GST   ·   \${totalItemsCount} items confirmed\`, marginX, currentY, 13, [100, 116, 139], 'helvetica', 'normal');
          currentY += 16;
      }

      // ---- 4. FINANCIAL SUMMARY CARDS ----
      const cardSpacing = 6;
      const cardWidth = (pageWidth - (marginX * 2) - (cardSpacing * 2)) / 3;
      
      const drawInfoCard = (x, title, valueText, subText, valColor) => {
          doc.setFillColor(248, 250, 252);
          doc.rect(x, currentY, cardWidth, 28, 'F');
          
          writeText(title, x + 5, currentY + 7, 10, [100, 116, 139], 'helvetica', 'normal');
          writeText(valueText, x + 5, currentY + 16, 16, valColor, 'helvetica', 'bold');
          writeText(subText, x + 5, currentY + 23, 9, [148, 163, 184], 'helvetica', 'normal');
      };

      // Card 1
      drawInfoCard(marginX, "Original estimate", formatINR(finalOriginalTotal).replace(/₹/g, 'Rs. '), "incl. GST", [15, 23, 42]);
      
      // Card 2
      drawInfoCard(marginX + cardWidth + cardSpacing, "Revised total", formatINR(finalRevisedTotal).replace(/₹/g, 'Rs. '), "incl. GST", [15, 23, 42]);
      
      // Card 3
      let varColor = [100, 116, 139]; // Grey (0 variance)
      let varSign = "";
      if (grandTotalVariance > 0) {
         varColor = [220, 38, 38]; // Red
         varSign = "+";
      } else if (grandTotalVariance < 0) {
         varColor = [5, 150, 105]; // Green
         varSign = "-";
      }
      const varValStr = grandTotalVariance === 0 ? "No change" : \`\${varSign}\${formatINR(Math.abs(grandTotalVariance)).replace(/₹/g, 'Rs. ')}\`;
      drawInfoCard(marginX + (cardWidth + cardSpacing) * 2, "Revision variance", varValStr, "vs. original estimate", varColor);
      
      currentY += 36;
      
      // ---- 5. EXECUTIVE SUMMARY TEXT ----
      let summaryText = customSummary;
      if (!summaryText) {
        const isIncrease = netDelta > 0;
        const toneSummaries = {
          'Partnership': \`As your execution partner, \${orgData?.orgName || 'we'} are committed to complete transparency. Following our recent design discussions and site evaluations, we have updated the Bill of Quantities (BOQ) to reflect the exact scope we agreed upon. Compared to the earlier estimate, the current revision shows a net cost \${isIncrease ? 'increase' : 'reduction'} of \${formatINR(Math.abs(netDelta))}, driven by scope optimization and design upgrades. The design fee has also been adjusted accordingly. This revision ensures that there are no surprises during execution and that our procurement aligns perfectly with your expectations.\`,
          'Neutral': \`The revised BOQ reflects scope alignment based on finalised design discussions. Compared to the earlier estimate, the current revision shows a net cost \${isIncrease ? 'addition' : 'reduction'} of \${formatINR(Math.abs(netDelta))}. The design fee has also been adjusted accordingly.\`,
          'Firm': \`This document contains the finalised revised BOQ for the project. To ensure complete transparency and maintain our execution schedule, all discussed scope changes have been incorporated. The revised BOQ total reflects a net cost \${isIncrease ? 'addition' : 'reduction'} of \${formatINR(Math.abs(netDelta))} from the original estimate.\`,
          'Payment-aligned': \`Following our recent design discussions, we have updated the Bill of Quantities (BOQ) to reflect the exact scope we agreed upon. The revised project estimate shows a net \${isIncrease ? 'addition' : 'reduction'} of \${formatINR(Math.abs(netDelta))}. As our payment schedule is directly tied to the BOQ value, the upcoming payment milestones have been adjusted accordingly.\`
        };
        summaryText = toneSummaries[summaryTone] || toneSummaries['Partnership'];
      }
      let summaryToPrint = summaryText || '';
      summaryToPrint = summaryToPrint.replace(/₹/g, 'Rs. ');
      const summaryLines = doc.splitTextToSize(summaryToPrint, pageWidth - (marginX * 2));
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(summaryLines, marginX, currentY);
      
      currentY += (summaryLines.length * 5) + 12;

`;

fs.writeFileSync('components/RevisionStudio.tsx', f.substring(0, startIndex) + replacement + f.substring(endIndex));
console.log("Patched successfully");
