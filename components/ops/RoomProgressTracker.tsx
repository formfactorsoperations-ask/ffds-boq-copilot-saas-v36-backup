import React, { useMemo, useState } from 'react';
import { ProjectContext, FullBoqItem, Room } from '../../types';
import { 
  Building, 
  Sparkles, 
  CheckCircle2, 
  RefreshCw, 
  Layers, 
  HardHat, 
  AlertCircle, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  PackageCheck,
  Clock,
  ListFilter
} from 'lucide-react';

interface Props {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  boq?: FullBoqItem[];
  bundles?: any[];
}

export const STAGES = [
  'Pending Execution Start',
  'Demolition & Marking',
  'Civil & MEP Layouts',
  'False Ceiling & Framing',
  'Carpentry & Assembly',
  'Painting & Finishes',
  'Fixtures & Final Snagging',
  'Handover Completed'
] as const;

export type ItemExecutionStatus = 'pending' | 'in_progress' | 'completed';

/**
 * Intelligent helper to automatically derive realistic room-level execution progress
 * and active stage based on:
 * 1. Individual item execution statuses in that specific room (highest fidelity)
 * 2. Active trade execution bundles (EB-01 to EB-11)
 * 3. Pre-handover quality checklist and snag list state
 */
export function deriveRoomProgress(
  room: Room,
  projectContext: ProjectContext,
  boq: FullBoqItem[] = [],
  bundles: any[] = []
): { stage: string; progress: number; reasoning: string; itemProgressSummary?: string } {
  // 1. Handover / Completed project state
  if (
    projectContext?.handoverDate ||
    projectContext?.status === 'completed' ||
    (projectContext as any)?.lifecycle?.stage === 'completed'
  ) {
    return { stage: 'Handover Completed', progress: 100, reasoning: 'Project handover recorded' };
  }

  const roomNameLower = (room.name || '').toLowerCase().trim();
  const roomKey = room.id || room.name;

  // 2. Room items from BOQ & their individual execution statuses
  const roomItems = boq.filter(item => {
    const iRoom = (item.roomId || (item as any).room || (item as any).roomName || '').toLowerCase();
    return iRoom === roomNameLower || (room.id && iRoom === room.id.toLowerCase());
  });

  const itemStatuses = projectContext.itemExecutionStatuses || {};

  // If room has items and at least some items have been tracked or marked
  if (roomItems.length > 0) {
    let completedCount = 0;
    let inProgressCount = 0;
    let pendingCount = 0;

    const activeCategories: string[] = [];

    roomItems.forEach(item => {
      const itemId = item.id || (item as any).tempId;
      const status: ItemExecutionStatus = (itemId && itemStatuses[itemId]) ? itemStatuses[itemId] : 'pending';
      const cat = (item.cat || item.category || 'General').toLowerCase();

      if (status === 'completed') {
        completedCount++;
      } else if (status === 'in_progress') {
        inProgressCount++;
        activeCategories.push(cat);
      } else {
        pendingCount++;
      }
    });

    const isAnyItemTracked = roomItems.some(item => {
      const itemId = item.id || (item as any).tempId;
      return itemId && itemStatuses[itemId] && itemStatuses[itemId] !== 'pending';
    });

    if (isAnyItemTracked || (completedCount > 0 || inProgressCount > 0)) {
      const progress = Math.round(((completedCount * 1.0 + inProgressCount * 0.5) / roomItems.length) * 100);
      const summary = `${completedCount}/${roomItems.length} items completed${inProgressCount > 0 ? `, ${inProgressCount} in progress` : ''}`;

      let stage = 'Carpentry & Assembly';
      if (progress === 100) {
        // Check quality check status
        const checkedState = projectContext.qualityChecklist?.checkedState || {};
        const roomChecks = checkedState[roomKey] || (room.name ? checkedState[room.name] : {}) || {};
        const passedChecksCount = Object.entries(roomChecks).filter(([_, v]) => Boolean(v)).length;
        stage = passedChecksCount >= 4 ? 'Handover Completed' : 'Fixtures & Final Snagging';
      } else if (progress >= 80) {
        stage = 'Painting & Finishes';
      } else if (progress >= 50) {
        stage = activeCategories.some(c => c.includes('wood') || c.includes('carpentry') || c.includes('kitchen') || c.includes('wardrobe'))
          ? 'Carpentry & Assembly'
          : 'Painting & Finishes';
      } else if (progress >= 30) {
        stage = activeCategories.some(c => c.includes('ceiling') || c.includes('pop'))
          ? 'False Ceiling & Framing'
          : 'Civil & MEP Layouts';
      } else if (progress > 0) {
        stage = 'Demolition & Marking';
      } else {
        stage = 'Pending Execution Start';
      }

      return {
        stage,
        progress,
        reasoning: `Calculated from ${roomItems.length} room items`,
        itemProgressSummary: summary
      };
    }
  }

  // 3. Fallback: Pre-execution / draft stage check
  const isExecutionStarted = ['execution', 'work_paused', 'completed'].includes(projectContext?.status || '');
  if (!isExecutionStarted && projectContext?.status && !['negotiation', 'won'].includes(projectContext.status)) {
    return { stage: 'Pending Execution Start', progress: 0, reasoning: 'Awaiting execution phase' };
  }

  // 4. Quality checklist checks for this room
  const checkedState = projectContext.qualityChecklist?.checkedState || {};
  const roomChecks = checkedState[roomKey] || (room.name ? checkedState[room.name] : {}) || {};
  const passedChecksCount = Object.entries(roomChecks).filter(([_, v]) => Boolean(v)).length;

  // 5. Snags for this room
  const roomSnags = (projectContext.snagList || []).filter(s => {
    const sRoomId = (s.roomId || '').toLowerCase();
    const sRoomName = (s.roomName || '').toLowerCase();
    return (
      (room.id && sRoomId === room.id.toLowerCase()) ||
      (room.name && (sRoomName === roomNameLower || sRoomName.includes(roomNameLower) || roomNameLower.includes(sRoomName)))
    );
  });
  const openSnags = roomSnags.filter(s => s.status !== 'verified').length;

  const hasWoodwork = roomItems.length === 0 || roomItems.some(i => {
    const cat = (i.cat || i.category || '').toLowerCase();
    return cat.includes('wood') || cat.includes('carpentry') || cat.includes('furniture') || cat.includes('wardrobe') || cat.includes('kitchen');
  });

  // 6. Execution Bundles state
  const getBundleStatus = (codeOrTradeKeywords: string[]) => {
    const match = bundles.find(b => {
      const codeMatch = codeOrTradeKeywords.includes(b.code);
      const tradeMatch = codeOrTradeKeywords.some(k => (b.trade || '').toLowerCase().includes(k) || (b.name || '').toLowerCase().includes(k));
      return codeMatch || tradeMatch;
    });
    return match?.status || 'pending';
  };

  const civilStatus = getBundleStatus(['EB-01', 'EB-02', 'civil', 'demolition']);
  const mepStatus = getBundleStatus(['EB-03', 'EB-11', 'plumbing', 'electrical']);
  const ceilingStatus = getBundleStatus(['EB-08', 'ceiling']);
  const flooringStatus = getBundleStatus(['EB-04', 'EB-05', 'flooring', 'tiling']);
  const carpentryStatus = getBundleStatus(['EB-06', 'EB-07', 'EB-10', 'carpentry', 'woodwork', 'kitchen']);

  // Quality check / snag closure completed gate
  if (passedChecksCount >= 5 && openSnags === 0 && (carpentryStatus === 'completed' || !hasWoodwork)) {
    return {
      stage: 'Handover Completed',
      progress: 100,
      reasoning: 'Quality checks passed with 0 open snags'
    };
  }

  if (passedChecksCount >= 2 || (openSnags > 0 && carpentryStatus === 'completed')) {
    const progress = Math.min(95, 90 + Math.floor((passedChecksCount / 6) * 8));
    return {
      stage: 'Fixtures & Final Snagging',
      progress,
      reasoning: `Final snagging (${passedChecksCount}/6 checks, ${openSnags} snags)`
    };
  }

  // Carpentry stage
  if (carpentryStatus === 'completed') {
    return {
      stage: 'Painting & Finishes',
      progress: 80,
      reasoning: 'Carpentry done, finishing in progress'
    };
  }

  if (carpentryStatus === 'active') {
    return {
      stage: 'Carpentry & Assembly',
      progress: 65,
      reasoning: 'Carpentry & carcass installation active'
    };
  }

  // Ceiling & Flooring stage
  if (ceilingStatus === 'completed' || flooringStatus === 'completed') {
    return {
      stage: hasWoodwork ? 'Carpentry & Assembly' : 'Painting & Finishes',
      progress: 55,
      reasoning: 'False ceiling & flooring laid'
    };
  }

  if (ceilingStatus === 'active') {
    return {
      stage: 'False Ceiling & Framing',
      progress: 45,
      reasoning: 'Ceiling framing active'
    };
  }

  // MEP / Civil stage
  if (mepStatus === 'completed' || mepStatus === 'active') {
    return {
      stage: 'Civil & MEP Layouts',
      progress: 30,
      reasoning: 'MEP and conduit routing underway'
    };
  }

  if (civilStatus === 'active' || civilStatus === 'completed') {
    return {
      stage: 'Demolition & Marking',
      progress: 20,
      reasoning: 'Civil marking & demolition active'
    };
  }

  // Mobilization / initial start
  if (isExecutionStarted) {
    return {
      stage: 'Demolition & Marking',
      progress: 15,
      reasoning: 'Site mobilization started'
    };
  }

  return {
    stage: 'Pending Execution Start',
    progress: 0,
    reasoning: 'Awaiting execution commencement'
  };
}

export default function RoomProgressTracker({ projectContext, setProjectContext, boq = [], bundles = [] }: Props) {
  const rooms = projectContext.rooms || [];
  const weeklyRoomProgress = projectContext.weeklyRoomProgress || {};
  const itemExecutionStatuses = projectContext.itemExecutionStatuses || {};

  // Expanded room drawers state for item breakdown
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});

  // Deterministic room key resolution
  const getRoomKey = (room: Room, idx: number): string => {
    return room.id || room.name || `room-${idx}`;
  };

  const toggleRoomExpand = (roomKey: string) => {
    setExpandedRooms(prev => ({
      ...prev,
      [roomKey]: !prev[roomKey]
    }));
  };

  // Get current room progress & stage with fallback to derived data
  const getRoomState = (room: Room, idx: number) => {
    const roomKey = getRoomKey(room, idx);
    // Ignore legacy "undefined" key
    const roomData = (weeklyRoomProgress[roomKey] && roomKey !== 'undefined')
      ? weeklyRoomProgress[roomKey]
      : (room.id && weeklyRoomProgress[room.id] && room.id !== 'undefined')
        ? weeklyRoomProgress[room.id]
        : (room.name && weeklyRoomProgress[room.name] && room.name !== 'undefined')
          ? weeklyRoomProgress[room.name]
          : null;

    if (roomData && Object.keys(roomData).length > 0) {
      const activeStageKey = Object.keys(roomData)[0] || 'Current';
      const item = roomData[activeStageKey];
      if (item && typeof item.progress === 'number' && item.stage) {
        return {
          progress: item.progress,
          stage: item.stage,
          isManual: true,
          reasoning: 'Custom set'
        };
      }
    }

    const derived = deriveRoomProgress(room, projectContext, boq, bundles);
    return {
      progress: derived.progress,
      stage: derived.stage,
      isManual: false,
      reasoning: derived.reasoning,
      itemProgressSummary: derived.itemProgressSummary
    };
  };

  // Handle individual item status change in a specific room
  const handleItemStatusChange = (room: Room, idx: number, itemId: string, newStatus: ItemExecutionStatus) => {
    const roomKey = getRoomKey(room, idx);
    const roomName = room.name;
    const roomNameLower = (room.name || '').toLowerCase().trim();

    // Get all items in this room
    const roomItems = boq.filter(item => {
      const iRoom = (item.roomId || (item as any).room || (item as any).roomName || '').toLowerCase();
      return iRoom === roomNameLower || (room.id && iRoom === room.id.toLowerCase());
    });

    // Compute updated item statuses map
    const nextItemStatuses = {
      ...(projectContext.itemExecutionStatuses || {}),
      [itemId]: newStatus
    };

    // Calculate this room's updated progress
    let completedCount = 0;
    let inProgressCount = 0;
    roomItems.forEach(item => {
      const iId = item.id || (item as any).tempId;
      const st = iId === itemId ? newStatus : (iId && nextItemStatuses[iId]) ? nextItemStatuses[iId] : 'pending';
      if (st === 'completed') completedCount++;
      else if (st === 'in_progress') inProgressCount++;
    });

    const newProgress = roomItems.length > 0 
      ? Math.round(((completedCount * 1.0 + inProgressCount * 0.5) / roomItems.length) * 100)
      : (newStatus === 'completed' ? 100 : newStatus === 'in_progress' ? 50 : 0);

    // Compute active stage for this room
    let newStage = getRoomState(room, idx).stage;
    if (newProgress === 100) {
      newStage = 'Handover Completed';
    } else if (newProgress >= 80) {
      newStage = 'Painting & Finishes';
    } else if (newProgress >= 50) {
      newStage = 'Carpentry & Assembly';
    } else if (newProgress >= 30) {
      newStage = 'False Ceiling & Framing';
    } else if (newProgress > 0) {
      newStage = 'Civil & MEP Layouts';
    }

    setProjectContext(prev => {
      const existing = { ...(prev.weeklyRoomProgress || {}) };
      delete existing['undefined'];

      const currentRoomData = existing[roomKey] || (roomName ? existing[roomName] : {}) || {};
      const activeStageKey = Object.keys(currentRoomData)[0] || 'Current';

      const updatedData = {
        ...currentRoomData,
        [activeStageKey]: {
          progress: newProgress,
          stage: newStage
        }
      };

      const nextWeekly = {
        ...existing,
        [roomKey]: updatedData
      };

      if (room.id) {
        nextWeekly[room.id] = updatedData;
      }
      if (roomName) {
        nextWeekly[roomName] = updatedData;
      }

      return {
        ...prev,
        itemExecutionStatuses: nextItemStatuses,
        weeklyRoomProgress: nextWeekly
      };
    });
  };

  // Bulk update all items in a single room
  const handleBulkSetRoomItems = (room: Room, idx: number, status: ItemExecutionStatus) => {
    const roomKey = getRoomKey(room, idx);
    const roomName = room.name;
    const roomNameLower = (room.name || '').toLowerCase().trim();

    const roomItems = boq.filter(item => {
      const iRoom = (item.roomId || (item as any).room || (item as any).roomName || '').toLowerCase();
      return iRoom === roomNameLower || (room.id && iRoom === room.id.toLowerCase());
    });

    const nextItemStatuses = { ...(projectContext.itemExecutionStatuses || {}) };
    roomItems.forEach(item => {
      const itemId = item.id || (item as any).tempId;
      if (itemId) {
        nextItemStatuses[itemId] = status;
      }
    });

    const newProgress = status === 'completed' ? 100 : status === 'in_progress' ? 50 : 0;
    const newStage = status === 'completed' ? 'Handover Completed' : status === 'in_progress' ? 'Carpentry & Assembly' : 'Pending Execution Start';

    setProjectContext(prev => {
      const existing = { ...(prev.weeklyRoomProgress || {}) };
      delete existing['undefined'];

      const currentRoomData = existing[roomKey] || (roomName ? existing[roomName] : {}) || {};
      const activeStageKey = Object.keys(currentRoomData)[0] || 'Current';

      const updatedData = {
        ...currentRoomData,
        [activeStageKey]: {
          progress: newProgress,
          stage: newStage
        }
      };

      const nextWeekly = {
        ...existing,
        [roomKey]: updatedData
      };

      if (room.id) {
        nextWeekly[room.id] = updatedData;
      }
      if (roomName) {
        nextWeekly[roomName] = updatedData;
      }

      return {
        ...prev,
        itemExecutionStatuses: nextItemStatuses,
        weeklyRoomProgress: nextWeekly
      };
    });
  };

  const handleProgressChange = (room: Room, idx: number, newProgress: number) => {
    const roomKey = getRoomKey(room, idx);
    const roomName = room.name;

    setProjectContext(prev => {
      const existing = { ...(prev.weeklyRoomProgress || {}) };
      delete existing['undefined']; // Clean up legacy artifact

      const currentRoomData = existing[roomKey] || (roomName ? existing[roomName] : {}) || {};
      const activeStageKey = Object.keys(currentRoomData)[0] || 'Current';
      const currentStageData = currentRoomData[activeStageKey] || { 
        stage: getRoomState(room, idx).stage || 'Pending Execution Start' 
      };

      const updatedData = {
        ...currentRoomData,
        [activeStageKey]: {
          ...currentStageData,
          progress: newProgress
        }
      };

      const nextWeekly = {
        ...existing,
        [roomKey]: updatedData
      };

      if (room.id) {
        nextWeekly[room.id] = updatedData;
      }
      if (roomName) {
        nextWeekly[roomName] = updatedData;
      }

      return {
        ...prev,
        weeklyRoomProgress: nextWeekly
      };
    });
  };

  const handleStageChange = (room: Room, idx: number, newStage: string) => {
    const roomKey = getRoomKey(room, idx);
    const roomName = room.name;

    setProjectContext(prev => {
      const existing = { ...(prev.weeklyRoomProgress || {}) };
      delete existing['undefined']; // Clean up legacy artifact

      const currentRoomData = existing[roomKey] || (roomName ? existing[roomName] : {}) || {};
      const activeStageKey = Object.keys(currentRoomData)[0] || 'Current';
      const currentStageData = currentRoomData[activeStageKey] || { 
        progress: getRoomState(room, idx).progress ?? 0 
      };

      const updatedData = {
        ...currentRoomData,
        [activeStageKey]: {
          ...currentStageData,
          stage: newStage
        }
      };

      const nextWeekly = {
        ...existing,
        [roomKey]: updatedData
      };

      if (room.id) {
        nextWeekly[room.id] = updatedData;
      }
      if (roomName) {
        nextWeekly[roomName] = updatedData;
      }

      return {
        ...prev,
        weeklyRoomProgress: nextWeekly
      };
    });
  };

  // Derive and sync all rooms at once
  const handleAutoDeriveAll = () => {
    const newWeekly: Record<string, Record<string, { progress: number; stage: string }>> = {};
    
    rooms.forEach((room, idx) => {
      const roomKey = getRoomKey(room, idx);
      const derived = deriveRoomProgress(room, projectContext, boq, bundles);
      const stageObj = {
        Current: {
          progress: derived.progress,
          stage: derived.stage
        }
      };
      newWeekly[roomKey] = stageObj;
      if (room.id) {
        newWeekly[room.id] = stageObj;
      }
      if (room.name) {
        newWeekly[room.name] = stageObj;
      }
    });

    setProjectContext(prev => ({
      ...prev,
      weeklyRoomProgress: newWeekly
    }));
  };

  // Re-derive a single room
  const handleAutoDeriveSingle = (room: Room, idx: number) => {
    const roomKey = getRoomKey(room, idx);
    const derived = deriveRoomProgress(room, projectContext, boq, bundles);
    const stageObj = {
      Current: {
        progress: derived.progress,
        stage: derived.stage
      }
    };

    setProjectContext(prev => {
      const existing = { ...(prev.weeklyRoomProgress || {}) };
      delete existing['undefined'];
      const nextWeekly = {
        ...existing,
        [roomKey]: stageObj
      };
      if (room.id) {
        nextWeekly[room.id] = stageObj;
      }
      if (room.name) {
        nextWeekly[room.name] = stageObj;
      }
      return {
        ...prev,
        weeklyRoomProgress: nextWeekly
      };
    });
  };

  // Calculate overall average progress across all rooms
  const avgProgress = useMemo(() => {
    if (rooms.length === 0) return 0;
    const total = rooms.reduce((sum, r, idx) => sum + getRoomState(r, idx).progress, 0);
    return Math.round(total / rooms.length);
  }, [rooms, weeklyRoomProgress, projectContext, boq, bundles, itemExecutionStatuses]);

  if (rooms.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden mt-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
        <div>
          <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 uppercase tracking-wide">
            <Building className="w-4 h-4 text-[#3D52A0]" />
            Room Progress Sync (Client Portal)
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Auto-calculates individual room progress from BOQ item execution statuses, trade bundles, and quality checks.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200/60 text-[#3D52A0] font-bold text-xs">
            <span className="text-[10px] uppercase tracking-wider text-sky-700">Site Avg:</span>
            <span>{avgProgress}%</span>
          </div>

          <button
            type="button"
            onClick={handleAutoDeriveAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-[#3D52A0] hover:border-sky-300 font-bold text-xs shadow-2xs hover:shadow-xs transition-all cursor-pointer"
            title="Automatically compute all room stages and percentages from item statuses, active trades, quality checks, and snags"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Auto-Derive All</span>
          </button>
        </div>
      </div>

      {/* Room Rows */}
      <div className="p-6 divide-y divide-slate-100">
        {rooms.map((room, idx) => {
          const roomKey = getRoomKey(room, idx);
          const state = getRoomState(room, idx);
          const isExpanded = Boolean(expandedRooms[roomKey]);

          // Room item count from BOQ
          const roomItems = boq.filter(i => {
            const iRoom = (i.roomId || (i as any).room || (i as any).roomName || '').toLowerCase();
            const rName = (room.name || '').toLowerCase();
            return iRoom === rName || (room.id && iRoom === room.id.toLowerCase());
          });

          // Compute item breakdown counts for badge
          const completedItemCount = roomItems.filter(item => {
            const itemId = item.id || (item as any).tempId;
            return itemId && itemExecutionStatuses[itemId] === 'completed';
          }).length;

          const inProgressItemCount = roomItems.filter(item => {
            const itemId = item.id || (item as any).tempId;
            return itemId && itemExecutionStatuses[itemId] === 'in_progress';
          }).length;

          return (
            <div key={roomKey} className="py-4 first:pt-0 last:pb-0 group">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Room Info & Stage Selector */}
                <div className="w-full lg:w-5/12 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-slate-900 text-sm truncate">{room.name}</span>
                      {room.size > 0 && (
                        <span className="text-[10px] font-semibold text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                          {room.size} {room.unit || 'sq ft'}
                        </span>
                      )}
                      {roomItems.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleRoomExpand(roomKey)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                            isExpanded 
                              ? 'bg-[#3D52A0] text-white' 
                              : completedItemCount > 0 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 hover:bg-emerald-100' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Click to view & update individual item installation status"
                        >
                          <PackageCheck className="w-3 h-3" />
                          <span>{completedItemCount}/{roomItems.length} Items Done</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAutoDeriveSingle(room, idx)}
                      className="text-[10px] font-bold text-slate-400 hover:text-sky-600 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-sky-50 transition-colors shrink-0 cursor-pointer"
                      title={`Re-derive ${room.name} from site ops signals (${state.reasoning})`}
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>Derive</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={state.stage}
                      onChange={(e) => handleStageChange(room, idx, e.target.value)}
                      className="text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#3D52A0] focus:ring-1 focus:ring-[#3D52A0] w-full transition-colors cursor-pointer"
                    >
                      {STAGES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      {!STAGES.includes(state.stage as any) && (
                        <option key={state.stage} value={state.stage}>{state.stage}</option>
                      )}
                    </select>
                  </div>
                </div>

                {/* Progress Slider & Percentage Badge */}
                <div className="w-full lg:w-7/12 flex items-center gap-4">
                  <div className="flex-1 flex flex-col gap-1">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={state.progress}
                      onChange={(e) => handleProgressChange(room, idx, parseInt(e.target.value, 10))}
                      className="w-full accent-[#3D52A0] h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                      <span>0%</span>
                      <span className="text-[10px] text-slate-500 font-sans italic truncate max-w-[240px] text-center">
                        {state.itemProgressSummary || state.reasoning}
                      </span>
                      <span>100%</span>
                    </div>
                  </div>

                  <div className="w-16 shrink-0 text-right">
                    <span className={`inline-block px-2 py-1 rounded-lg text-xs font-black font-mono border ${
                      state.progress === 100 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : state.progress > 0 
                          ? 'bg-sky-50 text-[#3D52A0] border-sky-200' 
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {state.progress}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Expandable Individual Items Checklist */}
              {isExpanded && roomItems.length > 0 && (
                <div className="mt-3.5 pl-2 sm:pl-4 border-l-2 border-[#3D52A0]/30 bg-slate-50/50 rounded-r-xl p-3.5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        {room.name} Items Checklist ({roomItems.length})
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        • Toggling an item auto-calculates {room.name} progress
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleBulkSetRoomItems(room, idx, 'completed')}
                        className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-md transition-colors cursor-pointer"
                      >
                        ✓ Mark All Done
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkSetRoomItems(room, idx, 'pending')}
                        className="text-[10px] font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-md transition-colors cursor-pointer"
                      >
                        Reset All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {roomItems.map((item, itemIdx) => {
                      const itemId = item.id || (item as any).tempId || `${roomKey}-item-${itemIdx}`;
                      const currentStatus: ItemExecutionStatus = (itemId && itemExecutionStatuses[itemId]) ? itemExecutionStatuses[itemId] : 'pending';
                      const itemCat = item.cat || item.category || 'General';

                      return (
                        <div 
                          key={itemId}
                          className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-3 ${
                            currentStatus === 'completed'
                              ? 'bg-emerald-50/70 border-emerald-200/80'
                              : currentStatus === 'in_progress'
                                ? 'bg-amber-50/70 border-amber-200/80'
                                : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-800 truncate" title={item.name}>
                                {item.name}
                              </span>
                              <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-100 px-1 py-0.2 rounded shrink-0">
                                {itemCat}
                              </span>
                            </div>
                            {item.specs && (
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                {item.specs}
                              </p>
                            )}
                          </div>

                          {/* 3-State Status Pills */}
                          <div className="flex items-center gap-1 shrink-0 bg-slate-100/80 p-0.5 rounded-md border border-slate-200/60">
                            <button
                              type="button"
                              onClick={() => handleItemStatusChange(room, idx, itemId, 'pending')}
                              className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-colors cursor-pointer ${
                                currentStatus === 'pending'
                                  ? 'bg-white text-slate-700 shadow-2xs font-black'
                                  : 'text-slate-400 hover:text-slate-600'
                              }`}
                              title="Pending Installation"
                            >
                              Pending
                            </button>
                            <button
                              type="button"
                              onClick={() => handleItemStatusChange(room, idx, itemId, 'in_progress')}
                              className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-colors cursor-pointer ${
                                currentStatus === 'in_progress'
                                  ? 'bg-amber-500 text-white shadow-2xs font-black'
                                  : 'text-slate-400 hover:text-amber-600'
                              }`}
                              title="In Progress"
                            >
                              In Prog
                            </button>
                            <button
                              type="button"
                              onClick={() => handleItemStatusChange(room, idx, itemId, 'completed')}
                              className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-colors flex items-center gap-0.5 cursor-pointer ${
                                currentStatus === 'completed'
                                  ? 'bg-emerald-600 text-white shadow-2xs font-black'
                                  : 'text-slate-400 hover:text-emerald-600'
                              }`}
                              title="Installation Completed"
                            >
                              <Check className="w-2.5 h-2.5" />
                              <span>Done</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
