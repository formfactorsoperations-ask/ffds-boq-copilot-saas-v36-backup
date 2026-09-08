import { jsPDF } from 'jspdf';
import { formatINR } from '../../../lib/utils';
import type { DecisionData } from '../../../services/decisionsService';

/**
 * The client sign-off certificate for one decision.
 *
 * Lifted out of the Decisions screen unchanged -- 200 lines of jsPDF drawing
 * commands that never touched component state and only made that file harder
 * to read. `studioName` and the error reporter are passed in because they are
 * the only two things it borrowed from its old home.
 */
export function downloadDecisionPdf(
  decision: DecisionData,
  studioName: string,
  onError: (message: string) => void,
) {
  const formatDate = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  };

  const showToast = (message: string, _type?: 'error' | 'success') => onError(message);

  const renderBoqImpactLabel = (impact: string) => {
    if (impact === 'none') return 'No cost change';
    if (impact === 'rate_change') return 'Rate changed';
    if (impact === 'new_item') return 'New item added';
    return impact;
  };

        try {
            const doc = new jsPDF();
            const pageWidth = 210;
            const marginX = 20;
            const contentWidth = 170; // 210 - 40
            
            // --- Elegant Brand Palette ---
            const ink = [31, 35, 40];       // #1f2328 - Primary Ink
            const inkSoft = [63, 70, 78];    // #3f464e - Secondary
            const muted = [114, 122, 130];   // #727a82 - Muted
            const gold = [176, 141, 87];    // #b08d57 - Gold
            const line = [230, 227, 220];   // #e6e3dc - Standard Line
            const lineSoft = [239, 236, 230]; // #efece6 - Soft Line
            const paper = [251, 250, 247];  // #fbfaf7 - Paper Background

            // Helper for setting colors & text
            const drawText = (
                text: string,
                x: number,
                y: number,
                size: number,
                color: number[],
                fontStyle: 'normal' | 'bold' | 'italic' = 'normal',
                align: 'left' | 'center' | 'right' = 'left'
            ) => {
                doc.setFont('helvetica', fontStyle);
                doc.setFontSize(size);
                doc.setTextColor(color[0], color[1], color[2]);
                doc.text(text || '', x, y, { align });
            };

            // 1. Header (Mast - Editorial Style matching TermsDocketPage / StudioDocumentShell)
            let y = 20;
            
            // Studio Brand Name
            drawText(studioName.toUpperCase(), marginX, y, 11, ink, 'bold');
            drawText('MINIMAL DESIGN. MAXIMUM IMPACT.', marginX, y + 4.5, 7, muted, 'normal');

            // Right-aligned Document Identifier
            drawText('DECISION LEDGER RECORD', pageWidth - marginX, y, 9.5, gold, 'bold', 'right');
            drawText(`REF: FFDS-DEC-${decision.id ? decision.id.substring(0, 8).toUpperCase() : 'NEW'}`, pageWidth - marginX, y + 4.5, 8, muted, 'normal', 'right');

            // Single Gold Hairline Accent
            doc.setFillColor(gold[0], gold[1], gold[2]);
            doc.rect(marginX, y + 10, contentWidth, 0.4, 'F');

            // 2. Document Title
            y = 42;
            drawText('ON-SITE DESIGN & EXECUTION DECISION', marginX, y, 14, ink, 'bold');
            drawText('This document certifies technical decisions, on-site revisions, and client authorizations.', marginX, y + 5, 8.5, inkSoft, 'normal');

            // 3. Metabar / Project Classification & Info Grid
            y = 56;
            // Draw metabar container with paper background and standard border
            doc.setFillColor(paper[0], paper[1], paper[2]);
            doc.setDrawColor(line[0], line[1], line[2]);
            doc.setLineWidth(0.3);
            doc.rect(marginX, y, contentWidth, 34, 'FD');

            // Internal Grid lines
            doc.setDrawColor(lineSoft[0], lineSoft[1], lineSoft[2]);
            doc.line(marginX, y + 11.5, marginX + contentWidth, y + 11.5);
            doc.line(marginX, y + 23, marginX + contentWidth, y + 23);
            doc.line(110, y, 110, y + 34);

            // Row 1
            drawText('PROJECT NAME', marginX + 4, y + 4.5, 7.5, muted, 'bold');
            drawText(decision.projectName || 'N/A', marginX + 4, y + 9, 8.5, ink, 'normal');

            drawText('CLIENT NAME', 114, y + 4.5, 7.5, muted, 'bold');
            drawText(decision.clientName || 'N/A', 114, y + 9, 8.5, ink, 'normal');

            // Row 2
            drawText('ROOM / AREA', marginX + 4, y + 16, 7.5, muted, 'bold');
            drawText(decision.roomName, marginX + 4, y + 20.5, 8.5, ink, 'normal');

            drawText('CLIENT EMAIL', 114, y + 16, 7.5, muted, 'bold');
            drawText(decision.clientEmail || 'N/A', 114, y + 20.5, 8.5, ink, 'normal');

            // Row 3
            drawText('CATEGORY', marginX + 4, y + 27.5, 7.5, muted, 'bold');
            drawText(decision.category, marginX + 4, y + 32, 8.5, ink, 'normal');

            drawText('PRESENTEES', 114, y + 27.5, 7.5, muted, 'bold');
            drawText(decision.presentees || 'N/A', 114, y + 32, 8.5, ink, 'normal');

            // 4. Financial & Schedule Impact Sections (Highlight & Principle styled)
            y = 98;
            drawText('FINANCIAL & SCHEDULE REVISIONS', marginX, y, 10, ink, 'bold');

            // Left Box: Cost Impact (Highlight Style: light gold background, gold left border)
            doc.setFillColor(253, 248, 239); // #fdf8ef
            doc.setDrawColor(236, 220, 192); // light gold border
            doc.rect(marginX, y + 4, 82, 18, 'FD');
            // Gold left border
            doc.setFillColor(gold[0], gold[1], gold[2]);
            doc.rect(marginX, y + 4, 1.5, 18, 'F');

            drawText('ESTIMATED COST IMPACT', marginX + 4.5, y + 9, 7.5, [138, 107, 52], 'bold');
            drawText(`${formatINR(decision.impactCostValue)} (${renderBoqImpactLabel(decision.boqImpact)})`, marginX + 4.5, y + 15, 10, ink, 'bold');

            // Right Box: Schedule Impact (Principle Style: soft grey background, slate left border)
            doc.setFillColor(244, 242, 236); // #f4f2ec
            doc.setDrawColor(230, 227, 220); // soft line border
            doc.rect(108, y + 4, 82, 18, 'FD');
            // Slate left border
            doc.setFillColor(ink[0], ink[1], ink[2]);
            doc.rect(108, y + 4, 1.5, 18, 'F');

            drawText('SCHEDULE TIMELINE IMPACT', 112.5, y + 9, 7.5, ink, 'bold');
            drawText(decision.impactScheduleDays ? `+ ${decision.impactScheduleDays} Work Days` : 'No Schedule Delay', 112.5, y + 15, 10, ink, 'bold');

            // 5. Main Decision text
            let yPos = 126;
            drawText('DECISION TEXT & AGREED CHANGE SCOPE', marginX, yPos, 10, ink, 'bold');
            yPos += 4;
            
            const splitDescription = doc.splitTextToSize(decision.decisionText, 164);
            const textHeight = splitDescription.length * 5.2;
            
            // Draw a subtle left bar with gold accent
            doc.setFillColor(gold[0], gold[1], gold[2]);
            doc.rect(marginX, yPos, 1.2, textHeight + 6, 'F');
            
            // Write text lines
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(inkSoft[0], inkSoft[1], inkSoft[2]);
            doc.text(splitDescription, marginX + 4.5, yPos + 5.5);
            
            yPos += textHeight + 20;

            // 6. Signature Sign-off and Digital Audit Block (No colored status pills, very sober print-first)
            if (decision.status === 'signed' && decision.signoff) {
                drawText('DIGITAL ACKNOWLEDGEMENT & COMPLIANCE PROOF', marginX, yPos, 10, ink, 'bold');
                
                // Outer box
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(line[0], line[1], line[2]);
                doc.rect(marginX, yPos + 4, contentWidth, 38, 'FD');
                
                // Green indicator bar
                doc.setFillColor(16, 124, 65);
                doc.rect(marginX, yPos + 4, 1.5, 38, 'F');
                
                // Details
                drawText('AUTHORIZED SIGNATORY DETAILS', marginX + 5, yPos + 10, 7.5, muted, 'bold');
                drawText(`Signed by: ${decision.signoff.clientNameEntered || decision.clientName}`, marginX + 5, yPos + 16, 8.5, ink, 'normal');
                drawText(`Email Verification: ${decision.signoff.clientEmail || decision.clientEmail || 'N/A'}`, marginX + 5, yPos + 21.5, 8, inkSoft, 'normal');
                
                drawText('DIGITAL VERIFICATION AUDIT', 114, yPos + 10, 7.5, muted, 'bold');
                drawText(`IP Address: ${decision.signoff.ipAddress || 'Internal'}`, 114, yPos + 16, 8.5, ink, 'normal');
                drawText(`Verified Date: ${formatDate(decision.signoff.respondedAt)}`, 114, yPos + 21.5, 8, inkSoft, 'normal');
                
                // Status label
                drawText('STATUS: DIGITALLY APPROVED & BINDING', marginX + 5, yPos + 32, 8.5, [16, 124, 65], 'bold');
                
            } else if (decision.status === 'disputed' && decision.signoff) {
                drawText('REVISION REQUESTED & REVIEW DETAILS', marginX, yPos, 10, ink, 'bold');
                
                // Outer box
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(242, 202, 202);
                doc.rect(marginX, yPos + 4, contentWidth, 38, 'FD');
                
                // Red indicator bar
                doc.setFillColor(185, 28, 28);
                doc.rect(marginX, yPos + 4, 1.5, 38, 'F');
                
                drawText('STATUS: REVISION SOUGHT / CLARIFICATION ACTIVE', marginX + 5, yPos + 10, 7.5, [185, 28, 28], 'bold');
                drawText(`Raised by: ${decision.signoff.clientNameEntered || decision.clientName}`, marginX + 5, yPos + 16, 8.5, ink, 'normal');
                drawText(`Date Raised: ${formatDate(decision.signoff.respondedAt)}`, 114, yPos + 16, 8.5, inkSoft, 'normal');
                
                const splitQuery = doc.splitTextToSize(`Concern: "${decision.signoff.queryText || 'No comment provided.'}"`, contentWidth - 10);
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(8.5);
                doc.setTextColor(inkSoft[0], inkSoft[1], inkSoft[2]);
                doc.text(splitQuery, marginX + 5, yPos + 23);
                
            } else {
                drawText('CLIENT SIGN-OFF SHEET (FORMAL EXECUTION AUTHORIZATION)', marginX, yPos, 10, ink, 'bold');
                
                // Outer box
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(line[0], line[1], line[2]);
                doc.rect(marginX, yPos + 4, contentWidth, 34, 'FD');
                
                // Gold indicator bar
                doc.setFillColor(gold[0], gold[1], gold[2]);
                doc.rect(marginX, yPos + 4, 1.5, 34, 'F');
                
                drawText('STATUS: PENDING CLIENT DIGITAL SIGNATURE', marginX + 5, yPos + 11, 8, gold, 'bold');
                drawText('This decision is registered in site progress records. A physical signature below serves as official backup consent.', marginX + 5, yPos + 16, 8, inkSoft, 'normal');
                
                // Double Signature lines
                const sigY = yPos + 28;
                doc.setDrawColor(ink[0], ink[1], ink[2]);
                doc.setLineWidth(0.3);
                doc.line(marginX + 5, sigY, marginX + 55, sigY);
                doc.line(pageWidth - marginX - 55, sigY, pageWidth - marginX - 5, sigY);
                
                drawText('Authorized Studio Architect', marginX + 5, sigY + 4, 8, ink, 'bold');
                drawText('Client Verification Signature', pageWidth - marginX - 5, sigY + 4, 8, ink, 'bold', 'right');
            }

            // 7. Footer
            doc.setDrawColor(lineSoft[0], lineSoft[1], lineSoft[2]);
            doc.setLineWidth(0.3);
            doc.line(marginX, 276, pageWidth - marginX, 276);

            drawText(`This record is generated securely via ${studioName}. Unauthorized reproduction is legally restricted.`, marginX, 282, 7.5, muted, 'italic');
            drawText('Page 1 of 1', pageWidth - marginX, 282, 7.5, muted, 'normal', 'right');

            doc.save(`Signoff_${decision.roomName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);
        } catch (error) {
            console.error("Error generating PDF", error);
            showToast("Failed to generate PDF. Check console for details.", 'error');
        }
}
