
import React, { useState } from 'react';
import { downscalePlanToBase64 } from '../lib/imageDownscale';
import { uploadPlanImage } from '../services/planStorage';
import { showSuccessWithNext } from './SuccessWithNextToast';
import { Item, ProjectContext, ProposalTier, AIStrategy, MaterialSuggestion, TimelinePhase, LeadProfile, DecisionBrainOutput } from '../types';
import { generateStandardPackages, TemplateData } from '../lib/standardPackages';
import ProjectContextCard from './ProjectContextCard';
import { isAiAvailable, generateProjectTimeline, generateMaterialMoodBoard } from '../services/geminiService';
import { readPlanOntoSheet } from '../services/planRooms';
import { asNewPlaygroundOption } from '../lib/playground/versions';
import { optionsWaitForPlan, OPTIONS_NEED_PLAN } from '../lib/briefRead';
import { planImageFromFile } from '../services/planImage';
import { buildBankMap } from '../lib/boqPricing';
import { PLAYGROUND_PRICING } from '../lib/playground/pricing';
import { id as generateId } from '../lib/utils';
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
  /* No options without the client's floor plan on the project (lib/briefRead optionsWaitForPlan). */
  const waitsForPlan = optionsWaitForPlan(projectContext, isFeeOnly(engagementOf(projectContext)));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    try {
      // Shrunk before it goes anywhere: a 4000px plan costs the studio upload
      // time and the client load time, and nothing here reads it at that size.
      const base64String = await downscalePlanToBase64(file);
      /* What the AI reads and the preview shows: the image, or page 1 of a PDF drawn as one. The PDF itself is what is stored. */
      const image = file.type === 'application/pdf' ? await planImageFromFile(file) : base64String;

      /*
        The bytes stay in component state and the document gets a URL.

        Analysis needs the image itself, and the preview below wants it before
        any upload finishes, but neither needs it *stored*: written into
        `floorplanImage` a plan was 200-270KB of a 1 MiB document, and once the
        wizard is done nothing displays it again.
      */
      setPlanBase64(image);
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
        setPlanUploadError('The plan could not be saved. Room detection still works, but options wait until the plan is saved: choose the file again.');
      }
    } catch (err) {
      console.error('Floor plan could not be read', err);
      alert('That file could not be read. Please try another image or PDF.');
    }
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
      /*
        The reading itself (rooms, the typology's top-up, the configuration and
        the area from the drawing, the studio's room names) lives in
        services/planRooms, so Brief & Site reads a plan the same way.
      */
      const read = await readPlanOntoSheet(planForAnalysis, projectContext, { tenantId: orgData?.tenantId, imageUrl: projectContext.floorplanImageUrl });
      setProjectContext(p => ({
          ...p,
          rooms: read.rooms,
          area: read.area,
          /* The drawing counted the bedrooms; it wins. A studio who disagrees edits the field. */
          config: read.config || p.config,
          /* The plan under the BOQ, its rooms where they are drawn (BOQ Editor's Plan). */
          ...(read.sheet ? { planSheet: read.sheet } : {}),
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
          /*
            A Playground BOQ: it starts empty, so there is nothing to carry over,
            and only a Playground version opens the design library on the plan,
            which is how items are added by hand to the client's plan.
          */
          boqFormat: 'playground',
          pricingRules: { ...PLAYGROUND_PRICING },
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

  const finalizeGeneration = async (generated: ProposalTier[]) => {
      /*
        The furniture on the plan. With the rooms on the client's plan, each
        option's lines that draw are placed in their rooms (lib/playground/placeAll),
        so the BOQ Editor opens with the pieces drawn rather than waiting under
        Needs a place. A manual BOQ starts empty and needs none of this.
      */
      const bankMap = buildBankMap(bank, projectContext.adHocItems);
      /* Every generated option is a Playground version (owner, 20 Nov 2026), its pieces placed. */
      const newTiers = generated.map(t => asNewPlaygroundOption(t, bankMap, projectContext.rooms || []));
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
          {/* The plan is needed either way: options are made on it. Entering by hand only means the rooms are typed, not read. */}
          {(setupMethod === 'floorplan' || waitsForPlan || projectContext.floorplanImageUrl) && (
            <Panel icon={Upload} title="Upload the floor plan"
              badge={waitsForPlan ? <Chip tone="warn">Needed for options</Chip> : <Chip tone="good">Saved</Chip>}
              blurb={setupMethod === 'floorplan' ? 'The area and the client’s plan, an image or a PDF. Analyse it to fill in the rooms below.' : 'The client’s plan, an image or a PDF. Options are made on it; set the rooms by hand below, or analyse it.'}>
              <div className="flex flex-col md:flex-row gap-4 md:items-end">
                <div className="flex-1 w-full">
                  <label htmlFor="wiz-area" className={`${LABEL} block`}>Project area (sq ft)</label>
                  <input id="wiz-area" type="number" value={projectContext.area || ''} onChange={e => setProjectContext(p => ({ ...p, area: Number(e.target.value) }))} className={`${INPUT} mt-1`} placeholder="e.g. 1200" />
                </div>
                <div className="flex-1 w-full">
                  <label htmlFor="wiz-plan" className={`${LABEL} block`}>Floor plan</label>
                  <input id="wiz-plan" type="file" onChange={handleFileChange} accept="image/*,application/pdf" className={`${INPUT} mt-1 py-1.5`} />
                </div>
                <Button variant="primary" icon={Sparkles} onClick={handleAnalyzeFloorplan} disabled={isLoading || !isAiAvailable() || !(planBase64 || projectContext.floorplanImage)}>
                  {isLoading ? loadingMessage : 'Analyse the plan'}
                </Button>
              </div>
              {(planBase64 || projectContext.floorplanImage || (projectContext.floorplanImageUrl && !/\.pdf(\?|#|$)/i.test(projectContext.floorplanImageUrl))) && (
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
              <span className="inline-flex flex-wrap items-center justify-end gap-3">
                {waitsForPlan && <span className="text-xs font-semibold text-amber-700" role="status">{OPTIONS_NEED_PLAN}</span>}
                <Button variant="primary" icon={ArrowRight} onClick={() => setStep(3)} disabled={!isContextComplete || waitsForPlan}>
                  Next: generate the options
                </Button>
              </span>
            )}
          </div>
        </div>
      )}

      {/* STEP 3 (the second step the user sees): the first options */}
      {step === 3 && (
        <div className="space-y-4">
          <Panel icon={Layers} title="Generate the options" blurb="The options are built from the studio's Standard templates. Every line can be edited afterwards in the BOQ Editor.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <button type="button" onClick={handleGenerateTemplates} disabled={isLoading || waitsForPlan} className={`${CHOICE} hud-row-in`}>
                <IconChip icon={List} />
                <h3 className="mt-4 font-bold text-slate-800">Use the standard templates</h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Makes {proposalMode === 'single' ? 'one option (Comfort Upgrade)' : 'three tiers (Essential, Comfort, Harmony)'} straight away from the studio's Standard templates for {projectContext.config}, each piece at its Item Bank standard size.
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
            <Button variant="quiet" icon={ArrowRight} onClick={handleStartManual} disabled={isLoading || waitsForPlan}>
              Skip, and start a manual BOQ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectSetupWizard;
