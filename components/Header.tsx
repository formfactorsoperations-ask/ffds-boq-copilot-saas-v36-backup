
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, LayoutDashboard, FileEdit, Brain, Wrench, Send, Settings, Globe } from 'lucide-react';
import { 
  SparklesIcon,
  CompareIcon,
  AnalyticsIcon,
  DashboardIcon,
  BOQIcon,
  BrainIcon,
  EnvelopeIcon,
  HardHatIcon,
  ListIcon,
  BuildingOfficeIcon,
  ClipboardListIcon,
  CalculatorIcon,
  PhotoIcon
} from './Icons';
import { AIStatus } from '../types';
import AIStatusIndicator from './AIStatusIndicator';
import { useOrg } from '../contexts/OrgContext';
import { FFDSLogo } from './FFDSLogo';
import { db as firestoreDb } from '../services/firebaseClient';
import { db } from '../services/dbService';
import CloudConfigModal from './CloudConfigModal';
import { ProjectContext } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  aiStatus: AIStatus;
  logo?: string;
  onLogout?: () => void;
  className?: string;
  pendingCommsCount?: number;
  commsHealthScore?: number;
  projectContext?: ProjectContext;
}

// Custom Icons for consistency - Colorful Versions
const VisionIcon = () => <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">👁️</span>;
const TimelineIcon = () => <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">📅</span>;
const MaterialIcon = () => <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">🎨</span>;
const ClientIcon = () => <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">💼</span>;
const BankIcon = () => <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">📚</span>;
const StrategyIcon = () => <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">🧠</span>;
const PromptIcon = () => <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">💬</span>;
const ExecutionIcon = () => <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">🚧</span>;
const ContractIcon = () => <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">📜</span>;
const OnboardingIcon = () => <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">🤝</span>;
const GlobeIcon = () => <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">🌍</span>;

const TABS = [
  { id: 'projects', label: 'My Projects', icon: <BuildingOfficeIcon className="w-5 h-5 text-slate-700" />, group: 'STUDIO', roles: ['Admin', 'Ops Director', 'Site Supervisor'] },
  { id: 'project-journey', label: 'Project Journey', icon: <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">🗺️</span>, group: 'STUDIO', roles: ['Admin', 'Ops Director', 'Site Supervisor'] },
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon className="w-5 h-5 text-blue-500" />, group: 'STUDIO', roles: ['Admin', 'Ops Director', 'Site Supervisor', 'Vendor'] },
  
  { id: 'boq-editor', label: 'Studio Editor', icon: <BOQIcon className="w-5 h-5 text-indigo-500" />, group: 'BOQ & Proposals', roles: ['Admin', 'Ops Director'] },
  { id: 'ops', label: 'Versions', icon: <CompareIcon className="w-5 h-5 text-teal-500" />, group: 'BOQ & Proposals', roles: ['Admin', 'Ops Director'] },
  { id: 'payment-calc', label: 'Payment Calc', icon: <CalculatorIcon className="w-5 h-5 text-indigo-500" />, group: 'BOQ & Proposals', roles: ['Admin', 'Ops Director'] },
  
  { id: 'leadiq', label: 'LeadIQ War Room', icon: <BrainIcon className="w-5 h-5 text-fuchsia-500" />, group: 'Strategy & AI', roles: ['Admin', 'Ops Director'] },
  
  { id: 'revision-studio', label: 'Revision Studio (V1)', icon: <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">🔄</span>, group: 'Design', roles: ['Admin', 'Ops Director'] },
  { id: 'drawing-tracker', label: 'Drawing Tracker', icon: <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">📐</span>, group: 'Design', roles: ['Admin', 'Ops Director', 'Site Supervisor'] },
  { id: 'scope-additions', label: 'Scope Additions', icon: <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">➕</span>, group: 'Design', roles: ['Admin', 'Ops Director', 'Site Supervisor'] },
  { id: 'site-ops', label: 'Execution & Ops', icon: <HardHatIcon className="w-5 h-5 text-amber-500" />, group: 'Execution', roles: ['Admin', 'Ops Director', 'Site Supervisor'] },
  { id: 'timeline', label: 'Timeline', icon: <TimelineIcon />, group: 'Execution', roles: ['Admin', 'Ops Director', 'Site Supervisor'] },
  { id: 'materials', label: 'SOF & Selections', icon: <MaterialIcon />, group: 'Execution', roles: ['Admin', 'Ops Director', 'Site Supervisor', 'Vendor'] },
  
  { id: 'terms-docket', label: 'Terms Docket', icon: <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">📜</span>, group: 'Client Outputs', roles: ['Admin', 'Ops Director'] },
  { id: 'payment-schedule', label: 'Payment Schedule', icon: <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">📋</span>, group: 'Client Outputs', roles: ['Admin', 'Ops Director'] },
  { id: 'handover-docket', label: 'Handover Docket', icon: <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">🏆</span>, group: 'Client Outputs', roles: ['Admin', 'Ops Director'] },
  { id: 'client', label: 'Client Proposal', icon: <ClientIcon />, group: 'Client Outputs', roles: ['Admin', 'Ops Director'] },
  { id: 'client-portal', label: 'Client Portal Preview', icon: <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">🌐</span>, group: 'Client Outputs', roles: ['Admin', 'Ops Director'] },
  { id: 'onboarding', label: 'Onboarding Kit', icon: <OnboardingIcon />, group: 'Client Outputs', roles: ['Admin', 'Ops Director'] },
  { id: 'contract', label: 'Contract', icon: <ContractIcon />, group: 'Client Outputs', roles: ['Admin', 'Ops Director'] },
  { id: 'execution-agreement', label: 'Execution Agreement', icon: <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">✍️</span>, group: 'Client Outputs', roles: ['Admin', 'Ops Director'] },
  { id: 'emails', label: 'Email Scripts', icon: <EnvelopeIcon className="w-5 h-5 text-indigo-500" />, group: 'Client Outputs', roles: ['Admin', 'Ops Director'] },
  { id: 'comms-tracker', label: 'Comms Tracker', icon: <span className="text-lg grayscale-0 filter hover:brightness-110 transition-all">📬</span>, group: 'Client Outputs', roles: ['Admin', 'Ops Director'] },
  { id: 'analytics', label: 'Analytics', icon: <AnalyticsIcon className="w-5 h-5 text-amber-500" />, group: 'Client Outputs', roles: ['Admin', 'Ops Director'] },
  
  { id: 'templates', label: 'Std. Templates', icon: <ListIcon className="w-5 h-5 text-orange-500" />, group: 'Admin', roles: ['Admin', 'Ops Director'] },
  { id: 'bank', label: 'Item Bank', icon: <BankIcon />, group: 'Admin', roles: ['Admin'] },
  { id: 'ai-settings', label: 'AI Strategy', icon: <StrategyIcon />, group: 'Admin', roles: ['Admin'] },
  { id: 'terms-and-payment', label: 'Terms & Payment', icon: <Settings className="w-5 h-5 text-slate-500" />, group: 'Admin', roles: ['Admin', 'Ops Director'] },

  { id: 'studio-settings', label: 'Studio Settings', icon: <Settings className="w-5 h-5 text-slate-500" />, group: 'Pinned', roles: ['Admin', 'Ops Director'] },
  { id: 'saas-dashboard', label: 'Platform Admin', icon: <GlobeIcon />, group: 'Pinned', roles: ['Super Admin'] },
];

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, aiStatus, logo, onLogout, className, pendingCommsCount = 0, commsHealthScore = 0, projectContext }) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const { orgData, currentRole, currentUserAuth } = useOrg();
  
  const { topTabs, pinnedTabs, navGroups } = React.useMemo(() => {
    const allowed = TABS.filter(tab => {
        if (tab.id === 'saas-dashboard') {
            return currentUserAuth?.email === 'formfactors.operations@gmail.com';
        }
        if (tab.roles) {
            if (currentRole === 'Super Admin' && currentUserAuth?.email === 'formfactors.operations@gmail.com') return true;
            if (currentRole === 'Super Admin' && currentUserAuth?.email !== 'formfactors.operations@gmail.com') return false; // Safety
            return tab.roles.includes(currentRole as any);
        }
        return true;
    });
    const top = allowed.filter(tab => tab.group !== 'Pinned');
    const pinned = allowed.filter(tab => tab.group === 'Pinned');
    
    const grouped = top.reduce((acc, tab) => {
      if (!acc[tab.group]) {
        acc[tab.group] = [];
      }
      acc[tab.group].push(tab);
      return acc;
    }, {} as Record<string, typeof TABS>);
    
    const getGroupIcon = (groupName: string, fallback: React.ReactNode) => {
      const lower = groupName.toLowerCase();
      if (lower.includes('overview') || lower.includes('project') || lower.includes('studio')) return <LayoutDashboard className="w-5 h-5 text-blue-500" />;
      if (lower.includes('boq') || lower.includes('management') || lower.includes('proposal')) return <FileEdit className="w-5 h-5 text-indigo-500" />;
      if (lower.includes('strategy') || lower.includes('ai')) return <Brain className="w-5 h-5 text-fuchsia-500" />;
      if (lower.includes('design')) return <span className="text-lg w-5 h-5 flex items-center justify-center grayscale-0 filter hover:brightness-110 transition-all">📐</span>;
      if (lower.includes('execution') || lower.includes('site')) return <Wrench className="w-5 h-5 text-amber-500" />;
      if (lower.includes('client')) return <Send className="w-5 h-5 text-teal-500" />;
      if (lower.includes('admin') && lower.includes('platform')) return <Globe className="w-5 h-5 text-indigo-400" />;
      if (lower.includes('admin')) return <Settings className="w-5 h-5 text-slate-500" />;
      
      return fallback;
    };

    const groups = Object.entries(grouped || {}).map(([groupName, tabs]) => ({
      id: groupName.toLowerCase().replace(/\s+/g, '-'),
      label: groupName,
      icon: getGroupIcon(groupName, tabs[0].icon),
      children: tabs
    }));
    
    return { topTabs: top, pinnedTabs: pinned, navGroups: groups };
  }, [currentRole]);

  useEffect(() => {
    const parentGroup = navGroups.find(g => g.children.some(c => c.id === activeTab));
    if (parentGroup) {
      setOpenGroup(parentGroup.id);
    }
  }, [activeTab, navGroups]);

  const MotionNav = motion.nav as any;
  const MotionDiv = motion.div as any;

  const isCloud = db.isCloud;

  return (
    <>
    <MotionNav 
        className={`fixed top-0 left-0 h-full w-64 glass-light p-4 flex flex-col overflow-hidden z-[100] print:hidden ${className || ''}`}
    >
      {/* Top Scrollable Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col gap-6 -mx-2 px-2 pb-4">
        {/* Header with Custom Logo Support */}
        <div className="px-1 pt-2">
          <div className="flex items-center gap-3">
              <FFDSLogo className="" mode="icon" customLogo={logo} />
              {!logo && (
                  <div className="flex flex-col">
                      <span 
                          className="font-extrabold text-lg tracking-tight block leading-none"
                          style={{ color: orgData.themeColor || '#1e293b' }}
                      >
                          {orgData.orgName.split(' ').slice(0, 2).join(' ').toUpperCase() || 'STUDIO'}
                      </span>
                      <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mt-0.5">
                          {orgData.orgName.split(' ').slice(2).join(' ') || 'OS'}
                      </span>
                  </div>
              )}
              {logo && (
                   <div>
                      <span className="font-extrabold text-lg tracking-tight text-indigo-900 block leading-none">{orgData.orgName || 'PROJECT'}</span>
                      <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Copilot</span>
                  </div>
              )}
          </div>
        </div>

        {/* Navigation Links */}
        <div className="space-y-2 flex-1">
          {navGroups.map(group => {
            const isOpen = openGroup === group.id;
            const hasActiveChild = group.children.some(c => c.id === activeTab);
            
            return (
              <div key={group.id} className="flex flex-col">
                <button
                  onClick={() => setOpenGroup(isOpen ? null : group.id)}
                  title={group.label}
                  className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 group outline-none border-l-2 ${
                    hasActiveChild && isOpen 
                      ? 'border-blue-600 bg-slate-50 text-indigo-950' 
                      : hasActiveChild 
                        ? 'border-transparent text-indigo-950 bg-slate-100/80 shadow-sm' 
                        : 'border-transparent text-slate-500 hover:text-indigo-900 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`relative z-10 w-5 h-5 flex items-center justify-center transition-transform group-hover:scale-110 ${hasActiveChild && !isOpen ? 'scale-110' : ''}`}>
                      {group.icon}
                    </span>
                    <span className="relative z-10 flex-1 text-left">{group.label}</span>
                  </div>
                  <span className="relative z-10">
                    {isOpen ? <ChevronUp className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
                  </span>
                </button>
                
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pl-4 pr-1 py-1 space-y-1">
                        {group.children.map(tab => {
                          const isActive = activeTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id)}
                              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 group outline-none ${isActive ? 'text-blue-700' : 'text-slate-500 hover:text-indigo-900'}`}
                            >
                              {isActive && (
                                  <MotionDiv
                                      layoutId="activeTab"
                                      className="absolute inset-0 bg-blue-50/50 shadow-sm border border-blue-100 rounded-xl"
                                      initial={false}
                                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                  />
                              )}
                              <span className={`relative z-10 w-5 h-5 flex items-center justify-center transition-transform group-hover:scale-110 ${isActive ? 'scale-110' : ''}`}>
                                  {tab.icon}
                              </span>
                              <span className="relative z-10 flex-1 text-left">{tab.label}</span>
                              {tab.id === 'project-journey' && projectContext?.journeySummary && (
                                  <span className={`relative z-10 inline-flex items-center justify-center px-2 py-0.5 ml-auto text-xs font-bold rounded-full ${projectContext.journeySummary.pct === 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100/80 text-amber-600 border border-amber-200'}`}>
                                      {projectContext.journeySummary.pct === 100 ? '✓' : (projectContext.journeySummary.active || 0)}
                                  </span>
                              )}
                              {tab.id === 'comms-tracker' && pendingCommsCount > 0 && (
                                <span className="relative z-10 inline-flex items-center justify-center px-2 py-0.5 ml-auto text-xs font-bold text-white bg-rose-500 rounded-full">
                                  {pendingCommsCount}
                                </span>
                              )}
                              {tab.id === 'comms-tracker' && pendingCommsCount === 0 && commsHealthScore === 100 && (
                                <span className="relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-xs font-bold text-emerald-600 bg-emerald-100 rounded-full">
                                  ✓
                                </span>
                              )}
                              {tab.id === 'boq-editor' && (
                                <span className={`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg ${
                                  projectContext?.boqFrozen ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-amber-600 bg-amber-100/80 border border-amber-200'
                                }`}>
                                  {projectContext?.boqFrozen ? 'Frozen' : 'WIP'}
                                </span>
                              )}
                              {tab.id === 'materials' && (
                                <span className={`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg ${
                                  projectContext?.sofFreezeDate ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-amber-600 bg-amber-100/80 border border-amber-200'
                                }`}>
                                  {projectContext?.sofFreezeDate ? 'Frozen' : 'WIP'}
                                </span>
                              )}
                              {tab.id === 'contract' && (
                                <span className={`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg ${
                                  projectContext?.contractSignoff?.status === 'signed' ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200'
                                  : projectContext?.contractSignoff?.status === 'sent' ? 'text-blue-600 bg-blue-100/80 border border-blue-200'
                                  : 'text-slate-500 bg-slate-100 border border-slate-200'
                                }`}>
                                  {projectContext?.contractSignoff?.status === 'signed' ? 'Signed' : projectContext?.contractSignoff?.status === 'sent' ? 'Sent' : 'Draft'}
                                </span>
                              )}
                              {tab.id === 'execution-agreement' && (
                                <span className={`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg ${
                                  (projectContext as any)?.executionSignoff?.status === 'signed' ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200'
                                  : (projectContext as any)?.executionSignoff?.status === 'sent' ? 'text-blue-600 bg-blue-100/80 border border-blue-200'
                                  : 'text-slate-500 bg-slate-100 border border-slate-200'
                                }`}>
                                  {(projectContext as any)?.executionSignoff?.status === 'signed' ? 'Signed' : (projectContext as any)?.executionSignoff?.status === 'sent' ? 'Sent' : 'Draft'}
                                </span>
                              )}
                              {tab.id === 'client' && (
                                <span className={`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg ${
                                  projectContext?.approvedTierId ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-rose-600 bg-rose-100/80 border border-rose-200'
                                }`}>
                                  {projectContext?.approvedTierId ? 'Approved' : 'Pending'}
                                </span>
                              )}
                              {tab.id === 'timeline' && (
                                <span className={`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg ${
                                  projectContext?.timelinePhases?.length ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-amber-600 bg-amber-100/80 border border-amber-200'
                                }`}>
                                  {projectContext?.timelinePhases?.length ? 'Set' : 'Pending'}
                                </span>
                              )}
                              {tab.id === 'terms-docket' && (
                                <span className={`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg ${
                                  (projectContext?.engagement?.status === 'issued' || projectContext?.engagement?.status === 'acknowledged')
                                    ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-rose-600 bg-rose-100/80 border border-rose-200'
                                }`}>
                                  {projectContext?.engagement?.status === 'acknowledged' ? 'Ack' : projectContext?.engagement?.status === 'issued' ? 'Issued' : 'Draft'}
                                </span>
                              )}
                              {tab.id === 'payment-schedule' && (
                                <span className={`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg ${
                                  (projectContext?.engagement?.status === 'issued' || projectContext?.engagement?.status === 'acknowledged')
                                    ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-amber-600 bg-amber-100/80 border border-amber-200'
                                }`}>
                                  {projectContext?.engagement?.status === 'acknowledged' ? 'Ack' : projectContext?.engagement?.status === 'issued' ? 'Issued' : 'Draft'}
                                </span>
                              )}
                              {tab.id === 'handover-docket' && (
                                <span className={`relative z-10 inline-flex items-center justify-center px-1.5 py-0.5 ml-auto text-[10px] font-bold rounded-lg ${
                                  projectContext?.handoverDate ? 'text-emerald-600 bg-emerald-100/80 border border-emerald-200' : 'text-rose-600 bg-rose-100/80 border border-rose-200'
                                }`}>
                                  {projectContext?.handoverDate ? 'Issued' : 'Draft'}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Pinned Navigation Links Moved to Scrollable */}
        <div className="mt-auto pt-4 border-t border-slate-100 space-y-1 pb-2">
          {pinnedTabs.map(tab => {
            const isActive = activeTab === tab.id || (tab.id === 'studio-settings' && ['team', 'subscription', 'setup-wizard'].includes(activeTab));
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 group outline-none ${isActive ? 'text-blue-700' : 'text-slate-500 hover:text-indigo-900'}`}
              >
                {isActive && (
                    <MotionDiv
                        layoutId="activeTab"
                        className="absolute inset-0 bg-blue-50/50 shadow-sm border border-blue-100 rounded-xl"
                        initial={false}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                )}
                <span className={`relative z-10 w-5 h-5 flex items-center justify-center transition-transform group-hover:scale-110 ${isActive ? 'scale-110' : ''}`}>
                    {tab.icon}
                </span>
                <span className="relative z-10">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Bottom Pinned Area - Compacted */}
      <div className="flex-shrink-0 border-t border-slate-100 pt-3 mt-1 flex flex-col gap-2">
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="w-8 h-8 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ backgroundColor: orgData.themeColor || '#0f172a' }}>
                  {orgData.orgName?.charAt(0).toUpperCase() || 'S'}
              </div>
              <div className="overflow-hidden flex-1">
                  <p className="text-xs font-bold text-indigo-900 truncate" title={orgData.orgName || 'Studio Admin'}>{orgData.orgName || 'Studio Admin'}</p>
                  <p className="text-[10px] text-slate-400 font-medium truncate">Role: {currentRole}</p>
                  {currentUserAuth?.email && (
                      <p className="text-[9px] text-slate-400 truncate" title={currentUserAuth.email}>{currentUserAuth.email}</p>
                  )}
              </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div 
              onClick={() => setIsConfigOpen(true)}
              className={`cursor-pointer px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all hover:scale-105 active:scale-95 ${isCloud ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'}`}
              title="Click to Configure Database"
            >
                <span className={`w-1.5 h-1.5 rounded-full ${isCloud ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                {isCloud ? 'Cloud' : 'Local'}
            </div>

            {onLogout && (
              <button 
                onClick={onLogout}
                className="px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-[10px] font-bold transition-all hover:scale-105 active:scale-95 bg-slate-50 text-slate-600 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
              >
                Logout
              </button>
            )}
          </div>
          
          <div className="flex justify-between items-center px-1">
             <div className="transform scale-90 origin-left">
                <AIStatusIndicator status={aiStatus} />
             </div>
             <p className="text-[9px] text-slate-400 font-medium">v36.1 • Milky White</p>
          </div>
      </div>
    </MotionNav>

    <CloudConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />
    </>
  );
};

export default Sidebar;

