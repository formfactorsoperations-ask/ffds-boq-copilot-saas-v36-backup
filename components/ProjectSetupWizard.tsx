
import React, { useState } from 'react';
import { Item, ProjectContext, ProposalTier, AIStrategy, MaterialSuggestion, TimelinePhase, LeadProfile, DecisionBrainOutput } from '../types';
import { generateStandardPackages, TemplateData } from '../lib/standardPackages';
import { SparklesIcon, PencilIcon, ArrowRightIcon, UploadIcon, ListIcon } from './Icons';
import { FFDSLogo } from './FFDSLogo';
import ProjectContextCard from './ProjectContextCard';
import { analyzeFloorPlan, isAiAvailable, generateProjectTimeline, generateMaterialMoodBoard, generateTieredBoqPackages } from '../services/geminiService';
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
      setTimelinePhases
  } = props;

  const [step, setStep] = useState(0); 
  const [setupMethod, setSetupMethod] = useState<SetupMethod>('manual');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [theme, setTheme] = useState('modern');
  const [selectedStrategy, setSelectedStrategy] = useState<AIStrategy>('balanced');
  
  const isContextComplete = (projectContext.rooms || []).length > 0 && projectContext.area > 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).replace('data:', '').replace(/^.+,/, '');
        setProjectContext(p => ({ ...p, floorplanImage: base64String }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyzeFloorplan = async () => {
    if (!projectContext.floorplanImage) {
      alert("Please upload a floor plan image.");
      return;
    }
    setIsLoading(true);
    setLoadingMessage('Analyzing floor plan...');
    try {
      const rooms = await analyzeFloorPlan(projectContext.floorplanImage, projectContext.area);
      const totalAreaFromAI = rooms.reduce((sum, room) => sum + (room.size || 0), 0);
      setProjectContext(p => ({ 
          ...p, 
          rooms,
          area: totalAreaFromAI > 0 ? Number(totalAreaFromAI.toFixed(2)) : p.area 
      }));
    } catch (e) {
      console.error(e);
      alert("Failed to analyze floor plan. Please try manual setup.");
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
                      return { ...bankItem, ...boqItem, margin: boqItem.marginOverride ?? bankItem.margin };
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
  };

  const handleGenerateTemplates = async () => {
    setIsLoading(true);
    setLoadingMessage('Applying Standard Packages...');
    await new Promise(resolve => setTimeout(resolve, 600)); // UX delay
    
    setProjectContext(prev => ({ ...prev, theme }));
    if (setAiStrategy) setAiStrategy(selectedStrategy);

    const newTiers = generateStandardPackages(projectContext, bank, templates);
    await finalizeGeneration(newTiers);
  };

  const handleGenerateAI = async () => {
      setIsLoading(true);
      setLoadingMessage('AI: Thinking & Generating...');
      
      setProjectContext(prev => ({ ...prev, theme }));
      if (setAiStrategy) setAiStrategy(selectedStrategy);

      try {
          const rawPackages = await generateTieredBoqPackages(projectContext, theme, bank, selectedStrategy);
          
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
                  projectContext,
                  summary: { totalSell: 0, totalCost: 0, totalGm: 0, itemCount: boqItems.length, totalRevenue: 0, designFee: 0, blendedGm: 0 }
              };
          };

          const newTiers = [
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
                  <h1 className="text-4xl md:text-5xl font-black text-indigo-950 tracking-tight mb-4">
                      Create New Project
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
                    className="relative bg-white border-2 border-indigo-100 rounded-3xl p-8 text-left shadow-xl shadow-indigo-500/10 hover:shadow-2xl hover:border-indigo-500/50 transition-all group overflow-hidden"
                  >
                      <div className="absolute top-0 right-0 p-3">
                          <span className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-md">Recommended</span>
                      </div>
                      <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 text-indigo-600 group-hover:scale-110 transition-transform">
                          <SparklesIcon className="w-7 h-7" />
                      </div>
                      <h3 className="text-xl font-bold text-indigo-950 mb-2 group-hover:text-indigo-700 transition-colors">AI Floor Plan Analysis</h3>
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
                      <h3 className="text-xl font-bold text-indigo-950 mb-2 group-hover:text-slate-700 transition-colors">Manual Entry</h3>
                      <p className="text-sm text-slate-500 leading-relaxed">
                          Start with a blank canvas. Manually define rooms and dimensions. Best for simple renovations or specific scope.
                      </p>
                  </MotionButton>
              </MotionDiv>

              <MotionDiv 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                transition={{ delay: 0.5 }}
                className="mt-12"
              >
                  <button 
                      onClick={handleSkipToDashboard}
                      className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-2 px-4 py-2 rounded-full hover:bg-slate-100"
                  >
                      Just exploring? Skip setup and go to Dashboard <ArrowRightIcon className="w-4 h-4" />
                  </button>
              </MotionDiv>
          </div>
      )}

      {/* STEP 1: PROJECT CONTEXT */}
      {step === 1 && (
        <MotionDiv initial={{opacity:0, x: 20}} animate={{opacity:1, x: 0}} className="space-y-8 pt-10">
            {/* Header / Progress */}
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-indigo-950">Project Context</h2>
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
                     {projectContext.floorplanImage && <img src={`data:image/jpeg;base64,${projectContext.floorplanImage}`} alt="floor plan preview" className="mt-6 max-h-64 rounded-xl shadow-md border border-white/50 mx-auto"/>}
                </Card>
            )}
             
             <ProjectContextCard projectContext={projectContext} setProjectContext={setProjectContext} aiStrategy={'balanced'} />
             
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
                <h2 className="text-2xl font-bold text-indigo-950">Generation Strategy</h2>
                <div className="flex justify-center gap-2 mt-4">
                    <div className="h-1.5 w-4 bg-emerald-500 rounded-full"></div>
                    <div className="h-1.5 w-12 bg-blue-600 rounded-full"></div>
                </div>
              </div>

              <Card title="Generation Engine">
                   <div className="p-2">
                       <p className="text-slate-600 mb-8">Select how you want to build the proposal options.</p>
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div className="space-y-2">
                                <label className="font-bold text-slate-700">Design Theme</label>
                                <select value={theme} onChange={e => setTheme(e.target.value)} className="w-full p-4 border border-slate-200 rounded-xl bg-slate-50 font-medium text-lg outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer">
                                    {['modern', 'minimalist', 'classic', 'industrial', 'bohemian', 'luxury'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                </select>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="font-bold text-slate-700">AI Persona (for Custom Gen)</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {AI_STRATEGIES.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => setSelectedStrategy(s.id as AIStrategy)}
                                            className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center
                                                ${selectedStrategy === s.id 
                                                    ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-200 text-blue-800' 
                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                                }
                                            `}
                                        >
                                            <span className="text-xl mb-1">{s.icon}</span>
                                            <span className="text-[10px] font-bold uppercase tracking-wide">{s.name}</span>
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
                                <h3 className="text-lg font-bold text-indigo-900 group-hover:text-blue-700">Use Standard Templates</h3>
                                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                                    Instantly generates 3 tiers (Essential, Comfort, Harmony) using FFDS standard specifications for {projectContext.config}.
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
                                <h3 className="text-lg font-bold text-indigo-900 group-hover:text-purple-700">Ask AI to Create</h3>
                                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                                    Gemini will analyze your exact room list and client brief to build 3 unique custom packages from scratch.
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
                                className="w-full py-4 bg-slate-50 text-slate-500 border border-slate-200 font-bold rounded-2xl hover:bg-white hover:text-indigo-900 hover:border-slate-300 transition-all flex items-center justify-center gap-2"
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
