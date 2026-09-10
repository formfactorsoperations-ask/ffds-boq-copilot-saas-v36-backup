
import ProposalAcceptanceCard from '../ops/ProposalAcceptanceCard';
import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ProjectContext, FullBoqItem, ProposalTier, Item, AiComparisonResult, MaterialSuggestion, TimelinePhase, PaymentMilestone, ProposalContent, DecisionBrainOutput, LeadProfile, ProposalLevel, ProposalType } from '../../types';
import ClientExportView from './ClientExportView';
import { useOrg } from '../../contexts/OrgContext';
import { Download } from 'lucide-react';
import { UI_STYLES, UI_CONSTANTS } from '../../lib/UIConstants';
 
import { calculateSellPrice, generateDeterministicSchedule, formatINR } from '../../lib/utils';
import { prepareClonedDocForPdf } from '../../lib/pdfUtils';
import { generateLocalComparison } from '../../lib/comparison';
import { CloseIcon, ExportIcon, PrintIcon, CheckBadgeIcon, PencilRulerIcon, BriefcaseIcon } from '../Icons';
import { TEMPLATE_TURNKEY, TEMPLATE_DESIGN_ONLY } from '../../constants';

export type PageOrientation = 'portrait' | 'landscape';

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

// Generic Field Renderer to handle any depth of content
interface FieldRendererProps {
    data: any;
    path: string[];
    onChange: (path: string[], value: any) => void;
}

function FieldRenderer({ data, path, onChange }: FieldRendererProps) {
    return (
        <div className="mb-4">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                {path[path.length - 1]}
            </label>
            <div className="text-sm text-slate-800">
                {typeof data === 'object' ? 'Complex Data' : String(data)}
            </div>
        </div>
    );
}

const ContentEditorModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    content: ProposalContent; 
    onSave: (c: ProposalContent) => void;
    initialSection?: string | null;
}> = ({ isOpen, onClose, content, onSave, initialSection }) => {
    // We initialize with the FULL content object to ensure we don't lose data
    const [localContent, setLocalContent] = useState<ProposalContent>(content);
    const [activeSection, setActiveSection] = useState<string>('cover');

    // Update local state when prop changes
    useEffect(() => {
        if (isOpen) {
            setLocalContent(JSON.parse(JSON.stringify(content))); // Deep copy
        }
    }, [content, isOpen]);

    useEffect(() => {
        if (isOpen && initialSection) {
            setActiveSection(initialSection);
        } else if (isOpen && !initialSection) {
            setActiveSection('cover');
        }
    }, [isOpen, initialSection]);

    const handleFieldChange = (path: string[], value: any) => {
        setLocalContent(prev => {
            const newData = JSON.parse(JSON.stringify(prev));
            let current: any = newData;
            for (let i = 0; i < path.length - 1; i++) {
                current = current[path[i]];
            }
            const lastKey = path[path.length - 1];
            if (Array.isArray(current)) {
                current[parseInt(lastKey)] = value;
            } else {
                current[lastKey] = value;
            }
            return newData;
        });
    };

    const MotionDiv: any = motion.div;

    if (!isOpen) return null;

    const sections = [
        { id: 'cover', label: 'L1: Cover & Intro' },
        { id: 'snapshot', label: 'L1: Snapshot' },
        { id: 'process', label: 'L1: Process' },
        { id: 'fees', label: 'L1: Fees' },
        { id: 'options', label: 'L1: Options' },
        { id: 'timeline', label: 'L1: Timeline' },
        { id: 'payments', label: 'L1: Payments' },
        { id: 'cta', label: 'L1: Call to Action' },
        { id: 'l2_cover', label: 'L2: Context' },
        { id: 'l2_snapshot', label: 'L2: Snapshot' },
        { id: 'l2_fees', label: 'L2: Fees' },
        { id: 'l2_scope', label: 'L2: Scope' },
        { id: 'l2_risk', label: 'L2: Readiness' },
        { id: 'l2_finishes', label: 'L2: Finishes' },
        { id: 'l2_timeline', label: 'L2: Timeline' },
        { id: 'footer', label: 'Footer' },
    ];

    const currentLabel = sections.find(s => s.id === activeSection)?.label || 'Edit Content';
    // Extract the data for the active section safely
    const sectionData = (localContent as any)[activeSection];

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0066CC]/90 backdrop-blur-md border border-white/20/60 backdrop-blur-md backdrop-blur-sm p-4">
            <MotionDiv 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                className={`bg-white w-full ${initialSection ? 'max-w-2xl h-auto max-h-[85vh]' : 'max-w-6xl h-[90vh]'} rounded-2xl shadow-2xl flex flex-col overflow-hidden`}
            >
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-800">{initialSection ? `Edit: ${currentLabel}` : 'Proposal Content Editor'}</h3>
                    <button onClick={onClose}><CloseIcon className="w-6 h-6 text-slate-500 hover:text-slate-800" /></button>
                </div>
                
                <div className="flex flex-grow overflow-hidden">
                    {/* Sidebar - Only show if NO initialSection was passed (i.e. full editor mode) */}
                    {!initialSection && (
                        <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 space-y-1 overflow-y-auto">
                            {sections.map(section => (
                                <button
                                    key={section.id}
                                    onClick={() => setActiveSection(section.id)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${activeSection === section.id ? 'bg-sky-100 text-[#0055B3]' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                    {section.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 md:p-8">
                        {!initialSection && <h4 className="font-bold text-lg text-slate-800 border-b pb-4 mb-6">{currentLabel}</h4>}
                        
                        {sectionData ? (
                            <FieldRenderer 
                                data={sectionData} 
                                path={[activeSection]} 
                                onChange={handleFieldChange} 
                            />
                        ) : (
                            <p className="text-slate-400 italic">No configurable content for this section.</p>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Cancel</button>
                    <button onClick={() => onSave(localContent)} className="px-6 py-2 bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white font-bold rounded-lg hover:bg-[#0066CC]/90 backdrop-blur-md border border-white/20 shadow-lg">Save Changes</button>
                </div>
            </MotionDiv>
        </div>,
        document.body
    );
};

const ClientTab: React.FC<ClientTabProps> = (props) => {
  const { tiers, bank, materialSuggestions, timelinePhases, isClientViewOnly = false, projectContext: liveContext, setProjectContext, onExportHtml } = props;
  const { currentRole, orgData } = useOrg();
  const isDesigner = currentRole === 'Designer';

  const [comparisonData, setComparisonData] = useState<AiComparisonResult>({ materialMatrix: [], scopeMatrix: [], tierSummaries: [] });
  const [editingSection, setEditingSection] = useState<string | null>(null);

  const bankMap = useMemo(() => new Map(bank.map(item => [item.id, item])), [bank]);
  const validTiers = useMemo(() => tiers.filter(t => t !== null && t !== undefined), [tiers]);
  const projectContext = liveContext || validTiers[0]?.projectContext;

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
        if (!bankItem) return null;
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
    
    const baselineBoq = (tier.boq || []).map(boqItem => {
      const bankItem = bankMap.get(boqItem.bankId);
      if (!bankItem) return null;
      const rate = calculateSellPrice(bankItem.materials, bankItem.labor, boqItem.marginOverride ?? bankItem.margin);
      return {
        id: boqItem.id,
        section: boqItem.roomId || bankItem.cat || 'General Scope',
        item: bankItem.name,
        unit: bankItem.unit,
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
  const approvedTier = tiers.find(t => t.id === projectContext.approvedTierId);
  const activeTier = approvedTier || tiers[0];
  const tierName = activeTier ? activeTier.name : 'selected option';

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

  // Now apply dynamic replacement to specific fields IF they still contain the placeholder
  if (mergedContent.l2_snapshot && mergedContent.l2_snapshot.subtitle && mergedContent.l2_snapshot.subtitle.includes('[Tier Name]')) {
      mergedContent.l2_snapshot = {
          ...mergedContent.l2_snapshot,
          subtitle: mergedContent.l2_snapshot.subtitle.replace('[Tier Name]', tierName)
      };
  }

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

  const [exportOrientation, setExportOrientation] = useState<PageOrientation>('portrait');
  const [isBuildingPdf, setIsBuildingPdf] = useState(false);

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

    Rendered a page at a time, deliberately. Handing the whole 25,000px booklet
    to html2canvas in one go returns a canvas that is structurally valid and
    entirely blank; one A4 page at a time renders correctly, and it also lets a
    long scope table be sliced across as many sheets as it needs.

    The remaining difference from Save PDF is the pipeline, not the layout:
    this route rasterises, so text in the file is not selectable. Save PDF goes
    through the browser's own print engine and keeps text vector — reach for
    that when the client needs to search or copy from the document.
  */
  const handleDownloadPdf = async () => {
    const root = document.querySelector('.vnext-proposal-wrapper') as HTMLElement | null;
    const pages = root ? Array.from(root.querySelectorAll<HTMLElement>('.ff-page')) : [];
    if (!root || pages.length === 0) {
      alert('Proposal content is still loading. Please try again in a moment.');
      return;
    }

    const landscape = exportOrientation === 'landscape';
    // The sheet, in millimetres and in CSS pixels at 96dpi.
    const sheet = landscape
      ? { wMm: 297, hMm: 210, padMm: 14, wPx: 1123 }
      : { wMm: 210, hMm: 297, padMm: 16, wPx: 794 };

    setIsBuildingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: exportOrientation });
      let firstSheet = true;

      for (const page of pages) {
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          /*
            Pin the layout width to the sheet. Without this the PDF is laid out
            at whatever width the studio's browser window happens to be, so the
            same proposal exports differently on two machines.
          */
          windowWidth: sheet.wPx,
          width: sheet.wPx,
          onclone: (clonedDoc: Document) => {
            /*
              Tailwind v4 writes its palette in oklch()/oklab(), which
              html2canvas cannot parse — it throws before drawing anything.
              Rewrite those to rgb on the throwaway clone first.
            */
            prepareClonedDocForPdf(clonedDoc);

            const st = clonedDoc.createElement('style');
            st.textContent = `
              .ff-page {
                box-sizing: border-box;
                width: ${sheet.wMm}mm; padding: ${sheet.padMm}mm;
                margin: 0; border: 0; box-shadow: none; overflow: visible;
              }
              .ff-page:not(.ff-page-flow) { height: ${sheet.hMm}mm; }
              .ff-page-flow { height: auto; min-height: ${sheet.hMm}mm; }
              .proposal-container, .vnext-proposal-wrapper {
                box-shadow: none; border: 0; border-radius: 0;
                margin: 0; padding: 0; background: #fff;
              }
              .ff-ed { background: none !important; box-shadow: none !important; }
              /* html2canvas rasterises under screen media, so @media print
                 never runs here — the editing furniture has to be hidden
                 explicitly or it prints into the client's PDF. */
              .ff-edlist-tools, .ff-edlist-item-tools { display: none !important; }
              .no-print { display: none !important; }
            `;
            clonedDoc.head.appendChild(st);
          },
        });

        const pxPerMm = canvas.width / sheet.wMm;
        const sliceHpx = Math.max(1, Math.floor(sheet.hMm * pxPerMm));

        /*
          Walk the page in sheet-high slices, and stop when what is left is a
          sliver rather than a sheet.

          A 297mm page rounds to a canvas a pixel or two taller than the
          computed slice height, so dividing with ceil() emitted a second,
          essentially empty sheet after every single page — the booklet came out
          with a blank between each leaf. Anything under 2% of a sheet is
          rounding noise, not content.
        */
        const MIN_SLICE = Math.max(4, Math.round(sliceHpx * 0.02));
        let offset = 0;

        while (canvas.height - offset > MIN_SLICE) {
          const hpx = Math.min(sliceHpx, canvas.height - offset);

          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = hpx;
          const ctx = slice.getContext('2d');
          if (!ctx) break;
          // Paint white first: a slice shorter than a full sheet would
          // otherwise carry transparent pixels into the PDF as black.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, offset, canvas.width, hpx, 0, 0, canvas.width, hpx);

          if (!firstSheet) pdf.addPage();
          firstSheet = false;
          pdf.addImage(
            slice.toDataURL('image/jpeg', 0.95),
            'JPEG', 0, 0, sheet.wMm, hpx / pxPerMm,
          );

          offset += hpx;
        }
      }

      pdf.save(`${getExportFileName()}.pdf`);
    } catch (err) {
      console.error('PDF generation failed', err);
      alert('PDF download failed. Use Save PDF to print to PDF instead.');
    } finally {
      setIsBuildingPdf(false);
    }
  };

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
                                className={`${UI_STYLES.button.xs} rounded-md transition-all ${activeMode === m.id ? 'bg-[#0066CC] text-white shadow-sm' : 'text-slate-500 hover:text-[#0055B3] hover:bg-sky-50'}`}
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
                                            ? 'bg-[#0066CC] text-white shadow-sm'
                                            : 'text-slate-500 hover:text-[#0055B3] hover:bg-sky-50'
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
                             className="flex items-center gap-2 px-4 py-2 bg-[#0066CC] text-white font-bold text-sm rounded-lg shadow-sm hover:bg-[#0055B3] transition-all disabled:opacity-60 disabled:cursor-wait"
                         >
                             <Download className="w-4 h-4" /> {isBuildingPdf ? 'Building PDF…' : 'Download PDF'}
                         </button>

                         <button 
                             type="button"
                             onClick={handlePrint}
                             className="flex items-center gap-2 px-4 py-2 bg-white text-[#0055B3] font-bold text-sm rounded-lg border border-sky-200 shadow-sm hover:bg-sky-50 hover:border-sky-300 transition-all"
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
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_1' ? 'bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Level 1: Concept
                        </button>
                        <button 
                            onClick={() => setProposalLevel('LEVEL_1_5')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_1_5' ? 'bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Level 1.5: Interim Update
                        </button>
                        <button 
                            onClick={() => setProposalLevel('LEVEL_2')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_2' ? 'bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Level 2: Planning
                        </button>
                        <button 
                            onClick={() => setProposalLevel('LEVEL_3')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_3' ? 'bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Level 3: Execution
                        </button>
                     </div>

                     {true && (
                         <div className="flex items-center gap-4 flex-wrap">
                             {!isDesigner && (
                                 <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-300 shadow-sm text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all select-none no-print">
                                     <input 
                                         type="checkbox" 
                                         checked={showScopePricing} 
                                         onChange={toggleShowScopePricing}
                                         className="rounded border-slate-300 text-[#0066CC] focus:ring-[#0066CC] w-3.5 h-3.5"
                                     />
                                     <span>Show Scope Pricing & Total</span>
                                 </label>
                             )}
                             {proposalLevel !== 'LEVEL_3' && (
                                 <div className="flex bg-white rounded-lg p-1 border border-slate-300 shadow-sm gap-1 self-stretch md:self-auto">
                                 <button
                                 onClick={() => setProposalFormat('classic')}
                                 className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalFormat === 'classic' ? 'bg-[#0066CC] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                             >
                                 Classic Digital
                             </button>
                             <button
                                 onClick={() => setProposalFormat('booklet')}
                                 className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalFormat === 'booklet' ? 'bg-[#0066CC] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
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

        <ContentEditorModal 
            isOpen={!!editingSection} 
            onClose={() => setEditingSection(null)} 
            content={mergedContent} 
            onSave={handleUpdateContent}
            initialSection={editingSection} 
        />
    </div>
  );
};

export default ClientTab;
