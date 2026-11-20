
import React, { useState } from 'react';
import { downscalePlanToBase64 } from '../lib/imageDownscale';
import { uploadPlanImage } from '../services/planStorage';
import { showSuccessWithNext } from './SuccessWithNextToast';
import { Item, ProjectContext, ProposalTier, AIStrategy, MaterialSuggestion, TimelinePhase, LeadProfile, DecisionBrainOutput, Room } from '../types';
import { generateStandardPackages, TemplateData, resolveActiveTemplate, ensureRoomsExistForTemplate, detectRoomType, roomFamily } from '../lib/standardPackages';
import { ensureScopeRooms, uniqueRoomNames, polishRoomNames } from '../lib/scopeBuckets';
import ProjectContextCard from './ProjectContextCard';
import { analyzeFloorPlan, isAiAvailable, generateProjectTimeline, generateMaterialMoodBoard, generateTieredBoqPackages, estimateRoomSizes } from '../services/geminiService';
import { id as generateId } from '../lib/utils';
import { AI_STRATEGIES } from '../constants';
import { FullBoqItem, BoqItem } from '../types'; // Import necessary types
import { Panel, Button, Chip, Segmented, IconChip, LABEL, INPUT } from './ui/kit';
import { Rocket, Sparkles, Pencil, Upload, Layers, List, ArrowRight } from '@/lib/lucide-shim';
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
  /** Closes the wizard. `next` says what was made, so the app can open it: generated options, or a manual BOQ. */
  onComplete?: (next?: 'options' | 'manual') => void;
  onCancel?: () => void;
}

type SetupMethod = 'manual' | 'floorplan';

import { useOrg } from '../contexts/OrgContext';
import { engagementOf, isFeeOnly } from '../lib/engagement';

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
      alert(`Could not read the floor plan: ${e instanceof Error ? e.message : String(e)}\n\nYou can still set the rooms by hand, or use Map rooms.`);
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
      if (onComplete) onComplete('manual');
  }

  const finalizeGeneration = async (newTiers: ProposalTier[]) => {
      setTiers(newTiers);
      if (onComplete) onComplete('options');
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


  /*
    The wizard in the console's own look (DESIGN.md "Screen kit",
    standardisation PR 10). It used to be a world of its own: the studio logo
    and "Create New Project" at display size, centred step titles with their
    own progress bars, upper-case blue buttons and a purple AI card. Now one
    slim row says which step this is, and each step is made of the kit's
    cards, switches and buttons. Every handler is the one it was.
  */
  const STEPS = [
    { n: 0, label: 'How to start' },
    { n: 1, label: 'Project details' },
    { n: 3, label: 'Options' },
  ];
  const stepIndex = STEPS.findIndex((st) => st.n === step);
  const CHOICE = 'relative text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 transition-all hover:border-[#3D52A0]/40 hover:shadow-md disabled:opacity-50 disabled:pointer-events-none';

  return (
    <div className="w-full max-w-5xl space-y-4 pb-20">
      {/* One row: where the setup is, and a way out when the brief is being modified. */}
      <div className="flex flex-wrap items-center gap-2">
        <ol className="flex flex-wrap items-center gap-2" aria-label="Setup steps">
          {STEPS.map((st, i) => (
            <li key={st.n} className="flex items-center gap-2" aria-current={i === stepIndex ? 'step' : undefined}>
              {i > 0 && <span className="w-4 h-px bg-slate-300" aria-hidden />}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${i === stepIndex ? 'bg-[#3D52A0] text-white' : i < stepIndex ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-slate-100 text-slate-500'}`}>
                <span className="tabular-nums">{i + 1}</span> {st.label}
              </span>
            </li>
          ))}
        </ol>
        {onCancel && (
          <div className="ml-auto"><Button size="sm" variant="quiet" onClick={onCancel}>Cancel</Button></div>
        )}
      </div>

      {/* STEP 0: how to start */}
      {step === 0 && (
        <Panel
          icon={Rocket}
          title={onCancel ? 'Modify the project brief' : 'Set up the project'}
          blurb="Choose how to put in the project's details. Either way, the next step is the brief and the rooms."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button type="button" onClick={() => { setSetupMethod('floorplan'); setStep(1); }} className={`${CHOICE} hud-row-in`}>
              <span className="absolute top-4 right-4"><Chip tone="brand">Recommended</Chip></span>
              <IconChip icon={Sparkles} />
              <h3 className="mt-4 font-bold text-slate-800">Read a floor plan</h3>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Upload a floor plan image. The AI finds the rooms, works out their areas and prepares the BOQ's structure.
              </p>
            </button>
            <button type="button" onClick={() => { setSetupMethod('manual'); setStep(1); }} className={`${CHOICE} hud-row-in`} style={{ animationDelay: '40ms' }}>
              <IconChip icon={Pencil} />
              <h3 className="mt-4 font-bold text-slate-800">Enter it by hand</h3>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Start from a blank brief and set the rooms and sizes yourself. Best for a simple renovation or a narrow scope.
              </p>
            </button>
          </div>
        </Panel>
      )}

      {/* STEP 1: project details */}
      {step === 1 && (
        <div className="space-y-4">
          {setupMethod === 'floorplan' && (
            <Panel icon={Upload} title="Upload the floor plan" blurb="The area and an image of the plan. Analyse it to fill in the rooms below.">
              <div className="flex flex-col md:flex-row gap-4 md:items-end">
                <div className="flex-1 w-full">
                  <label htmlFor="wiz-area" className={`${LABEL} block`}>Project area (sq ft)</label>
                  <input id="wiz-area" type="number" value={projectContext.area || ''} onChange={e => setProjectContext(p => ({ ...p, area: Number(e.target.value) }))} className={`${INPUT} mt-1`} placeholder="e.g. 1200" />
                </div>
                <div className="flex-1 w-full">
                  <label htmlFor="wiz-plan" className={`${LABEL} block`}>Floor plan image</label>
                  <input id="wiz-plan" type="file" onChange={handleFileChange} accept="image/*" className={`${INPUT} mt-1 py-1.5`} />
                </div>
                <Button variant="primary" icon={Sparkles} onClick={handleAnalyzeFloorplan} disabled={isLoading || !isAiAvailable()}>
                  {isLoading ? loadingMessage : 'Analyse the plan'}
                </Button>
              </div>
              {(planBase64 || projectContext.floorplanImage || projectContext.floorplanImageUrl) && (
                <img
                  src={planBase64 || projectContext.floorplanImage
                    ? `data:image/jpeg;base64,${planBase64 || projectContext.floorplanImage}`
                    : projectContext.floorplanImageUrl}
                  alt="floor plan preview"
                  className="mt-5 max-h-64 rounded-xl border border-slate-200"
                />
              )}
              {planUploadError && (
                <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {planUploadError}
                </p>
              )}
            </Panel>
          )}

          <ProjectContextCard projectContext={projectContext} setProjectContext={setProjectContext} aiStrategy={'balanced'} hideExecutionControls={true} />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button onClick={() => setStep(0)}>Back</Button>
            {/* A fee-only project has no BOQ options to generate: it opens straight onto the project. */}
            {isFeeOnly(engagementOf(projectContext)) ? (
              <Button variant="primary" icon={ArrowRight} onClick={handleStartManual} disabled={!isContextComplete}>
                Create the project
              </Button>
            ) : (
              <Button variant="primary" icon={ArrowRight} onClick={() => setStep(3)} disabled={!isContextComplete}>
                Next: generate the options
              </Button>
            )}
          </div>
        </div>
      )}

      {/* STEP 3 (the second step the user sees): the first options */}
      {step === 3 && (
        <div className="space-y-4">
          <Panel icon={Layers} title="Generate the options" blurb="Choose how the proposal's options are built. Every line can be edited afterwards in the BOQ Editor.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className={LABEL}>Proposal</p>
                <div className="mt-1.5">
                  <Segmented
                    label="Proposal mode"
                    size="sm"
                    value={proposalMode}
                    options={[{ id: 'single', label: 'Single option' }, { id: 'tiered', label: 'Tiered options' }]}
                    onChange={(m) => {
                      setProposalMode(m);
                      setProjectContext(p => ({ ...p, proposalMode: m }));
                    }}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="wiz-theme" className={`${LABEL} block`}>Design theme</label>
                <select id="wiz-theme" value={theme} onChange={e => setTheme(e.target.value)} className={`${INPUT} mt-1.5 bg-white cursor-pointer`}>
                  {['modern', 'minimalist', 'classic', 'industrial', 'bohemian', 'luxury'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <p className={LABEL}>AI persona, for AI options</p>
                <div className="mt-1.5">
                  <Segmented
                    label="AI persona"
                    size="sm"
                    value={selectedStrategy}
                    options={AI_STRATEGIES.map(s => ({ id: s.id, label: s.name }))}
                    onChange={(id) => setSelectedStrategy(id as AIStrategy)}
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <button type="button" onClick={handleGenerateTemplates} disabled={isLoading} className={`${CHOICE} hud-row-in`}>
                <span className="absolute top-4 right-4"><Chip tone="brand">Fastest · recommended</Chip></span>
                <IconChip icon={List} />
                <h3 className="mt-4 font-bold text-slate-800">Use the standard templates</h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Makes {proposalMode === 'single' ? 'one option (Comfort Upgrade)' : 'three tiers (Essential, Comfort, Harmony)'} straight away from the studio's standard specifications for {projectContext.config}.
                </p>
              </button>
              <button type="button" onClick={handleGenerateAI} disabled={isLoading || !isAiAvailable()} className={`${CHOICE} hud-row-in`} style={{ animationDelay: '40ms' }}>
                <span className="absolute top-4 right-4"><Chip tone="slate">Flexible · tailored</Chip></span>
                <IconChip icon={Sparkles} />
                <h3 className="mt-4 font-bold text-slate-800">Ask AI to build them</h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Gemini reads this room list and the client's brief and builds {proposalMode === 'single' ? 'one custom option' : 'three custom packages'} from scratch.
                </p>
              </button>
            </div>

            {isLoading && (
              <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                <span className="w-4 h-4 border-2 border-[#3D52A0] border-t-transparent rounded-full animate-spin" aria-hidden />
                {loadingMessage}
              </p>
            )}
          </Panel>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button onClick={() => setStep(1)} disabled={isLoading}>Back</Button>
            <Button variant="quiet" icon={ArrowRight} onClick={handleStartManual} disabled={isLoading}>
              Skip, and start a manual BOQ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectSetupWizard;
