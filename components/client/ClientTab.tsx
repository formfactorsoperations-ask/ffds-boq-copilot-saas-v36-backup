
import ProposalAcceptanceCard from '../ops/ProposalAcceptanceCard';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ProjectContext, FullBoqItem, ProposalTier, Item, AiComparisonResult, MaterialSuggestion, TimelinePhase, PaymentMilestone, ProposalContent, DecisionBrainOutput, LeadProfile, ProposalLevel, ProposalType } from '../../types';
import ClientExportView from './ClientExportView';
import ProposalSectionEditor from './ProposalSectionEditor';
import { useOrg } from '../../contexts/OrgContext';
import { Download } from '@/lib/lucide-shim';
import { UI_STYLES, UI_CONSTANTS } from '../../lib/UIConstants';
 
import { calculateSellPrice, generateDeterministicSchedule, formatINR } from '../../lib/utils';
import { buildProposalPdf, PdfTimeoutError, withTimeout, type PageOrientation, type PdfProgress } from '../../lib/proposalPdf';
import { onDownloadIntent } from '../../lib/downloadIntent';
import { generateLocalComparison } from '../../lib/comparison';
import { ExportIcon, PrintIcon, CheckBadgeIcon, PencilRulerIcon, BriefcaseIcon } from '../Icons';
import { TEMPLATE_TURNKEY, TEMPLATE_DESIGN_ONLY, INITIAL_BANK } from '../../constants';
import { proposalOption, optionLabel } from '../../lib/proposalOption';

export type { PageOrientation };

/*
  The one place that decides the printed sheet.

  Nothing in the exported document set `@page { size }`. The only rule that
  reached it came from index.html and carried a margin but no size, so the
  sheet was whatever the browser's print dialog happened to remember — which
  is why the booklet came out landscape. The pages are built at A4 portrait
  height, so portrait is the default and landscape is now a deliberate choice.
*/
export const pageRuleFor = (orientation: PageOrientation): string => `
  /* The sheet carries no margin of its own: .ff-page is exactly one sheet
     tall and its padding is the visual margin. Splitting the margin between
     the two is what made every page 12mm too tall for its sheet. */
  @page { size: A4 ${orientation}; margin: 0; }
  @media print {
    html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
    :root {
      --ff-page-h: ${orientation === 'landscape' ? '210mm' : '297mm'};
      --ff-page-pad: ${orientation === 'landscape' ? '14mm' : '16mm'};
    }
    .proposal-container, .vnext-proposal-wrapper {
      box-shadow: none !important; border: 0 !important; border-radius: 0 !important;
      margin: 0 !important; padding: 0 !important; background: #fff !important;
    }
  }
`;

interface ClientTabProps {
  tiers: ProposalTier[];
  bank: Item[];
  materialSuggestions: MaterialSuggestion[];
  timelinePhases: TimelinePhase[];
  setTimelinePhases: React.Dispatch<React.SetStateAction<TimelinePhase[]>>;
  isClientViewOnly?: boolean;
  projectContext?: ProjectContext;
  decisionBrainOutput?: DecisionBrainOutput | null;
  leadProfile?: LeadProfile;
  setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
  onExportHtml?: (fileName?: string, orientation?: PageOrientation) => void;
}

const ClientTab: React.FC<ClientTabProps> = (props) => {
  const { tiers, bank, materialSuggestions, timelinePhases, isClientViewOnly = false, projectContext: liveContext, setProjectContext, onExportHtml } = props;
  const { currentRole, orgData } = useOrg();
  const isDesigner = currentRole === 'Designer';

  const [comparisonData, setComparisonData] = useState<AiComparisonResult>({ materialMatrix: [], scopeMatrix: [], tierSummaries: [] });
  const [editingSection, setEditingSection] = useState<string | null>(null);

  const validTiers = useMemo(() => tiers.filter(t => t !== null && t !== undefined), [tiers]);
  const projectContext = liveContext || validTiers[0]?.projectContext;

  const bankMap = useMemo(() => {
    const map = new Map((bank || []).map(item => [item.id, item]));
    if (projectContext?.adHocItems) {
      projectContext.adHocItems.forEach(item => map.set(item.id, item));
    }
    INITIAL_BANK.forEach(item => {
      if (!map.has(item.id)) map.set(item.id, item);
    });
    return map;
  }, [bank, projectContext?.adHocItems]);

  const proposalLevel = projectContext?.activeProposalLevel || 'LEVEL_1';
  const activeMode = projectContext?.activeProposalMode || 'TURNKEY';
  const proposalFormat = projectContext?.activeProposalFormat || 'classic';
  const showScopePricing = projectContext?.showScopePricing || false;

  const setProposalLevel = (level: ProposalLevel) => {
      if (setProjectContext) {
          setProjectContext(prev => ({ ...prev, activeProposalLevel: level }));
      }
  };

  const setActiveMode = (mode: ProposalType) => {
      if (setProjectContext) {
          setProjectContext(prev => ({ ...prev, activeProposalMode: mode }));
      }
  };

  const setProposalFormat = (format: 'classic' | 'booklet') => {
      if (setProjectContext) {
          setProjectContext(prev => ({ ...prev, activeProposalFormat: format }));
      }
  };

  /* The option the Level 2 proposal is written for; the approved one until the studio picks another. */
  const l2Option = proposalOption(validTiers, projectContext);
  const setProposalOption = (tierId: string) => {
      if (setProjectContext) {
          setProjectContext(prev => ({ ...prev, proposalOptionId: tierId }));
      }
  };

  const toggleShowScopePricing = () => {
      if (setProjectContext) {
          setProjectContext(prev => ({ ...prev, showScopePricing: !showScopePricing }));
      }
  };

  // Updated Default Payment Milestones - Front-Loaded for Cash Flow
  const [paymentMilestones] = useState<PaymentMilestone[]>([
      { id: 'd1', type: 'design', name: 'Sign-up & Concept', percentage: 20, description: 'Retainer & Concept Direction' },
      { id: 'd2', type: 'design', name: 'Design Development & 3D', percentage: 35, description: 'Layouts, Visuals & Material Selection' },
      { id: 'd3', type: 'design', name: 'Technical Documentation', percentage: 35, description: 'Detailed GFC Drawings & Services' },
      { id: 'd4', type: 'design', name: 'Handover & Closeout', percentage: 10, description: 'Final Set Release' },
      { id: 'e1', type: 'execution', name: 'Material Order Advance', percentage: 10, description: 'Day 1 – Day 5' },
      { id: 'e2', type: 'execution', name: 'Material Procurement + Structural Works', percentage: 40, description: 'Day 6 – Day 35' },
      { id: 'e3', type: 'execution', name: 'Mid Execution (Outer Laminate Start)', percentage: 40, description: 'Day 36 – Day 65' },
      { id: 'e4', type: 'execution', name: 'Completion and Handover', percentage: 10, description: 'Day 66 – Day 90' },
  ]);

  useEffect(() => {
    const generateComp = () => {
        if (validTiers.length > 0) {
            const data = generateLocalComparison(validTiers, bank);
            setComparisonData(data);
        }
    };
    generateComp();
  }, [validTiers, bank]);

  const fullTiers = useMemo(() => {
    return validTiers.map(tier => {
      const fullBoq: FullBoqItem[] = (tier.boq || []).map(boqItem => {
        const bankItem = bankMap.get(boqItem.bankId);
        if (!bankItem) {
          return {
            id: boqItem.id,
            name: (boqItem as any).item || (boqItem as any).name || (boqItem.roomId ? `${boqItem.roomId} Scope Item` : 'Scope Item'),
            cat: (boqItem as any).cat || boqItem.roomId || 'General Scope',
            materials: boqItem.baseRate !== undefined ? boqItem.baseRate : ((boqItem as any).rate || 0),
            labor: 0,
            margin: boqItem.marginOverride ?? 0,
            unit: (boqItem as any).unit || 'nos',
            specs: (boqItem as any).specs || 'Scope Details',
            qty: boqItem.qty || 1,
            // Kept so the scope is grouped by room, and the summary can tell options
            // apart: the same item, and the spec it is built to.
            roomId: boqItem.roomId,
            bankId: boqItem.bankId,
            rationale: (boqItem as any).rationale,
          } as FullBoqItem;
        }
        const effectiveMargin = boqItem.marginOverride ?? bankItem.margin;
        const effectiveMaterials = boqItem.baseRate !== undefined ? boqItem.baseRate : bankItem.materials;
        const { id, ...bankRest } = bankItem;
        return { ...bankRest, ...boqItem, id: boqItem.id, materials: effectiveMaterials, margin: effectiveMargin };
      }).filter((i): i is FullBoqItem => i !== null);

      const executionTotal = fullBoq.reduce((sum, item) => sum + calculateSellPrice(item.materials, item.labor, item.margin) * item.qty, 0);
      
      const groupedBoq: { [key: string]: FullBoqItem[] } = {};
      const validRoomNames = new Set(projectContext?.rooms?.map(r => r.name) || []);
      
      fullBoq.forEach(item => {
          const roomName = item.roomId && validRoomNames.has(item.roomId) ? item.roomId : 'Unassigned';
          if (!groupedBoq[roomName]) groupedBoq[roomName] = [];
          groupedBoq[roomName].push(item);
      });

      return { ...tier, fullBoq, executionTotal, groupedBoq };
    });
  }, [validTiers, bankMap, projectContext]);

  const currentRevisionBoq = useMemo(() => {
    const tierId = projectContext?.approvedTierId || validTiers[0]?.id;
    if (!tierId) return [];
    const tier = validTiers.find(t => t.id === tierId);
    if (!tier) return [];
    
    const isGeneric = (s: any) => !s || typeof s !== 'string' || ['imported', 'imported.', 'custom / old item', ''].includes(s.trim().toLowerCase());

    const baselineBoq = (tier.boq || []).map(boqItem => {
      const bankItem = bankMap.get(boqItem.bankId);
      let itemName = '';
      if (bankItem?.name && !isGeneric(bankItem.name)) itemName = bankItem.name;
      else if ((boqItem as any).item && !isGeneric((boqItem as any).item)) itemName = (boqItem as any).item;
      else if ((boqItem as any).name && !isGeneric((boqItem as any).name)) itemName = (boqItem as any).name;
      else itemName = bankItem?.name || (boqItem as any).item || (boqItem as any).name || (boqItem.roomId ? `${boqItem.roomId} Scope Item` : 'Scope Item');

      const rate = boqItem.selectedRate !== undefined && Number(boqItem.selectedRate) > 0
        ? Number(boqItem.selectedRate)
        : bankItem
        ? calculateSellPrice(bankItem.materials, bankItem.labor, boqItem.marginOverride ?? bankItem.margin)
        : Number((boqItem as any).rate || (boqItem as any).baseRate || 0);

      return {
        id: boqItem.id,
        section: boqItem.roomId || bankItem?.cat || 'General Scope',
        item: itemName,
        unit: (boqItem as any).unit || bankItem?.unit || 'nos',
        qty: boqItem.qty,
        rate: rate,
        total: rate * boqItem.qty,
        status: 'Approved'
      };
    }).filter(Boolean);

    let workingBoq = JSON.parse(JSON.stringify(baselineBoq));
    const actions = projectContext?.boqRevisions || [];

    actions.forEach(action => {
      if (action.type === 'ADD') {
        workingBoq.push({
          id: action.id,
          section: action.section,
          item: action.item,
          unit: action.newValue.unit || 'nos',
          qty: action.newValue.qty || 1,
          rate: action.newValue.rate || 0,
          total: (action.newValue.qty || 1) * (action.newValue.rate || 0),
          status: 'Added',
          note: action.note,
          reasonCategory: action.reasonCategory
        });
      } else {
        const targetIndex = workingBoq.findIndex((i: any) => i.section === action.section && i.item === action.item);
        if (targetIndex >= 0) {
          if (action.type === 'REMOVE') {
            workingBoq[targetIndex].status = 'Removed';
            workingBoq[targetIndex].qty = 0;
            workingBoq[targetIndex].total = 0;
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          } else if (action.type === 'REVISE_QTY') {
            workingBoq[targetIndex].qty = action.newValue;
            workingBoq[targetIndex].total = action.newValue * workingBoq[targetIndex].rate;
            workingBoq[targetIndex].status = 'Revised';
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          } else if (action.type === 'REVISE_RATE') {
            workingBoq[targetIndex].rate = action.newValue;
            workingBoq[targetIndex].total = workingBoq[targetIndex].qty * action.newValue;
            workingBoq[targetIndex].status = 'Revised';
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          } else if (action.type === 'MARK_PENDING') {
            workingBoq[targetIndex].status = 'Pending Decision';
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          } else if (action.type === 'MARK_VENDOR') {
            workingBoq[targetIndex].status = 'Vendor Direct';
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          } else if (action.type === 'REPLACE') {
            workingBoq[targetIndex].item = action.newValue.item;
            workingBoq[targetIndex].rate = action.newValue.rate;
            workingBoq[targetIndex].total = workingBoq[targetIndex].qty * action.newValue.rate;
            workingBoq[targetIndex].status = 'Replaced';
            workingBoq[targetIndex].note = action.note;
            workingBoq[targetIndex].reasonCategory = action.reasonCategory;
          }
        }
      }
    });

    return workingBoq;
  }, [validTiers, bankMap, projectContext?.approvedTierId, projectContext?.boqRevisions]);

  const tasks = useMemo(() => {
    const activeTier = fullTiers.find(t => t.id === projectContext?.approvedTierId) || fullTiers[0];
    if (!activeTier) return [];
    return generateDeterministicSchedule(activeTier.fullBoq);
  }, [fullTiers, projectContext?.approvedTierId]);

  /*
    Export state lives above the early return below: a hook declared after a
    conditional return crashes the page ("rendered more hooks") the moment the
    options arrive after the first render.
  */
  const [exportOrientation, setExportOrientation] = useState<PageOrientation>('portrait');
  const [pdfProgress, setPdfProgress] = useState<PdfProgress | null>(null);
  const isBuildingPdf = pdfProgress !== null;
  const buildingPdf = useRef(false);
  // The Documents board's download intent fires a handler captured on mount; this keeps it current.
  const downloadPdfRef = useRef<() => void>(() => {});

  /* Download from the Documents board opens this page asking for the PDF. */
  useEffect(() => {
    return onDownloadIntent('client', '.vnext-proposal-wrapper .ff-page, .vnext-proposal-wrapper.ff-classic', () => downloadPdfRef.current());
  }, []);

  if (!projectContext || validTiers.length === 0) return <div>No data available to generate a proposal. Please set up the project first.</div>;

  const handleUpdateContent = (newContent: ProposalContent) => {
      if (setProjectContext) {
          setProjectContext(prev => ({
              ...prev, 
              // Save to mode-specific content to ensure separation
              proposalContentByMode: {
                  ...(prev.proposalContentByMode || {}),
                  [activeMode]: newContent
              },
              // For backward compatibility, also update the main proposalContent if we are in Turnkey mode
              ...(activeMode === 'TURNKEY' ? { proposalContent: newContent } : {})
          }));
      }
      setEditingSection(null);
  }

  // --- NEW: Visibility Handler Logic ---
  const handleVisibilityChange = (newVisibility: Record<string, boolean>) => {
      if (setProjectContext) {
          setProjectContext(prev => {
              // 1. Get current content for the ACTIVE MODE (or empty object if none)
              const currentModeContent = prev.proposalContentByMode?.[activeMode] || {};
              
              // 2. Update visibleSections in that content object
              const updatedModeContent = { 
                  ...currentModeContent, 
                  visibleSections: newVisibility 
              };
              
              const newProposalContentByMode = {
                  ...(prev.proposalContentByMode || {}),
                  [activeMode]: updatedModeContent
              };

              // 3. For backward compatibility: Update root proposalContent if Turnkey
              const mainUpdate = activeMode === 'TURNKEY' 
                  ? { proposalContent: { ...(prev.proposalContent || {}), visibleSections: newVisibility } } 
                  : {};

              return {
                  ...prev,
                  proposalContentByMode: newProposalContentByMode,
                  ...mainUpdate
              };
          });
      }
  };

  // --- Dynamic Defaults Construction Logic ---
  // 1. Select the base template based on the current ACTIVE VIEW MODE
  let baseTemplate = TEMPLATE_TURNKEY;
  if (activeMode === 'DESIGN_ONLY') baseTemplate = TEMPLATE_DESIGN_ONLY;
  
  // 2. Retrieve any saved overrides for the CURRENT mode
  const savedModeContent = projectContext.proposalContentByMode?.[activeMode];
  
  // 3. Special case for legacy Turnkey data: 
  const legacyContent = (activeMode === 'TURNKEY' && !savedModeContent && projectContext.proposalContent) 
      ? projectContext.proposalContent 
      : {};

  // 4. Construct Final Content
  const mergedContent = {
      ...baseTemplate,
      ...legacyContent,
      ...savedModeContent
  };

  /* "[Tier Name]" stays in the saved text and is filled in where it is shown,
     with the option the Level 2 proposal is for (lib/proposalOption.ts). Baking
     a name in here saved it with the text, so it outlived a change of option. */

  // --- CIVIL WORKS DURATION WARNING INJECTION ---
  if (projectContext.propertyStatus === 'raw_shell' && activeMode === 'TURNKEY') {
      const warningText = "\n\n⚠️ NOTE: Civil works require technical curing time before woodwork installation to ensure durability. This phasing is factored into the schedule.";
      
      if (mergedContent.timeline && !mergedContent.timeline.subtitle.includes('curing')) {
          mergedContent.timeline = {
              ...mergedContent.timeline,
              subtitle: mergedContent.timeline.subtitle + warningText
          };
      }
  }

  // We patch the proposalType in context *just for the view*
  const viewContext = { ...projectContext, proposalType: activeMode, proposalContent: mergedContent };

const MODEL_SWITCHER = [
      { id: 'TURNKEY', label: 'Turnkey Proposal', icon: <CheckBadgeIcon className="w-4 h-4" /> },
      { id: 'DESIGN_ONLY', label: 'Design & PMC', icon: <PencilRulerIcon className="w-4 h-4" /> },
  ];

  const getExportFileName = () => {
        const safeProjectName = (projectContext.name || 'Project').replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_');
        
        if (activeMode === 'TURNKEY') {
            if (proposalLevel === 'LEVEL_1') return `Turnkey_Proposal_L1_Design_Overview_${safeProjectName}`;
            if (proposalLevel === 'LEVEL_2') return `Turnkey_Proposal_L2_Design_Cost_Plan_${safeProjectName}`;
            if (proposalLevel === 'LEVEL_3') return `Turnkey_Proposal_L3_Final_Scope_Execution_${safeProjectName}`;
        } else if (activeMode === 'DESIGN_ONLY') {
            if (proposalLevel === 'LEVEL_1') return `Design_PMC_L1_Design_Overview_${safeProjectName}`;
            // Fallbacks for Design Only levels not explicitly named in prompt
            if (proposalLevel === 'LEVEL_2') return `Design_PMC_L2_Planning_${safeProjectName}`;
            if (proposalLevel === 'LEVEL_3') return `Design_PMC_L3_Agreement_${safeProjectName}`;
        }
        
        return `${activeMode}_${proposalLevel}_${safeProjectName}`;
  }

  const handlePrint = () => {
      // Logic to generate HTML string
      const clientViewNode = document.querySelector('.vnext-proposal-wrapper');
      if (!clientViewNode) {
          alert('Content not fully loaded. Please wait a moment and try again.');
          return;
      }

      const doc = document.cloneNode(true) as Document;
      const proposalWrapper = doc.querySelector('.vnext-proposal-wrapper');
      if (proposalWrapper) {
          doc.body.innerHTML = '';
          doc.body.appendChild(proposalWrapper);
          doc.body.className = 'luxe-proposal-active'; // Retain styling class
      }
      
      // Cleanup
      doc.querySelectorAll('.no-print, script[type="module"], script[type="importmap"]').forEach(el => el.remove());

      // Appended last so it beats the size-less @page rule from index.html.
      const pageStyle = doc.createElement('style');
      pageStyle.textContent = pageRuleFor(exportOrientation);
      doc.head.appendChild(pageStyle);

      // Auto-print script with expanded details
      const script = document.createElement('script');
      script.textContent = `
        window.onload = () => {
            document.querySelectorAll('details').forEach(d => d.setAttribute('open', 'true'));
            setTimeout(() => {
                window.print();
            }, 800);
        };
      `;
      doc.body.appendChild(script);

      const htmlContent = doc.documentElement.outerHTML;
      const blob = new Blob([`<!DOCTYPE html>${htmlContent}`], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      // Attempt to open in new tab to bypass iframe sandbox print restrictions
      const pdfWindow = window.open(url, '_blank');
      
      if (!pdfWindow) {
          alert('Pop-up blocked. Please allow popups for this site to generate the PDF print view.');
      }
  }

  /*
    One proposal, two ways to get it out.

    Download PDF used to be ~440 lines of jsPDF drawing a summary document from
    scratch, while Save PDF printed the actual booklet — so the two buttons
    handed the client visibly different papers. Both now produce the same
    booklet at the same page geometry, honouring the same orientation toggle.

    How the pages are captured, and why it stays quick, is in lib/proposalPdf.ts.

    The remaining difference from Save PDF is the pipeline, not the layout:
    this route rasterises, so text in the file is not selectable. Save PDF goes
    through the browser's own print engine and keeps text vector — reach for
    that when the client needs to search or copy from the document.
  */
  const handleDownloadPdf = async () => {
    if (buildingPdf.current) return;
    const root = document.querySelector('.vnext-proposal-wrapper') as HTMLElement | null;
    if (!root) {
      alert('Proposal content is still loading. Please try again in a moment.');
      return;
    }
    buildingPdf.current = true;
    setPdfProgress({ done: 0, total: 0 });
    try {
      // A ceiling on the whole build, on top of the ones on each step inside it.
      const pdf = await withTimeout(buildProposalPdf(root, exportOrientation, setPdfProgress), 180_000, 'Building the PDF');
      pdf.save(`${getExportFileName()}.pdf`);
    } catch (err) {
      console.error('PDF generation failed', err);
      alert(err instanceof PdfTimeoutError
        ? `The PDF is taking too long (${err.message}). Use Save PDF to print it to PDF instead.`
        : 'PDF download failed. Use Save PDF to print to PDF instead.');
    } finally {
      buildingPdf.current = false;
      setPdfProgress(null);
    }
  };
  downloadPdfRef.current = handleDownloadPdf;

  return (
    <div className={`transition-all ${isClientViewOnly ? '' : 'p-4 bg-slate-200/50 pattern-bg rounded-2xl print:p-0 print:bg-white print:rounded-none'}`}>
        {!isClientViewOnly && setProjectContext && (
            <div className="flex flex-col gap-4 mb-6 no-print">
                 {/* The client's acceptance of these commercials — studio-side
                     only, and the thing the rest of the project waits on. */}
                 <ProposalAcceptanceCard
                     projectContext={projectContext}
                     setProjectContext={setProjectContext}
                     tiers={tiers || []}
                 />

                 
                 <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                     {/* Engagement Model Switcher */}
                     <div className="bg-white p-1 rounded-lg border border-slate-300 shadow-sm flex items-center">
                        {MODEL_SWITCHER.map((m: any) => (
                            <button
                                key={m.id}
                                onClick={() => setActiveMode(m.id as ProposalType)}
                                className={`${UI_STYLES.button.xs} rounded-md transition-all ${activeMode === m.id ? 'bg-[#3D52A0] text-white shadow-sm' : 'text-slate-500 hover:text-[#334486] hover:bg-sky-50'}`}
                            >
                                {m.icon}
                                {m.label}
                            </button>
                        ))}
                     </div>

                     <div className="flex gap-3 items-center">
                        {/* Portrait matches how the booklet pages are built; landscape
                            is there for wide scope tables that read better across. */}
                        <div className="bg-white p-1 rounded-lg border border-slate-300 shadow-sm flex items-center" role="group" aria-label="Export page orientation">
                            {(['portrait', 'landscape'] as PageOrientation[]).map(o => (
                                <button
                                    key={o}
                                    type="button"
                                    onClick={() => setExportOrientation(o)}
                                    aria-pressed={exportOrientation === o}
                                    title={`Export as A4 ${o}`}
                                    className={`px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded-md transition-all ${
                                        exportOrientation === o
                                            ? 'bg-[#3D52A0] text-white shadow-sm'
                                            : 'text-slate-500 hover:text-[#334486] hover:bg-sky-50'
                                    }`}
                                >{o}</button>
                            ))}
                        </div>

                        {onExportHtml && (
                            <button 
                                onClick={() => onExportHtml(getExportFileName(), exportOrientation)} 
                                className={`${UI_STYLES.button.sm} ${UI_STYLES.button.secondary}`}
                            >
                                <ExportIcon className="w-4 h-4" /> Export HTML
                            </button>
                        )}
                        

                         <button 
                             type="button"
                             onClick={handleDownloadPdf}
                             disabled={isBuildingPdf}
                             className="flex items-center gap-2 px-4 py-2 bg-[#3D52A0] text-white font-bold text-sm rounded-lg shadow-sm hover:bg-[#334486] transition-all disabled:opacity-60 disabled:cursor-wait"
                         >
                             <Download className="w-4 h-4" /> {pdfProgress ? (pdfProgress.total ? `Building PDF… ${pdfProgress.done}/${pdfProgress.total}` : 'Building PDF…') : 'Download PDF'}
                         </button>

                         <button 
                             type="button"
                             onClick={handlePrint}
                             className="flex items-center gap-2 px-4 py-2 bg-white text-[#334486] font-bold text-sm rounded-lg border border-sky-200 shadow-sm hover:bg-sky-50 hover:border-sky-300 transition-all"
                         >
                             <PrintIcon className="w-4 h-4"/> Save PDF
                         </button>
                    </div>
                 </div>

                 {/* Level Switcher and Format Switcher */}
                 <div className="flex flex-col md:flex-row justify-between gap-4 w-full items-start md:items-center">
                     <div className="flex bg-white rounded-lg p-1 border border-slate-300 shadow-sm flex-wrap gap-1">
                        <button 
                            onClick={() => setProposalLevel('LEVEL_1')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_1' ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Level 1: Concept
                        </button>
                        <button 
                            onClick={() => setProposalLevel('LEVEL_1_5')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_1_5' ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Level 1.5: Interim Update
                        </button>
                        <button 
                            onClick={() => setProposalLevel('LEVEL_2')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_2' ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Level 2: Planning
                        </button>
                        <button 
                            onClick={() => setProposalLevel('LEVEL_3')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_3' ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Level 3: Execution
                        </button>
                     </div>

                     {true && (
                         <div className="flex items-center gap-4 flex-wrap">
                             {proposalLevel === 'LEVEL_2' && validTiers.length > 0 && (
                                 <label className="flex items-center gap-2 bg-white pl-3 pr-1 py-1 rounded-lg border border-slate-300 shadow-sm text-xs font-bold text-slate-700 no-print">
                                     <span className="text-slate-500">Proposal for</span>
                                     <select
                                         value={l2Option.tier?.id || ''}
                                         onChange={e => setProposalOption(e.target.value)}
                                         aria-label="Option the Level 2 proposal is for"
                                         className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-[#3D52A0]/30 focus:border-[#3D52A0]"
                                     >
                                         {validTiers.map((t, i) => (
                                             <option key={t.id} value={t.id}>
                                                 {optionLabel(i)} · {t.name}{t.id === projectContext.approvedTierId ? ' (approved)' : ''}
                                             </option>
                                         ))}
                                     </select>
                                 </label>
                             )}
                             {!isDesigner && (
                                 <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-300 shadow-sm text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all select-none no-print">
                                     <input 
                                         type="checkbox" 
                                         checked={showScopePricing} 
                                         onChange={toggleShowScopePricing}
                                         className="rounded border-slate-300 text-[#3D52A0] focus:ring-[#3D52A0] w-3.5 h-3.5"
                                     />
                                     <span>Show Scope Pricing & Total</span>
                                 </label>
                             )}
                             {proposalLevel !== 'LEVEL_3' && (
                                 <div className="flex bg-white rounded-lg p-1 border border-slate-300 shadow-sm gap-1 self-stretch md:self-auto">
                                 <button
                                 onClick={() => setProposalFormat('classic')}
                                 className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalFormat === 'classic' ? 'bg-[#3D52A0] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                             >
                                 Classic Digital
                             </button>
                             <button
                                 onClick={() => setProposalFormat('booklet')}
                                 className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalFormat === 'booklet' ? 'bg-[#3D52A0] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                             >
                                 Luxe Booklet (New Format)
                             </button>
                         </div>
                         )}
                     </div>
                     )}
                 </div>
            </div>
        )}

        <div className="proposal-container shadow-2xl rounded-xl border border-slate-300 bg-white">
            {/* We inject the type-specific content into the projectContext for the child view */}
            <ClientExportView 
                tiers={fullTiers} 
                projectContext={viewContext} 
                setProjectContext={setProjectContext}
                comparisonData={comparisonData} 
                timelinePhases={timelinePhases} 
                paymentMilestones={paymentMilestones}
                tasks={tasks}
                currentRevisionBoq={currentRevisionBoq}
                decisionBrainOutput={props.decisionBrainOutput}
                level={proposalLevel}
                materialSuggestions={materialSuggestions}
                proposalFormat={proposalFormat}
                onEditSection={!isClientViewOnly ? setEditingSection : undefined}
                clientBudget={props.leadProfile?.budgetValue}
                onVisibilityChange={handleVisibilityChange} // NEW PROP
            />
        </div>

        <ProposalSectionEditor
            sectionId={editingSection}
            content={mergedContent}
            onClose={() => setEditingSection(null)}
            onSave={handleUpdateContent}
        />
    </div>
  );
};

export default ClientTab;
