import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProjectContext, Room, AIStrategy, DesignScope, DesignFeeType, PropertyStatus, ProjectStatus } from '../types';
import Card from './shared/Card';
import { estimateRoomSizes, isAiAvailable } from '../services/geminiService';
import { useOrg } from '../contexts/OrgContext';
import { 
    SparklesIcon, 
    SaveIcon, 
    DeleteIcon,
    ApartmentIcon,
    ModernIcon,
    ClassicIcon,
    BohemianIcon,
    IndustrialIcon,
    DuplexIcon,
    UploadIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    PencilIcon,
    BriefcaseIcon,
    GridIcon,
    ListIcon,
    CheckIcon
} from './Icons';

interface ProjectContextCardProps {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  aiStrategy: AIStrategy; 
  onSaveProject?: () => void;
  projectId?: string;
}

const CONFIG_OPTIONS = [
    { id: '1-BHK', label: '1-BHK', icon: <ApartmentIcon className="w-5 h-5" /> },
    { id: '2-BHK', label: '2-BHK', icon: <ApartmentIcon className="w-5 h-5" /> },
    { id: '3-BHK', label: '3-BHK', icon: <ApartmentIcon className="w-5 h-5" /> },
    { id: '4-BHK', label: '4-BHK', icon: <ApartmentIcon className="w-5 h-5" /> },
    { id: 'Duplex', label: 'Duplex', icon: <DuplexIcon className="w-5 h-5" /> },
    { id: 'Bathroom-Remodel', label: 'Bath Only', icon: <SparklesIcon className="w-5 h-5" />, isNew: true },
];

const THEME_OPTIONS = [
    { id: 'modern', label: 'Modern', icon: <ModernIcon className="w-6 h-6" /> },
    { id: 'classic', label: 'Classic', icon: <ClassicIcon className="w-6 h-6" /> },
    { id: 'bohemian', label: 'Bohemian', icon: <BohemianIcon className="w-6 h-6" /> },
    { id: 'industrial', label: 'Industrial', icon: <IndustrialIcon className="w-6 h-6" /> },
];

const STATUS_OPTIONS: { id: ProjectStatus, label: string }[] = [
    { id: 'lead', label: 'New Lead' },
    { id: 'draft', label: 'Drafting' },
    { id: 'proposal_sent', label: 'Proposal Sent' },
    { id: 'negotiation', label: 'Negotiation' },
    { id: 'won', label: 'Won / Execution' },
    { id: 'completed', label: 'Completed' },
    { id: 'lost', label: 'Lost' },
];

const ProjectContextCard: React.FC<ProjectContextCardProps> = ({ projectContext, setProjectContext, onSaveProject, projectId }) => {
  const { orgData, teamMembers } = useOrg();
  const siteSupervisors = teamMembers.filter(m => m.role === 'Site Supervisor');
  const [isEstimating, setIsEstimating] = useState(false);
  const [isScopeExpanded, setIsScopeExpanded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(() => {
    if (!projectContext.rooms || (projectContext.rooms || []).length === 0) return true;
    if (projectId) {
      return localStorage.getItem(`projectContext_expanded_${projectId}`) === 'true';
    }
    return false; // Default collapsed if has rooms and no projectId
  });

  useEffect(() => {
    if (projectId) {
      localStorage.setItem(`projectContext_expanded_${projectId}`, isExpanded.toString());
    }
  }, [isExpanded, projectId]);

  const handleContextChange = (field: keyof ProjectContext, value: any) => {
    setProjectContext(prev => ({ ...prev, [field]: value }));
  };

  // Smart Config Switcher
  const handleConfigSelect = (configId: string) => {
      // If switching TO Bathroom-Remodel, auto-set sensible defaults
      if (configId === 'Bathroom-Remodel') {
          setProjectContext(prev => ({
              ...prev,
              config: configId,
              area: 45, // Set to standard bathroom size
              rooms: [{ name: 'Master Bathroom', size: 45, unit: 'sq ft', length: 9, width: 5, height: 9.5 }]
          }));
      } 
      // If switching FROM Bathroom-Remodel back to a house config
      else if (projectContext.config === 'Bathroom-Remodel' && configId !== 'Bathroom-Remodel') {
           setProjectContext(prev => ({
              ...prev,
              config: configId,
              area: 1000, // Reset to standard apartment size
              rooms: [] // Clear rooms to force re-estimation or manual entry
          }));
      }
      else {
          handleContextChange('config', configId);
      }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              handleContextChange('logoImage', reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const handleDesignScopeChange = (field: keyof DesignScope, value: boolean | number) => {
      setProjectContext(prev => ({
          ...prev,
          designScope: { ...prev.designScope, [field]: value }
      }));
  }

  const handleRoomChange = (index: number, field: keyof Room, value: string | number) => {
    const newRooms = [...projectContext.rooms];
    const roomToUpdate = { ...newRooms[index] };
    
    // Cast field to string to safely check includes on a string array
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
    const newRoom: Room = { name: `New Room ${(projectContext.rooms || []).length + 1}`, size: 100, unit: 'sq ft' };
    setProjectContext(prev => ({ ...prev, rooms: [...prev.rooms, newRoom] }));
  };

  const handleAddSpecialRoom = (type: 'Functional' | 'Others') => {
    const newRoom: Room = { name: type, size: projectContext.area || 100, unit: 'sq ft' };
    setProjectContext(prev => ({ ...prev, rooms: [...prev.rooms, newRoom] }));
  };
  
  const handleDeleteRoom = (index: number) => {
      setProjectContext(prev => ({ ...prev, rooms: prev.rooms.filter((_, i) => i !== index) }));
  }

  const handleEstimateRooms = async () => {
      if (!isAiAvailable() || !projectContext.area || !projectContext.config) {
          alert("Please provide total area and configuration to estimate rooms.");
          return;
      }
      setIsEstimating(true);
      const estimatedRooms = await estimateRoomSizes(projectContext.area, projectContext.config);
      if (estimatedRooms.length > 0) {
        setProjectContext(prev => ({...prev, rooms: estimatedRooms }));
      }
      setIsEstimating(false);
  }

  // Calculate scope summary
  const deliverablesCount = Object.entries(projectContext.designScope || {})
    .filter(([k, v]) => k !== 'visitCount' && v === true).length;
    
  const hasFunctionalRoom = projectContext.rooms.some(r => r?.name?.toLowerCase() === 'functional');
  const hasOthersRoom = projectContext.rooms.some(r => r?.name?.toLowerCase() === 'others');
  
  const feeLabel = projectContext.designFeeType === 'percentage' ? `${projectContext.designFee || 10}% of Cost` : 
                   projectContext.designFeeType === 'fixed_sqft' ? `₹${projectContext.designFee || 0}/sqft` : 
                   `₹${projectContext.designFee || 0} Fixed`;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div id="project-context-card" className="bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden relative">
        {/* Header Area */}
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div>
                <h3 className="text-xl font-bold text-slate-800 tracking-tight">Project Context</h3>
                <p className="text-xs text-slate-500 mt-1">Define the core parameters for AI estimation</p>
            </div>
            <div className="flex gap-2">
                {isExpanded && (
                    <button 
                        onClick={() => setIsExpanded(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white font-bold rounded-xl shadow-sm hover:bg-indigo-700 transition-all active:scale-95"
                    >
                        Save & Collapse
                    </button>
                )}
                {/* Save Backup moved to settings tab */}
            </div>
        </div>

      {!isExpanded ? (
          <div className="p-6 md:px-8 md:py-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
               <div>
                   <h4 className="font-bold text-slate-800 text-lg">
                       {projectContext.name || 'Untitled Project'} <span className="text-slate-400 font-normal">· {projectContext.config || 'No config'} · {projectContext.area || 0} sqft · {projectContext.location || 'No location'}</span>
                   </h4>
                   <p className="text-sm font-medium text-slate-500 mt-1 flex gap-2 items-center">
                       <span className="flex items-center gap-1"><ListIcon className="w-4 h-4" /> {projectContext.rooms?.length || 0} rooms configured</span>
                       <span className="text-slate-300">|</span>
                       <span className="flex items-center gap-1"><SparklesIcon className="w-4 h-4" /> Style: <span className="capitalize">{projectContext.theme || 'Not set'}</span></span>
                   </p>
               </div>
               <button 
                  onClick={() => setIsExpanded(true)}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm text-indigo-700 font-bold bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-all"
               >
                   <PencilIcon className="w-4 h-4" /> Edit details
               </button>
          </div>
      ) : (
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="p-8 space-y-10"
      >
        
        {/* Logo & Identity */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center gap-8 p-6 bg-slate-50 rounded-3xl border border-slate-100">
            <div className="shrink-0 relative group">
                {projectContext.logoImage ? (
                    <div className="relative rounded-2xl overflow-hidden bg-white shadow-sm border border-slate-200 p-2">
                        <img src={projectContext.logoImage} alt="Logo" className="w-auto object-contain" style={{height: (projectContext.logoHeight || 80) / 1.5}} />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button onClick={() => handleContextChange('logoImage', '')} className="text-white hover:text-red-400 p-2">
                                <DeleteIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="h-24 w-24 bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2 shadow-sm">
                        <SparklesIcon className="w-6 h-6 opacity-50" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Logo</span>
                    </div>
                )}
            </div>
            <div className="flex-grow w-full">
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <div className="relative flex-1">
                        <input type="file" accept="image/*" onChange={handleLogoUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                        <button className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-sm w-full transition-all">
                            <UploadIcon className="w-4 h-4 text-slate-400" />
                            {projectContext.logoImage ? 'Replace Logo' : 'Upload Firm Logo'}
                        </button>
                    </div>
                </div>
                {/* Logo Height Control */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                     <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                        <span>Proposal Logo Size</span>
                        <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{projectContext.logoHeight || 80}px</span>
                    </div>
                    <input 
                        type="range" 
                        min="40" 
                        max="200" 
                        step="5"
                        value={projectContext.logoHeight || 80} 
                        onChange={e => handleContextChange('logoHeight', parseInt(e.target.value))} 
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                    />
                </div>
            </div>
        </motion.div>

        {/* Core Details */}
        <motion.div variants={itemVariants}>
            <div className="flex items-center gap-2 mb-4">
                <BriefcaseIcon className="w-5 h-5 text-slate-400" />
                <h5 className="font-bold text-slate-700">Core Details</h5>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Project Name / Site</label>
                    <input type="text" value={projectContext?.name || ''} onChange={e => handleContextChange('name', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" placeholder="e.g. Skyline Apartments 404" />
                </div>
                <div className="lg:col-span-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Client Name</label>
                    <input type="text" value={projectContext.clientName || ''} onChange={e => handleContextChange('clientName', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" placeholder="e.g. Rahul & Priya" />
                </div>
                <div className="lg:col-span-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Client Email(s)</label>
                    <input type="text" value={projectContext.clientEmail || ''} onChange={e => handleContextChange('clientEmail', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" placeholder="email1@ex.com, email2@ex.com" />
                </div>
                <div className="lg:col-span-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Client Phone</label>
                    <input type="text" value={projectContext.clientPhone || ''} onChange={e => handleContextChange('clientPhone', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-semibold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" placeholder="e.g. 9876543210" />
                </div>
                <div className="lg:col-span-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Location</label>
                    <input type="text" value={projectContext.location || ''} onChange={e => handleContextChange('location', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Total Area (sq ft)</label>
                    <input type="number" value={projectContext.area || ''} onChange={e => handleContextChange('area', Number(e.target.value))} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Ceiling Height (ft)</label>
                    <input type="number" value={projectContext.ceilingHeight || 9.5} onChange={e => handleContextChange('ceilingHeight', Number(e.target.value))} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                </div>
            </div>
            {/* New Property Status Control */}
            <div className="mt-4">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Current Property Status</label>
                <div className="flex gap-2 mt-1">
                    {[
                        { id: 'raw_shell', label: 'Raw Shell (Civil Needed)' },
                        { id: 'semi_finished', label: 'Semi-Finished (Flooring Done)' },
                        { id: 'finished', label: 'Finished (Renovation Only)' }
                    ].map(status => (
                        <button
                            key={status.id}
                            onClick={() => handleContextChange('propertyStatus', status.id)}
                            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${projectContext.propertyStatus === status.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'}`}
                        >
                            {status.label}
                        </button>
                    ))}
                </div>
            </div>
        </motion.div>

        {/* Project Type & Theme */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                 <div className="flex items-center gap-2 mb-4">
                     <GridIcon className="w-5 h-5 text-slate-400" />
                     <h5 className="font-bold text-slate-700">Configuration</h5>
                 </div>
                 {/* Updated Grid for 6 items */}
                 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3">
                    {CONFIG_OPTIONS.map((opt: any) => (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            key={opt.id}
                            onClick={() => handleConfigSelect(opt.id)}
                            className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all duration-200 border relative
                                ${projectContext.config === opt.id 
                                    ? 'border-blue-500 bg-blue-50 shadow-sm' 
                                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                                }
                            `}
                        >
                            {opt.isNew && (
                                <span className="absolute -top-2 -right-1 bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm animate-bounce">
                                    NEW
                                </span>
                            )}
                            <span className={`${projectContext.config === opt.id ? 'text-blue-600' : 'text-slate-400'}`}>{opt.icon}</span>
                            <span className={`text-xs font-bold ${projectContext.config === opt.id ? 'text-blue-700' : 'text-slate-600'} leading-tight`}>{opt.label}</span>
                        </motion.button>
                    ))}
                 </div>
            </div>
             <div>
                 <div className="flex items-center gap-2 mb-4">
                     <SparklesIcon className="w-5 h-5 text-slate-400" />
                     <h5 className="font-bold text-slate-700">Design Theme</h5>
                 </div>
                 <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                    {THEME_OPTIONS.map(opt => (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            key={opt.id}
                            onClick={() => handleContextChange('theme', opt.id)}
                            className={`p-4 rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all duration-200 border
                                ${projectContext.theme === opt.id 
                                    ? 'border-blue-500 bg-blue-50 shadow-sm' 
                                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                                }
                            `}
                        >
                            <span className={`${projectContext.theme === opt.id ? 'text-blue-600' : 'text-slate-400'}`}>{opt.icon}</span>
                            <span className={`text-sm font-bold ${projectContext.theme === opt.id ? 'text-blue-700' : 'text-slate-600'}`}>{opt.label}</span>
                        </motion.button>
                    ))}
                 </div>
            </div>
        </motion.div>

        {/* Execution Intelligence Parameters */}
        <motion.div variants={itemVariants} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl relative overflow-hidden">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
            
            <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                    <h5 className="font-bold text-white text-lg flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 rounded-xl">
                            <SparklesIcon className="w-5 h-5 text-amber-400" />
                        </div>
                        Execution Intelligence
                    </h5>
                    <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                        Ops Layer
                    </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Target Handover */}
                    <div className="group">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block group-hover:text-amber-400 transition-colors">Target Handover</label>
                        <div className="relative">
                            <input 
                                type="date" 
                                value={projectContext.targetHandoverDate || ''} 
                                onChange={e => handleContextChange('targetHandoverDate', e.target.value)} 
                                className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm font-medium text-white focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all hover:bg-slate-800" 
                            />
                        </div>
                    </div>

                    {/* SOF Freeze */}
                    <div className="group">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block group-hover:text-amber-400 transition-colors">SOF Freeze Deadline</label>
                        <div className="relative">
                            <input 
                                type="date" 
                                value={projectContext.sofFreezeDate || ''} 
                                onChange={e => handleContextChange('sofFreezeDate', e.target.value)} 
                                className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm font-medium text-white focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all hover:bg-slate-800" 
                            />
                        </div>
                    </div>

                    <div className="group col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block group-hover:text-amber-400 transition-colors">Manual Step Triggers: Click to Mark Done</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleContextChange('briefFrozenAt', projectContext.briefFrozenAt ? null : Date.now())}
                                className={`flex-1 p-2 rounded-lg text-xs font-bold border transition-colors ${projectContext.briefFrozenAt ? 'bg-amber-600 border-amber-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                            >
                                {projectContext.briefFrozenAt ? '✓ Brief Frozen' : 'Freeze Brief'}
                            </button>
                            <button
                                onClick={() => handleContextChange('designApprovedAt', projectContext.designApprovedAt ? null : Date.now())}
                                className={`flex-1 p-2 rounded-lg text-xs font-bold border transition-colors ${projectContext.designApprovedAt ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                            >
                                {projectContext.designApprovedAt ? '✓ Design Approved' : 'Approve Design'}
                            </button>
                            <button
                                onClick={() => handleContextChange('handoverDate', projectContext.handoverDate ? null : Date.now())}
                                className={`flex-1 p-2 rounded-lg text-xs font-bold border transition-colors ${projectContext.handoverDate ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                            >
                                {projectContext.handoverDate ? '✓ Handed Over' : 'Mark Handover'}
                            </button>
                        </div>
                    </div>

                    {/* Procurement Lead Time */}
                    <div className="group">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block group-hover:text-amber-400 transition-colors">Procurement Lead (Weeks)</label>
                        <div className="relative flex items-center">
                            <input 
                                type="number" 
                                value={projectContext.procurementLeadTimeWeeks || 4} 
                                onChange={e => handleContextChange('procurementLeadTimeWeeks', Number(e.target.value))} 
                                className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm font-medium text-white focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all hover:bg-slate-800 pl-4" 
                            />
                            <span className="absolute right-4 text-slate-500 text-sm font-medium pointer-events-none">wks</span>
                        </div>
                    </div>

                    {/* Current Bundle */}
                    <div className="group">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block group-hover:text-amber-400 transition-colors">Active Bundle</label>
                        <div className="relative">
                            <select 
                                value={projectContext.currentExecutionBundle || 'pre_execution'} 
                                onChange={e => handleContextChange('currentExecutionBundle', e.target.value)} 
                                className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm font-medium text-white focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all hover:bg-slate-800 appearance-none cursor-pointer"
                            >
                                <option value="pre_execution" className="bg-slate-800">Pre-Execution & Approvals</option>
                                <option value="civil_mep" className="bg-slate-800">Civil & MEP</option>
                                <option value="false_ceiling" className="bg-slate-800">False Ceiling & Paneling</option>
                                <option value="finishes_carpentry" className="bg-slate-800">Finishes & Carpentry</option>
                                <option value="handover" className="bg-slate-800">Final Handover</option>
                            </select>
                            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                <ChevronDownIcon className="w-4 h-4 text-slate-400" />
                            </div>
                        </div>
                    </div>

                    {/* Assigned Supervisor */}
                    <div className="group">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block group-hover:text-amber-400 transition-colors">Assigned Supervisor</label>
                        <div className="relative">
                            <select 
                                value={projectContext.assignedSupervisors?.[0] || ''} 
                                onChange={e => handleContextChange('assignedSupervisors', [e.target.value])} 
                                className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-sm font-medium text-white focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all hover:bg-slate-800 appearance-none cursor-pointer"
                            >
                                <option value="" className="bg-slate-800">Unassigned</option>
                                {siteSupervisors.map(s => (
                                    <option key={s.id} value={s.id} className="bg-slate-800">{s.name}</option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                                <ChevronDownIcon className="w-4 h-4 text-slate-400" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>

        {/* Design Scope & Fee Configurator (Collapsible for Cleanliness) */}
        <motion.div variants={itemVariants} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            <div 
                className="p-5 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors group"
                onClick={() => setIsScopeExpanded(!isScopeExpanded)}
            >
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                        <PencilIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <h5 className="font-bold text-slate-800 text-base">Design Fees & Deliverables</h5>
                        <p className="text-sm text-slate-500 mt-0.5">
                            <span className="font-bold text-indigo-600">{feeLabel}</span>
                            <span className="mx-2 text-slate-300">|</span>
                            {deliverablesCount} Deliverables Included
                        </p>
                    </div>
                </div>
                <button className="flex items-center gap-2 text-sm font-bold text-slate-400 group-hover:text-indigo-600 transition-colors bg-slate-100 px-3 py-1.5 rounded-lg">
                    {isScopeExpanded ? 'Collapse' : 'Configure'}
                    {isScopeExpanded ? <ChevronUpIcon className="w-4 h-4"/> : <ChevronDownIcon className="w-4 h-4"/>}
                </button>
            </div>
            
            <AnimatePresence>
            {isScopeExpanded && (
                <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                >
                    <div className="p-6 bg-slate-50/50 border-t border-slate-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Deliverables Checklist */}
                        <div>
                            <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-4">Deliverables Checklist</p>
                            <div className="space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${projectContext.designScope?.has3DRenders ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                                        {projectContext.designScope?.has3DRenders && <CheckIcon className="w-3.5 h-3.5" />}
                                    </div>
                                    <input type="checkbox" checked={!!projectContext.designScope?.has3DRenders} onChange={e => handleDesignScopeChange('has3DRenders', e.target.checked)} className="hidden" />
                                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">3D Visualization (4 views/room)</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${projectContext.designScope?.has2DDrawings ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                                        {projectContext.designScope?.has2DDrawings && <CheckIcon className="w-3.5 h-3.5" />}
                                    </div>
                                    <input type="checkbox" checked={!!projectContext.designScope?.has2DDrawings} onChange={e => handleDesignScopeChange('has2DDrawings', e.target.checked)} className="hidden" />
                                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">2D Working Drawings (GFC)</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${projectContext.designScope?.hasFurnitureSelection ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                                        {projectContext.designScope?.hasFurnitureSelection && <CheckIcon className="w-3.5 h-3.5" />}
                                    </div>
                                    <input type="checkbox" checked={!!projectContext.designScope?.hasFurnitureSelection} onChange={e => handleDesignScopeChange('hasFurnitureSelection', e.target.checked)} className="hidden" />
                                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">Loose Furniture Selection</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${projectContext.designScope?.hasVrWalkthrough ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                                        {projectContext.designScope?.hasVrWalkthrough && <CheckIcon className="w-3.5 h-3.5" />}
                                    </div>
                                    <input type="checkbox" checked={!!projectContext.designScope?.hasVrWalkthrough} onChange={e => handleDesignScopeChange('hasVrWalkthrough', e.target.checked)} className="hidden" />
                                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">VR Walkthrough</span>
                                </label>
                                <div className="flex items-center gap-3 mt-4 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <label className="flex items-center gap-3 cursor-pointer group flex-grow">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${projectContext.designScope?.hasSiteVisits ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>
                                            {projectContext.designScope?.hasSiteVisits && <CheckIcon className="w-3.5 h-3.5" />}
                                        </div>
                                        <input type="checkbox" checked={!!projectContext.designScope?.hasSiteVisits} onChange={e => handleDesignScopeChange('hasSiteVisits', e.target.checked)} className="hidden" />
                                        <span className="text-sm font-medium text-slate-700">Site Visits:</span>
                                    </label>
                                    <input 
                                        type="number" 
                                        value={projectContext.designScope?.visitCount || 0} 
                                        onChange={e => handleDesignScopeChange('visitCount', parseInt(e.target.value))} 
                                        disabled={!projectContext.designScope?.hasSiteVisits}
                                        className="w-20 p-2 text-center border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50 disabled:bg-slate-100" 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Fee Structure */}
                        <div>
                            <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-4">Professional Fee Model</p>
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-xl">
                                    <button 
                                        onClick={() => handleContextChange('designFeeType', 'percentage')}
                                        className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all ${projectContext.designFeeType === 'percentage' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        % of Cost
                                    </button>
                                    <button 
                                        onClick={() => handleContextChange('designFeeType', 'fixed_sqft')}
                                        className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all ${projectContext.designFeeType === 'fixed_sqft' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Fixed / Sq.Ft
                                    </button>
                                    <button 
                                        onClick={() => handleContextChange('designFeeType', 'fixed_lumpsum')}
                                        className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all ${projectContext.designFeeType === 'fixed_lumpsum' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Lumpsum
                                    </button>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                    <div className="flex-grow relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                                            {projectContext.designFeeType === 'percentage' ? '' : '₹'}
                                        </span>
                                        <input 
                                            type="number" 
                                            value={projectContext.designFee !== undefined ? projectContext.designFee : ''} 
                                            onChange={e => handleContextChange('designFee', parseFloat(e.target.value))} 
                                            className={`w-full p-3 border border-slate-300 rounded-xl font-bold text-indigo-700 text-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all ${projectContext.designFeeType === 'percentage' ? 'pl-4' : 'pl-8'}`} 
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                                            {projectContext.designFeeType === 'percentage' ? '%' : ''}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400 mt-4 text-center">
                                    Used to calculate the "Design Fee" line item in the dashboard & proposals.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
            )}
            </AnimatePresence>
        </motion.div>
        
        {/* Room Specifications */}
        <motion.div variants={itemVariants}>
            <div className="flex justify-between items-end mb-4">
                <div className="flex items-center gap-2">
                    <ListIcon className="w-5 h-5 text-slate-400" />
                    <h5 className="font-bold text-slate-700">Room Specifications</h5>
                </div>
                <div className="flex gap-3">
                     {!hasFunctionalRoom && (
                        <button onClick={() => handleAddSpecialRoom('Functional')} className="px-3 py-2 text-xs bg-emerald-50 text-emerald-700 font-bold rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-100 hidden sm:block">+ Functional</button>
                     )}
                     {!hasOthersRoom && (
                        <button onClick={() => handleAddSpecialRoom('Others')} className="px-3 py-2 text-xs bg-amber-50 text-amber-700 font-bold rounded-xl hover:bg-amber-100 transition-colors border border-amber-100 hidden sm:block">+ Others</button>
                     )}
                     <button 
                        onClick={handleEstimateRooms}
                        disabled={isEstimating || !isAiAvailable()}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 disabled:opacity-50 transition-colors border border-indigo-100">
                        <SparklesIcon className="w-4 h-4"/>
                        {isEstimating ? 'Thinking...' : 'AI Auto-Fill'}
                    </button>
                    <button onClick={handleAddRoom} className="px-4 py-2 text-sm bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-sm">+ Add Room</button>
                </div>
            </div>

            {(projectContext.rooms || []).length === 0 ? (
                <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                        <ListIcon className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-base font-bold text-slate-600 mb-1">No rooms defined yet</p>
                    <p className="text-sm text-slate-400">Add rooms manually or use AI Auto-Fill based on project area.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <AnimatePresence>
                    {projectContext.rooms.map((room, index) => {
                        if (!room) return null;
                        return (
                        <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            key={index} 
                            className="group p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
                        >
                            <div className="flex flex-wrap items-start gap-4">
                                <div className="flex-grow min-w-[200px]">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Room Name</label>
                                    <input type="text" value={room.name || ''} onChange={e => handleRoomChange(index, 'name', e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-bold text-slate-800 outline-none transition-all" placeholder="Room Name" />
                                </div>
                                <div className="flex gap-3 items-end">
                                     <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">L (ft)</label>
                                        <input type="number" value={room.length || ''} onChange={e => handleRoomChange(index, 'length', e.target.value)} className="w-16 p-2 bg-slate-50 border border-slate-200 rounded-lg text-center text-sm font-medium focus:border-blue-500 outline-none transition-all" placeholder="L" />
                                     </div>
                                     <span className="mb-3 text-slate-300 font-bold">×</span>
                                     <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">W (ft)</label>
                                        <input type="number" value={room.width || ''} onChange={e => handleRoomChange(index, 'width', e.target.value)} className="w-16 p-2 bg-slate-50 border border-slate-200 rounded-lg text-center text-sm font-medium focus:border-blue-500 outline-none transition-all" placeholder="W" />
                                     </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">H (ft)</label>
                                    <input type="number" value={room.height || ''} placeholder={String(projectContext.ceilingHeight || 9.5)} onChange={e => handleRoomChange(index, 'height', e.target.value)} className="w-16 p-2 bg-slate-50 border border-slate-200 rounded-lg text-center text-sm font-medium placeholder-slate-300 focus:border-blue-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Area (sq ft)</label>
                                    <input 
                                        type="number" 
                                        value={room.size || ''} 
                                        onChange={e => handleRoomChange(index, 'size', e.target.value)} 
                                        className={`w-24 p-2 border rounded-lg text-center text-sm font-bold transition-all ${room.length && room.width ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-blue-50 border-blue-200 text-blue-700'}`}
                                        readOnly={!!(room.length && room.width)}
                                    />
                                </div>
                                <button onClick={() => handleDeleteRoom(index)} className="self-center p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors mt-5 border border-transparent hover:border-red-100">
                                    <DeleteIcon className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="mt-4">
                                <input 
                                    type="text" 
                                    value={room.notes || ''} 
                                    onChange={e => handleRoomChange(index, 'notes', e.target.value)} 
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                    placeholder="Add specific features or notes (e.g. 'South facing window', 'Needs extra soundproofing')"
                                />
                            </div>
                        </motion.div>
                    )})}
                    </AnimatePresence>
                </div>
            )}
        </motion.div>
      </motion.div>
      )}
    </div>
  );
};

export default ProjectContextCard;
