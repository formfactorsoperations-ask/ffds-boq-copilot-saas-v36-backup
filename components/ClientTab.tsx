
import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ProjectContext, FullBoqItem, ProposalTier, Item, AiComparisonResult, MaterialSuggestion, TimelinePhase, PaymentMilestone, ProposalContent, DecisionBrainOutput, LeadProfile, ProposalLevel, ProposalType } from '../types';
import ClientExportView from './client/ClientExportView'; 
import { formatClientValue, calculateSellPrice } from '../lib/utils';
import { generateLocalComparison } from '../lib/comparison';
import { CloseIcon, ExportIcon, PrintIcon, CheckBadgeIcon, PencilRulerIcon, BriefcaseIcon } from './Icons';
import { motion } from 'framer-motion';
import { useOrg } from '../contexts/OrgContext';
import { useStudioSettings } from '../hooks/useStudioSettings';

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
  onEnterClientMode?: () => void;
}

// --- CONSTANTS ---
const DEFAULT_MILESTONES: PaymentMilestone[] = [
    { id: 'd1', type: 'design', name: 'Sign-up & Concept', percentage: 20, description: 'Retainer & Concept Direction' },
    { id: 'd2', type: 'design', name: 'Design Development & 3D', percentage: 35, description: 'Layouts, Visuals & Material Selection' },
    { id: 'd3', type: 'design', name: 'Technical Documentation', percentage: 35, description: 'Detailed GFC Drawings & Services' },
    { id: 'd4', type: 'design', name: 'Project Handover & Closeout', percentage: 10, description: 'Project Sign-off & Final Handover' },
    { id: 'e1', type: 'execution', name: 'Material Order Advance', percentage: 10, description: 'Day 1 – Day 5' },
    { id: 'e2', type: 'execution', name: 'Material Procurement + Structural Works', percentage: 40, description: 'Day 10 – Day 20' },
    { id: 'e3', type: 'execution', name: 'Mid Execution (Outer Laminate Start)', percentage: 40, description: 'Day 35 – Day 55' },
    { id: 'e4', type: 'execution', name: 'Completion and Handover', percentage: 10, description: 'Day 60 – Day 75' },
];

const TEMPLATE_TURNKEY: ProposalContent = {
    cover: {
        title: "Executive Summary",
        text: "Thank you for inviting us to envision your new home. This proposal outlines a turnkey execution plan tailored for your specific requirements. We have structured this document to give you clarity on the investment required to achieve your desired aesthetic."
    },
    snapshot: {
        title: "Project Snapshot",
        subtitle: "This snapshot helps you quickly decide if the direction and investment feel broadly aligned before going into details.",
        engagementModel: "Design-led Turnkey Execution"
    },
    options: {
        title: "Options Overview",
        subtitle: "Each option changes finish level, detailing, and civil scope. Core functionality remains intact."
    },
    process: {
        title: "How FFDS takes you from ideas to a locked plan (before execution)",
        subtitle: "This is the part that protects your budget and timeline. We resolve decisions on paper first, then move to site. You will always know what is next, what is pending, and what is being executed.",
        steps: [
            { id: 1, title: "Discovery & Brief Freeze", desc: "Site measure check, lifestyle needs, storage priorities, budget comfort, and must-haves. We freeze the brief so scope does not drift later.", tags: ["Kick-off call", "Site verification", "Requirements sheet"] },
            { id: 2, title: "Space Planning & Layout Options", desc: "Furniture layout, storage logic, and circulation. We align room-by-room functionality before any finish decisions.", tags: ["Layout iterations", "Electrical intent", "Storage zoning"] },
            { id: 3, title: "3D Visuals & Material Direction", desc: "We develop the look and feel with realistic views and a clear material direction. Final brands/shades are confirmed through samples.", tags: ["3D views", "Sample shortlist", "Finish coordination"] },
            { id: 4, title: "Budget Lock & GFC Drawings", desc: "We freeze scope, confirm selections, and prepare detailed working drawings (GFC) for execution teams. This is where costs become predictable.", tags: ["BOQ freeze", "GFC set", "Execution schedule"] }
        ]
    },
    fees: {
        title: "How Design & Execution Fees Work",
        subtitle: "At FFDS, design is not treated as an add-on. It is the framework that controls scope, cost overruns, and execution quality.",
        card1: { 
            label: "DESIGN FEE", 
            value: "8-10% of final execution value", 
            desc: "Depends on project scope and complexity. Covers the complete design + coordination lifecycle." 
        },
        card2: { 
            label: "WHAT IT COVERS", 
            items: [
                "Space planning, layouts, and design direction", 
                "3D visualization and technical drawings", 
                "Material and finish selection guidance", 
                "Vendor coordination and site involvement"
            ] 
        },
        practicalView: "Practical view: Most clients recover the design fee many times over by avoiding rework, scope creep, and on-site trial-and-error. A detailed stage-wise breakup is shared once layouts and scope are finalized."
    },
    timeline: {
        title: "Indicative Timeline",
        subtitle: "Timeline can shift based on approvals, site conditions, and selection cycles. This keeps expectations realistic."
    },
    payments: {
        title: "Payment Milestones",
        subtitle: "Payments are tied to clear progress. Detailed invoices are shared at each milestone."
    },
    cta: {
        title: "What we are deciding right now",
        subtitle: "At this stage, you are not locking final materials, exact quantities, or final vendor selections. The decision required now is whether FFDS should proceed with design development and detailed planning, after which scope and final costing are frozen transparently.",
        nextStepsTitle: "Next 3 steps",
        steps: [
            "Confirm intent to proceed",
            "Design retainer invoice shared",
            "Kick-off scheduled within 3–5 working days"
        ]
    },
    footer: {
        orgName: "Studio Name",
        tagline: "Minimal Design. Maximum Impact.",
        contactInfo: "Office: Studio Office, City • Call: +91 0000000000",
        phoneNumber: "+910000000000"
    },
    
    // Level 2 Defaults (Standard)
    l2_cover: { title: "Execution Readiness & Scope Lock", text: "We have transitioned from design concepts to a production-ready plan. This document creates a definitive baseline for the **Execution Scope**, specifying exactly what will be built, the materials to be used, and the final investment value.\n\nThis is the blueprint for your project. Approving this document freezes the scope, allowing us to generate technical GFC drawings and initiate material procurement with zero ambiguity." },
    l2_snapshot: { title: "Confirmed Project Snapshot", subtitle: "This snapshot represents the [Tier Name] scope as discussed. The values below form the baseline for the execution contract." },
    l2_fees: { title: "Design Fee & Retainer Adjustment", subtitle: "The design commitment retainer (₹4,999) you have paid is fully adjusted here. GST component is statutory and not adjustable against professional fees." },
    l2_scope: { title: "Design-defined Scope of Works (SOW)", subtitle: "This section defines the locked scope. Items listed as 'Included' are part of the investment total. Excluded or Optional items are not charged unless approved." },
    l2_risk: { title: "Execution Readiness", subtitle: "Status of key dependencies before we start work.", items: [{ title: "Decisions First", desc: "No material is ordered until drawings and specs are frozen." }, { title: "Stage-wise Approvals", desc: "You sign off at key milestones (Design, Civil, Finishing)." }, { title: "Controlled Changes", desc: "Any scope change is documented in a Change Note with cost impact." }] },
    l2_finishes: { title: "Finish Direction (Indicative)", subtitle: "We have defined the visual language and material palette for each space." },
    l2_timeline: { title: "Execution Timeline", subtitle: "From Design Freeze to Handover" }
};

const TEMPLATE_DESIGN_ONLY: ProposalContent = {
    ...TEMPLATE_TURNKEY,
    snapshot: {
        title: "Design Mandate Snapshot",
        subtitle: "This proposal focuses on providing comprehensive Design & Planning services. Execution is handled by your vendors, with our guidance.",
        engagementModel: "Design Consultancy & PMC"
    },
    fees: {
        title: "Professional Design Fees",
        subtitle: "Our fee structure covers the intellectual property, technical detailing, and creative direction required for your project. The fee is calculated based on the carpet area and the complexity of the design mandate.",
        card1: {
            label: "CONSULTANCY FEE",
            value: "Flat Fee / Sq.ft Basis",
            desc: "Based on the scope of drawings and visualization required."
        },
        card2: {
            label: "DELIVERABLES",
            items: [
                "Layouts & Space Planning",
                "3D Visualization (4 views/room)",
                "Detailed GFC Drawings (Elec, Civil, Joinery)",
                "Material Selection Assistance"
            ]
        },
        practicalView: "Practical view: Good design is an investment, not a cost. A well-detailed set of drawings saves you 15-20% in material wastage and contractor errors during execution."
    },
    options: {
        title: "Design Depth Options",
        subtitle: "Choose the level of detailing and support you need for your project."
    },
    timeline: {
        title: "Design Delivery Timeline",
        subtitle: "The timeline for delivering the complete Good for Construction (GFC) set."
    }
};

// ... (Helper Components like FieldRenderer, ContentEditorModal remain same) ...
// Copied simplified versions to ensure file completeness if needed, but assuming they exist from previous context.
// For the purpose of this update, I'm focusing on the Logic flow in ClientTab

// Generic Field Renderer to handle any depth of content
const FieldRenderer: React.FC<{
    data: any;
    path: string[];
    onChange: (path: string[], value: any) => void;
}> = ({ data, path, onChange }) => {
    if (typeof data === 'string') {
        const isLong = data.length > 60;
        return (
            <div className="mb-4">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {path[path.length - 1].replace(/([A-Z])/g, ' $1').trim()}
                </label>
                {isLong ? (
                    <textarea 
                        value={data} 
                        onChange={e => onChange(path, e.target.value)} 
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none min-h-[100px]" 
                    />
                ) : (
                    <input 
                        type="text" 
                        value={data} 
                        onChange={e => onChange(path, e.target.value)} 
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none" 
                    />
                )}
            </div>
        );
    } else if (typeof data === 'number') {
        return (
            <div className="mb-4">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {path[path.length - 1]}
                </label>
                <input 
                    type="number" 
                    value={data} 
                    onChange={e => onChange(path, Number(e.target.value))} 
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm" 
                />
            </div>
        );
    } else if (Array.isArray(data)) {
        return (
            <div className="mb-6 pl-4 border-l-2 border-slate-100">
                <label className="block text-xs font-bold text-slate-500 mb-2">
                    {path[path.length - 1]} (List)
                </label>
                {data.map((item, index) => (
                    <div key={index} className="mb-2">
                        <FieldRenderer data={item} path={[...path, index.toString()]} onChange={onChange} />
                    </div>
                ))}
            </div>
        );
    } else if (typeof data === 'object' && data !== null) {
        return (
            <div className="mb-6 space-y-2">
                {Object.keys(data).map(key => (
                    <FieldRenderer key={key} data={data[key]} path={[...path, key]} onChange={onChange} />
                ))}
            </div>
        );
    }
    return null;
};

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
            const newData = { ...prev };
            let current: any = newData;
            for (let i = 0; i < path.length - 1; i++) {
                current = current[path[i]];
            }
            // Handle array update if last path key is index
            if (Array.isArray(current)) {
                current[parseInt(path[path.length - 1])] = value;
            } else {
                current[path[path.length - 1]] = value;
            }
            return newData;
        });
    };

    const MotionDiv = motion.div as any;

    if (!isOpen) return null;

    const sections = [
        { id: 'cover', label: 'L1: Cover & Intro' },
        { id: 'snapshot', label: 'L1: Snapshot' },
        { id: 'process', label: 'L1: Process' },
        { id: 'fees', label: 'L1: Fees' },
        { id: 'options', label: 'L1: Options' },
        { id: 'materials', label: 'Technical Specifications' },
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
  const { orgData } = useOrg();
  const { settings: studioSettings } = useStudioSettings(orgData?.tenantId || 'demo-tenant-01');
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

  // --- 1. PAYMENT SCHEDULE INITIALIZATION ---
  // Ensure we have a schedule in context, or load defaults
  useEffect(() => {
      if (setProjectContext && !projectContext?.paymentMilestones) {
          setProjectContext(prev => ({
              ...prev,
              paymentMilestones: DEFAULT_MILESTONES,
              paymentScheduleConfig: {
                  signupDate: new Date().toISOString().split('T')[0],
                  possessionDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
              }
          }));
      }
  }, [projectContext?.paymentMilestones, setProjectContext]);

  // Handler to update payment schedule
  const handleUpdatePaymentSchedule = (newMilestones: PaymentMilestone[], newConfig: { signupDate?: string, possessionDate?: string }) => {
      if (setProjectContext) {
          setProjectContext(prev => ({
              ...prev,
              paymentMilestones: newMilestones,
              paymentScheduleConfig: { ...prev.paymentScheduleConfig, ...newConfig }
          }));
      }
  };

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
        const { id, ...bankRest } = bankItem;
        return { ...bankRest, ...boqItem, id: boqItem.id, margin: effectiveMargin };
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
  const mergedContent: ProposalContent = {
      ...baseTemplate,
      ...legacyContent,
      ...savedModeContent
  };
  
  if (mergedContent.footer && orgData) {
      mergedContent.footer.orgName = orgData.orgName || mergedContent.footer.orgName;
      mergedContent.footer.contactInfo = `Office: ${orgData.officeAddress || 'Studio Office'}, ${orgData.cityState || 'City'} • Call: ${orgData.contactPhone || '+91 0000000000'}`;
      if (orgData.contactEmail) {
          mergedContent.footer.contactInfo += ` • ${orgData.contactEmail}`;
      }
      mergedContent.footer.phoneNumber = orgData.contactPhone?.replace(/[^0-9]/g, '') || "+910000000000";
  }

  // Now apply dynamic replacement to specific fields IF they still contain the placeholder
  if (mergedContent.l2_snapshot?.subtitle?.includes('[Tier Name]')) {
      mergedContent.l2_snapshot = {
          ...mergedContent.l2_snapshot,
          subtitle: mergedContent.l2_snapshot.subtitle.replace('[Tier Name]', tierName)
      };
  }

  // --- CIVIL WORKS DURATION WARNING INJECTION ---
  if (projectContext.propertyStatus === 'raw_shell' && activeMode === 'TURNKEY') {
      const warningText = "\n\n⚠️ NOTE: Civil works require technical curing time before woodwork installation to ensure durability. This phasing is factored into the schedule.";
      
      if (mergedContent.timeline?.subtitle && !mergedContent.timeline.subtitle.includes('curing')) {
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
        const companyName = studioSettings?.companyName || orgData?.orgName || "FFDS";
        const safeCompanyName = companyName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_');
        const safeClientName = (projectContext.clientName || projectContext.name || 'Project').replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_');
        
        if (proposalLevel === 'LEVEL_3') {
            return `${safeCompanyName}_Contract_${safeClientName}`;
        }
        return `${safeCompanyName}_Proposal_${safeClientName}`;
  }

  const handlePrint = () => {
      // Logic to generate HTML string
      const clientViewNode = document.querySelector('.vnext-proposal-wrapper');
      if (!clientViewNode) {
          alert('Content not fully loaded. Please wait a moment and try again.');
          return;
      }

      const doc = document.cloneNode(true) as Document;
      
      // Update Title for PDF Name
      doc.title = getExportFileName();
      const titleTag = doc.querySelector('title');
      if (titleTag) titleTag.textContent = getExportFileName();

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
                        {props.onEnterClientMode && (
                            <button 
                                onClick={props.onEnterClientMode} 
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 font-bold text-sm rounded-lg shadow-sm border border-indigo-200 hover:bg-indigo-100 transition-all"
                            >
                                <BriefcaseIcon className="w-4 h-4" /> Client Portal
                            </button>
                        )}
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
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex flex-col gap-2">
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
                        
                        <div className="flex items-center gap-4 mt-2 border-t border-slate-200 pt-4 w-full">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest shrink-0 w-24">Cover Page:</span>
                            <div className="flex gap-4">
                                {/* Minimal */}
                                <button
                                    onClick={() => setProjectContext && setProjectContext(prev => ({ ...prev, coverStyle: 'minimal' }))}
                                    className={`relative flex flex-col items-center gap-1 group`}
                                >
                                    <div className={`w-16 h-20 rounded shadow-sm border-2 transition-all bg-white flex flex-col p-1 ${
                                        (projectContext.coverStyle || 'photo') === 'minimal' ? 'border-indigo-600' : 'border-slate-200 hover:border-slate-400'
                                    }`}>
                                        <div className="w-4 h-1 bg-slate-300 self-end rounded-full mb-auto mt-1"></div>
                                        <div className="w-10 h-2 bg-slate-700 mx-auto rounded-full mb-1"></div>
                                        <div className="w-8 h-1 bg-slate-400 mb-1 rounded-full"></div>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-600">Minimal</span>
                                </button>

                                {/* Bold */}
                                <button
                                    onClick={() => setProjectContext && setProjectContext(prev => ({ ...prev, coverStyle: 'bold' }))}
                                    className={`relative flex flex-col items-center gap-1 group`}
                                >
                                    <div className={`w-16 h-20 rounded shadow-sm border-2 transition-all bg-indigo-950 flex flex-col p-1 ${
                                        (projectContext.coverStyle || 'photo') === 'bold' ? 'border-indigo-600' : 'border-slate-200 hover:border-slate-400'
                                    }`}>
                                        <div className="w-4 h-1 bg-slate-500 rounded-full mb-auto mt-1"></div>
                                        <div className="w-10 h-2 bg-white rounded-full mt-2"></div>
                                        <div className="w-6 h-1 bg-indigo-400 mt-1 mb-auto rounded-full"></div>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-600">Bold</span>
                                </button>

                                {/* Photo */}
                                <button
                                    onClick={() => setProjectContext && setProjectContext(prev => ({ ...prev, coverStyle: 'photo' }))}
                                    className={`relative flex flex-col items-center gap-1 group`}
                                >
                                    <div className={`w-16 h-20 rounded shadow-sm border-2 transition-all bg-white flex overflow-hidden ${
                                        (projectContext.coverStyle || 'photo') === 'photo' ? 'border-indigo-600' : 'border-slate-200 hover:border-slate-400'
                                    }`}>
                                        <div className="w-1/2 h-full bg-slate-300 flex items-center justify-center">
                                            <span className="text-[8px] opacity-50">📷</span>
                                        </div>
                                        <div className="w-1/2 flex flex-col p-1 justify-center">
                                            <div className="w-4 h-1 bg-slate-300 self-end rounded-full mb-2"></div>
                                            <div className="w-6 h-1.5 bg-indigo-900 rounded-full mb-1"></div>
                                            <div className="w-4 h-1 bg-slate-400 rounded-full"></div>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-600">Photo</span>
                                </button>
                            </div>
                        </div>
                    </div>
                 </div>
            </div>
        )}

        <div className="proposal-container shadow-2xl rounded-xl border border-slate-300 bg-white">
            <ClientExportView 
                tiers={fullTiers} 
                projectContext={viewContext} 
                setProjectContext={setProjectContext}
                comparisonData={comparisonData} 
                timelinePhases={timelinePhases} 
                paymentMilestones={projectContext.paymentMilestones || DEFAULT_MILESTONES}
                decisionBrainOutput={props.decisionBrainOutput}
                level={proposalLevel}
                materialSuggestions={materialSuggestions}
                onEditSection={!isClientViewOnly ? setEditingSection : undefined}
                clientBudget={props.leadProfile?.budgetValue}
                onVisibilityChange={handleVisibilityChange}
                onUpdatePaymentSchedule={handleUpdatePaymentSchedule} // NEW HANDLER
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
