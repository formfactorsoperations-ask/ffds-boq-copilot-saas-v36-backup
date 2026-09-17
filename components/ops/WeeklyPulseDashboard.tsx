import React, { useState, useMemo } from 'react';
import { ProjectContext, WeeklyReport, SiteUpdateRecord, ProjectDecisionRecord, SnagItem } from '../../types';
import { 
  Activity, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  MessageSquare, 
  Calendar, 
  ChevronRight, 
  Compass, 
  Layers, 
  HelpCircle,
  FileText,
  DollarSign,
  TrendingUp,
  Inbox,
  AlertCircle,
  BookOpen,
  Image as ImageIcon,
  Check,
  ChevronLeft,
  X,
  MapPin
} from 'lucide-react';
import { formatINR } from '../../lib/utils';

interface WeeklyPulseDashboardProps {
  projectContext: ProjectContext;
  setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
  activeProject?: any;
}

export default function WeeklyPulseDashboard({ projectContext, setProjectContext, activeProject }: WeeklyPulseDashboardProps) {
  // Navigation Tabs: 'analytics' (Week-by-Week Tracker) vs 'journey' (Project Journey Book)
  const [activeTab, setActiveTab] = useState<'analytics' | 'journey'>('analytics');

  // Lightbox State for Journey Photos
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  // 1. Determine Week Selection State for Analytics Tab
  const publishedReports = useMemo(() => {
    return (projectContext?.weeklyReports || [])
      .filter(r => r.publishedAt)
      .sort((a, b) => b.weekNumber - a.weekNumber);
  }, [projectContext?.weeklyReports]);

  // Options for selection dropdown: 'current' (calendar week) or a report ID
  const [selectedWeekId, setSelectedWeekId] = useState<string>('current');

  // Helper to parse dates
  const currentWeekRange = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    return { start: monday, end: sunday };
  }, []);

  // Compute selected week date boundaries based on dropdown selection
  const weekBoundaries = useMemo(() => {
    if (selectedWeekId === 'current') {
      return currentWeekRange;
    }
    const report = publishedReports.find(r => r.id === selectedWeekId);
    if (report && report.weekOf) {
      const start = new Date(report.weekOf);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    return currentWeekRange;
  }, [selectedWeekId, publishedReports, currentWeekRange]);

  // Helper to check if a date falls in our selected week boundary
  const isDateInSelectedWeek = (dateStr: string | number) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= weekBoundaries.start && d <= weekBoundaries.end;
  };

  // Find corresponding WeeklyReport if any
  const matchedReport = useMemo(() => {
    if (selectedWeekId === 'current') {
      const mondayStr = weekBoundaries.start.toISOString().split('T')[0];
      return publishedReports.find(r => r.weekOf === mondayStr) || publishedReports[0] || null;
    }
    return publishedReports.find(r => r.id === selectedWeekId) || null;
  }, [selectedWeekId, publishedReports, weekBoundaries]);

  // Site Progress Metrics
  const projectRooms = useMemo(() => {
    return (projectContext?.rooms || []).filter((r: any) => r && typeof r === 'object');
  }, [projectContext?.rooms]);

  const roomProgressList = useMemo(() => {
    const reportProgress = matchedReport?.roomProgress;
    
    return projectRooms.map((room: any) => {
      const rId = room.id || room.name;
      const cached = reportProgress?.[rId];
      
      return {
        id: rId,
        name: room.name,
        progress: cached?.progress ?? room.currentProgress ?? 0,
        stage: cached?.stage ?? room.currentStageName ?? 'Not Started'
      };
    });
  }, [projectRooms, matchedReport, projectContext]);

  const averageSiteProgress = useMemo(() => {
    if (roomProgressList.length === 0) return 0;
    const sum = roomProgressList.reduce((acc, item) => acc + item.progress, 0);
    return Math.round(sum / roomProgressList.length);
  }, [roomProgressList]);

  // Trade Sequence Progress Tracker
  const trades = useMemo(() => {
    return projectContext?.tradeSequence || [
      "Civil & Demolition",
      "Electrical Rough-In",
      "Plumbing & Sanitation",
      "Plastering & Gypsum",
      "Tiling & Flooring",
      "Carpentry & Framework",
      "Painting / Wallpapers",
      "Deep Cleaning & Handover"
    ];
  }, [projectContext?.tradeSequence]);

  const currentTradeIndex = useMemo(() => {
    let maxStageIndex = 0;
    roomProgressList.forEach(room => {
      const idx = trades.findIndex(t => t.toLowerCase().includes(room.stage.toLowerCase()) || room.stage.toLowerCase().includes(t.toLowerCase()));
      if (idx > maxStageIndex) {
        maxStageIndex = idx;
      }
    });
    return maxStageIndex === -1 ? 0 : maxStageIndex;
  }, [roomProgressList, trades]);

  // Pending Bottlenecks
  const pendingDecisions = useMemo(() => {
    const decisions = projectContext?.projectDecisions || [];
    return decisions.filter(d => d.status === 'pending');
  }, [projectContext?.projectDecisions]);

  const pendingSnags = useMemo(() => {
    const snags = projectContext?.snagList || [];
    return snags.filter(s => s.status === 'open' || s.status === 'in_progress');
  }, [projectContext?.snagList]);

  const snagSeverityCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };
    pendingSnags.forEach(s => {
      if (s.severity === 'high') counts.high++;
      else if (s.severity === 'medium') counts.medium++;
      else if (s.severity === 'low') counts.low++;
    });
    return counts;
  }, [pendingSnags]);

  // Client Communication Metrics
  const commsHealth = projectContext?.commsHealth ?? 85;
  const commsSent = projectContext?.commsSentCount ?? 0;
  const commsPending = projectContext?.commsPendingCount ?? 0;
  const commsOverdue = projectContext?.commsOverdueCount ?? 0;

  // Integrated Project Feed Filtered by Selected Week
  const weeklyFeedItems = useMemo(() => {
    const updates = projectContext?.siteUpdates || [];
    const filteredUpdates = updates.filter(u => isDateInSelectedWeek(u.date));
    
    const formattedUpdates = filteredUpdates.map(u => ({
      id: u.id,
      date: new Date(u.date),
      title: u.title,
      description: u.description,
      type: 'site_update' as const,
      data: {
        type: u.type || 'site',
        images: u.images || [],
        tags: u.tags || [],
        author: u.author || 'Project Team'
      }
    }));

    const schedules = projectContext?.paymentSchedules || [];
    const milestoneItems: any[] = [];
    schedules.forEach(sched => {
      (sched.advances || []).forEach(m => {
        if (m.receivedAt && isDateInSelectedWeek(m.receivedAt)) {
          milestoneItems.push({
            id: m.advanceCode || `milestone-${m.label}`,
            date: new Date(m.receivedAt),
            title: `Payment Cleared: ${m.label}`,
            description: `Payment advance received successfully. Amount: ${formatINR(m.amount)} (${m.percentage}%).`,
            type: 'payment' as const,
            data: {
              name: m.label,
              amount: m.amount,
              percentage: m.percentage
            }
          });
        }
      });
    });

    return [...formattedUpdates, ...milestoneItems].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [projectContext?.siteUpdates, projectContext?.paymentSchedules, weekBoundaries]);

  // Chronological Journey Reports (from Week 1 upwards)
  const journeyReports = useMemo(() => {
    return (projectContext?.weeklyReports || [])
      .filter(r => r.publishedAt)
      .sort((a, b) => a.weekNumber - b.weekNumber);
  }, [projectContext?.weeklyReports]);

  // Helper formatting dates for range display
  const getWeekDatesString = (weekOfStr: string) => {
    try {
      const start = new Date(weekOfStr);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } catch {
      return weekOfStr;
    }
  };

  return (
    <div className="space-y-8 font-sans antialiased text-slate-800">
      
      {/* Clean Header & Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2 border-b border-slate-200">
        <div>
          <span className="text-[10px] font-bold tracking-widest text-[#3D52A0] uppercase block mb-1">Site Operations</span>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Site Progress & Client Experience
          </h3>
          <p className="text-xs text-slate-500 font-normal mt-0.5">
            Track week-by-week room progress, site milestones, and client updates.
          </p>
        </div>

        {/* Elegant Mode Pickers */}
        <div className="flex bg-slate-100 p-1 rounded-xl self-stretch md:self-auto border border-slate-200/50">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'analytics'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5 justify-center">
              <Activity className="w-3.5 h-3.5" /> Week Analytics
            </span>
          </button>
          <button
            onClick={() => setActiveTab('journey')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'journey'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-1.5 justify-center">
              <BookOpen className="w-3.5 h-3.5" /> Project Journey Book
            </span>
          </button>
        </div>
      </div>

      {activeTab === 'analytics' ? (
        <div className="space-y-6">
          {/* Executive Header Controls */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight uppercase">
                Week-by-Week Progress Diagnostic
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Aggregating real-time room progress, site milestones, pending client signoffs, and feed updates.
              </p>
            </div>

            {/* Week Selector Dropdown */}
            <div className="flex items-center gap-3 w-full md:w-auto self-stretch md:self-auto">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">
                Analysis Window
              </span>
              <select
                id="week-select"
                value={selectedWeekId}
                onChange={(e) => setSelectedWeekId(e.target.value)}
                className="w-full md:w-64 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 cursor-pointer outline-none focus:ring-1 focus:ring-[#B5945B] transition-all shadow-sm"
              >
                <option value="current">Current Calendar Week</option>
                {publishedReports.map(report => (
                  <option key={report.id} value={report.id}>
                    Week {report.weekNumber} Pulse Report
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Range Ribbon Accent */}
          <div className="flex items-center gap-2.5 bg-[#FAF9F6] border border-amber-200/50 px-4 py-3 rounded-xl text-xs font-bold text-[#B5945B]">
            <Calendar className="w-4 h-4 text-[#B5945B] shrink-0" />
            <span>
              Analyzing Period: {weekBoundaries.start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {weekBoundaries.end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {matchedReport && (
              <span className="ml-auto bg-[#B5945B]/10 px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-extrabold text-[#B5945B]">
                Report Linked
              </span>
            )}
          </div>

          {/* High-Level Executive Stat Cards (Sober, Print-first Aesthetic) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Card 1: Comms Health Index */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald-500" />
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Comms Health</span>
                <span className="text-3xl font-light text-slate-900 tracking-tight block">{commsHealth}%</span>
                <span className="text-[10px] text-slate-500 block">
                  Target: 90% responsiveness
                </span>
              </div>
            </div>

            {/* Card 2: Site Progress Index */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#B5945B]" />
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Overall Progress</span>
                <span className="text-3xl font-light text-[#B5945B] tracking-tight block">{averageSiteProgress}%</span>
                <span className="text-[10px] text-slate-500 block">
                  Across {roomProgressList.length} defined areas
                </span>
              </div>
            </div>

            {/* Card 3: Actionable Bottlenecks */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-rose-500" />
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Open Blockers</span>
                <span className="text-3xl font-light text-rose-600 tracking-tight block">
                  {pendingDecisions.length + pendingSnags.length} Pending
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {pendingDecisions.length} Decisions • {pendingSnags.length} Snags
                </span>
              </div>
            </div>

            {/* Card 4: Updates This Week */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#3D52A0]/90 backdrop-blur-md border border-white/20" />
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Activity Logged</span>
                <span className="text-3xl font-light text-slate-900 tracking-tight block">
                  {weeklyFeedItems.length} Entries
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Updates published this week
                </span>
              </div>
            </div>
          </div>

          {/* Main Grid: Bento Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Room-by-Room Site Progress */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900 flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-[#B5945B]" /> Room Site Progress
                </h4>
                <span className="text-[10px] font-bold text-slate-400">Avg {averageSiteProgress}%</span>
              </div>

              <div className="space-y-5">
                {roomProgressList.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No rooms configured.
                  </div>
                ) : (
                  roomProgressList.map(item => (
                    <div key={item.id} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-800">{item.name}</span>
                        <span className="text-[10px] font-extrabold text-[#B5945B] bg-amber-50 px-2 py-0.5 rounded">
                          {item.progress}%
                        </span>
                      </div>
                      {/* Elegant Progress Line */}
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200/20">
                        <div 
                          className="bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${item.progress}%` }} 
                        />
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">
                        Stage: {item.stage}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Trade Sequence Tracker */}
              <div className="pt-5 border-t border-slate-100 space-y-4">
                <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest block">Active Trade Phase</span>
                <div className="relative pl-4 space-y-4 before:absolute before:left-1 before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-200">
                  {trades.slice(0, 5).map((trade, idx) => {
                    const isActive = idx === currentTradeIndex;
                    const isPassed = idx < currentTradeIndex;
                    return (
                      <div key={idx} className="flex items-center gap-3 relative">
                        {/* Status dot */}
                        <div className={`absolute -left-[16px] w-2 h-2 rounded-full border ${
                          isActive ? 'bg-[#B5945B] border-amber-300 ring-2 ring-[#B5945B]/10' : 
                          isPassed ? 'bg-[#3D52A0]/90 backdrop-blur-md border border-white/20 border-[#334486]' : 'bg-white border-slate-300'
                        }`} />
                        <span className={`text-xs ${
                          isActive ? 'text-slate-900 font-bold' : 
                          isPassed ? 'text-slate-400' : 'text-slate-500'
                        }`}>
                          {trade}
                        </span>
                        {isActive && (
                          <span className="text-[8px] font-black text-[#B5945B] bg-amber-50 border border-amber-200 px-1.5 rounded uppercase tracking-wider">
                            Current
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Center Column: Bottlenecks & Pending Client Actions */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-500" /> Pending Bottlenecks
                </h4>
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                  {pendingDecisions.length + pendingSnags.length} Items
                </span>
              </div>

              {/* Client Decisions Pending */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest block border-b border-slate-55 pb-1">
                  Client Decisions ({pendingDecisions.length})
                </span>
                {pendingDecisions.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 italic text-center">
                    No decisions awaiting client signoff.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {pendingDecisions.map(decision => (
                      <div key={decision.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5">
                        <HelpCircle className="w-4 h-4 text-[#B5945B] mt-0.5 shrink-0" />
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-slate-900 block leading-tight">{decision.title}</span>
                          <span className="text-[9px] font-bold text-slate-400 block uppercase">
                            Room: {decision.roomId || 'General'} · Added {new Date(decision.date).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Unresolved Snags */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest block border-b border-slate-55 pb-1">
                  Site Snags ({pendingSnags.length})
                </span>
                
                {/* Severity mini-badge grid */}
                <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
                  <div className="bg-rose-50/50 border border-rose-100 rounded-xl py-1">
                    <span className="text-xs font-bold text-rose-600 block">{snagSeverityCounts.high}</span>
                    <span className="text-[8px] text-rose-400 uppercase tracking-wider block">High</span>
                  </div>
                  <div className="bg-amber-50/50 border border-amber-100 rounded-xl py-1">
                    <span className="text-xs font-bold text-amber-600 block">{snagSeverityCounts.medium}</span>
                    <span className="text-[8px] text-amber-400 uppercase tracking-wider block">Medium</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl py-1">
                    <span className="text-xs font-bold text-slate-600 block">{snagSeverityCounts.low}</span>
                    <span className="text-[8px] text-slate-400 uppercase tracking-wider block">Low</span>
                  </div>
                </div>

                {pendingSnags.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 italic text-center">
                    All site snags fully addressed.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {pendingSnags.slice(0, 4).map(snag => (
                      <div key={snag.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5">
                        <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                          snag.severity === 'high' ? 'text-rose-500' : 'text-amber-500'
                        }`} />
                        <div className="space-y-0.5">
                          <span className="text-xs text-slate-700 block leading-tight">{snag.description}</span>
                          <span className="text-[9px] font-bold text-slate-400 block uppercase">
                            {snag.roomName} · Status: {snag.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Communication and Week's Timeline Feed */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-slate-900" /> Comms Activity
                </h4>
                <span className="text-[10px] font-bold text-slate-400">Activity Log</span>
              </div>

              {/* Communication Overdue & Targets info */}
              <div className="bg-slate-50 border border-slate-200/60 p-3 rounded-xl">
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div>
                    <span className="text-sm font-bold text-emerald-600 block">{commsSent}</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase block">Sent</span>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-[#B5945B] block">{commsPending}</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase block">Pending</span>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-rose-500 block">{commsOverdue}</span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase block">Overdue</span>
                  </div>
                </div>
              </div>

              {/* Week's Integrated Timeline Feed */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest block border-b border-slate-55 pb-1">
                  Feed Updates ({weeklyFeedItems.length})
                </span>
                
                {weeklyFeedItems.length === 0 ? (
                  <div className="py-8 text-center space-y-2 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl p-4">
                    <Inbox className="w-5 h-5 text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-400 italic">
                      No feed updates posted this week.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                    {weeklyFeedItems.map((item, idx) => (
                      <div key={item.id || idx} className="relative pl-3.5 before:absolute before:left-0 before:top-2 before:bottom-0 before:w-[1px] before:bg-[#3D52A0]/90 backdrop-blur-md border border-white/20/20">
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] font-bold text-[#B5945B] uppercase tracking-wider block">
                            {item.type === 'site_update' ? 'Site Update' : 'Payment Cleared'}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400">
                            {item.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-slate-900 block mt-0.5 leading-tight">{item.title}</span>
                        <p className="text-xs text-slate-500 leading-relaxed mt-1 line-clamp-2">
                          {item.description}
                        </p>
                        
                        {item.type === 'site_update' && item.data?.images && item.data.images.length > 0 && (
                          <div className="flex gap-1.5 mt-2">
                            {item.data.images.slice(0, 2).map((imgUrl: string, imgIdx: number) => (
                              <div key={imgIdx} className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 shrink-0">
                                <img src={imgUrl} className="w-full h-full object-cover" alt="Weekly snapshot" referrerPolicy="no-referrer" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      ) : (
        /* ==================== PROJECT JOURNEY BOOK TAB ==================== */
        <div className="space-y-6 max-w-4xl mx-auto">
          <div className="text-center py-6 border-b border-slate-100">
            <h3 className="text-xl font-semibold text-slate-900 tracking-tight font-serif mb-2">
              The Journey Book
            </h3>
            <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
              A comprehensive archive of your project's weekly checkpoints, completed decisions, and photographic growth. Flip through the chapters of how your house became a home.
            </p>
          </div>

          {journeyReports.length === 0 ? (
            <div className="bg-[#FAF9F6] border border-amber-200/50 p-12 rounded-2xl text-center space-y-4 max-w-lg mx-auto">
              <BookOpen className="w-10 h-10 text-[#B5945B] mx-auto opacity-70" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">Journey book is empty</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  As the project progresses and you publish weekly pulse reports to the client feed, they will compile here into an elegant chronological journey archive.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-12 relative pl-6 md:pl-8 before:absolute before:left-[11px] md:before:left-[15px] before:top-4 before:bottom-4 before:w-[1px] before:bg-amber-500/30">
              {journeyReports.map((report, reportIdx) => {
                const datesStr = getWeekDatesString(report.weekOf);
                return (
                  <div key={report.id} className="relative group space-y-4">
                    
                    {/* Visual Connector Dot (Gold/Navy ring) */}
                    <div className="absolute -left-[23px] md:-left-[27px] top-1.5 w-6 h-6 rounded-full bg-white border-2 border-[#B5945B] flex items-center justify-center shadow-sm z-10">
                      <span className="text-[9px] font-black text-slate-900 leading-none">{report.weekNumber}</span>
                    </div>

                    {/* Editorial Week Title & Date */}
                    <div className="flex flex-col md:flex-row justify-between md:items-baseline gap-1.5 pt-0.5">
                      <h4 className="text-lg font-semibold tracking-tight text-slate-900 font-serif">
                        Chapter {report.weekNumber}: Week Progress Update
                      </h4>
                      <span className="text-xs font-bold text-slate-400">
                        {datesStr}
                      </span>
                    </div>

                    {/* Sophisticated Print-inspired Weekly Container */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                      {/* Subtle elegant gold hairline line */}
                      <div className="absolute top-0 left-0 bottom-0 w-[3px] bg-[#B5945B]" />

                      {/* Executive Briefing narrative */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block">Executive Summary</span>
                        <div className="text-xs text-slate-600 leading-relaxed font-sans max-w-3xl whitespace-pre-wrap">
                          {report.thisWeek || "No summary narrative archived for this period."}
                        </div>
                      </div>

                      {/* Forward Outlook narrative */}
                      {report.nextWeek && (
                        <div className="pt-4 border-t border-slate-100 space-y-2">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-[#B5945B] block">Outlook / Forward Plan</span>
                          <div className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap max-w-3xl">
                            {report.nextWeek}
                          </div>
                        </div>
                      )}

                      {/* Photo Snapshots of the week */}
                      {report.photos && report.photos.length > 0 && (
                        <div className="space-y-3 pt-4 border-t border-slate-100">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block flex items-center gap-1">
                            <ImageIcon className="w-3.5 h-3.5 text-slate-400" /> Site Visuals Captured ({report.photos.length})
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {report.photos.map((photoUrl, pIdx) => (
                              <div 
                                key={pIdx} 
                                onClick={() => setLightboxPhoto(photoUrl)}
                                className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer group/photo relative shadow-sm hover:border-amber-500/50 transition-colors"
                              >
                                <img 
                                  src={photoUrl} 
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover/photo:scale-105" 
                                  alt={`Week ${report.weekNumber} Snapshot`} 
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center">
                                  <span className="text-[9px] font-bold text-white bg-slate-900/70 px-2 py-1 rounded-md">View Full</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Milestones, Actions & Decisions Completed in this week */}
                      {report.asks && report.asks.length > 0 && (
                        <div className="space-y-3 pt-4 border-t border-slate-100">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block">
                            Milestones & Decisions Highlighted
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {report.asks.map((ask, aIdx) => (
                              <div key={aIdx} className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 flex items-start gap-2.5">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black ${
                                  ask.kind === 'payment' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-[#B5945B] border border-amber-200'
                                }`}>
                                  {ask.kind === 'payment' ? '₹' : '?'}
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-xs font-bold text-slate-800 block">{ask.label}</span>
                                  <span className="text-[10px] text-slate-500 block leading-normal">{ask.detail}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Lightbox Modal for Journey Pictures */}
      {lightboxPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <button 
              onClick={() => setLightboxPhoto(null)} 
              className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10">
            <img 
              src={lightboxPhoto} 
              className="max-w-full max-h-[85vh] object-contain" 
              alt="High definition site snapshot" 
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}

    </div>
  );
}
