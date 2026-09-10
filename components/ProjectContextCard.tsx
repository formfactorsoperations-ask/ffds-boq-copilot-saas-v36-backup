import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProjectContext, Room, AIStrategy, DesignScope, CivilScope } from '../types';
import { CIVIL_SCOPE_FIELDS, DEFAULT_CIVIL_SCOPE, resolveCivilScope, isScopeCustomised, pendingSuggestions, applySuggestions } from '../lib/civilScope';
import { ROOM_DISTRIBUTIONS, resolveActiveTemplate, ensureRoomsExistForTemplate, roomFamily } from '../lib/standardPackages';
import { isScopeBucket, realRooms, ensureScopeRooms, polishRoomNames, SCOPE_BUCKETS, SCOPE_BUCKET_META } from '../lib/scopeBuckets';
import { estimateRoomSizes, isAiAvailable } from '../services/geminiService';
import { useOrg } from '../contexts/OrgContext';
import TakeoffPanel from './TakeoffPanel';
import { 
  Sparkles, 
  Trash2, 
  Upload, 
  ChevronDown, 
  Briefcase, 
  Grid, 
  List, 
  Check, 
  Home, 
  Layers, 
  Compass, 
  Hammer, 
  Palette, 
  Sliders, 
  Calendar, 
  Clock, 
  ShieldAlert, 
  Coins, 
  CheckSquare,
  HelpCircle
} from 'lucide-react';

interface ProjectContextCardProps {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  aiStrategy: AIStrategy; 
  onSaveProject?: () => void;
  projectId?: string;
  hideExecutionControls?: boolean;
}

const CONFIG_OPTIONS = [
  { id: '1-BHK', label: '1-BHK', desc: 'Compact studio or 1-bed apartment', icon: Home },
  { id: '2-BHK', label: '2-BHK', desc: 'Standard mid-size family residence', icon: Home },
  { id: '3-BHK', label: '3-BHK', desc: 'Spacious 3-bedroom apartment/flat', icon: Home },
  { id: '4-BHK', label: '4-BHK', desc: 'Large 4-bedroom premium home', icon: Home },
  { id: 'Duplex', label: 'Duplex', desc: 'Multi-level premium residential unit', icon: Layers },
  { id: 'Bathroom-Remodel', label: 'Bath Only', desc: 'Targeted sanitary/tiling remodel', icon: Sparkles, isNew: true },
];

const THEME_OPTIONS = [
  { id: 'modern', label: 'Modern', desc: 'Minimal lines, neutral tones, sleek forms', icon: Compass },
  { id: 'classic', label: 'Classic', desc: 'Traditional wood, symmetry, rich fabrics', icon: Hammer },
  { id: 'bohemian', label: 'Bohemian', desc: 'Eclectic textures, plants, warm colors', icon: Palette },
  { id: 'industrial', label: 'Industrial', desc: 'Exposed ducts, raw concrete, steel accents', icon: Sliders },
];

const ProjectContextCard: React.FC<ProjectContextCardProps> = ({ 
  projectContext, 
  setProjectContext,
  hideExecutionControls = false
}) => {
  const { teamMembers } = useOrg();
  const siteSupervisors = teamMembers.filter(m => m.role === 'Site Supervisor');
  const [isEstimating, setIsEstimating] = useState(false);
  const [plannerTab, setPlannerTab] = useState<'editor' | 'takeoff'>('editor');

  const handleContextChange = (field: keyof ProjectContext, value: any) => {
    setProjectContext(prev => ({ ...prev, [field]: value }));
  };

  const handleConfigSelect = (configId: string) => {
    if (configId === 'Bathroom-Remodel') {
      setProjectContext(prev => ({
        ...prev,
        config: configId,
        area: 45,
        rooms: [{ name: 'Master Bathroom', size: 45, unit: 'sq ft', length: 9, width: 5, height: 9.5 }]
      }));
    } else if (projectContext.config === 'Bathroom-Remodel' && configId !== 'Bathroom-Remodel') {
      setProjectContext(prev => ({
        ...prev,
        config: configId,
        area: 1000,
        rooms: []
      }));
    } else {
      handleContextChange('config', configId);
    }
  };

  const handleDesignScopeChange = (field: keyof DesignScope, value: boolean | number) => {
    setProjectContext(prev => ({
      ...prev,
      designScope: { ...prev.designScope, [field]: value }
    }));
  };

  const handleRoomChange = (index: number, field: keyof Room, value: string | number) => {
    const newRooms = [...(projectContext.rooms || [])];
    const roomToUpdate = { ...newRooms[index] };
    
    (roomToUpdate as any)[field] = (typeof value === 'string' && ['size', 'length', 'width', 'height'].includes(field as string)) ? Number(value) || 0 : value;

    if (field === 'length' || field === 'width') {
      const l = field === 'length' ? Number(value) : roomToUpdate.length || 0;
      const w = field === 'width' ? Number(value) : roomToUpdate.width || 0;
      if (l > 0 && w > 0) {
        roomToUpdate.size = Number((l * w).toFixed(2));
      }
    }
    
    newRooms[index] = roomToUpdate;
    setProjectContext(prev => ({ ...prev, rooms: newRooms }));
  };

  const handleAddRoom = () => {
    const newRoom: Room = { name: `Room ${(projectContext.rooms || []).length + 1}`, size: 120, unit: 'sq ft' };
    setProjectContext(prev => ({ ...prev, rooms: [...(prev.rooms || []), newRoom] }));
  };

  /*
    Buckets were added here as rooms carrying the whole flat's area, which is
    what made a 904 sq ft project measure 2,710. They are not rooms and are not
    created: Civil, Functional and Others always exist as places for a line to
    sit, and the BOQ puts lines in them. See lib/scopeBuckets.

    Anything a previous version stored as a bucket-room is filtered out of the
    planner rather than deleted, so nothing is destroyed on projects that have
    BOQ lines pointing at those names.
  */
  const plannerRooms = realRooms(projectContext.rooms);
  /*
    Only a scope carrying an AREA is a legacy entry worth warning about — that
    is the shape that got measured as a room. The three zero-area scopes are
    supposed to be there, and calling them "legacy entries hidden from
    measurement" made the correct state read like a fault.
  */
  const legacyBucketRooms = (projectContext.rooms || [])
    .filter(r => isScopeBucket(r?.name) && (r?.size || 0) > 0);
  
  const handleDeleteRoom = (index: number) => {
    setProjectContext(prev => ({ ...prev, rooms: (prev.rooms || []).filter((_, i) => i !== index) }));
  };

  /*
    The civil scope, and the one thing that made Current Site State matter.

    Picking a site state used to change nothing: the field was read in one
    place in the whole app, for a portal message, so a raw shell and a finished
    refit generated identical bills. It now seeds these switches, and the
    switches are what the BOQ generator reads — which also means the studio can
    disagree with it. A finished flat having its floors and bathrooms redone is
    an ordinary brief, and it is the reason the block is editable at all.
  */
  const civilScope = resolveCivilScope(projectContext);

  const setCivilScope = (key: keyof CivilScope, value: boolean) => {
    setProjectContext(prev => ({
      ...prev,
      // Materialised in full on first edit, so an untouched switch reads as the
      // studio's choice from here on rather than drifting when the site state
      // is changed later.
      civilScope: { ...resolveCivilScope(prev), [key]: value },
    }));
  };

  /*
    The brief does the typing.

    Seven switches is seven decisions, and the studio has already written the
    requirement down in a sentence. This reads it back and offers the switches
    it implies — it never sets them. A bill that changed because a regex fired
    is worse than one nobody configured, because nobody knows to check it.
  */
  const briefSuggestions = pendingSuggestions(projectContext);

  const applyBriefSuggestions = () => {
    setProjectContext(prev => ({ ...prev, civilScope: applySuggestions(prev, pendingSuggestions(prev)) }));
  };

  const resetCivilScope = () => {
    setProjectContext(prev => ({ ...prev, civilScope: undefined }));
  };

  const handleSiteStateChange = (status: string) => {
    setProjectContext(prev => ({
      ...prev,
      propertyStatus: status as any,
      /* Changing the site state re-suggests the scope. It only overwrites a
         scope the studio has not touched — an explicit choice survives. */
      civilScope: prev.civilScope && isScopeCustomised(prev) ? prev.civilScope : undefined,
    }));
  };

  /*
    Auto-map rooms, with a floor under it.

    The button used to be disabled whenever the AI key was missing or the call
    failed, which left the manual path with no way to get a room list at all —
    and without rooms the BOQ generator has nothing to price against. The
    typology's own distribution is a perfectly good answer: ROOM_DISTRIBUTIONS
    already knows a 3-BHK is three bedrooms and three bathrooms. AI refines it
    where it is available; it is no longer the only way through.
  */
  const distributionRooms = (): Room[] => {
    const { activeTemplate, configKey } = resolveActiveTemplate(undefined, projectContext.config || '');
    return ensureRoomsExistForTemplate({ ...projectContext, rooms: [] } as any, activeTemplate, configKey);
  };

  /*
    Rooms map themselves.

    Disabling the button once rooms exist was half a fix: on a project that has
    never had any, the studio still had to notice a button and press it before
    anything could be priced, and a BOQ generated with no rooms is a BOQ of
    nothing. The typology's own distribution is deterministic — no AI call, no
    cost, no waiting — so there is no reason to make anyone ask for it.

    Runs once per project, only when there are no rooms at all and the two
    inputs it needs are present. It never overwrites: the moment a room exists,
    whether from a plan, the AI or by hand, this stops. `mappedFor` is keyed on
    the project so opening a second project re-arms it.
  */
  const mappedFor = React.useRef<string | null>(null);

  useEffect(() => {
    const key = `${projectContext.name}|${projectContext.config}|${projectContext.area}`;
    if (mappedFor.current === key) return;
    if (realRooms(projectContext.rooms).length > 0) return;
    if (!projectContext.area || !projectContext.config) return;

    mappedFor.current = key;
    const seeded = distributionRooms();
    if (seeded.length > 0) {
      setProjectContext(prev =>
        realRooms(prev.rooms).length > 0 ? prev : { ...prev, rooms: ensureScopeRooms(polishRoomNames(seeded, roomFamily)) },
      );
    }
  }, [projectContext.name, projectContext.config, projectContext.area, projectContext.rooms]);

  const handleEstimateRooms = async () => {
    if (!projectContext.area || !projectContext.config) {
      alert("Please provide total area and configuration to map rooms.");
      return;
    }
    setIsEstimating(true);
    try {
      if (isAiAvailable()) {
        const estimatedRooms = await estimateRoomSizes(projectContext.area, projectContext.config);
        if (estimatedRooms.length > 0) {
          setProjectContext(prev => ({ ...prev, rooms: ensureScopeRooms(polishRoomNames(estimatedRooms, roomFamily)) }));
          return;
        }
      }
      const fallback = distributionRooms();
      if (fallback.length > 0) setProjectContext(prev => ({ ...prev, rooms: ensureScopeRooms(polishRoomNames(fallback, roomFamily)) }));
    } catch (err) {
      console.error(err);
      // A failed call is not a dead end — fall back rather than leave the
      // planner empty and the BOQ with nothing to price.
      const fallback = distributionRooms();
      if (fallback.length > 0) setProjectContext(prev => ({ ...prev, rooms: ensureScopeRooms(polishRoomNames(fallback, roomFamily)) }));
    } finally {
      setIsEstimating(false);
    }
  };

  const deliverablesCount = Object.entries(projectContext.designScope || {})
    .filter(([k, v]) => k !== 'visitCount' && v === true).length;
    
  
  const feeLabel = projectContext.designFeeType === 'percentage' ? `${projectContext.designFee || 10}% of Cost` : 
                   projectContext.designFeeType === 'fixed_sqft' ? `₹${projectContext.designFee || 0}/sqft` : 
                   `₹${projectContext.designFee || 0} Fixed`;

  return (
    <div className="space-y-6 w-full">
      {/* 1. Brand Identity & Project Metadata Section */}
      <div className="glass-light rounded-2xl border border-[#0066CC]/15 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
        <div className="px-6 py-4 glass-light border-b border-[#0066CC]/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#0066CC]/5 rounded-lg">
              <Briefcase className="w-5 h-5 text-[#0066CC]" />
            </div>
            <div>
              <h4 className="text-base font-bold text-sky-950">Client Handoff & Project Identity</h4>
              <p className="text-xs text-slate-400 font-medium">Core contact information and site details</p>
            </div>
          </div>
          <span className="text-[10px] font-black tracking-widest text-[#0066CC] uppercase bg-sky-50/50 px-2.5 py-1 rounded border border-[#0066CC]/20">
            CLIENT & SITE PROFILE
          </span>
        </div>

        <div className="p-6 md:p-8">
          {/* Project Fields Grid */}
          <div className="w-full space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Project Name / Site Tag</label>
                <input 
                  type="text" 
                  value={projectContext?.name || ''} 
                  onChange={e => handleContextChange('name', e.target.value)} 
                  className="w-full px-4 py-3 bg-white/40 backdrop-blur-sm border border-slate-200 rounded-xl text-sm font-bold text-sky-950 focus:border-[#0066CC] focus:bg-white focus:ring-1 focus:ring-[#0066CC]/10 outline-none transition-all duration-200" 
                  placeholder="e.g. Lodha Amara 402" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Client Full Name</label>
                <input 
                  type="text" 
                  value={projectContext.clientName || ''} 
                  onChange={e => handleContextChange('clientName', e.target.value)} 
                  className="w-full px-4 py-3 bg-white/40 backdrop-blur-sm border border-slate-200 rounded-xl text-sm font-bold text-sky-950 focus:border-[#0066CC] focus:bg-white focus:ring-1 focus:ring-[#0066CC]/10 outline-none transition-all duration-200" 
                  placeholder="e.g. Rahul Sharma" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Client Email Address</label>
                <input 
                  type="email" 
                  value={projectContext.clientEmail || ''} 
                  onChange={e => handleContextChange('clientEmail', e.target.value)} 
                  className="w-full px-4 py-3 bg-white/40 backdrop-blur-sm border border-slate-200 rounded-xl text-sm font-bold text-sky-950 focus:border-[#0066CC] focus:bg-white focus:ring-1 focus:ring-[#0066CC]/10 outline-none transition-all duration-200" 
                  placeholder="email@example.com" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Client Primary Phone</label>
                <input 
                  type="text" 
                  value={projectContext.clientPhone || ''} 
                  onChange={e => handleContextChange('clientPhone', e.target.value)} 
                  className="w-full px-4 py-3 bg-white/40 backdrop-blur-sm border border-slate-200 rounded-xl text-sm font-bold text-sky-950 focus:border-[#0066CC] focus:bg-white focus:ring-1 focus:ring-[#0066CC]/10 outline-none transition-all duration-200" 
                  placeholder="e.g. +91 98765 43210" 
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Site Location / City</label>
                    <input 
                      type="text" 
                      value={projectContext.location || ''} 
                      onChange={e => handleContextChange('location', e.target.value)} 
                      className="w-full px-4 py-3 bg-white/40 backdrop-blur-sm border border-slate-200 rounded-xl text-sm font-bold text-sky-950 focus:border-[#0066CC] focus:bg-white focus:ring-1 focus:ring-[#0066CC]/10 outline-none transition-all duration-200" 
                      placeholder="e.g. Thane West, Mumbai" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Area (Sq Ft)</label>
                    <input 
                      type="number" 
                      value={projectContext.area || ''} 
                      onChange={e => handleContextChange('area', Number(e.target.value))} 
                      className="w-full px-4 py-3 bg-white/40 backdrop-blur-sm border border-[#0066CC]/30 rounded-xl text-sm font-black text-[#0066CC] focus:border-[#0066CC] focus:bg-white focus:ring-1 focus:ring-[#0066CC]/10 outline-none transition-all duration-200" 
                    />
                  </div>
                </div>
              </div>
            </div>

              {/* Current Site State Selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Current Site State</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { id: 'raw_shell', label: 'Raw Shell', desc: 'Full masonry & civil required' },
                    { id: 'semi_finished', label: 'Semi-Finished', desc: 'Flooring laid, plumbing ready' },
                    { id: 'finished', label: 'Finished (Refit Only)', desc: 'Soft fit-out / modular only' }
                  ].map(status => (
                    <button
                      key={status.id}
                      type="button"
                      onClick={() => handleSiteStateChange(status.id)}
                      className={`flex flex-col text-left p-3 rounded-xl border transition-all duration-200 ${
                        projectContext.propertyStatus === status.id 
                          ? 'bg-[#0066CC] border-[#0066CC] text-white shadow-md' 
                          : 'bg-white/40 backdrop-blur-sm border-slate-200 text-sky-950 hover:border-[#0066CC]/30 hover:bg-sky-50/50/30'
                      }`}
                    >
                      <span className="text-xs font-black tracking-wide leading-normal">{status.label}</span>
                      <span className={`text-[10px] leading-tight mt-0.5 ${projectContext.propertyStatus === status.id ? 'text-slate-300' : 'text-slate-400'}`}>
                        {status.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* The requirement, in the client's own words. */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Client Requirement / Brief
                  </label>
                  <span className="text-[11px] text-slate-400">Sets the scope below — one paragraph, not seven switches</span>
                </div>
                <textarea
                  value={projectContext.clientBrief || ''}
                  onChange={e => handleContextChange('clientBrief', e.target.value)}
                  rows={2}
                  placeholder="e.g. Civil refresh to the entire flooring of the house and both bathrooms. Kitchen and wardrobes in modular. Keep the existing electricals."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white/40 backdrop-blur-sm text-sm text-sky-950 placeholder:text-slate-300 focus:border-[#0066CC]/40 focus:outline-none focus:ring-1 focus:ring-[#0066CC]/20 resize-y leading-relaxed"
                />
                {briefSuggestions.length > 0 && (
                  <div className="rounded-xl border border-[#0066CC]/25 bg-sky-50/50 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-[11px] font-bold text-[#0055B3] inline-flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        The brief suggests {briefSuggestions.length} change{briefSuggestions.length === 1 ? '' : 's'} to the scope
                      </span>
                      <button
                        type="button"
                        onClick={applyBriefSuggestions}
                        className="px-3 py-1 text-[10px] font-black uppercase tracking-wider bg-[#0066CC] text-white rounded-lg hover:bg-[#0055B3] transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                    {/* The words that led here, so the studio can disagree with
                        the reading rather than with a silent result. */}
                    <div className="flex flex-col gap-1">
                      {briefSuggestions.map(sug => {
                        const field = CIVIL_SCOPE_FIELDS.find(f => f.key === sug.key);
                        return (
                          <div key={sug.key} className="text-[11px] text-slate-600 flex items-start gap-2">
                            <span className={`font-black shrink-0 ${sug.value ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {sug.value ? '+' : '−'}
                            </span>
                            <span>
                              <b className="text-slate-800">{field?.label || sug.key}</b>
                              <span className="text-slate-400"> — “{sug.quote}”</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/*
                  Civil & Site Scope.

                  Every switch here changes which bank items get priced. A
                  switch that changed nothing would not belong — that was the
                  problem with Current Site State on its own.
              */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Civil &amp; Site Scope
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-400">Drives which items the BOQ generates</span>
                    {isScopeCustomised(projectContext) && (
                      <button
                        type="button"
                        onClick={resetCivilScope}
                        className="text-[10px] font-bold uppercase tracking-wider text-[#0066CC] hover:underline"
                      >
                        Reset to site state
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {CIVIL_SCOPE_FIELDS.map(field => {
                    const on = !!civilScope[field.key];
                    const suggested = !!DEFAULT_CIVIL_SCOPE[projectContext.propertyStatus || 'finished'][field.key];
                    return (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() => setCivilScope(field.key, !on)}
                        className={`flex items-start gap-2.5 text-left p-3 rounded-xl border transition-all duration-200 ${
                          on
                            ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                            : 'bg-white/40 backdrop-blur-sm border-slate-200 text-slate-500 hover:border-[#0066CC]/30'
                        }`}
                      >
                        <span className={`w-4 h-4 mt-0.5 rounded-md flex items-center justify-center shrink-0 border transition-colors ${
                          on ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'
                        }`}>
                          {on && <Check className="w-3 h-3 text-white" strokeWidth={3.5} />}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-black tracking-wide leading-normal">{field.label}</span>
                            {/* Says which way this switch was moved, so a
                                deliberate exception is legible months later. */}
                            {on !== suggested && (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200/70">
                                {on ? 'added' : 'removed'}
                              </span>
                            )}
                          </span>
                          <span className={`block text-[10px] leading-tight mt-0.5 ${on ? 'text-emerald-700/80' : 'text-slate-400'}`}>
                            {field.detail}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Project Category Tag: Actual vs Dummy Classification */}
              <div className="space-y-2 pt-2 border-t border-slate-200/60">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Project Classification (Actual vs Dummy)
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Controls client directory filters & analytics
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setProjectContext(prev => ({
                        ...prev,
                        isDummy: false,
                        projectCategory: 'actual'
                      }));
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                      projectContext.isDummy === false || (projectContext.isDummy === undefined && !projectContext.name?.toLowerCase().includes('sample') && !projectContext.name?.toLowerCase().includes('demo') && !projectContext.name?.toLowerCase().includes('test'))
                        ? 'bg-sky-50 border-sky-400 text-sky-950 shadow-xs ring-1 ring-sky-300'
                        : 'bg-white/40 border-slate-200 text-slate-600 hover:border-sky-200 hover:bg-sky-50/30'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      projectContext.isDummy === false || (projectContext.isDummy === undefined && !projectContext.name?.toLowerCase().includes('sample') && !projectContext.name?.toLowerCase().includes('demo') && !projectContext.name?.toLowerCase().includes('test'))
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-400'
                    }`}>
                      <Check className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 leading-snug">Actual Project</p>
                      <p className="text-[10px] text-slate-500 leading-tight">Live studio client engagement with commercial accounting</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProjectContext(prev => ({
                        ...prev,
                        isDummy: true,
                        projectCategory: 'dummy'
                      }));
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                      projectContext.isDummy === true || (projectContext.isDummy === undefined && (projectContext.name?.toLowerCase().includes('sample') || projectContext.name?.toLowerCase().includes('demo') || projectContext.name?.toLowerCase().includes('test')))
                        ? 'bg-amber-50 border-amber-400 text-amber-950 shadow-xs ring-1 ring-amber-300'
                        : 'bg-white/40 border-slate-200 text-slate-600 hover:border-amber-200 hover:bg-amber-50/30'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      projectContext.isDummy === true || (projectContext.isDummy === undefined && (projectContext.name?.toLowerCase().includes('sample') || projectContext.name?.toLowerCase().includes('demo') || projectContext.name?.toLowerCase().includes('test')))
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-100 text-slate-400'
                    }`}>
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 leading-snug">Dummy / Sample Project</p>
                      <p className="text-[10px] text-slate-500 leading-tight">Template or sandbox project excluded from actual accounts</p>
                    </div>
                  </button>
                </div>
              </div>
          </div>
        </div>
      </div>

      {/* 2. Configuration & Aesthetic Palette Hub */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Configuration Selector */}
        <div className="glass-light rounded-2xl border border-[#0066CC]/15 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 glass-light border-b border-[#0066CC]/10 flex items-center gap-3">
              <Grid className="w-4 h-4 text-[#0066CC]" />
              <h5 className="text-sm font-bold text-sky-950">Configuration Alignment</h5>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              {CONFIG_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const isSelected = projectContext.config === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleConfigSelect(opt.id)}
                    className={`p-4 rounded-xl text-left border relative transition-all duration-200 flex items-start gap-3.5 ${
                      isSelected 
                        ? 'border-[#0066CC] bg-sky-50/50 shadow-[0_4px_16px_rgba(181,148,91,0.06)]' 
                        : 'border-slate-200 bg-white hover:border-[#0066CC]/30 hover:bg-slate-50/50'
                    }`}
                  >
                    {opt.isNew && (
                      <span className="absolute top-2 right-2 bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">
                        NEW
                      </span>
                    )}
                    <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-[#0066CC]/10 text-[#0066CC]' : 'bg-slate-50 text-slate-400'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`block text-xs font-black ${isSelected ? 'text-sky-950' : 'text-slate-800'}`}>
                        {opt.label}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5 leading-snug">
                        {opt.desc}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className="px-6 py-4 bg-white/50 backdrop-blur-sm border-t border-slate-100 text-[11px] text-slate-400 leading-normal flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 bg-[#0066CC] rounded-full"></span>
            Configuring Bathroom Remodels automatically sets area defaults to 45 sqft and scopes a Master Bathroom.
          </div>
        </div>

        {/* Aesthetic Persona Selector */}
        <div className="glass-light rounded-2xl border border-[#0066CC]/15 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 glass-light border-b border-[#0066CC]/10 flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-[#0066CC]" />
              <h5 className="text-sm font-bold text-sky-950">Aesthetic Palette / Mood Persona</h5>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              {THEME_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const isSelected = projectContext.theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleContextChange('theme', opt.id)}
                    className={`p-4 rounded-xl text-left border transition-all duration-200 flex items-start gap-3.5 ${
                      isSelected 
                        ? 'border-[#0066CC] bg-sky-50/50 shadow-[0_4px_16px_rgba(181,148,91,0.06)]' 
                        : 'border-slate-200 bg-white hover:border-[#0066CC]/30 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-[#0066CC]/10 text-[#0066CC]' : 'bg-slate-50 text-slate-400'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className={`block text-xs font-black capitalize ${isSelected ? 'text-sky-950' : 'text-slate-800'}`}>
                        {opt.label}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5 leading-snug">
                        {opt.desc}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-6 py-4 bg-white/50 backdrop-blur-sm border-t border-slate-100 text-[11px] text-slate-400 leading-normal flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 bg-[#0066CC] rounded-full"></span>
            Selecting an aesthetic theme primes the AI assistant's material suggestions inside the BOQ.
          </div>
        </div>
      </div>

      {/* 3. Live Design Scope Checklist & Commercial Fees Panel */}
      <div className="glass-light rounded-2xl border border-[#0066CC]/15 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
        <div className="px-6 py-4 glass-light border-b border-[#0066CC]/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-4 h-4 text-[#0066CC]" />
            <div>
              <h5 className="text-sm font-bold text-sky-950">Scope of Deliverables & Commercials</h5>
              <p className="text-xs text-slate-400 font-medium">Design scope checksheets paired with active studio fee model</p>
            </div>
          </div>
          <span className="text-xs font-black text-[#0066CC]">
            {deliverablesCount} Active Deliverables
          </span>
        </div>

        <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Deliverables Checklist */}
          <div className="lg:col-span-7 space-y-3.5">
            <p className="text-[10px] font-bold text-[#0066CC] uppercase tracking-widest mb-4">Milestone Deliverables</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-start gap-3 cursor-pointer p-3 border border-slate-100 rounded-xl bg-slate-50/20 hover:border-[#0066CC]/30 hover:bg-sky-50/50/20 transition-all duration-150">
                <input 
                  type="checkbox" 
                  checked={!!projectContext.designScope?.has3DRenders} 
                  onChange={e => handleDesignScopeChange('has3DRenders', e.target.checked)} 
                  className="mt-0.5 rounded text-[#0066CC] focus:ring-[#0066CC] border-slate-300 cursor-pointer" 
                />
                <div>
                  <span className="block text-xs font-bold text-sky-950">3D Visualizations</span>
                  <span className="block text-[10px] text-slate-400 leading-tight mt-0.5">4 high-fidelity angles per room</span>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer p-3 border border-slate-100 rounded-xl bg-slate-50/20 hover:border-[#0066CC]/30 hover:bg-sky-50/50/20 transition-all duration-150">
                <input 
                  type="checkbox" 
                  checked={!!projectContext.designScope?.has2DDrawings} 
                  onChange={e => handleDesignScopeChange('has2DDrawings', e.target.checked)} 
                  className="mt-0.5 rounded text-[#0066CC] focus:ring-[#0066CC] border-slate-300 cursor-pointer" 
                />
                <div>
                  <span className="block text-xs font-bold text-sky-950">2D GFC Drawing Set</span>
                  <span className="block text-[10px] text-slate-400 leading-tight mt-0.5">Execution-ready structural plans</span>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer p-3 border border-slate-100 rounded-xl bg-slate-50/20 hover:border-[#0066CC]/30 hover:bg-sky-50/50/20 transition-all duration-150">
                <input 
                  type="checkbox" 
                  checked={!!projectContext.designScope?.hasFurnitureSelection} 
                  onChange={e => handleDesignScopeChange('hasFurnitureSelection', e.target.checked)} 
                  className="mt-0.5 rounded text-[#0066CC] focus:ring-[#0066CC] border-slate-300 cursor-pointer" 
                />
                <div>
                  <span className="block text-xs font-bold text-sky-950">Loose Furniture Spec</span>
                  <span className="block text-[10px] text-slate-400 leading-tight mt-0.5">Sourcing lists & vendor references</span>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer p-3 border border-slate-100 rounded-xl bg-slate-50/20 hover:border-[#0066CC]/30 hover:bg-sky-50/50/20 transition-all duration-150">
                <input 
                  type="checkbox" 
                  checked={!!projectContext.designScope?.hasVrWalkthrough} 
                  onChange={e => handleDesignScopeChange('hasVrWalkthrough', e.target.checked)} 
                  className="mt-0.5 rounded text-[#0066CC] focus:ring-[#0066CC] border-slate-300 cursor-pointer" 
                />
                <div>
                  <span className="block text-xs font-bold text-sky-950">Interactive VR Walkthrough</span>
                  <span className="block text-[10px] text-slate-400 leading-tight mt-0.5">Dual-lens 360 panorama build</span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 p-3 glass-light border border-slate-200/80 rounded-xl shadow-inner mt-4">
              <label className="flex items-center gap-3 cursor-pointer flex-grow select-none">
                <input 
                  type="checkbox" 
                  checked={!!projectContext.designScope?.hasSiteVisits} 
                  onChange={e => handleDesignScopeChange('hasSiteVisits', e.target.checked)} 
                  className="rounded text-[#0066CC] focus:ring-[#0066CC] border-slate-300 cursor-pointer" 
                />
                <div>
                  <span className="block text-xs font-bold text-sky-950">Professional Site Visits Included</span>
                  <span className="block text-[10px] text-slate-400">On-site structural/rework tracking</span>
                </div>
              </label>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Visits:</span>
                <input 
                  type="number" 
                  value={projectContext.designScope?.visitCount || 0} 
                  onChange={e => handleDesignScopeChange('visitCount', parseInt(e.target.value) || 0)} 
                  disabled={!projectContext.designScope?.hasSiteVisits}
                  className="w-14 p-1.5 text-center border border-slate-200 rounded-lg text-xs font-black focus:border-[#0066CC] outline-none disabled:opacity-50 disabled:bg-slate-100" 
                />
              </div>
            </div>
          </div>

          {/* Fee Model Display */}
          <div className="lg:col-span-5 bg-sky-50/50 rounded-xl border border-[#0066CC]/25 p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <span className="text-[10px] font-bold text-[#0066CC] uppercase tracking-widest block">Professional Fee Engine</span>
              
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                {[
                  { id: 'percentage', label: '% Cost' },
                  { id: 'fixed_sqft', label: '₹/Sqft' },
                  { id: 'fixed_lumpsum', label: 'Fixed Sum' }
                ].map(model => (
                  <button 
                    key={model.id}
                    type="button"
                    onClick={() => handleContextChange('designFeeType', model.id)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-150 ${
                      projectContext.designFeeType === model.id 
                        ? 'bg-[#0066CC] text-white shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {model.label}
                  </button>
                ))}
              </div>

              <div className="relative glass-light border border-slate-200 rounded-xl overflow-hidden shadow-sm flex items-center px-4 py-3">
                <span className="text-[#0066CC] font-black text-lg select-none mr-2">
                  {projectContext.designFeeType === 'percentage' ? '' : '₹'}
                </span>
                <input 
                  type="number" 
                  value={projectContext.designFee !== undefined ? projectContext.designFee : ''} 
                  onChange={e => handleContextChange('designFee', parseFloat(e.target.value) || 0)} 
                  className="w-full font-black text-[#0066CC] text-2xl outline-none" 
                  placeholder="0"
                />
                <span className="text-[#0066CC] font-black text-lg select-none ml-2">
                  {projectContext.designFeeType === 'percentage' ? '%' : ''}
                </span>
              </div>
            </div>

            <div className="mt-6 border-t border-[#0066CC]/15 pt-4 text-[11px] text-slate-400 leading-normal flex items-start gap-2.5">
              <span className="bg-[#0066CC]/10 text-[#0066CC] p-1 rounded font-black text-[9px] shrink-0">ACTIVE</span>
              <p>
                Calculates to <span className="font-bold text-sky-950">{feeLabel}</span>. Directly affects automated invoices inside client contract bundles.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Execution Intelligence & Operations Layer */}
      {!hideExecutionControls && (
        <div className="bg-[#111C30] border border-[#0066CC]/30 p-6 md:p-8 rounded-2xl text-white relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#0066CC]/5 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="relative z-10 space-y-6">
            <div className="flex items-center justify-between border-b border-[#0066CC]/15 pb-4">
              <div className="flex items-center gap-3">
                <Sliders className="w-5 h-5 text-[#0066CC]" />
                <div>
                  <h5 className="font-bold text-white text-base">Execution Intelligence & Site Controls</h5>
                  <p className="text-slate-400 text-xs font-medium">Coordinate on-site workflows, target dates, and gating checksheets</p>
                </div>
              </div>
              <span className="text-[10px] font-bold tracking-widest text-[#0066CC] uppercase bg-[#0066CC] border border-[#0066CC]/30 px-3 py-1 rounded">
                SITE OPERATIONS COCKPIT
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Handover Date</label>
                <div className="relative">
                  <input 
                    type="date" 
                    value={projectContext.targetHandoverDate || ''} 
                    onChange={e => handleContextChange('targetHandoverDate', e.target.value)} 
                    className="w-full px-3 py-2.5 bg-[#0066CC]/60 border border-slate-700 rounded-xl text-xs font-bold text-white focus:border-[#0066CC] outline-none transition-all" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">SOF Freeze Deadline</label>
                <div className="relative">
                  <input 
                    type="date" 
                    value={projectContext.sofFreezeDate || ''} 
                    onChange={e => handleContextChange('sofFreezeDate', e.target.value)} 
                    className="w-full px-3 py-2.5 bg-[#0066CC]/60 border border-slate-700 rounded-xl text-xs font-bold text-white focus:border-[#0066CC] outline-none transition-all" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Procurement Lead Time</label>
                <div className="relative flex items-center">
                  <input 
                    type="number" 
                    value={projectContext.procurementLeadTimeWeeks || 4} 
                    onChange={e => handleContextChange('procurementLeadTimeWeeks', Number(e.target.value) || 0)} 
                    className="w-full px-3 py-2.5 bg-[#0066CC]/60 border border-slate-700 rounded-xl text-xs font-bold text-white focus:border-[#0066CC] outline-none transition-all pr-12" 
                  />
                  <span className="absolute right-4 text-slate-400 text-xs font-bold">Wks</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Supervisor</label>
                <div className="relative">
                  <select 
                    value={projectContext.assignedSupervisors?.[0] || ''} 
                    onChange={e => handleContextChange('assignedSupervisors', [e.target.value])} 
                    className="w-full px-3 py-2.5 bg-[#0066CC]/60 border border-slate-700 rounded-xl text-xs font-bold text-white focus:border-[#0066CC] outline-none appearance-none cursor-pointer pr-10"
                  >
                    <option value="" className="bg-[#111C30]">Unassigned (Reviewing...)</option>
                    {siteSupervisors.map(s => (
                      <option key={s.id} value={s.id} className="bg-[#111C30]">{s.name}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none">
                    <ChevronDown className="w-4 h-4 text-[#0066CC]" />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 border-t border-[#0066CC]/15">
              <div className="lg:col-span-4 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Execution Milestone</label>
                <div className="relative">
                  <select 
                    value={projectContext.currentExecutionBundle || 'pre_execution'} 
                    onChange={e => handleContextChange('currentExecutionBundle', e.target.value)} 
                    className="w-full px-3 py-3 bg-[#0066CC]/60 border border-slate-700 rounded-xl text-xs font-bold text-white focus:border-[#0066CC] outline-none appearance-none cursor-pointer pr-10"
                  >
                    <option value="pre_execution" className="bg-[#111C30]">Pre-Execution & Approvals</option>
                    <option value="civil_mep" className="bg-[#111C30]">Civil & MEP Layouts</option>
                    <option value="false_ceiling" className="bg-[#111C30]">False Ceiling & Partitioning</option>
                    <option value="finishes_carpentry" className="bg-[#111C30]">Finishes & Carpentry Assembly</option>
                    <option value="handover" className="bg-[#111C30]">Final Snag Checklist & Handover</option>
                  </select>
                  <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none">
                    <ChevronDown className="w-4 h-4 text-[#0066CC]" />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-8 space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Site Operational Checkpoints</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleContextChange('briefFrozenAt', projectContext.briefFrozenAt ? null : Date.now())}
                    className={`py-3 px-1.5 rounded-xl text-xs font-bold border transition-all duration-150 flex items-center justify-center gap-1.5 ${
                      projectContext.briefFrozenAt 
                        ? 'bg-[#0066CC] border-[#0066CC] text-white shadow-md' 
                        : 'bg-[#0066CC]/40 border-slate-700 text-slate-300 hover:bg-[#0066CC]/80 hover:text-white'
                    }`}
                  >
                    <Check className={`w-3.5 h-3.5 transition-transform ${projectContext.briefFrozenAt ? 'scale-100' : 'scale-75'}`} />
                    <span>{projectContext.briefFrozenAt ? 'Brief Locked' : 'Lock Design Brief'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleContextChange('designApprovedAt', projectContext.designApprovedAt ? null : Date.now())}
                    className={`py-3 px-1.5 rounded-xl text-xs font-bold border transition-all duration-150 flex items-center justify-center gap-1.5 ${
                      projectContext.designApprovedAt 
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' 
                        : 'bg-[#0066CC]/40 border-slate-700 text-slate-300 hover:bg-[#0066CC]/80 hover:text-white'
                    }`}
                  >
                    <Check className={`w-3.5 h-3.5 transition-transform ${projectContext.designApprovedAt ? 'scale-100' : 'scale-75'}`} />
                    <span>{projectContext.designApprovedAt ? 'Design Cleared' : 'Approve Render GFC'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleContextChange('handoverDate', projectContext.handoverDate ? null : Date.now())}
                    className={`py-3 px-1.5 rounded-xl text-xs font-bold border transition-all duration-150 flex items-center justify-center gap-1.5 ${
                      projectContext.handoverDate 
                        ? 'bg-[#0066CC] border-[#0066CC] text-white shadow-md' 
                        : 'bg-[#0066CC]/40 border-slate-700 text-slate-300 hover:bg-[#0066CC]/80 hover:text-white'
                    }`}
                  >
                    <Check className={`w-3.5 h-3.5 transition-transform ${projectContext.handoverDate ? 'scale-100' : 'scale-75'}`} />
                    <span>{projectContext.handoverDate ? 'Handed Over' : 'Mark Handover'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Room Specifications (Dynamic Architectural Dimension Space Planner) */}
      <div id="dimensional-space-planner" className="glass-light rounded-2xl border border-[#0066CC]/15 overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
        <div className="px-6 py-5 glass-light border-b border-[#0066CC]/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#0066CC]/5 rounded-lg text-[#0066CC]">
              <List className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-base font-bold text-sky-950">Dimensional Space Planner</h4>
              <p className="text-xs text-slate-400 font-medium">Set length, width, and heights for exact volumetric estimates</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Tab selector */}
            <div className="flex p-1 bg-slate-200/60 rounded-lg mr-2">
              <button
                type="button"
                onClick={() => setPlannerTab('editor')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${plannerTab === 'editor' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Room Editor
              </button>
              <button
                type="button"
                onClick={() => setPlannerTab('takeoff')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${plannerTab === 'takeoff' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Plan Takeoff
              </button>
            </div>

            {plannerTab === 'editor' && (
              <>
                {/* Civil, Functional and Others are project scopes, not rooms.
                    They used to be created here as rooms carrying the whole
                    flat's area, which is what made an eight-room 904 sq ft
                    project measure 2,710 sq ft. They always exist now, and the
                    BOQ groups lines into them. */}
                                {/*
                    Auto-map stands down once there are rooms.

                    It replaces the room list wholesale, so on a project whose
                    rooms came off a floor plan it is a destructive button
                    sitting next to the thing it would destroy — the plan is the
                    better source and re-deriving from a BHK ratio throws it
                    away. Still reachable: clear the rooms and it comes back.
                */}
                <button
                  type="button"
                  onClick={handleEstimateRooms}
                  disabled={isEstimating || plannerRooms.length > 0}
                  title={plannerRooms.length > 0
                    ? 'Rooms are already mapped. Delete them to re-map from the configuration.'
                    : 'Derive rooms from the area and BHK configuration'}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider bg-sky-50/50 text-[#0066CC] rounded-lg hover:bg-[#0066CC]/10 disabled:opacity-50 border border-[#0066CC]/30 transition-all duration-150 animate-pulse-subtle"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#0066CC]"/>
                  {isEstimating
                    ? 'Mapping rooms...'
                    : plannerRooms.length > 0
                      ? 'Rooms mapped'
                      : (isAiAvailable() ? 'AI Auto-Map Rooms' : 'Auto-Map Rooms')}
                </button>

                <button 
                  type="button"
                  onClick={handleAddRoom} 
                  className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider bg-[#0066CC] text-white rounded-lg hover:bg-[#0055B3] transition-all shadow-sm"
                >
                  + Create Room
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-6 md:p-8">
          {plannerTab === 'takeoff' ? (
            <TakeoffPanel projectContext={projectContext} setProjectContext={setProjectContext} />
          ) : plannerRooms.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-sm">
                <List className="w-5 h-5 text-slate-300" />
              </div>
              <h5 className="text-sm font-bold text-slate-700">No rooms configured</h5>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-normal">
                Click "+ Create Room" to configure custom dimensions manually, or let our AI auto-map room partitions based on your active BHK configuration.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Where everything that is not a room ends up. Without this the
                  planner reads as though painting and debris were forgotten. */}
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400 pb-1">
                <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Project scopes</span>
                {SCOPE_BUCKETS.map(bucket => (
                  <span key={bucket} title={SCOPE_BUCKET_META[bucket].detail}
                    className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200/70 font-semibold text-slate-500">
                    {bucket}
                  </span>
                ))}
                <span className="text-slate-300">— priced across the flat, not per room</span>
                {legacyBucketRooms.length > 0 && (
                  <span className="text-amber-600 font-semibold">
                    · {legacyBucketRooms.length} legacy scope {legacyBucketRooms.length === 1 ? 'entry' : 'entries'} hidden from measurement
                  </span>
                )}
              </div>
              <AnimatePresence>
                {/* Mapped over the original array so `index` still addresses the
                    right room for edits and deletes; buckets are skipped rather
                    than filtered out, which would shift every index below them. */}
                {projectContext.rooms.map((room, index) => {
                  if (!room || isScopeBucket(room.name)) return null;
                  return (
                    <motion.div 
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      key={index} 
                      className="p-5 glass-light border border-slate-200/80 rounded-xl hover:border-[#0066CC]/30 hover:bg-sky-50/50 transition-all duration-200 shadow-sm relative group"
                    >
                      {/* Left elegant gold hairline indicator */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#0066CC]/30 group-hover:bg-[#0066CC] rounded-l transition-all"></div>
                      
                      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-center pl-3">
                        {/* Room Name */}
                        <div className="xl:col-span-4 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Room Designation</label>
                          <input 
                            type="text" 
                            value={room.name || ''} 
                            onChange={e => handleRoomChange(index, 'name', e.target.value)} 
                            className="w-full px-3 py-2 bg-slate-50/80 border border-slate-200 rounded-lg focus:bg-white focus:border-[#0066CC] font-bold text-sky-950 text-xs outline-none transition-all" 
                            placeholder="e.g. Master Bedroom" 
                          />
                        </div>

                        {/* Dimensions: Length x Width */}
                        <div className="xl:col-span-3 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Plan Dimensions</label>
                          <div className="flex items-center gap-2">
                            <div className="relative flex items-center">
                              <input 
                                type="number" 
                                value={room.length || ''} 
                                onChange={e => handleRoomChange(index, 'length', e.target.value)} 
                                className="w-20 px-2 py-2 bg-slate-50/80 border border-slate-200 rounded-lg text-center text-xs font-bold focus:bg-white focus:border-[#0066CC] outline-none transition-all" 
                                placeholder="Length" 
                              />
                              <span className="absolute right-2 text-[10px] text-slate-400 font-bold select-none pointer-events-none">ft</span>
                            </div>
                            <span className="text-slate-300 font-black text-sm select-none">×</span>
                            <div className="relative flex items-center">
                              <input 
                                type="number" 
                                value={room.width || ''} 
                                onChange={e => handleRoomChange(index, 'width', e.target.value)} 
                                className="w-20 px-2 py-2 bg-slate-50/80 border border-slate-200 rounded-lg text-center text-xs font-bold focus:bg-white focus:border-[#0066CC] outline-none transition-all" 
                                placeholder="Width" 
                              />
                              <span className="absolute right-2 text-[10px] text-slate-400 font-bold select-none pointer-events-none">ft</span>
                            </div>
                          </div>
                        </div>

                        {/* Height */}
                        <div className="xl:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ceiling Ht</label>
                          <div className="relative flex items-center">
                            <input 
                              type="number" 
                              value={room.height || ''} 
                              placeholder={String(projectContext.ceilingHeight || 9.5)} 
                              onChange={e => handleRoomChange(index, 'height', e.target.value)} 
                              className="w-full px-2 py-2 bg-slate-50/80 border border-slate-200 rounded-lg text-center text-xs font-bold focus:bg-white focus:border-[#0066CC] outline-none transition-all" 
                            />
                            <span className="absolute right-2.5 text-[10px] text-slate-400 font-bold select-none pointer-events-none">ft</span>
                          </div>
                        </div>

                        {/* Total Room Area */}
                        <div className="xl:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Net Area</label>
                          <div className="relative flex items-center">
                            <input 
                              type="number" 
                              value={room.size || ''} 
                              onChange={e => handleRoomChange(index, 'size', e.target.value)} 
                              className={`w-full px-2 py-2 border rounded-lg text-center text-xs font-black transition-all ${
                                room.length && room.width 
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed font-medium' 
                                  : 'bg-sky-50/50 border-[#0066CC]/30 text-[#0066CC]'
                              }`}
                              readOnly={!!(room.length && room.width)}
                            />
                            <span className="absolute right-2.5 text-[9px] text-slate-400 font-bold select-none pointer-events-none">sq ft</span>
                          </div>
                        </div>

                        {/* Delete Action */}
                        <div className="xl:col-span-1 flex justify-end">
                          <button 
                            type="button"
                            onClick={() => handleDeleteRoom(index)} 
                            className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100"
                            title="Remove Space"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Notes / Special Annotations */}
                      <div className="mt-3 pl-3">
                        <input 
                          type="text" 
                          value={room.notes || ''} 
                          onChange={e => handleRoomChange(index, 'notes', e.target.value)} 
                          className="w-full px-3 py-2 bg-white/50 backdrop-blur-sm border border-slate-200 rounded-lg text-xs text-slate-600 placeholder-slate-400 focus:bg-white focus:border-[#0066CC] outline-none transition-all"
                          placeholder="Add site notes / special layout features (e.g. 'Pillar on east wall, requires custom wardrobe framing')"
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectContextCard;
