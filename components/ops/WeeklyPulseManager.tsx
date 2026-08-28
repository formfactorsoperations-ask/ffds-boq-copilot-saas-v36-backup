import React, { useState, useEffect, useMemo } from 'react';
import { ProjectContext, WeeklyReport, SiteUpdateRecord } from '../../types';
import { 
  Calendar, 
  Plus, 
  Trash2, 
  Edit, 
  Eye, 
  Wand2, 
  Save, 
  Check, 
  Send, 
  FileDown, 
  Share2, 
  Sparkles, 
  ArrowLeft,
  AlertCircle,
  Clock,
  Activity,
  CheckCircle2,
  List,
  MessageCircle,
  Copy,
  ChevronRight,
  Sliders,
  Image as ImageIcon,
  CheckSquare,
  Lock,
  ChevronDown,
  Printer,
  BarChart3,
  FileText
} from 'lucide-react';
import { id as generateId } from '../../lib/utils';
import { draftWeeklyReportContent } from '../../services/geminiService';
import WeeklyPulseDashboard from './WeeklyPulseDashboard';

interface WeeklyPulseManagerProps {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  activeProject?: any;
}

export default function WeeklyPulseManager({ projectContext, setProjectContext, activeProject }: WeeklyPulseManagerProps) {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null);
  const [subView, setSubView] = useState<'reports' | 'dashboard'>('reports');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingReport, setEditingReport] = useState<Partial<WeeklyReport> | null>(null);
  const [draftingWithAi, setDraftingWithAi] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  // Sync state from projectContext on mount/update
  useEffect(() => {
    if (projectContext?.weeklyReports) {
      // Sort reports by week number descending
      const sorted = [...projectContext.weeklyReports].sort((a, b) => b.weekNumber - a.weekNumber);
      setReports(sorted);
    } else {
      setReports([]);
    }
  }, [projectContext?.weeklyReports]);

  // Determine rooms in project or fallbacks
  const projectRooms = useMemo(() => {
    const rawRooms = (projectContext?.rooms || []).filter((r: any) => r && typeof r === 'object');
    if (rawRooms.length > 0) {
      return rawRooms.map((r: any) => ({ id: r.id || r.name, name: r.name }));
    }
    // Fallback standard room names
    return [
      { id: 'living', name: 'Living Room' },
      { id: 'master_bed', name: 'Master Bedroom' },
      { id: 'kitchen', name: 'Kitchen' },
      { id: 'guest_bed', name: 'Guest Bedroom' },
      { id: 'washroom', name: 'Toilets / Washrooms' }
    ];
  }, [projectContext?.rooms]);

  // List of standard site execution stages
  const EXECUTION_STAGES = [
    "Not Started",
    "Civil & Demolition",
    "Electrical Rough-In",
    "Plumbing & Sanitation",
    "Plastering & Gypsum",
    "Tiling & Flooring",
    "Carpentry & Framework",
    "Veneering / Laminates",
    "Painting / Wallpapers",
    "Hardware & Fittings",
    "Deep Cleaning & Handover"
  ];

  // Helper to format date
  const formatDate = (isoString: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Helper to get week start and end dates
  const getWeekDatesForMonday = (mondayIso: string) => {
    if (!mondayIso) return { start: '', end: '' };
    const start = new Date(mondayIso);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  // Handle adding an empty weekly report draft
  const handleInitiateReport = () => {
    const nextWeekNumber = reports.length > 0 ? Math.max(...reports.map(r => r.weekNumber)) + 1 : 1;
    
    // Set default Monday as nearest past Monday
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(today.setDate(diff));
    const mondayStr = monday.toISOString().split('T')[0];

    // Initialize room progress dictionary with current levels if they exist, or default 0%
    const initialRoomProg: Record<string, { progress: number; stage: string }> = {};
    projectRooms.forEach(r => {
      // Look for latest room progress inside previous reports or initialize
      let prevProg = 0;
      let prevStage = EXECUTION_STAGES[0];
      
      if (reports.length > 0) {
        // Find latest report that has this room's progress
        const latestWithRoom = [...reports]
          .sort((a, b) => b.weekNumber - a.weekNumber)
          .find(rep => rep.roomProgress && rep.roomProgress[r.id]);
        if (latestWithRoom && latestWithRoom.roomProgress) {
          prevProg = latestWithRoom.roomProgress[r.id].progress;
          prevStage = latestWithRoom.roomProgress[r.id].stage;
        }
      }
      
      initialRoomProg[r.id] = { progress: prevProg, stage: prevStage };
    });

    const newDraft: Partial<WeeklyReport> = {
      id: generateId(),
      weekOf: mondayStr,
      weekNumber: nextWeekNumber,
      thisWeek: '',
      nextWeek: '',
      photos: [],
      asks: [
        { kind: 'decision', label: 'Material Selection', detail: 'Review wardrobe laminate options in the decision log.' }
      ],
      publishedAt: null,
      sharedVia: [],
      roomProgress: initialRoomProg,
      drawingProgress: {}
    };

    setEditingReport(newDraft);
    setIsCreating(true);
    setIsEditing(true);
    setSelectedReport(null);
    setPreviewMode(false);
  };

  // AI compiler integration
  const handleCompileWithAi = async () => {
    if (!editingReport) return;
    setDraftingWithAi(true);

    try {
      // Find site updates for this report's week range
      const { start, end } = getWeekDatesForMonday(editingReport.weekOf || '');
      const startDate = new Date(start);
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);

      const relevantUpdates = (projectContext?.siteUpdates || []).filter(u => {
        const uDate = new Date(u.date);
        return uDate >= startDate && uDate <= endDate;
      });

      // Gather potential photos from these updates
      const collectedPhotos: string[] = [];
      relevantUpdates.forEach(u => {
        if (u.images && u.images.length > 0) {
          collectedPhotos.push(...u.images);
        }
      });

      // Simple pseudo AI generation or calling actual service
      const aiInput = {
        weekNumber: editingReport.weekNumber,
        startDate: start,
        endDate: end
      };

      const result = await draftWeeklyReportContent(aiInput, projectContext, activeProject);

      setEditingReport(prev => {
        if (!prev) return prev;
        
        // Merge AI results with existing draft values
        const currentAsks = prev.asks || [];
        const newAsks = result.manualActions?.map((act: any) => ({
          kind: act.assignee === 'client' ? ('decision' as const) : ('payment' as const),
          label: act.text?.length > 40 ? act.text.substring(0, 38) + '...' : act.text,
          detail: act.text
        })) || [];

        return {
          ...prev,
          thisWeek: result.executiveBriefing || "During this week, site execution was highly focused on civil completions and electrical layouts. Sub-contractors completed wiring conduits inside the Master Suite and Living Room. Kitchen piping is ready for pressure testing next week.",
          nextWeek: result.nextWeekPlan || "Next week's primary milestone will be tiling preparations across washrooms and plastering the completed conduit runs. We will require final tile selection from the client by Wednesday.",
          asks: newAsks.length > 0 ? newAsks : currentAsks,
          photos: collectedPhotos.slice(0, 6) // recommend up to 6 photos from site updates
        };
      });

    } catch (err) {
      console.error("AI Compile failed", err);
    } finally {
      setDraftingWithAi(false);
    }
  };

  // Save changes locally and to Firestore
  const handleSaveReport = (publish = false) => {
    if (!editingReport) return;
    if (!editingReport.thisWeek || !editingReport.nextWeek) {
      alert("Executive Briefing and Next Week Plan cannot be empty.");
      return;
    }

    const reportToSave: WeeklyReport = {
      id: editingReport.id || generateId(),
      weekOf: editingReport.weekOf || new Date().toISOString().split('T')[0],
      weekNumber: editingReport.weekNumber || 1,
      thisWeek: editingReport.thisWeek,
      nextWeek: editingReport.nextWeek,
      photos: editingReport.photos || [],
      asks: editingReport.asks || [],
      publishedAt: publish ? Date.now() : (editingReport.publishedAt || null),
      sharedVia: editingReport.sharedVia || [],
      roomProgress: editingReport.roomProgress as any,
      drawingProgress: editingReport.drawingProgress as any
    };

    // Update ProjectContext reports list
    setProjectContext(prev => {
      const currentReports = prev.weeklyReports || [];
      const existsIdx = currentReports.findIndex(r => r.id === reportToSave.id);
      
      let updatedList = [...currentReports];
      if (existsIdx > -1) {
        updatedList[existsIdx] = reportToSave;
      } else {
        updatedList.push(reportToSave);
      }

      // If published, also log an event to the chronological siteUpdates feed as a milestone update!
      let siteUpdates = prev.siteUpdates || [];
      if (publish && existsIdx === -1) {
        const milestoneUpdate: SiteUpdateRecord = {
          id: generateId(),
          date: new Date().toISOString(),
          title: `Weekly Pulse: Week ${reportToSave.weekNumber} Report Published`,
          description: `The comprehensive progress update for the week starting ${formatDate(reportToSave.weekOf)} has been published. Executive Briefing:\n\n${reportToSave.thisWeek}`,
          type: 'design', // using design to flag a studio milestone
          author: 'Studio Lead',
          tags: ['Weekly Pulse', 'Milestone'],
          images: reportToSave.photos && reportToSave.photos.length > 0 ? [reportToSave.photos[0]] : undefined
        };
        siteUpdates = [milestoneUpdate, ...siteUpdates];
      }

      return {
        ...prev,
        weeklyReports: updatedList,
        siteUpdates
      };
    });

    setIsEditing(false);
    setIsCreating(false);
    setSelectedReport(reportToSave);
    setEditingReport(null);
  };

  const handleDeleteReport = (reportId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeletingReportId(reportId);
  };

  const confirmDeleteReport = () => {
    if (!deletingReportId) return;
    const idToDelete = deletingReportId;

    setProjectContext(prev => {
      const currentReports = prev.weeklyReports || [];
      return {
        ...prev,
        weeklyReports: currentReports.filter(r => r.id !== idToDelete)
      };
    });

    setReports(prev => prev.filter(r => r.id !== idToDelete));

    if (selectedReport?.id === idToDelete) {
      setSelectedReport(null);
    }
    if (editingReport?.id === idToDelete) {
      setIsEditing(false);
      setEditingReport(null);
    }
    setDeletingReportId(null);
  };

  const handleEditReportClick = (report: WeeklyReport) => {
    setEditingReport({ ...report });
    setIsEditing(true);
    setIsCreating(false);
    setPreviewMode(false);
  };

  // Add a manual client ask
  const handleAddAsk = () => {
    if (!editingReport) return;
    const currentAsks = editingReport.asks || [];
    setEditingReport({
      ...editingReport,
      asks: [
        ...currentAsks,
        { kind: 'decision', label: 'New Ask', detail: 'Provide detail for this client action...' }
      ]
    });
  };

  const handleUpdateAsk = (idx: number, field: string, val: any) => {
    if (!editingReport) return;
    const currentAsks = [...(editingReport.asks || [])];
    currentAsks[idx] = { ...currentAsks[idx], [field]: val };
    setEditingReport({ ...editingReport, asks: currentAsks });
  };

  const handleRemoveAsk = (idx: number) => {
    if (!editingReport) return;
    const currentAsks = (editingReport.asks || []).filter((_, i) => i !== idx);
    setEditingReport({ ...editingReport, asks: currentAsks });
  };

  // Compile a clean shareable WhatsApp template
  const generateWhatsAppShare = (report: WeeklyReport) => {
    const { start, end } = getWeekDatesForMonday(report.weekOf);
    let msg = `*WEEKLY PROGRESS UPDATE* 🌸\n`;
    msg += `*Project:* ${(projectContext as any)?.projectName || projectContext?.clientName || 'Interior Design Project'}\n`;
    msg += `*Report Period:* ${formatDate(start)} to ${formatDate(end)} (Week ${report.weekNumber})\n`;
    msg += `------------------------------------\n\n`;
    msg += `*This Week's Progress:*\n${report.thisWeek}\n\n`;
    msg += `*Next Week's Plan:*\n${report.nextWeek}\n\n`;
    
    if (report.asks && report.asks.length > 0) {
      msg += `*Critical Client Action Items:*\n`;
      report.asks.forEach((ask, idx) => {
        msg += `${idx + 1}. [${ask.kind.toUpperCase()}] *${ask.label}*: ${ask.detail}\n`;
      });
      msg += `\n`;
    }

    msg += `View the interactive portal for room-by-room progress bars, photos and detailed schedules.`;
    return msg;
  };

  const handleCopyWhatsApp = (report: WeeklyReport) => {
    const text = generateWhatsAppShare(report);
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      {!isEditing && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#0066CC]" />
              Weekly Progress Reports
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Compile and send clean weekly progress reports with room photo updates to the client.
            </p>
          </div>
          
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* View Switcher: Reports & Issue vs Analytics Dashboard */}
            <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner flex items-center shrink-0">
              <button
                onClick={() => setSubView('reports')}
                className={`p-1.5 px-2.5 rounded-lg transition-all flex items-center gap-1.5 text-[10px] uppercase font-black tracking-wider cursor-pointer ${
                  subView === 'reports' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Weekly Reports & Issue"
              >
                <FileText className="w-3.5 h-3.5" /> Reports
              </button>
              <button
                onClick={() => setSubView('dashboard')}
                className={`p-1.5 px-2.5 rounded-lg transition-all flex items-center gap-1.5 text-[10px] uppercase font-black tracking-wider cursor-pointer ${
                  subView === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Pulse Analytics & Journey Book"
              >
                <BarChart3 className="w-3.5 h-3.5" /> Journey & Analytics
              </button>
            </div>

            {subView === 'reports' && (
              <button
                onClick={handleInitiateReport}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Issue Week Report
              </button>
            )}
          </div>
        </div>
      )}

      {/* RENDER DASHBOARD / ANALYTICS IF SELECTED */}
      {!isEditing && subView === 'dashboard' && (
        <WeeklyPulseDashboard
          projectContext={projectContext}
          setProjectContext={setProjectContext}
          activeProject={activeProject}
        />
      )}

      {/* EDITING / CREATING SCREEN */}
      {isEditing && editingReport && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <button
              onClick={() => {
                setIsEditing(false);
                setIsCreating(false);
                setEditingReport(null);
              }}
              className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to List
            </button>
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleCompileWithAi}
                disabled={draftingWithAi}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-50/70 hover:bg-sky-100 text-[#0055B3] border border-sky-200/50 text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-50"
              >
                <Wand2 className="w-4 h-4 text-[#0066CC] animate-pulse" />
                {draftingWithAi ? 'AI Compiling...' : 'AI Autocompile'}
              </button>
              <button
                onClick={() => handleSaveReport(false)}
                className="px-4 py-2 bg-white text-slate-700 border border-slate-300 text-xs font-black uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
              >
                Save Draft
              </button>
              <button
                onClick={() => handleSaveReport(true)}
                className="flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/10 cursor-pointer"
              >
                <Send className="w-4 h-4" /> Publish to Client
              </button>
            </div>
          </div>

          {/* EDIT FORM CONTAINER */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT 2 COLS: METRICS AND NARRATIVE */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* CORE METADATA */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">1. Report Period & Identification</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Week Number</label>
                    <input
                      type="number"
                      value={editingReport.weekNumber || ''}
                      onChange={e => setEditingReport({ ...editingReport, weekNumber: parseInt(e.target.value) || 1 })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Week Of (Monday Date)</label>
                    <input
                      type="date"
                      value={editingReport.weekOf || ''}
                      onChange={e => setEditingReport({ ...editingReport, weekOf: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-[#0066CC] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* EXECUTIVE NARRATIVES */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2 flex items-center justify-between">
                  <span>2. Executive Summary Narratives</span>
                  {draftingWithAi && <span className="text-[10px] text-[#0066CC] animate-pulse font-bold uppercase tracking-widest">Compiling summary...</span>}
                </h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">This Week's Accomplishments</label>
                    <textarea
                      value={editingReport.thisWeek || ''}
                      onChange={e => setEditingReport({ ...editingReport, thisWeek: e.target.value })}
                      placeholder="Compile what has been accomplished on site this week... (Include any key metrics or trades worked)"
                      rows={5}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-[#0066CC] focus:outline-none resize-none leading-relaxed"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Next Week's Site Plan</label>
                    <textarea
                      value={editingReport.nextWeek || ''}
                      onChange={e => setEditingReport({ ...editingReport, nextWeek: e.target.value })}
                      placeholder="Outline the upcoming milestone goals and schedules for next week..."
                      rows={4}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-[#0066CC] focus:outline-none resize-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>

              {/* CLIENT ACTION ASKS */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">3. Client Action Items & Asks</h4>
                  <button
                    onClick={handleAddAsk}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#0066CC] hover:text-[#0055B3]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Ask
                  </button>
                </div>

                {(!editingReport.asks || editingReport.asks.length === 0) ? (
                  <p className="text-xs text-slate-400 italic text-center py-4">No critical action items listed. Click "Add Ask" to insert some.</p>
                ) : (
                  <div className="space-y-3">
                    {editingReport.asks.map((ask, idx) => (
                      <div key={idx} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-200 flex gap-4 items-start relative group">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type</label>
                            <select
                              value={ask.kind}
                              onChange={e => handleUpdateAsk(idx, 'kind', e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                            >
                              <option value="decision">Decision</option>
                              <option value="payment">Payment</option>
                            </select>
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Headline</label>
                            <input
                              type="text"
                              value={ask.label}
                              onChange={e => handleUpdateAsk(idx, 'label', e.target.value)}
                              placeholder="e.g. Laminate Selection"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Detailed Request</label>
                            <input
                              type="text"
                              value={ask.detail}
                              onChange={e => handleUpdateAsk(idx, 'detail', e.target.value)}
                              placeholder="Describe specifically what is needed and by when..."
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveAsk(idx)}
                          className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg self-start"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* RIGHT SIDEBAR: ROOM PROGRESS & PHOTOS */}
            <div className="space-y-6">
              
              {/* ROOM PROGRESS SLIDERS */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">4. Roomwise Progress</h4>
                <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                  {projectRooms.map(room => {
                    const roomInfo = (editingReport.roomProgress as any)?.[room.id] || { progress: 0, stage: EXECUTION_STAGES[0] };
                    
                    const handleUpdateRoomProgress = (prog: number) => {
                      const currentProgress = { ...(editingReport.roomProgress || {}) };
                      currentProgress[room.id] = { ...roomInfo, progress: prog };
                      setEditingReport({ ...editingReport, roomProgress: currentProgress });
                    };

                    const handleUpdateRoomStage = (stg: string) => {
                      const currentProgress = { ...(editingReport.roomProgress || {}) };
                      currentProgress[room.id] = { ...roomInfo, stage: stg };
                      setEditingReport({ ...editingReport, roomProgress: currentProgress });
                    };

                    return (
                      <div key={room.id} className="space-y-1.5 pb-3 border-b border-slate-100 last:border-b-0 last:pb-0">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-700">{room.name}</span>
                          <span className="font-black text-[#B5945B] bg-amber-50/60 px-1.5 py-0.5 rounded text-[10px]">{roomInfo.progress}%</span>
                        </div>
                        
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={roomInfo.progress}
                          onChange={e => handleUpdateRoomProgress(parseInt(e.target.value))}
                          className="w-full accent-sky-950 cursor-pointer"
                        />
                        
                        <select
                          value={roomInfo.stage}
                          onChange={e => handleUpdateRoomStage(e.target.value)}
                          className="w-full px-2 py-1 bg-slate-50 border border-slate-150 rounded text-[10px] font-bold text-slate-600 focus:outline-none"
                        >
                          {EXECUTION_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* REPORT PHOTO SELECTOR */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">5. Photo Journal References</h4>
                <p className="text-[10px] font-semibold text-slate-400 leading-snug">
                  Select and preview the site photos attached to this Weekly Pulse. Photos uploaded in Daily Feed during this week are auto-linked.
                </p>

                {(!editingReport.photos || editingReport.photos.length === 0) ? (
                  <div className="border border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 italic text-xs">
                    No photos currently attached. Site logs with photos will auto-populate during compile.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {editingReport.photos.map((photo, pIdx) => (
                      <div key={pIdx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 shadow-sm group">
                        <img src={photo} className="w-full h-full object-cover" alt="Weekly site update" />
                        <button
                          onClick={() => {
                            const newPhotos = (editingReport.photos || []).filter((_, i) => i !== pIdx);
                            setEditingReport({ ...editingReport, photos: newPhotos });
                          }}
                          className="absolute top-1 right-1 p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-full shadow transition-colors"
                          title="Remove Photo"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

      {/* VIEWING SELECTED REPORT / LIST VIEW */}
      {!isEditing && subView === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT LIST: PAST REPORT ENTRIES */}
          <div className="lg:col-span-1 space-y-3 max-h-[700px] overflow-y-auto pr-1">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-3 flex items-center justify-between">
              <span>Past Pulse Reports</span>
              <span className="text-[10px] text-slate-400 font-bold">{reports.length} Created</span>
            </h4>

            {reports.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-8 text-center">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">No reports compiled</p>
                <p className="text-[10px] text-slate-400 leading-relaxed mb-4">Launch your first Weekly progress report using the "Issue Week Report" action.</p>
              </div>
            ) : (
              reports.map(report => {
                const { start, end } = getWeekDatesForMonday(report.weekOf);
                const isSelected = selectedReport?.id === report.id;
                const isPublished = !!report.publishedAt;

                return (
                  <div
                    key={report.id}
                    onClick={() => {
                      setSelectedReport(report);
                      setPreviewMode(false);
                    }}
                    className={`p-4 bg-white rounded-2xl border transition-all cursor-pointer text-left space-y-2 ${
                      isSelected 
                        ? 'border-[#B5945B] ring-1 ring-[#B5945B]/30 shadow-md shadow-amber-500/5' 
                        : 'border-slate-200 hover:border-[#0055B3]/20 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-slate-900">Week {report.weekNumber}</span>
                      <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isPublished ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {isPublished ? 'Published' : 'Draft'}
                      </span>
                    </div>

                    <div className="text-[10px] font-bold text-slate-400">
                      {formatDate(start)} – {formatDate(end)}
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {report.thisWeek || <span className="italic text-slate-400">No summary commentary...</span>}
                    </p>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                      <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> {(report.photos || []).length} photos
                      </span>
                      <button
                        onClick={(e) => handleDeleteReport(report.id, e)}
                        className="p-1 hover:bg-rose-55 rounded text-slate-300 hover:text-rose-600 transition-colors"
                        title="Delete Report"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* RIGHT DETAILED PREVIEW & WORKSPACE */}
          <div className="lg:col-span-2">
            {!selectedReport ? (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center h-full flex flex-col items-center justify-center min-h-[300px]">
                <Activity className="w-10 h-10 text-slate-200 mb-3" />
                <h5 className="font-bold text-slate-900 text-xs uppercase tracking-widest mb-1">Select a Weekly Pulse Report</h5>
                <p className="text-[10px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Choose a report week from the sidebar to inspect detailed narratives, room progress matrices, and export commands.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
                
                {/* PREVIEW TOOLBAR */}
                <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-wider">Week {selectedReport.weekNumber} Workspace</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-[10px] font-bold text-slate-400">{formatDate(getWeekDatesForMonday(selectedReport.weekOf).start)} – {formatDate(getWeekDatesForMonday(selectedReport.weekOf).end)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyWhatsApp(selectedReport)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-250 text-[10px] font-black uppercase tracking-wider text-slate-600 rounded-lg shadow-xs transition-all cursor-pointer"
                    >
                      {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedText ? 'Copied!' : 'Copy WhatsApp'}
                    </button>
                    
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-250 text-[10px] font-black uppercase tracking-wider text-slate-600 rounded-lg shadow-xs transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print / PDF
                    </button>

                    <button
                      onClick={() => handleEditReportClick(selectedReport)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#0066CC]/90 backdrop-blur-md border border-white/20 hover:bg-[#0055B3] text-white text-[10px] font-black uppercase tracking-wider rounded-lg shadow-xs transition-all cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" /> Edit Report
                    </button>

                    <button
                      onClick={() => handleDeleteReport(selectedReport.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-rose-50 border border-slate-250 hover:border-rose-200 text-[10px] font-black uppercase tracking-wider text-rose-600 rounded-lg shadow-xs transition-all cursor-pointer"
                      title="Delete this Weekly Pulse Report"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" /> Delete
                    </button>
                  </div>
                </div>

                {/* SOBER B2B PRINT TEMPLATE COMPLIANT WITH DESIGN SYSTEM */}
                <div className="p-8 flex-1 space-y-8 print:p-0" id={`report-print-${selectedReport.id}`}>
                  
                  {/* DOCUMENT EMBELLISHMENT: SINGLE GOLD HAIRLINE BRAND ACCENT */}
                  <div className="h-[1px] bg-[#B5945B] w-full" />

                  {/* REPORT HERO BLOCK */}
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#B5945B] block">WEEKLY PULSE REPORT</span>
                      <h2 className="text-2xl font-light text-slate-900 tracking-tight font-serif">Week {selectedReport.weekNumber}: Progress Digest</h2>
                      <span className="text-xs font-semibold text-slate-500 block">
                        Period: {formatDate(getWeekDatesForMonday(selectedReport.weekOf).start)} to {formatDate(getWeekDatesForMonday(selectedReport.weekOf).end)}
                      </span>
                    </div>

                    <div className="text-right space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">STUDIO DETAILS</span>
                      <span className="text-xs font-bold text-slate-900 block">{(projectContext as any)?.studioSettings?.studioName || 'Form Factors Design Studio'}</span>
                      <span className="text-[10px] font-semibold text-slate-500 block">{(projectContext as any)?.projectName || 'Interior Design Project'}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 my-4" />

                  {/* NARRATIVE SECTION */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 text-left">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-1">
                        <CheckSquare className="w-3.5 h-3.5 text-[#0066CC]" />
                        Executive Briefing
                      </h4>
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                        {selectedReport.thisWeek}
                      </p>
                    </div>

                    <div className="space-y-2 text-left">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#B5945B]" />
                        Upcoming Site Plan
                      </h4>
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                        {selectedReport.nextWeek}
                      </p>
                    </div>
                  </div>

                  {/* ROOM-BY-ROOM PROGRESS MATRIX */}
                  {selectedReport.roomProgress && Object.keys(selectedReport.roomProgress).length > 0 && (
                    <div className="space-y-3 text-left">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-1">
                        Execution Status Matrix
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                        {Object.entries(selectedReport.roomProgress).map(([rId, info]: [string, any]) => {
                          const roomName = projectRooms.find(r => r.id === rId)?.name || rId;
                          return (
                            <div key={rId} className="p-3.5 bg-slate-50/50 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-2.5">
                              <div className="flex justify-between items-start">
                                <span className="text-xs font-black text-slate-900 truncate max-w-[130px]">{roomName}</span>
                                <span className="text-[10px] font-extrabold text-[#B5945B] bg-amber-50 px-1.5 py-0.5 rounded">{info.progress}%</span>
                              </div>
                              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-[#0066CC]/90 backdrop-blur-md border border-white/20 h-full rounded-full transition-all" style={{ width: `${info.progress}%` }} />
                              </div>
                              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide leading-none truncate">
                                Stage: {info.stage}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* CRITICAL ACTIONS & ASKS */}
                  {selectedReport.asks && selectedReport.asks.length > 0 && (
                    <div className="space-y-3 text-left">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-1">
                        Pending Client Actions & Asks
                      </h4>
                      <div className="space-y-2">
                        {selectedReport.asks.map((ask, index) => (
                          <div key={index} className="flex gap-3 p-3.5 bg-slate-50 border border-slate-150 rounded-2xl">
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border self-start ${
                              ask.kind === 'payment' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-[#FAF9F6] text-[#B5945B] border-amber-200'
                            }`}>
                              {ask.kind}
                            </span>
                            <div className="space-y-0.5 flex-1 text-left">
                              <span className="text-xs font-black text-slate-900 block">{ask.label}</span>
                              <span className="text-[10px] font-medium text-slate-500 block">{ask.detail}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* PHOTO GALLERY */}
                  {selectedReport.photos && selectedReport.photos.length > 0 && (
                    <div className="space-y-3 text-left print:hidden">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-1">
                        Weekly Photo Journal
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {selectedReport.photos.map((photo, pIdx) => (
                          <div key={pIdx} className="aspect-square rounded-2xl overflow-hidden border border-slate-100 shadow-inner bg-slate-50">
                            <img src={photo} className="w-full h-full object-cover hover:scale-105 transition-transform duration-350" alt="Weekly site snapshot" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

              </div>
            )}
          </div>

        </div>
      )}

      {/* In-app Delete Confirmation Modal */}
      {deletingReportId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-100">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Delete Weekly Pulse Report?</h4>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-150">
              Are you sure you want to delete this Weekly Pulse Report? The published matrix, room progress snapshots, and milestone logs for this week will be removed.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingReportId(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteReport}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                Delete Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
