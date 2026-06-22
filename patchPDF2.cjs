const fs = require('fs');

const f = fs.readFileSync('components/RevisionStudio.tsx', 'utf8');
const startIndex = f.indexOf('const exportToPDF = () => {');
const endIndexStr = 'doc.save(`${projectContext?.name || \'Project\'}_Revision_Pack_${new Date().toISOString().split(\'T\')[0]}.pdf`);\n      showToast("PDF Pack generated successfully!");\n    } catch (err) {\n      console.error("Error generating PDF:", err);\n      showToast("Could not generate PDF. Please try again.");\n    }\n  };';
const endIndex = f.indexOf(endIndexStr) + endIndexStr.length;

if(startIndex === -1 || f.indexOf(endIndexStr) === -1) {
  console.log("Could not find start or end block.");
  process.exit(1);
}

const replacement = `const exportToPDF = () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.width;
      
      let currentY = 20;

      // Color Palette
      const colors = {
        slate900: [15, 23, 42],
        slate800: [30, 41, 59],
        slate600: [71, 85, 105],
        slate500: [100, 116, 139],
        slate200: [226, 232, 240],
        slate50: [248, 250, 252],
        emerald600: [5, 150, 105],
        emerald50: [236, 253, 245],
        amber700: [180, 83, 9],
        amber100: [254, 243, 199],
        amber50: [255, 251, 235],
        blue700: [29, 78, 216],
        blue50: [239, 246, 255],
        white: [255, 255, 255]
      };

      const drawText = (text: string, x: number, y: number, size: number, color: number[], font='helvetica', style='normal', align='left') => {
        doc.setFontSize(size);
        doc.setFont(font, style);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text((text || '').replace(/₹/g, 'Rs. '), x, y, { align });
      };

      // Header
      doc.setFillColor(colors.slate900[0], colors.slate900[1], colors.slate900[2]);
      doc.rect(0, 0, pageWidth, 40, 'F');
      drawText(orgData?.orgName?.toUpperCase() || "FORM FACTORS STUDIO", 14, 20, 24, colors.white, 'helvetica', 'bold');
      drawText("EXECUTION REVISION PACK", 14, 28, 10, colors.white);
      drawText(\`Date: \${new Date().toLocaleDateString()}\`, pageWidth - 14, 20, 10, colors.white, 'helvetica', 'normal', 'right');
      drawText(\`Project: \${projectContext?.name || 'Untitled Project'}\`, pageWidth - 14, 28, 10, colors.white, 'helvetica', 'normal', 'right');
      
      currentY = 55;

      // Ensure fresh calculation for PDF
      const pdfOriginalExecution = originalNetExecution;
      const pdfRevisedExecution = revisedTotal;
      const pdfNetDelta = netDelta;

      // Re-calculate the grand totals to include design fee & GST
      const discounts = projectContext?.financials?.discounts || [];
      const calculateDiscountValue = (base, target) => {
        const targetDiscounts = discounts.filter(d => d.target === target);
        let totalDeduction = 0;
        targetDiscounts.forEach(d => {
          if (d.type === 'percentage') {
            totalDeduction += base * (d.value / 100);
          } else {
            totalDeduction += d.value;
          }
        });
        return totalDeduction;
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
      
      const grandTotalDelta = finalRevisedTotal - finalOriginalTotal;
      const isGrandInc = grandTotalDelta > 0;

      // ----------------------------------------------------
      // PART 1 - WHAT THIS MEANS FOR YOU
      // ----------------------------------------------------
      drawText("PART 1 — WHAT THIS MEANS FOR YOU", 14, currentY, 10, colors.slate500, 'helvetica', 'bold');
      currentY += 10;
      drawText("Revision summary — 3-number card", 14, currentY, 14, colors.slate800, 'helvetica', 'bold');
      currentY += 8;

      const cardW = (pageWidth - 28 - 12) / 3;
      
      // Card 1
      doc.setFillColor(colors.slate50[0], colors.slate50[1], colors.slate50[2]);
      doc.roundedRect(14, currentY, cardW, 26, 3, 3, 'F');
      drawText("Original estimate", 18, currentY + 7, 10, colors.slate600);
      drawText(\`\${formatINR(finalOriginalTotal)}\`, 18, currentY + 18, 16, colors.slate900, 'helvetica', 'bold');

      // Card 2
      doc.setFillColor(colors.slate50[0], colors.slate50[1], colors.slate50[2]);
      doc.roundedRect(14 + cardW + 6, currentY, cardW, 26, 3, 3, 'F');
      drawText("Revised total", 18 + cardW + 6, currentY + 7, 10, colors.slate600);
      drawText(\`\${formatINR(finalRevisedTotal)}\`, 18 + cardW + 6, currentY + 18, 16, colors.slate900, 'helvetica', 'bold');

      // Card 3
      doc.setFillColor(colors.slate50[0], colors.slate50[1], colors.slate50[2]);
      doc.roundedRect(14 + (cardW * 2) + 12, currentY, cardW, 26, 3, 3, 'F');
      drawText("Net change", 18 + (cardW * 2) + 12, currentY + 7, 10, colors.slate600);
      
      if (grandTotalDelta === 0) {
        drawText("No change", 18 + (cardW * 2) + 12, currentY + 18, 16, colors.slate900, 'helvetica', 'bold');
      } else {
        const tColor = isGrandInc ? colors.amber700 : colors.emerald600;
        const sym = isGrandInc ? "+" : "-";
        const suffix = isGrandInc ? "added" : "saved";
        drawText(\`\${sym}\${formatINR(Math.abs(grandTotalDelta))} \${suffix}\`, 18 + (cardW * 2) + 12, currentY + 17, 16, tColor, 'helvetica', 'bold');
        drawText("Incl. GST", 18 + (cardW * 2) + 12, currentY + 23, 9, colors.slate500, 'helvetica', 'normal');
      }

      currentY += 36;
      drawText("Change snapshot — 4 chips", 14, currentY, 14, colors.slate800, 'helvetica', 'bold');
      currentY += 7;

      let cUnchanged = 0;
      let cVendor = 0;
      let cPending = 0;
      let cChanged = 0;
      
      currentRevisionBoq.forEach(item => {
        if (item.status === 'Vendor Direct') cVendor++;
        else if (item.status === 'Pending Decision') cPending++;
        else if (item.status === 'Added' || item.status === 'Revised' || item.status === 'Removed' || item.status === 'Replaced') cChanged++;
        else cUnchanged++; // Approved is unchanged
      });

      let chipX = 14;
      const drawChip = (label, bg, fg) => {
        if (!label) return;
        const w = doc.getTextWidth(label) + 12;
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.roundedRect(chipX, currentY, w, 8, 2, 2, 'F');
        drawText(label, chipX + 6, currentY + 5.5, 9, fg);
        chipX += w + 4;
      };

      if (cUnchanged > 0) drawChip(\`\${cUnchanged} items unchanged\`, colors.slate50, colors.slate600);
      if (cVendor > 0) drawChip(\`\${cVendor} moved to vendor-direct\`, colors.blue50, colors.blue700);
      if (cPending > 0) drawChip(\`\${cPending} needs your confirmation\`, colors.amber50, colors.amber700);
      if (cChanged > 0) drawChip(\`\${cChanged} items updated\`, colors.slate200, colors.slate800);

      currentY += 20;
      
      // Payment Journey Stepper
      drawText("Payment journey — visual stepper", 14, currentY, 14, colors.slate800, 'helvetica', 'bold');
      currentY += 15;
      
      const paymentMilestones = projectContext?.paymentMilestones || [];
      const executionMilestones = paymentMilestones.filter(m => m.type === 'execution');
      
      if (executionMilestones.length > 0) {
        // Calculate milestones
        const computedMilestones = executionMilestones.map((m, idx) => {
          // Borrow calculation logic from component
          const eD = projectContext?.financials?.executionGstEnabled !== false ? gstRate : 0;
          const ePercent = projectContext?.financials?.billablePercent ?? 100;
          const amtBase = pdfRevisedExecution * (m.percentage/100);
          const iBill = amtBase * (ePercent/100);
          const iCash = amtBase * (Math.max(0, 100 - ePercent)/100);
          const iGst = iBill * (eD/100);
          let amtTotal = iBill + iCash + iGst;
          
          let initPaid = 0;
          if (idx === 0 && (projectContext?.financials?.initiationFeePaid || 0) > 0) {
             initPaid = Math.min(amtTotal, projectContext.financials.initiationFeePaid);
             amtTotal = Math.max(0, amtTotal - projectContext.financials.initiationFeePaid);
          }
          return { name: m.name, amount: amtTotal, status: m.status };
        });

        const stepW = (pageWidth - 28) / (computedMilestones.length);
        const circleR = 4;
        computedMilestones.forEach((mg, idx) => {
          const cX = 14 + (stepW/2) + (idx * stepW);
          const cY = currentY;
          
          if (idx < computedMilestones.length - 1) {
            doc.setDrawColor(226, 232, 240);
            doc.line(cX + circleR + 2, cY, cX + stepW - circleR - 2, cY);
          }
          
          const isCleared = mg.status === 'paid' || mg.status === 'invoiced';
          if (isCleared) {
            doc.setFillColor(colors.emerald50[0], colors.emerald50[1], colors.emerald50[2]);
            doc.circle(cX, cY, circleR, 'F');
            drawText("v", cX - 1, cY + 1.5, 8, colors.emerald600); // Checkmark approximation
          } else {
            doc.setFillColor(colors.slate50[0], colors.slate50[1], colors.slate50[2]);
            doc.setDrawColor(203, 213, 225);
            doc.circle(cX, cY, circleR, 'FD');
            drawText((idx+1).toString(), cX, cY + 1.5, 8, colors.slate600, 'helvetica', 'normal', 'center');
          }
          
          // Use split text to wrap long names like "Material Order Advance"
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          const maxTextW = stepW - 4;
          const splitName = doc.splitTextToSize(mg.name, maxTextW);
          let startY = cY + 8;
          splitName.forEach(line => {
             drawText(line, cX, startY, 8, colors.slate800, 'helvetica', 'normal', 'center');
             startY += 3;
          });
          drawText(\`\${formatINR(Math.round(mg.amount))}\`, cX, startY, 9, colors.slate900, 'helvetica', 'bold', 'center');
        });
        currentY += 25;
      }

      // ----------------------------------------------------
      // PART 2 - ACTION REQUIRED
      // ----------------------------------------------------
      const pendingItems = currentRevisionBoq.filter(i => i.status === 'Pending Decision');
      if (pendingItems.length > 0) {
        if (currentY > 230) { doc.addPage(); currentY = 20; }
        
        drawText("PART 2 — ACTION REQUIRED", 14, currentY, 10, colors.amber700, 'helvetica', 'bold');
        currentY += 8;

        pendingItems.forEach(pi => {
           if (currentY > 260) { doc.addPage(); currentY = 20; }
           doc.setFillColor(colors.amber50[0], colors.amber50[1], colors.amber50[2]);
           doc.setDrawColor(colors.amber700[0], colors.amber700[1], colors.amber700[2]);
           doc.roundedRect(14, currentY, pageWidth - 28, 20, 2, 2, 'FD');
           
           drawText(\`Your confirmation needed: \${pi.item}\`, 22, currentY + 7, 10, colors.amber700, 'helvetica', 'bold');
           const noteStr = pi.note || \`We've proposed this change for \${formatINR(pi.total)}. Please confirm if you'd like to proceed.\`;
           doc.setFontSize(9);
           doc.setFont('helvetica', 'normal');
           doc.setTextColor(colors.amber700[0], colors.amber700[1], colors.amber700[2]);
           const noteSplit = doc.splitTextToSize(noteStr.replace(/₹/g, 'Rs. '), pageWidth - 40);
           let nY = currentY + 12;
           noteSplit.forEach(line => {
              doc.text(line, 22, nY);
              nY += 4;
           });
           
           // Idea icon text
           drawText("💡 Confirming this holds your estimated amount. We'll adjust the scope only if you want changes.", 14, nY + 4, 8, colors.slate600);
           currentY = nY + 12;
        });
        currentY += 8;
      }

      // ----------------------------------------------------
      // PART 3 - WHAT CHANGED
      // ----------------------------------------------------
      if (cChanged > 0 || cVendor > 0 || pendingItems.length > 0) {
        if (currentY > 200) { doc.addPage(); currentY = 20; }
        drawText("PART 3 — WHAT CHANGED", 14, currentY, 10, colors.slate500, 'helvetica', 'bold');
        currentY += 8;
        
        const changedItemsData = currentRevisionBoq.filter(i => i.status !== 'Approved');
        
        const changedBody = changedItemsData.map(item => {
           let dispStatus = item.status;
           let amtStr = formatINR(item.total);
           if (item.status === 'Vendor Direct') { dispStatus = 'Vendor direct'; amtStr = 'Vendor direct'; }
           if (item.status === 'Pending Decision') { dispStatus = 'Pending'; amtStr = \`\${formatINR(item.total)} (pending)\`; }
           if (item.status === 'Added') { dispStatus = 'Added'; }
           if (item.status === 'Removed') { dispStatus = 'Removed'; }
           
           return [
             item.item + "\\n" + item.section,
             amtStr,
             dispStatus,
             item.reasonCategory ? \`[\${item.reasonCategory}] \${item.note || ''}\` : (item.note || '')
           ];
        });

        // Use autoTable for the changed items
        autoTable(doc, {
          startY: currentY,
          head: [['ITEM', 'REVISED AMOUNT', 'CHANGE', 'WHY']],
          body: changedBody,
          theme: 'plain',
          styles: { fontSize: 9, cellPadding: 4, font: 'helvetica' },
          headStyles: { textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 35 },
            2: { cellWidth: 30 },
            3: { cellWidth: 45 }
          },
          didDrawCell: (data) => {
            if (data.section === 'head' && data.row.index === 0) {
               doc.setDrawColor(226, 232, 240);
               doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
          },
          didParseCell: (data) => {
            if (data.cell && data.cell.text) {
               data.cell.text = data.cell.text.map(t => t.replace(/₹/g, 'Rs. '));
            }
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // ----------------------------------------------------
      // APPENDIX - FULL BOQ REFERENCE
      // ----------------------------------------------------
      doc.addPage();
      currentY = 20;
      
      const appTagW = doc.getTextWidth("APPENDIX — FULL BOQ REFERENCE") + 6;
      doc.setFillColor(colors.slate50[0], colors.slate50[1], colors.slate50[2]);
      doc.roundedRect(14, currentY - 5, appTagW, 8, 1, 1, 'F');
      drawText("APPENDIX — FULL BOQ REFERENCE", 17, currentY, 10, colors.slate800, 'helvetica', 'bold');
      currentY += 10;
      drawText("This is your complete scope for reference only. No items in this section require action.", 14, currentY, 10, colors.slate600);
      currentY += 8;

      const fullBoqBody = currentRevisionBoq.map(item => {
          let stat = item.status === 'Approved' ? 'Confirmed' : item.status;
          if (item.status === 'Vendor Direct') stat = 'Vendor direct';
          if (item.status === 'Pending Decision') stat = 'Pending';
          return [
            item.item,
            formatINR(item.total),
            stat
          ];
      });

      autoTable(doc, {
          startY: currentY,
          head: [['ITEM', 'AMOUNT', 'STATUS']],
          body: fullBoqBody,
          theme: 'plain',
          styles: { fontSize: 9, cellPadding: 3, font: 'helvetica' },
          headStyles: { textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 120 },
            1: { cellWidth: 30 },
            2: { cellWidth: 30 }
          },
          didDrawCell: (data) => {
            if (data.section === 'head' && data.row.index === 0) {
               doc.setDrawColor(226, 232, 240);
               doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
            }
          },
          willDrawCell: (data) => {
             // Draw a subtle line between rows
             if (data.section === 'body') {
               doc.setDrawColor(241, 245, 249);
               doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
             }
          },
          didParseCell: (data) => {
            if (data.cell && data.cell.text) {
               data.cell.text = data.cell.text.map(t => t.replace(/₹/g, 'Rs. '));
            }
          }
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 10;
      drawText(\`+ \${currentRevisionBoq.length} scope items • \${formatINR(finalRevisedTotal)} total\`, 14 + 180/2, currentY, 10, colors.slate500, 'helvetica', 'normal', 'center');

      doc.save(\`\${projectContext?.name || 'Project'}_Revision_Pack_\${new Date().toISOString().split('T')[0]}.pdf\`);
      showToast("PDF Pack generated successfully!");
    } catch (err) {
      console.error("Error generating PDF:", err);
      showToast("Could not generate PDF. Please try again.");
    }
  };`;

fs.writeFileSync('components/RevisionStudio.tsx', f.substring(0, startIndex) + replacement + f.substring(endIndex));
console.log("Successfully replaced exportToPDF!");
