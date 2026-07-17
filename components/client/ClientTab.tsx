
import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ProjectContext, FullBoqItem, ProposalTier, Item, AiComparisonResult, MaterialSuggestion, TimelinePhase, PaymentMilestone, ProposalContent, DecisionBrainOutput, LeadProfile, ProposalLevel, ProposalType } from '../../types';
import ClientExportView from './ClientExportView';
 
import { calculateSellPrice, generateDeterministicSchedule } from '../../lib/utils';
import { generateLocalComparison } from '../../lib/comparison';
import { CloseIcon, ExportIcon, PrintIcon, CheckBadgeIcon, PencilRulerIcon, BriefcaseIcon } from '../Icons';
import { TEMPLATE_TURNKEY, TEMPLATE_DESIGN_ONLY } from '../../constants';

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
  onExportHtml?: (fileName?: string) => void;
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
            <div className="text-sm text-indigo-900">
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-indigo-950/60 backdrop-blur-md backdrop-blur-sm p-4">
            <MotionDiv 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                className={`bg-white w-full ${initialSection ? 'max-w-2xl h-auto max-h-[85vh]' : 'max-w-6xl h-[90vh]'} rounded-2xl shadow-2xl flex flex-col overflow-hidden`}
            >
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg text-indigo-900">{initialSection ? `Edit: ${currentLabel}` : 'Proposal Content Editor'}</h3>
                    <button onClick={onClose}><CloseIcon className="w-6 h-6 text-slate-500 hover:text-indigo-900" /></button>
                </div>
                
                <div className="flex flex-grow overflow-hidden">
                    {/* Sidebar - Only show if NO initialSection was passed (i.e. full editor mode) */}
                    {!initialSection && (
                        <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 space-y-1 overflow-y-auto">
                            {sections.map(section => (
                                <button
                                    key={section.id}
                                    onClick={() => setActiveSection(section.id)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${activeSection === section.id ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                    {section.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 md:p-8">
                        {!initialSection && <h4 className="font-bold text-lg text-indigo-900 border-b pb-4 mb-6">{currentLabel}</h4>}
                        
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
                    <button onClick={() => onSave(localContent)} className="px-6 py-2 bg-indigo-950 text-white font-bold rounded-lg hover:bg-indigo-950 shadow-lg">Save Changes</button>
                </div>
            </MotionDiv>
        </div>,
        document.body
    );
};

const ClientTab: React.FC<ClientTabProps> = (props) => {
  const { tiers, bank, materialSuggestions, timelinePhases, isClientViewOnly = false, projectContext: liveContext, setProjectContext, onExportHtml } = props;
  const [comparisonData, setComparisonData] = useState<AiComparisonResult>({ materialMatrix: [], scopeMatrix: [], tierSummaries: [] });
  const [editingSection, setEditingSection] = useState<string | null>(null);

  const bankMap = useMemo(() => new Map(bank.map(item => [item.id, item])), [bank]);
  const validTiers = useMemo(() => tiers.filter(t => t !== null && t !== undefined), [tiers]);
  const projectContext = liveContext || validTiers[0]?.projectContext;

  const proposalLevel = projectContext?.activeProposalLevel || 'LEVEL_1';
  const activeMode = projectContext?.activeProposalMode || 'TURNKEY';

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

  return (
    <div className={`transition-all ${isClientViewOnly ? '' : 'p-4 bg-slate-200/50 pattern-bg rounded-2xl print:p-0 print:bg-white print:rounded-none'}`}>
        {!isClientViewOnly && setProjectContext && (
            <div className="flex flex-col gap-4 mb-6 no-print">
                 
                 <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                     {/* Engagement Model Switcher */}
                     <div className="bg-white p-1 rounded-lg border border-slate-300 shadow-sm flex items-center">
                        {MODEL_SWITCHER.map((m: any) => (
                            <button
                                key={m.id}
                                onClick={() => setActiveMode(m.id as ProposalType)}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md transition-all ${activeMode === m.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-indigo-900 hover:bg-slate-50'}`}
                            >
                                {m.icon}
                                {m.label}
                            </button>
                        ))}
                     </div>

                     <div className="flex gap-3">
                        {onExportHtml && (
                            <button 
                                onClick={() => onExportHtml(getExportFileName())} 
                                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 font-bold text-sm rounded-lg shadow-sm border border-slate-300 hover:bg-slate-50 transition-all"
                            >
                                <ExportIcon className="w-4 h-4" /> Export HTML
                            </button>
                        )}
                        

                        <button 
                            type="button"
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-900 text-white font-bold text-sm rounded-lg shadow-sm hover:bg-indigo-950 transition-all"
                        >
                            <PrintIcon className="w-4 h-4"/> Save PDF
                        </button>
                    </div>
                 </div>

                 {/* Level Switcher */}
                 <div className="flex self-start bg-white rounded-lg p-1 border border-slate-300 shadow-sm flex-wrap gap-1">
                    <button 
                        onClick={() => setProposalLevel('LEVEL_1')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_1' ? 'bg-indigo-950 text-white shadow-md' : 'text-slate-500 hover:text-indigo-900'}`}
                    >
                        Level 1: Concept
                    </button>
                    <button 
                        onClick={() => setProposalLevel('LEVEL_1_5')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_1_5' ? 'bg-indigo-950 text-white shadow-md' : 'text-slate-500 hover:text-indigo-900'}`}
                    >
                        Level 1.5: Interim Update
                    </button>
                    <button 
                        onClick={() => setProposalLevel('LEVEL_2')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_2' ? 'bg-indigo-950 text-white shadow-md' : 'text-slate-500 hover:text-indigo-900'}`}
                    >
                        Level 2: Planning
                    </button>
                    <button 
                        onClick={() => setProposalLevel('LEVEL_3')}
                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${proposalLevel === 'LEVEL_3' ? 'bg-indigo-950 text-white shadow-md' : 'text-slate-500 hover:text-indigo-900'}`}
                    >
                        Level 3: Execution
                    </button>
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
