const fs = require('fs');

const f = fs.readFileSync('components/RevisionStudio.tsx', 'utf8');
const startIndex = f.indexOf('const exportToPDF = () => {');
const endMarker = 'const renderClientView = () => {';
const endIndex = f.indexOf(endMarker);

if(startIndex === -1 || endIndex === -1) {
  console.log("Could not find start or end block.");
  process.exit(1);
}

const replacement = `const exportToPDF = () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const marginX = 20;
      
      let currentY = 20;

      // ---- Helper function for Text & Typography ----
      const writeText = (text, x, y, size, color, font='helvetica', style='normal', align='left') => {
        doc.setFontSize(size);
        doc.setFont(font, style);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text((text || '').replace(/₹/g, 'Rs. '), x, y, { align });
      };

      // ---- 1. HEADER (Editorial Style) ----
      doc.setFillColor(248, 250, 252); // Soft slate-50 background for header
      doc.rect(0, 0, pageWidth, 45, 'F');
      
      // Studio Name
      writeText(orgData?.orgName?.toUpperCase() || "FORM FACTORS STUDIO", marginX, 22, 22, [15, 23, 42], 'helvetica', 'bold');
      writeText("REVISION PACK", marginX, 32, 10, [100, 116, 139], 'helvetica', 'bold');
      
      // Project Details (Right aligned)
      writeText(\`Project: \${projectContext?.name || 'Untitled'}\`, pageWidth - marginX, 22, 10, [15, 23, 42], 'helvetica', 'bold', 'right');
      writeText(\`Date: \${new Date().toLocaleDateString('en-IN')}\`, pageWidth - marginX, 28, 9, [100, 116, 139], 'helvetica', 'normal', 'right');
      if (projectContext?.clientName) {
         writeText(\`Client: \${projectContext.clientName}\`, pageWidth - marginX, 34, 9, [100, 116, 139], 'helvetica', 'normal', 'right');
      }

      currentY = 60;

      // ---- 2. EXECUTIVE SUMMARY ----
      writeText("EXECUTIVE SUMMARY", marginX, currentY, 12, [15, 23, 42], 'helvetica', 'bold');
      currentY += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85); // Slate 700
      let summaryToPrint = summaryText || '';
      summaryToPrint = summaryToPrint.replace(/₹/g, 'Rs. ');
      const summaryLines = doc.splitTextToSize(summaryToPrint, pageWidth - (marginX * 2));
      doc.text(summaryLines, marginX, currentY);
      currentY += (summaryLines.length * 5) + 12;

      // ---- CALCULATIONS FOR FINANCIALS ----
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

      // ---- 3. FINANCIAL SUMMARY TABLE ----
      const buildFinRow = (label, orig, rev) => {
          const v = rev - orig;
          const vStr = v === 0 ? '-' : (v > 0 ? \`+\${formatINR(v)}\` : \`-\${formatINR(Math.abs(v))}\`); 
          return [label, formatINR(orig), formatINR(rev), vStr];
      };

      const finData = [
          buildFinRow("Execution Scope (Post-discount)", pdfOriginalExecution, pdfRevisedExecution),
          buildFinRow(\`Execution GST (\${gstRate}%)\`, origExecGst, revExecGst),
          buildFinRow("Design Fee (Net)", origDesignNet, revDesignNet),
          buildFinRow(\`Design GST (\${gstRate}%)\`, origDesignGst, revDesignGst),
      ];

      autoTable(doc, {
          startY: currentY,
          head: [['FINANCIAL IMPACT', 'ORIGINAL', 'REVISED', 'VARIANCE']],
          body: [
              ...finData,
              ['GRAND TOTAL (INCL. GST)', formatINR(finalOriginalTotal), formatINR(finalRevisedTotal), buildFinRow('', finalOriginalTotal, finalRevisedTotal)[3]]
          ],
          theme: 'plain',
          headStyles: { fillColor: [255, 255, 255], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 8, cellPadding: { top: 4, bottom: 4 } },
          styles: { font: 'helvetica', fontSize: 10, textColor: [51, 65, 85], cellPadding: 6 },
          columnStyles: {
              0: { fontStyle: 'bold', textColor: [15, 23, 42] },
              1: { halign: 'right' },
              2: { halign: 'right' },
              3: { halign: 'right' }
          },
          willDrawCell: (data) => {
             // Bold the grand total row and add a subtle background
             if (data.section === 'body' && data.row.index === finData.length) {
                 doc.setFillColor(248, 250, 252);
                 doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
                 doc.setFont('helvetica', 'bold');
                 doc.setTextColor(15, 23, 42);
                 
                 // Apply red/green to variance on grand total
                 if (data.column.index === 3) {
                     const delta = finalRevisedTotal - finalOriginalTotal;
                     if (delta > 0) doc.setTextColor(220, 38, 38); // Red for increase
                     if (delta < 0) doc.setTextColor(5, 150, 105); // Green for savings
                 }
             }
          },
          didDrawCell: (data) => {
             // Bottom border for header
             if (data.section === 'head') {
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.5);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
             }
             // Top border for Grand Total
             if (data.section === 'body' && data.row.index === finData.length) {
                doc.setDrawColor(203, 213, 225);
                doc.setLineWidth(1);
                doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
             }
          },
          didParseCell: (data) => {
            if (data.cell && data.cell.text) data.cell.text = data.cell.text.map(t => t.replace(/₹/g, 'Rs. '));
          }
      });

      currentY = doc.lastAutoTable.finalY + 16;


      // ---- 4. HIGHLIGHTS & OUT-OF-SCOPE ITEMS ----
      const pendingItems = currentRevisionBoq.filter(i => i.status === 'Pending Decision');
      const vendorItems = currentRevisionBoq.filter(i => i.status === 'Vendor Direct');

      if (pendingItems.length > 0 || vendorItems.length > 0) {
          if (currentY > pageHeight - 60) { doc.addPage(); currentY = marginX; }
          
          writeText("IMPORTANT SCOPE NOTES", marginX, currentY, 12, [15, 23, 42], 'helvetica', 'bold');
          currentY += 6;

          const scopeNotes = [];
          pendingItems.forEach(pi => {
              scopeNotes.push([
                  pi.item,
                  \`Rs. \${formatINR(pi.total).replace(/₹/g,'')}\`,
                  'Pending Confirmation',
                  pi.note || 'To be confirmed by client. Excluded from current total.'
              ]);
          });
          vendorItems.forEach(vi => {
              scopeNotes.push([
                  vi.item,
                  'As Actuals',
                  'Vendor Direct',
                  vi.note || 'Procured directly from vendor. Excluded from studio total.'
              ]);
          });

          autoTable(doc, {
              startY: currentY,
              head: [['ITEM', 'AMOUNT (EST)', 'STATUS', 'REMARKS']],
              body: scopeNotes,
              theme: 'plain',
              headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 8, cellPadding: 4 },
              styles: { font: 'helvetica', fontSize: 9, textColor: [51, 65, 85], cellPadding: 4 },
              columnStyles: {
                  0: { fontStyle: 'bold', textColor: [15, 23, 42], cellWidth: 50 },
                  1: { cellWidth: 30 },
                  2: { fontStyle: 'italic', textColor: [180, 83, 9], cellWidth: 35 },
                  3: { cellWidth: 'auto' } // fill remaining
              },
              willDrawCell: (data) => {
                 if (data.section === 'body') {
                    doc.setDrawColor(241, 245, 249);
                    doc.setLineWidth(0.5);
                    doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
                 }
              }
          });
          currentY = doc.lastAutoTable.finalY + 16;
      }


      // ---- 5. DETAILED BOQ BREAKDOWN ----
      doc.addPage();
      currentY = 25;
      writeText("DETAILED BOQ BREAKDOWN", marginX, currentY, 12, [15, 23, 42], 'helvetica', 'bold');
      currentY += 8;

      const sections = Array.from(new Set([...baselineBoq.map(b => b.section), ...currentRevisionBoq.map(r => r.section)]));
      
      const boqBody = [];
      sections.forEach(section => {
          const sectionItems = currentRevisionBoq.filter(r => r.section === section);
          const sectionOrigTotal = baselineBoq.filter(b => b.section === section).reduce((sum, i) => sum + i.total, 0);
          const sectionRevTotal = sectionItems.reduce((sum, i) => (i.status === 'Vendor Direct' || i.status === 'Pending Decision') ? sum : sum + i.total, 0);
          const sectionVar = sectionRevTotal - sectionOrigTotal;

          // Section Header Row
          boqBody.push([
              { content: section.toUpperCase(), styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] } },
              { content: '', styles: { fillColor: [241, 245, 249] } },
              { content: formatINR(sectionOrigTotal).replace(/₹/g, 'Rs. '), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] } },
              { content: formatINR(sectionRevTotal).replace(/₹/g, 'Rs. '), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] } },
              { content: sectionVar === 0 ? '-' : (sectionVar > 0 ? \`+\${formatINR(sectionVar)}\` : \`-\${formatINR(Math.abs(sectionVar))}\`).replace(/₹/g, 'Rs. '), styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] } }
          ]);

          sectionItems.forEach(item => {
              const origItem = baselineBoq.find(b => b.section === section && b.item === item.item);
              const origTotal = origItem ? origItem.total : 0;
              const variance = (item.status === 'Vendor Direct' || item.status === 'Pending Decision') ? 0 : (item.total - origTotal);
              
              let statusText = item.status === 'Approved' ? '-' : item.status;
              if (item.reasonCategory) statusText = item.reasonCategory;

              const displayOrig = origTotal === 0 ? '-' : formatINR(origTotal);
              const displayRev = item.status === 'Vendor Direct' ? 'As Actuals' : (item.status === 'Pending Decision' ? 'Pending' : formatINR(item.total));
              const displayVar = variance === 0 ? '-' : (variance > 0 ? \`+\${formatINR(variance)}\` : \`-\${formatINR(Math.abs(variance))}\`);

              boqBody.push([
                  { content: \`\${item.item}\\n\${item.note ? '➔ ' + item.note : ''}\`, styles: { textColor: [51, 65, 85] } },
                  { content: statusText, styles: { textColor: item.status === 'Approved' ? [148, 163, 184] : [217, 119, 6] } },
                  { content: displayOrig.replace(/₹/g, 'Rs. '), styles: { halign: 'right' } },
                  { content: displayRev.replace(/₹/g, 'Rs. '), styles: { halign: 'right' } },
                  { content: displayVar.replace(/₹/g, 'Rs. '), styles: { halign: 'right', textColor: variance > 0 ? [220, 38, 38] : (variance < 0 ? [5, 150, 105] : [100, 116, 139]) } }
              ]);
          });
      });

      autoTable(doc, {
          startY: currentY,
          head: [['ITEM & DESCRIPTION', 'STATUS / REASON', 'ORIGINAL', 'REVISED', 'VARIANCE']],
          body: boqBody,
          theme: 'plain',
          headStyles: { fillColor: [255, 255, 255], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 8 },
          styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4 },
          columnStyles: {
              0: { cellWidth: 70 },
              1: { cellWidth: 35 },
              2: { cellWidth: 25 },
              3: { cellWidth: 25 },
              4: { cellWidth: 25 }
          },
          didDrawCell: (data) => {
             // Header border
             if (data.section === 'head') {
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(1);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
             }
          },
          willDrawCell: (data) => {
             if (data.section === 'body' && data.row.raw[0]?.styles?.fontStyle !== 'bold') {
                // Subtle line between normal items
                doc.setDrawColor(241, 245, 249);
                doc.setLineWidth(0.5);
                doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
             }
          }
      });

      currentY = doc.lastAutoTable.finalY + 20;

      // ---- 6. FOOTER / SIGN-OFF ----
      if (currentY > pageHeight - 40) { doc.addPage(); currentY = marginX; }
      
      writeText("MOVING FORWARD TOGETHER", marginX, currentY, 12, [15, 23, 42], 'helvetica', 'bold');
      currentY += 8;
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const signOffLines = [
          "As your execution partner, our goal is complete transparency and zero surprises.",
          "1. Please review the detailed breakdown above.",
          "2. Let us know if any item needs further value engineering or discussion.",
          "3. Once aligned, provide your formal approval so we can lock in procurement rates.",
          "4. We will then update the payment milestones and proceed with execution seamlessly.",
          "",
          \`Thank you for trusting \${orgData?.orgName || 'Form Factors Studio'} with your vision.\`
      ];
      doc.text(signOffLines, marginX, currentY, { lineHeightFactor: 1.5 });

      // Add thin page borders on all pages
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
         doc.setPage(i);
         doc.setDrawColor(226, 232, 240);
         doc.setLineWidth(0.5);
         // Left line
         doc.line(10, 10, 10, pageHeight - 10);
      }

      doc.save(\`\${projectContext?.name || 'Project'}_Revision_Pack_\${new Date().toISOString().split('T')[0]}.pdf\`);
      showToast("PDF Pack generated successfully!");

    } catch (err) {
      console.error("Error generating PDF:", err);
      showToast("Could not generate PDF. Please try again.");
    }
  };
`;

fs.writeFileSync('components/RevisionStudio.tsx', f.substring(0, startIndex) + replacement + "\n" + f.substring(endIndex));
console.log("Successfully replaced exportToPDF with overhauled editorial layout!");
