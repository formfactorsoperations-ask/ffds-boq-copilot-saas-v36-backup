import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Home, 
  Building2, 
  Target, 
  BarChart3, 
  Settings, 
  Library, 
  Users, 
  CreditCard, 
  Globe, 
  PanelLeftClose, 
  PanelLeft,
  Database,
  LogOut,
  ChevronDown,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Cloud,
  HardDrive
} from 'lucide-react';
import { AIStatus } from '../types';
import AIStatusIndicator from './AIStatusIndicator';
import { useOrg } from '../contexts/OrgContext';
import { FFDSLogo } from './FFDSLogo';
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
  autoCollapse?: boolean;
  isHidden?: boolean;
}

const TABS = [
  { id: 'home', label: 'Home', icon: Home, section: 'STUDIO', roles: ['Admin', 'Ops Director', 'Site Supervisor', 'Designer'] },
  { id: 'projects', label: 'Projects', icon: Building2, section: 'STUDIO', roles: ['Admin', 'Ops Director', 'Site Supervisor', 'Designer'] },
  { id: 'clients', label: 'Clients', icon: Users, section: 'STUDIO', roles: ['Admin', 'Ops Director', 'Site Supervisor', 'Designer'] },
  { id: 'reports', label: 'Reports', icon: BarChart3, section: 'STUDIO', roles: ['Admin', 'Ops Director'] },
  
  { id: 'studio-settings', label: 'Studio Settings', icon: Settings, section: 'STUDIO ADMIN', roles: ['Admin', 'Ops Director'] },
  { id: 'admin-templates-bank', label: 'Templates & Bank', icon: Library, section: 'STUDIO ADMIN', roles: ['Admin', 'Ops Director'] },
  
  { id: 'saas-dashboard', label: 'Platform Admin', icon: Globe, section: 'PLATFORM', roles: ['Super Admin'] },
];

const TAB_THEMES: Record<string, { iconColor: string; bgLight: string; borderColor: string; activeGradient: string }> = {
  'home': { iconColor: 'text-sky-600', bgLight: 'bg-sky-50', borderColor: 'border-sky-100', activeGradient: 'from-sky-500 to-sky-600' },
  'projects': { iconColor: 'text-[#0066CC]', bgLight: 'bg-sky-50', borderColor: 'border-sky-100', activeGradient: 'from-sky-500 to-[#0066CC]' },
  'clients': { iconColor: 'text-blue-500', bgLight: 'bg-blue-50', borderColor: 'border-blue-100', activeGradient: 'from-blue-500 to-blue-600' },
  'reports': { iconColor: 'text-cyan-600', bgLight: 'bg-cyan-50', borderColor: 'border-cyan-100', activeGradient: 'from-cyan-500 to-cyan-600' },
  'studio-settings': { iconColor: 'text-slate-600', bgLight: 'bg-slate-100', borderColor: 'border-slate-200', activeGradient: 'from-slate-500 to-slate-600' },
  'admin-templates-bank': { iconColor: 'text-teal-600', bgLight: 'bg-teal-50', borderColor: 'border-teal-100', activeGradient: 'from-teal-500 to-teal-600' },
  'saas-dashboard': { iconColor: 'text-rose-500', bgLight: 'bg-rose-50', borderColor: 'border-rose-100', activeGradient: 'from-rose-500 to-rose-600' },
};

const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  aiStatus, 
  logo, 
  onLogout, 
  className, 
  projectContext,
  autoCollapse = false,
  isHidden = false
}) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const { orgData, currentRole, currentUserAuth } = useOrg();
  
  const isCloud = db.isCloud;
  const activeLogo = logo || orgData?.orgLogo || orgData?.customLogo || (orgData as any)?.logoUrl;
  const userInitial = orgData?.orgName?.charAt(0).toUpperCase() || 
                      currentUserAuth?.displayName?.charAt(0).toUpperCase() || 
                      currentUserAuth?.email?.charAt(0).toUpperCase() || 
                      'S';
  const userName = currentUserAuth?.displayName || 
                   (currentUserAuth?.email ? currentUserAuth.email.split('@')[0] : 'Studio User');

  // Stored user preference
  const [userPref, setUserPref] = useState<boolean | null>(() => {
    const stored = localStorage.getItem('ffds_sidebar_collapsed');
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return null;
  });

  // Global Font, Theme & Compact Layout sync
  useEffect(() => {
    const applyPersonalization = () => {
      const font = localStorage.getItem('ffds_global_font') || 'jakarta';
      const theme = localStorage.getItem('ffds_global_theme') || 'milky-white';
      const compact = localStorage.getItem('ffds_compact_mode') === 'true';

      const fontClasses = ['font-choice-jakarta', 'font-choice-opensans', 'font-choice-playfair', 'font-choice-system'];
      fontClasses.forEach(cls => document.body.classList.remove(cls));
      document.body.classList.add(`font-choice-${font}`);

      const themeClasses = ['theme-milky-white', 'theme-dark-blue', 'theme-light-blue', 'theme-light-orange'];
      themeClasses.forEach(cls => document.body.classList.remove(cls));
      document.body.classList.add(`theme-${theme}`);

      if (compact) {
        document.body.classList.add('compact-density');
      } else {
        document.body.classList.remove('compact-density');
      }
      window.dispatchEvent(new Event('resize'));
    };

    applyPersonalization();
    window.addEventListener('storage', applyPersonalization);
    window.addEventListener('ffds_personalization_change', applyPersonalization);
    return () => {
      window.removeEventListener('storage', applyPersonalization);
      window.removeEventListener('ffds_personalization_change', applyPersonalization);
    };
  }, []);

  const [isHovered, setIsHovered] = useState(false);

  // Effective collapsed state
  const collapsed = userPref !== null ? userPref : !!autoCollapse;
  const isExpanded = !collapsed || isHovered;

  const toggleSidebar = () => {
    const next = !collapsed;
    setUserPref(next);
    localStorage.setItem('ffds_sidebar_collapsed', String(next));
    window.dispatchEvent(new Event('sidebar-toggle'));
  };

  // Set CSS variable `--sidebar-w` on `<html>`
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      if (isHidden || isMobile) {
        document.documentElement.style.setProperty('--sidebar-w', '0px');
      } else {
        const widthStr = collapsed ? '72px' : '250px';
        document.documentElement.style.setProperty('--sidebar-w', widthStr);
      }
      window.dispatchEvent(new Event('sidebar-toggle'));
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [collapsed, isHidden]);

  // Filter allowed tabs based on role and operations email
  const allowedTabs = React.useMemo(() => {
    return TABS.filter(tab => {
      if (tab.id === 'saas-dashboard') {
        return currentUserAuth?.email === 'formfactors.operations@gmail.com';
      }
      if (tab.roles) {
        if (currentRole === 'Super Admin' && currentUserAuth?.email === 'formfactors.operations@gmail.com') return true;
        if (currentRole === 'Super Admin' && currentUserAuth?.email !== 'formfactors.operations@gmail.com') return false;
        return tab.roles.includes(currentRole as any);
      }
      return true;
    });
  }, [currentRole, currentUserAuth?.email]);

  // Group tabs by section
  const sections = React.useMemo(() => {
    const grouped: Record<string, typeof TABS> = {};
    allowedTabs.forEach(tab => {
      const sec = tab.section || 'STUDIO';
      if (!grouped[sec]) grouped[sec] = [];
      grouped[sec].push(tab);
    });
    return Object.entries(grouped);
  }, [allowedTabs]);

  if (isHidden) return null;

  return (
    <>
      <aside 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`fixed top-0 left-0 bottom-0 z-[100] glass-light border-r border-sky-100 text-slate-800 flex flex-col justify-between transition-all duration-300 ${
          isExpanded ? 'w-[250px] shadow-2xl md:shadow-sm' : 'w-[72px] shadow-sm'
        } ${className || ''}`}
      >
        {/* Top Section: Brand & Navigation */}
        <div className="flex flex-col flex-1 min-h-0">
          
          {/* Header Brand & Dedicated Logo Space */}
          {isExpanded ? (
            <div className="p-3.5 border-b border-sky-100 flex items-center justify-between gap-2 shrink-0 bg-transparent">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Studio Logo Container Slot */}
                <div className="w-10 h-10 rounded-xl bg-white border border-sky-100 shadow-sm flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
                  {activeLogo ? (
                    <img src={activeLogo} alt="Studio Logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <FFDSLogo mode="icon" className="w-full h-full" />
                  )}
                </div>
                
                <div className="flex flex-col min-w-0">
                  <span className="font-['Plus_Jakarta_Sans'] text-xs font-black tracking-tight text-slate-900 truncate uppercase">
                    {orgData?.orgName ? orgData.orgName : "STUDIO COPILOT"}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] font-mono font-extrabold text-[#0055B3] uppercase bg-sky-100/90 border border-sky-200/80 px-2 py-0.5 rounded-md">
                      {currentRole}
                    </span>
                  </div>
                </div>
              </div>

              {/* Collapse Toggle Button */}
              <motion.button
                whileHover={{ scale: 1.1, rotate: -5 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleSidebar}
                className="p-1.5 rounded-xl text-slate-400 hover:text-[#0055B3] hover:bg-sky-50 border border-transparent hover:border-sky-200 transition-all shrink-0 cursor-pointer"
                title="Collapse Sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </motion.button>
            </div>
          ) : (
            <div className="p-3 border-b border-slate-200 flex flex-col items-center gap-2 shrink-0 bg-white/90">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 shadow-xs flex items-center justify-center p-1 shrink-0 overflow-hidden">
                {activeLogo ? (
                  <img src={activeLogo} alt="Studio Logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <FFDSLogo mode="icon" className="w-full h-full" />
                )}
              </div>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleSidebar}
                className="p-1.5 rounded-xl text-slate-400 hover:text-[#0055B3] hover:bg-sky-50 transition-all cursor-pointer"
                title="Expand Sidebar"
              >
                <PanelLeft className="w-4 h-4 text-[#0066CC]" />
              </motion.button>
            </div>
          )}

          {/* Active Project Banner (if inside a project) */}
          {projectContext?.name && isExpanded && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-3 mt-3 p-2.5 rounded-xl bg-gradient-to-r from-sky-500/10 via-amber-500/10 to-sky-500/10 border border-sky-200/80 flex items-center justify-between gap-2 shrink-0 shadow-2xs"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-2 h-2 rounded-full bg-[#0066CC] animate-pulse" />
                  <span className="text-[9px] font-mono font-black text-[#0055B3] uppercase tracking-wider">
                    ACTIVE WORKSPACE
                  </span>
                </div>
                <p className="text-xs font-black text-slate-900 truncate font-['Plus_Jakarta_Sans']">
                  {projectContext.name}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setActiveTab('dashboard')}
                className="p-1.5 rounded-lg bg-[#0066CC] text-white hover:bg-[#0055B3] transition-all cursor-pointer shadow-xs"
                title="Go to Project Dashboard"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </motion.button>
            </motion.div>
          )}

          {/* Navigation Items (Scrollable List) */}
          <div className={`flex-1 overflow-y-auto scrollbar-none ${isExpanded ? 'p-3' : 'px-2 py-3'} space-y-4`}>
            {sections.map(([sectionName, sectionTabs]) => (
              <div key={sectionName} className="space-y-1.5">
                {isExpanded && (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0066CC]" />
                    <p className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
                      {sectionName}
                    </p>
                  </div>
                )}
                {sectionTabs.map(tab => {
                  const isActive = activeTab === tab.id;
                  const Icon = tab.icon;
                  const theme = TAB_THEMES[tab.id] || { iconColor: 'text-[#0066CC]', bgLight: 'bg-sky-100/90', borderColor: 'border-sky-200', activeGradient: 'from-[#0066CC] to-[#0055B3]' };

                  return (
                    <motion.button
                      key={tab.id}
                      whileHover={{ scale: 1.02, x: !isExpanded ? 0 : 4 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setActiveTab(tab.id)}
                      title={!isExpanded ? tab.label : undefined}
                      className={`relative w-full group flex transition-all duration-200 outline-none cursor-pointer rounded-xl text-xs ${
                        isActive
                          ? 'text-sky-900 bg-white shadow-sm border border-sky-100/60'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-sky-50/50'
                      } ${!isExpanded ? 'flex-col items-center justify-center py-2.5 px-1' : 'flex-row items-center gap-3 px-3 py-2'}`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="verticalSidebarActiveBar"
                          className={`absolute bg-sky-500 ${
                            !isExpanded 
                              ? 'top-0 left-2 right-2 h-0.5 rounded-b-full' 
                              : 'left-0 top-2 bottom-2 w-1 rounded-r-full'
                          }`}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      {/* Plush Icon */}
                      <div className={`transition-all shrink-0 flex items-center justify-center ${
                        isActive 
                           ? `${theme.iconColor} drop-shadow-sm`
                          : `${theme.iconColor} opacity-70 group-hover:opacity-100`
                      }`}>
                        <Icon className="w-5 h-5 stroke-[1.8]" />
                      </div>

                      {isExpanded && (
                        <span className={`truncate font-['Plus_Jakarta_Sans'] ${isActive ? 'font-black tracking-tight' : 'font-bold tracking-tight text-slate-600 group-hover:text-slate-900'}`}>
                          {tab.label}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Section: Utility & User Profile */}
        <div className={`border-t border-slate-200/80 bg-transparent shrink-0 flex flex-col ${isExpanded ? 'p-3 gap-2.5' : 'p-2 py-4'}`}>
          {isExpanded ? (
            <div className="flex flex-col gap-2.5">
              
              {/* Cloud Sync & AI Status */}
              <div className="flex items-center justify-between px-1">
                <button
                  onClick={() => setIsConfigOpen(true)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] font-bold border transition-all cursor-pointer ${
                    isCloud
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-300'
                      : 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-300'
                  }`}
                >
                  {isCloud ? <Cloud className="w-2.5 h-2.5" /> : <HardDrive className="w-2.5 h-2.5" />}
                  <span>{isCloud ? 'CLOUD' : 'LOCAL'}</span>
                </button>
                <div className="scale-95 origin-right">
                  <AIStatusIndicator status={aiStatus} />
                </div>
              </div>

              {/* User Profile, Logout & Collapse */}
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0055B3] to-sky-600 text-white flex items-center justify-center font-black text-xs shadow-sm shrink-0">
                    {userInitial}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-extrabold text-slate-900 truncate font-['Plus_Jakarta_Sans']">
                      {userName}
                    </span>
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase truncate">
                      {currentRole}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {onLogout && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={onLogout}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="Sign Out"
                    >
                      <LogOut className="w-4 h-4" />
                    </motion.button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={toggleSidebar}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                    title="Collapse Sidebar"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {/* Compact Combined Avatar & Indicators */}
              <div className="relative">
                <div 
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-800 to-sky-700 text-white flex items-center justify-center shadow-sm shrink-0 cursor-pointer border-2 border-transparent hover:border-sky-300 transition-all"
                  title={`${userName} (${currentRole})`}
                >
                  <span className="font-black text-sm">{userInitial}</span>
                </div>
                {/* AI Status Dot */}
                <div 
                  className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${aiStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-rose-500'}`} 
                  title={aiStatus === 'online' ? 'System Online' : 'System Offline'} 
                />
                {/* Cloud Sync Icon */}
                <div 
                  onClick={() => setIsConfigOpen(true)}
                  className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center cursor-pointer shadow-sm ${isCloud ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`} 
                  title={isCloud ? 'Cloud Sync Active' : 'Local Storage'}
                >
                  {isCloud ? <Cloud className="w-2.5 h-2.5" /> : <HardDrive className="w-2.5 h-2.5" />}
                </div>
              </div>
              
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleSidebar}
                className="p-1.5 rounded-xl text-slate-400 hover:text-[#0066CC] hover:bg-sky-50 transition-all cursor-pointer"
                title="Expand Sidebar"
              >
                <PanelLeft className="w-4 h-4" />
              </motion.button>
            </div>
          )}
        </div>
      </aside>
      
      <CloudConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />
    </>
  );
};

export default Sidebar;

