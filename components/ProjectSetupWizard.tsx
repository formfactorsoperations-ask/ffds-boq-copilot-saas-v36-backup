
import React, { useState } from 'react';
import { downscalePlanToBase64 } from '../lib/imageDownscale';
import { uploadPlanImage } from '../services/planStorage';
import { showSuccessWithNext } from './SuccessWithNextToast';
import { Item, ProjectContext, ProposalTier, AIStrategy, MaterialSuggestion, TimelinePhase, LeadProfile, DecisionBrainOutput, Room } from '../types';
import { generateStandardPackages, TemplateData, resolveActiveTemplate, ensureRoomsExistForTemplate, detectRoomType, roomFamily } from '../lib/standardPackages';
import { ensureScopeRooms, uniqueRoomNames, polishRoomNames } from '../lib/scopeBuckets';
import { SparklesIcon, PencilIcon, ArrowRightIcon, UploadIcon, ListIcon } from './Icons';
import { FFDSLogo } from './FFDSLogo';
import ProjectContextCard from './ProjectContextCard';
import { analyzeFloorPlan, isAiAvailable, generateProjectTimeline, generateMaterialMoodBoard, generateTieredBoqPackages, estimateRoomSizes } from '../services/geminiService';
import { id as generateId } from '../lib/utils';
import { motion } from 'framer-motion';
import { AI_STRATEGIES } from '../constants';
import { FullBoqItem, BoqItem } from '../types'; // Import necessary types
import Card from './shared/Card'; // Import Card component
import { INITIAL_BANK } from '../constants';

interface ProjectSetupWizardProps {
  setTiers: React.Dispatch<React.SetStateAction<ProposalTier[]>>;
  bank: Item[];
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  setActiveTierId: (id: string | null) => void;
  setAiStrategy?: (strategy: AIStrategy) => void;
  setMaterialSuggestions?: React.Dispatch<React.SetStateAction<MaterialSuggestion[]>>;
  setTimelinePhases?: React.Dispatch<React.SetStateAction<TimelinePhase[]>>;
  leadProfile: LeadProfile;
  setLeadProfile: (profile: LeadProfile) => void;
  setDecisionBrainOutput: (output: DecisionBrainOutput | null) => void;
  templates: TemplateData;
  onComplete?: () => void;
  onCancel?: () => void;
}

type SetupMethod = 'manual' | 'floorplan';

import { useOrg } from '../contexts/OrgContext';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } }
};

const ProjectSetupWizard: React.FC<ProjectSetupWizardProps> = (props) => {
  const { orgData } = useOrg();
  // Correctly destructure props with initializer
  const { 
      setTiers, 
      bank, 
      projectContext, 
      setProjectContext, 
      setActiveTierId, 
      templates,
      setAiStrategy,
      setMaterialSuggestions,
      setTimelinePhases,
      onComplete,
      onCancel
  } = props;

  const [step, setStep] = useState(0);
  // The plan itself, held for analysis and preview only — never persisted.
  const [planBase64, setPlanBase64] = useState<string | null>(null);
  const [planUploadError, setPlanUploadError] = useState<string | null>(null);
  const [setupMethod, setSetupMethod] = useState<SetupMethod>('manual');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [theme, setTheme] = useState('modern');
  const [proposalMode, setProposalMode] = useState<'single' | 'tiered'>('tiered');
  const [selectedStrategy, setSelectedStrategy] = useState<AIStrategy>('balanced');
  
  const isContextComplete = (projectContext.rooms || []).length > 0 && projectContext.area > 0;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    try {
      // Shrunk before it goes anywhere: a 4000px plan costs the studio upload
      // time and the client load time, and nothing here reads it at that size.
      const base64String = await downscalePlanToBase64(file);

      /*
        The bytes stay in component state and the document gets a URL.

        Analysis needs the image itself, and the preview below wants it before
        any upload finishes, but neither needs it *stored*: written into
        `floorplanImage` a plan was 200-270KB of a 1 MiB document, and once the
        wizard is done nothing displays it again.
      */
      setPlanBase64(base64String);
      setPlanUploadError(null);
      setProjectContext(p => ({ ...p, floorplanImage: undefined }));

      try {
        const url = await uploadPlanImage(orgData?.tenantId, base64String);
        setProjectContext(p => ({ ...p, floorplanImageUrl: url }));
      } catch (uploadErr) {
        /*
          Setup continues without it. The plan is only needed here to read rooms
          off, which works from what is already in state -- failing the whole
          wizard because a bucket was unreachable would cost the studio the
          setup, not just the stored copy.
        */
        console.error('Floor plan could not be uploaded', uploadErr);
        setPlanUploadError('The plan could not be saved to storage. Setup can continue — room detection still works.');
      }
    } catch (err) {
      console.error('Floor plan could not be read', err);
      alert('That file could not be read. Please try another image.');
    }
  };

  /**
   * The BHK the plan actually shows.
   *
   * The studio was typing this in after the AI had just counted the bedrooms
   * for them, and a wrong or empty config silently changes everything
   * downstream — it picks the template, the room distribution, and therefore
   * every quantity in the BOQ. Bedrooms are counted by room type rather than by
   * name, so "Bed 1" and "Master Bedroom" both count once.
   *
   * Returns null when the plan yielded no bedrooms at all; a guess would be
   * worse than leaving the field for a human.
   */
  const configFromRooms = (rooms: Room[]): string | null => {
    const bedrooms = rooms.filter(r => detectRoomType(r.name).includes('bedroom')).length;
    if (bedrooms < 1) return null;
    return `${Math.min(bedrooms, 4)}-BHK`;
  };

  /**
   * Top up a plan-derived room list with whatever the typology expects.
   *
   * Matched on room *type* rather than name, so "Bed 1" from a plan and
   * "Master Bedroom" from the distribution are not both added. Returns the
   * detected rooms first, in the order the plan gave them.
   */
  const autoMapMissingRooms = async (detected: Room[], area: number): Promise<Room[]> => {
    const config = projectContext.config;
    if (!config || !area) return detected;

    let expected: Room[] = [];
    try {
      if (isAiAvailable() && detected.length === 0) {
        expected = await estimateRoomSizes(area, config);
      }
    } catch { /* falls through to the distribution below */ }

    if (expected.length === 0) {
      const { activeTemplate, configKey } = resolveActiveTemplate(undefined, config);
      expected = ensureRoomsExistForTemplate({ ...projectContext, rooms: [], area } as any, activeTemplate, configKey);
    }

    if (detected.length === 0) return expected;

    /* The plan's own labels repeat — "Toilet" three times is normal draughting.
       Counting by type below is unaffected; the names are separated when the
       list is written, by ensureScopeRooms. */

    /*
      One slot per room FAMILY, not per exact type.

      A plan labels its rooms "Bedroom" and "Toilet"; the typology calls the same
      rooms "Master Bedroom" and "Common Bathroom". Matching on the exact type
      meant none of them ever paired up, so a plan that already showed three
      bedrooms and three toilets was topped up with a master bedroom, a guest
      bedroom, a master bathroom and a common bathroom — a second set of rooms,
      with no dimensions, inflating the flat.
    */
    const seen = new Map<string, number>();
    detected.forEach(r => {
      const k = roomFamily(r.name);
      seen.set(k, (seen.get(k) || 0) + 1);
    });

    const additions: Room[] = [];
    expected.forEach(r => {
      const k = roomFamily(r.name);
      const remaining = seen.get(k) || 0;
      if (remaining > 0) { seen.set(k, remaining - 1); return; }
      additions.push(r);
    });

    return [...detected, ...additions];
  };

  const handleAnalyzeFloorplan = async () => {
    // Freshly uploaded bytes, or a legacy project whose plan is still inline.
    const planForAnalysis = planBase64 || projectContext.floorplanImage;
    if (!planForAnalysis) {
      alert("Please upload a floor plan image.");
      return;
    }
    setIsLoading(true);
    setLoadingMessage('Analyzing floor plan...');
    try {
      const rooms = await analyzeFloorPlan(planForAnalysis, projectContext.area);
      const totalAreaFromAI = rooms.reduce((sum, room) => sum + (room.size || 0), 0);
      const areaAfterPlan = totalAreaFromAI > 0 ? Number(totalAreaFromAI.toFixed(2)) : projectContext.area;

      /*
        Auto-map anything the plan did not yield.

        Plan analysis reads what is drawn, and a plan that is partial, low
        resolution or cropped comes back with two rooms for a 3-BHK — or none
        at all. The BOQ generator prices per room, so a short room list is a
        short bill, which is most of why a generated BOQ read as thin.

        Detected rooms are never overwritten: this only tops up the rooms the
        typology expects and the plan did not give, so a real plan always beats
        a ratio.
      */
      setLoadingMessage('Auto-mapping rooms...');
      const mapped = await autoMapMissingRooms(rooms, areaAfterPlan);

      /*
        The plan sets the configuration too.

        It has just counted the bedrooms; asking the studio to type "3-BHK"
        afterwards is asking them to repeat the answer. The config picks the
        template and the room distribution, so getting it from the drawing
        rather than from memory is worth more than it looks — an empty config
        falls back to whichever template happens to be first.

        Only filled in, never overwritten: a studio that has already set it
        knows something about the flat that the drawing does not say.
      */
      const detectedConfig = configFromRooms(mapped);

      /*
        Named the way a studio names them, once, at creation.

        A drawing says "Toilet"; a BOQ a client reads should say "Common
        Bathroom". This runs here and nowhere else: the name is the identity a
        BOQ line carries, so polishing it later would orphan every line already
        priced against the old name.
      */
      const named = ensureScopeRooms(polishRoomNames(mapped, roomFamily));

      setProjectContext(p => ({
          ...p,
          rooms: named,
          area: areaAfterPlan,
          /*
            The plan sets the configuration outright.

            `p.config || detected` never fired: a new project is created with
            "2-BHK" already filled in, so there was no empty value for the
            detection to fall into and a three-bedroom plan stayed 2-BHK. The
            drawing counted the bedrooms; it wins. A studio who disagrees edits
            the field, and analysis does not run again unless they ask for it.
          */
          config: detectedConfig || p.config,
      }));
      showSuccessWithNext("Project area is calculated. Check the rooms.", {
          label: "Review Rooms",
          onClick: () => {
              const el = document.getElementById("dimensional-space-planner");
              if (el) {
                  el.scrollIntoView({ behavior: 'smooth' });
              }
          }
      });
    } catch (e) {
      console.error(e);
      // The reason, not a shrug. "Gemini API Key missing on server" is
      // actionable; "please try manual setup" sent people round in circles.
      alert(`Could not read the floor plan: ${e instanceof Error ? e.message : String(e)}\n\nYou can still set the rooms by hand, or use Auto-Map Rooms.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipToDashboard = () => {
      const newTier: ProposalTier = {
          id: generateId(),
          name: "Option 1",
          timestamp: Date.now(),
          boq: [],
          projectContext: { ...projectContext, theme: 'modern' },
          summary: { totalSell: 0, totalCost: 0, totalGm: 0, itemCount: 0, totalRevenue: 0, designFee: 0, blendedGm: 0 }
      };
      setProjectContext(prev => ({ ...prev, theme: 'modern' }));
      setTiers([newTier]);
      setActiveTierId(newTier.id);
  }

  const handleStartManual = () => {
      const newTier: ProposalTier = {
          id: generateId(),
          name: "Standard Proposal",
          timestamp: Date.now(),
          boq: [],
          projectContext: { ...projectContext, theme },
          summary: { totalSell: 0, totalCost: 0, totalGm: 0, itemCount: 0, totalRevenue: 0, designFee: 0, blendedGm: 0 }
      };
      setProjectContext(prev => ({ ...prev, theme }));
      if (setAiStrategy) setAiStrategy(selectedStrategy);
      setTiers([newTier]);
      setActiveTierId(newTier.id);
  }

  const finalizeGeneration = async (newTiers: ProposalTier[]) => {
      setTiers(newTiers);
      if (onComplete) onComplete();
      const premiumTier = newTiers.find(t => t.name === "Comfort Upgrade") || newTiers[0];
      setActiveTierId(premiumTier.id);

      // 2. Generate Timeline (AI)
      if (setTimelinePhases) {
          if ((premiumTier.boq?.length > 0 || false) && isAiAvailable()) {
              setLoadingMessage('AI: Optimizing Timeline...');
              try {
                  const fullBoqForTimeline: FullBoqItem[] = (premiumTier.boq || []).map(boqItem => {
                      const bankItem = bank.find(b => b.id === boqItem.bankId) || INITIAL_BANK.find(i => i.id === boqItem.bankId);
                      if (!bankItem) return null;
                      const effectiveMaterials = boqItem.baseRate !== undefined ? boqItem.baseRate : bankItem.materials;
                      return { ...bankItem, ...boqItem, materials: effectiveMaterials, margin: boqItem.marginOverride ?? bankItem.margin };
                  }).filter((i): i is FullBoqItem => i !== null);
                  
                  const timeline = await generateProjectTimeline(fullBoqForTimeline);
                  if (timeline && timeline.length > 0) {
                      setTimelinePhases(timeline.sort((a, b) => a.startDay - b.startDay));
                  } else if (orgData?.defaultTimelinePhases) {
                      setTimelinePhases([...orgData.defaultTimelinePhases].sort((a, b) => a.startDay - b.startDay));
                  }
              } catch (e) {
                  if (orgData?.defaultTimelinePhases) {
                      setTimelinePhases([...orgData.defaultTimelinePhases].sort((a, b) => a.startDay - b.startDay));
                  }
              }
          } else if (orgData?.defaultTimelinePhases) {
              setTimelinePhases([...orgData.defaultTimelinePhases].sort((a, b) => a.startDay - b.startDay));
          }
      }

      // 3. Generate Mood Board (AI)
      if (setMaterialSuggestions && (projectContext.rooms || []).length > 0 && isAiAvailable()) {
          setLoadingMessage('AI: Curating Mood Board...');
          const materials = await generateMaterialMoodBoard(theme, projectContext.rooms);
          setMaterialSuggestions(materials);
      }
      setIsLoading(false);
      showSuccessWithNext('Project Context Saved and Packages Generated');
  };

  const handleGenerateTemplates = async () => {
    setIsLoading(true);
    setLoadingMessage('Applying Standard Packages...');
    await new Promise(resolve => setTimeout(resolve, 600)); // UX delay
    
    const updatedContext = { ...projectContext, theme, proposalMode };
    setProjectContext(updatedContext);
    if (setAiStrategy) setAiStrategy(selectedStrategy);

    const newTiers = generateStandardPackages(updatedContext, bank, templates, proposalMode);
    await finalizeGeneration(newTiers);
  };

  const handleGenerateAI = async () => {
      setIsLoading(true);
      setLoadingMessage('AI: Thinking & Generating...');
      
      const updatedContext = { ...projectContext, theme, proposalMode };
      setProjectContext(updatedContext);
      if (setAiStrategy) setAiStrategy(selectedStrategy);

      try {
          const rawPackages = await generateTieredBoqPackages(updatedContext, theme, bank, selectedStrategy);
          
          const mapToTier = (name: string, items: any[]): ProposalTier => {
              const boqItems: BoqItem[] = items.map(i => ({
                  id: generateId(),
                  bankId: i.id,
                  qty: i.qty,
                  marginOverride: i.margin,
                  roomId: i.roomId,
                  rationale: i.rationale,
                  optional: i.optional
              }));
              
              return {
                  id: generateId(),
                  name,
                  timestamp: Date.now(),
                  boq: boqItems,
                  projectContext: updatedContext,
                  summary: { totalSell: 0, totalCost: 0, totalGm: 0, itemCount: boqItems.length, totalRevenue: 0, designFee: 0, blendedGm: 0 }
              };
          };

          const newTiers = proposalMode === 'single' ? [
              mapToTier("Comfort Upgrade", rawPackages.premium)
          ] : [
              mapToTier("Essential Elegance", rawPackages.essential),
              mapToTier("Comfort Upgrade", rawPackages.premium),
              mapToTier("Complete Harmony", rawPackages.luxury)
          ];

          await finalizeGeneration(newTiers);

      } catch (e) {
          console.error(e);
          alert("AI Generation failed. Falling back to templates.");
          handleGenerateTemplates();
      }
  };

  const MotionDiv = motion.div as any;
  const MotionButton = motion.button as any;

  return (
    <div className="space-y-10 max-w-5xl mx-auto">
      
      {/* STEP 0: METHOD SELECTION - THE "LAUNCHER" */}
      {step === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[80vh]">
              <MotionDiv 
                initial={{ opacity: 0, y: -20 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.6 }}
                className="text-center mb-16"
              >
                  <FFDSLogo className="mb-6 scale-125" />
                  {onCancel && (
                      <button 
                          onClick={onCancel}
                          className="absolute top-8 right-8 px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-full text-sm font-bold transition-colors"
                      >
                          Cancel
                      </button>
                  )}
                  <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-4">
                      {onCancel ? 'Modify Project Brief' : 'Create New Project'}
                  </h1>
                  <p className="text-lg text-slate-500 max-w-xl mx-auto">
                      Build data-driven interior proposals in minutes. Choose how you want to input the project details.
                  </p>
              </MotionDiv>

              <MotionDiv 
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl px-4"
              >
                  {/* AI Option */}
                  <MotionButton 
                    variants={item}
                    whileHover={{ scale: 1.02, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setSetupMethod('floorplan'); setStep(1); }} 
                    className="relative bg-white border-2 border-sky-100 rounded-3xl p-8 text-left shadow-xl shadow-sky-500/10 hover:shadow-2xl hover:border-[#0066CC]/50 transition-all group overflow-hidden"
                  >
                      <div className="absolute top-0 right-0 p-3">
                          <span className="bg-[#0066CC] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-md">Recommended</span>
                      </div>
                      <div className="w-14 h-14 bg-sky-50 rounded-2xl flex items-center justify-center mb-6 text-[#0066CC] group-hover:scale-110 transition-transform">
                          <SparklesIcon className="w-7 h-7" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-[#0055B3] transition-colors">AI Floor Plan Analysis</h3>
                      <p className="text-sm text-slate-500 leading-relaxed">
                          Upload a floor plan image. Our AI will automatically detect rooms, calculate areas, and prepare your BOQ structure.
                      </p>
                  </MotionButton>

                  {/* Manual Option */}
                  <MotionButton 
                    variants={item}
                    whileHover={{ scale: 1.02, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setSetupMethod('manual'); setStep(1); }} 
                    className="bg-white border-2 border-slate-100 rounded-3xl p-8 text-left shadow-lg hover:shadow-xl hover:border-slate-300 transition-all group"
                  >
                      <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-600 group-hover:scale-110 transition-transform">
                          <PencilIcon className="w-7 h-7" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-slate-700 transition-colors">Manual Entry</h3>
                      <p className="text-sm text-slate-500 leading-relaxed">
                          Start with a blank canvas. Manually define rooms and dimensions. Best for simple renovations or specific scope.
                      </p>
                  </MotionButton>
              </MotionDiv>


          </div>
      )}

      {/* STEP 1: PROJECT CONTEXT */}
      {step === 1 && (
        <MotionDiv initial={{opacity:0, x: 20}} animate={{opacity:1, x: 0}} className="space-y-8 pt-10">
            {/* Header / Progress */}
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-slate-900">Project Context</h2>
                <div className="flex justify-center gap-2 mt-4">
                    <div className="h-1.5 w-12 bg-blue-600 rounded-full"></div>
                    <div className="h-1.5 w-4 bg-slate-200 rounded-full"></div>
                </div>
            </div>

            {setupMethod === 'floorplan' && (
                <Card title="Upload Floor Plan" titleIcon={<UploadIcon className="w-4 h-4"/>}>
                    <div className="flex flex-col md:flex-row gap-6 items-end">
                        <div className="flex-1 w-full">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Project Area (sq ft)</label>
                            <input type="number" value={projectContext.area || ''} onChange={e => setProjectContext(p => ({ ...p, area: Number(e.target.value) }))} className="w-full p-3 bg-white/50 border border-slate-200 rounded-xl mt-2 text-lg font-bold outline-none focus:ring-2 focus:ring-blue-200" placeholder="e.g. 1200" />
                        </div>
                        <div className="flex-1 w-full">
                             <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Floor Plan Image</label>
                             <input type="file" onChange={handleFileChange} accept="image/*" className="w-full p-2 border border-slate-200 rounded-xl mt-2 bg-white/50" />
                        </div>
                         <button onClick={handleAnalyzeFloorplan} disabled={isLoading || !isAiAvailable()} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-all disabled:bg-slate-400">
                            {isLoading ? loadingMessage : 'Analyze Plan'}
                         </button>
                    </div>
                     {(planBase64 || projectContext.floorplanImage || projectContext.floorplanImageUrl) && (
                       <img
                         src={planBase64 || projectContext.floorplanImage
                           ? `data:image/jpeg;base64,${planBase64 || projectContext.floorplanImage}`
                           : projectContext.floorplanImageUrl}
                         alt="floor plan preview"
                         className="mt-6 max-h-64 rounded-xl shadow-md border border-white/50 mx-auto"
                       />
                     )}
                     {planUploadError && (
                       <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                         {planUploadError}
                       </p>
                     )}
                </Card>
            )}
             
             <ProjectContextCard projectContext={projectContext} setProjectContext={setProjectContext} aiStrategy={'balanced'} hideExecutionControls={true} />
             
             <div className="flex justify-center gap-4 pt-4">
                <button onClick={() => setStep(0)} className="px-8 py-4 bg-white text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all shadow-sm border border-slate-200">Back</button>
                <button 
                    onClick={() => setStep(3)} // SKIPPED STEP 2
                    disabled={!isContextComplete} 
                    className="px-10 py-4 btn-primary text-white font-bold rounded-2xl shadow-xl transition-all flex items-center gap-2"
                >
                    Next: Generate Options <ArrowRightIcon className="w-5 h-5" />
                </button>
             </div>
        </MotionDiv>
      )}

      {/* STEP 3: GENERATION (LOGICALLY STEP 2 NOW) */}
      {step === 3 && (
          <MotionDiv initial={{opacity:0, scale: 0.95}} animate={{opacity:1, scale: 1}} className="max-w-4xl mx-auto space-y-8 pt-10">
              
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-slate-900">Generation Strategy</h2>
                <div className="flex justify-center gap-2 mt-4">
                    <div className="h-1.5 w-4 bg-emerald-500 rounded-full"></div>
                    <div className="h-1.5 w-12 bg-blue-600 rounded-full"></div>
                </div>
              </div>

              <Card title="Generation Engine">
                   <div className="p-2">
                       <p className="text-slate-600 mb-8">Select how you want to build the proposal options.</p>
                       
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div className="space-y-2">
                                <label className="font-bold text-slate-700">Proposal Mode</label>
                                <div className="grid grid-cols-2 gap-2 h-[58px]">
                                    {(['single', 'tiered'] as const).map(m => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => {
                                                setProposalMode(m);
                                                setProjectContext(p => ({ ...p, proposalMode: m }));
                                            }}
                                            className={`px-3 rounded-xl border text-center transition-all font-bold text-[10px] flex items-center justify-center uppercase tracking-wider leading-tight
                                                ${proposalMode === m 
                                                    ? 'bg-blue-50 border-blue-500 text-blue-800 ring-1 ring-blue-200 shadow-sm' 
                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                }
                                            `}
                                        >
                                            {m === 'single' ? 'Single Option' : 'Tiered Options'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="font-bold text-slate-700">Design Theme</label>
                                <select value={theme} onChange={e => setTheme(e.target.value)} className="w-full p-4 border border-slate-200 rounded-xl bg-slate-50 font-medium text-sm outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer h-[58px]">
                                    {['modern', 'minimalist', 'classic', 'industrial', 'bohemian', 'luxury'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                </select>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="font-bold text-slate-700">AI Persona (for Custom Gen)</label>
                                <div className="grid grid-cols-3 gap-1 h-[58px]">
                                    {AI_STRATEGIES.map(s => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => setSelectedStrategy(s.id as AIStrategy)}
                                            className={`rounded-xl border text-center transition-all flex flex-col items-center justify-center p-1
                                                ${selectedStrategy === s.id 
                                                    ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-200 text-blue-800' 
                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                }
                                            `}
                                        >
                                            <span className="text-base mb-0.5">{s.icon}</span>
                                            <span className="text-[8px] font-bold uppercase tracking-wider leading-none">{s.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                       </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            <button 
                                onClick={handleGenerateTemplates} 
                                disabled={isLoading} 
                                className="relative group p-6 bg-white border-2 border-slate-200 rounded-3xl text-left hover:border-blue-500 hover:shadow-xl transition-all disabled:opacity-50"
                            >
                                <div className="absolute top-4 right-4 text-blue-600 bg-blue-50 p-2 rounded-lg">
                                    <ListIcon className="w-6 h-6" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-700">Use Standard Templates</h3>
                                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                                    Instantly generates {proposalMode === 'single' ? '1 option (Comfort Upgrade)' : '3 tiers (Essential, Comfort, Harmony)'} using standard firm specifications for {projectContext.config}.
                                </p>
                                <div className="mt-4 text-xs font-bold text-blue-600 bg-blue-50 inline-block px-2 py-1 rounded">Fastest • Recommended</div>
                            </button>

                            <button 
                                onClick={handleGenerateAI} 
                                disabled={isLoading || !isAiAvailable()} 
                                className="relative group p-6 bg-white border-2 border-slate-200 rounded-3xl text-left hover:border-purple-500 hover:shadow-xl transition-all disabled:opacity-50"
                            >
                                <div className="absolute top-4 right-4 text-purple-600 bg-purple-50 p-2 rounded-lg">
                                    <SparklesIcon className="w-6 h-6" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 group-hover:text-purple-700">Ask AI to Create</h3>
                                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                                    Gemini will analyze your exact room list and client brief to build {proposalMode === 'single' ? 'a unique custom option' : '3 unique custom packages'} from scratch.
                                </p>
                                <div className="mt-4 text-xs font-bold text-purple-600 bg-purple-50 inline-block px-2 py-1 rounded">Flexible • Tailored</div>
                            </button>

                        </div>

                        {isLoading && (
                            <div className="mt-8 text-center animate-in fade-in zoom-in">
                                <div className="inline-flex items-center gap-3 bg-white px-6 py-3 rounded-full shadow-lg border border-slate-100">
                                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="font-bold text-slate-700">{loadingMessage}</span>
                                </div>
                            </div>
                        )}

                        <div className="mt-8 border-t border-slate-100 pt-6">
                             <button 
                                onClick={handleStartManual} 
                                disabled={isLoading} 
                                className="w-full py-4 bg-slate-50 text-slate-500 border border-slate-200 font-bold rounded-2xl hover:bg-white hover:text-slate-800 hover:border-slate-300 transition-all flex items-center justify-center gap-2"
                            >
                               Skip Generation & Start Manual BOQ <ArrowRightIcon className="w-4 h-4"/>
                            </button>
                        </div>
                   </div>
              </Card>
          </MotionDiv>
      )}
    </div>
  );
};

export default ProjectSetupWizard;
