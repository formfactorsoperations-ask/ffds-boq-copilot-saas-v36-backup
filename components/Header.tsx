import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
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
import { PWAInstallPrompt } from './PWAInstallPrompt';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  aiStatus: AIStatus;
  logo?: string;
  onLogout?: () => void;
  className?: string;
  pendingCommsCount?: number;
  commsHealthScore?: number;
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
  autoCollapse = false,
  isHidden = false
}) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  /* Two disclosure menus on the bar, dismissed together so neither is left
     hanging open behind the other. */
  /*
    The sliding indicator.

    Measured with a layout effect and moved with an inline transform under a
    CSS transition, NOT with framer-motion's layoutId — that silently resolves
    to `transform: none` in this codebase and the pill simply never moves.
    offsetLeft/offsetWidth against the track are reliable, and a ResizeObserver
    keeps it honest when the bar reflows.
  */
  const trackRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  /* Bumped whenever the reticle re-locks, so the sweep animation restarts
     rather than playing once and never again. */
  const [lockKey, setLockKey] = useState(0);
  useEffect(() => { setLockKey(k => k + 1); }, [activeTab]);

  /*
    Travel state for the reticle.

    A pill that simply slides reads as a rectangle changing coordinates. One
    that stretches as it launches and settles as it lands reads as a single
    object with mass — so `stretch` is applied for the first ~190ms of the
    journey, anchored to the edge it is travelling away from, and `echo`
    leaves a fading ghost at the position it left.
  */
  const prevLeft = useRef<number | null>(null);
  const [stretch, setStretch] = useState(1);
  const [origin, setOrigin] = useState<'left' | 'right'>('left');
  const [echo, setEcho] = useState<{ left: number; width: number; key: number } | null>(null);
  const [adminMenu, setAdminMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  useEffect(() => {
    if (!adminMenu && !userMenu) return;
    const close = () => { setAdminMenu(false); setUserMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [adminMenu, userMenu]);

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
      /* The bar occupies height, never width. `--sidebar-w` is kept and pinned
         at zero rather than deleted, because layout code across the app still
         reads it; `--topbar-h` is the measurement that now matters. */
      /* A window can report width 0 — minimised, or restored from a
         background tab — and treating that as "mobile" published a 0px
         offset while the bar was still on screen, sliding the page under it.
         Zero means unknown, so assume desktop. */
      const w = window.innerWidth;
      const isMobile = w > 0 && w < 768;
      document.documentElement.style.setProperty('--sidebar-w', '0px');
      document.documentElement.style.setProperty('--topbar-h', (isHidden || isMobile) ? '0px' : '74px');
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

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const el = track.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
      if (!el) { setPill(null); return; }
      const next = { left: el.offsetLeft, width: el.offsetWidth };
      const from = prevLeft.current;
      if (from !== null && Math.abs(from - next.left) > 4) {
        const distance = Math.abs(from - next.left);
        setOrigin(next.left > from ? 'left' : 'right');
        setStretch(1 + Math.min(distance / 1050, 0.32));
        setEcho({ left: from, width: el.offsetWidth, key: Date.now() });
        window.setTimeout(() => setStretch(1), 190);
        window.setTimeout(() => setEcho(null), 520);
      }
      prevLeft.current = next.left;
      setPill(prev =>
        prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.width - next.width) < 0.5
          ? prev
          : next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [activeTab, allowedTabs.length]);

  if (isHidden) return null;

  /*
    ── The studio bar, as instrumentation ──────────────────────────────────

    The brief was Iron Man, so the borrowed language is the HUD rather than
    the armour: an arc reactor for the brand mark and the account, a reticle
    that locks onto the active destination instead of a flat highlight, an
    energy rail along the bottom edge, and telemetry set in mono.

    Deliberately NOT dark. A charcoal-and-gold bar would look the part for a
    day and then fight every milky-white surface behind it, and the studio's
    blue is already the right colour for this — arc reactors are blue. The
    cyan is the energy accent, used only where something is live.
  */
  const primary = allowedTabs.filter(t => (t.section || 'STUDIO') === 'STUDIO');
  const secondary = allowedTabs.filter(t => (t.section || 'STUDIO') !== 'STUDIO');

  const navBtn = (tab: typeof TABS[number], quiet: boolean, idx: number) => {
    const Icon = tab.icon;
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        data-tab={tab.id}
        style={{ animationDelay: `${Math.min(idx, 9) * 45}ms` }}
        onClick={() => setActiveTab(tab.id)}
        aria-current={isActive ? 'page' : undefined}
        title={tab.label}
        className={`hud-rise group relative z-10 flex items-center gap-2 rounded-lg whitespace-nowrap cursor-pointer
                    transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50
                    ${quiet ? 'px-2.5 py-1.5 text-[12.5px]' : 'px-3 py-1.5 text-[13px]'}
                    ${isActive
                      ? 'text-white font-bold'
                      : quiet
                        ? 'text-slate-400 hover:text-[#0055B3] font-semibold'
                        : 'text-slate-500 hover:text-[#0055B3] font-bold'}`}
      >
        {/* Hover bracket — the reticle's ghost, before you commit. */}
        {!isActive && (
          <span aria-hidden="true"
                className="absolute inset-0 rounded-lg border border-transparent
                           group-hover:border-sky-200/90 group-hover:bg-sky-50/60
                           transition-colors duration-200" />
        )}
        <Icon className={`relative w-4 h-4 shrink-0 transition-transform duration-200 ease-out
                          ${isActive ? 'scale-110 drop-shadow-[0_0_5px_rgba(103,232,249,.85)]'
                                     : 'group-hover:-translate-y-0.5 group-hover:scale-110'}`} />
        <span className={`relative tracking-tight ${quiet ? 'hidden xl:inline' : 'hidden sm:inline'}`}>
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-[100] h-[74px] flex items-center gap-2.5 px-4 sm:px-6
                    bg-gradient-to-b from-white to-[#F5F9FD] backdrop-blur-xl
                    border-b border-slate-200/70 ${className || ''}`}
      >
        {/* Energy rail — the one ambient motion on the bar. */}
        <span aria-hidden="true" className="hud-rail absolute bottom-0 left-0 right-0 h-px" />

        {/* Brand: reactor + wordmark */}
        <button
          onClick={() => setActiveTab('home')}
          title="Home"
          className="group flex items-center gap-2.5 shrink-0 pr-1 cursor-pointer outline-none"
        >
          {logo
            ? <img src={logo} alt="" className="h-10 w-auto max-w-[200px] object-contain transition-transform duration-300 group-hover:scale-[1.04]" />
            : <FFDSLogo className="h-10 w-auto transition-transform duration-300 group-hover:scale-[1.04]" />}
        </button>

        <span className="w-px h-6 bg-gradient-to-b from-transparent via-slate-200 to-transparent shrink-0 hidden sm:block" />

        {/* Destinations — the reticle locks onto whichever is active */}
        <nav
          ref={trackRef}
          className="relative flex items-center gap-0.5 min-w-0 overflow-x-auto scrollbar-none py-1"
          aria-label="Studio"
        >
          {echo && (
            <span
              key={echo.key}
              aria-hidden="true"
              className="hud-echo absolute top-1 bottom-1 rounded-lg bg-[#0066CC]/45 pointer-events-none"
              style={{ transform: `translateX(${echo.left}px)`, width: `${echo.width}px` }}
            />
          )}

          {pill && (
            <span
              aria-hidden="true"
              className="nav-pill hud-reticle absolute top-1 bottom-1 rounded-lg
                         bg-gradient-to-b from-[#1a7fd4] to-[#0055B3] pointer-events-none overflow-hidden"
              style={{
                transform: `translateX(${pill.left}px) scaleX(${stretch})`,
                transformOrigin: `${origin} center`,
                width: `${pill.width}px`,
                transition: 'transform .42s cubic-bezier(.34,1.16,.44,1), width .42s cubic-bezier(.34,1.16,.44,1)',
              }}
            >
              <span key={lockKey} className="hud-sweep absolute inset-y-0 w-1/3" />
            </span>
          )}

          {primary.map((t, i) => navBtn(t, false, i))}

          {secondary.length > 0 && (
            <span className="w-px h-5 bg-gradient-to-b from-transparent via-slate-200 to-transparent shrink-0 mx-1.5" aria-hidden="true" />
          )}

          {secondary.map((t, i) => navBtn(t, true, primary.length + i))}
        </nav>

        <div className="flex-1 min-w-[8px]" />

        {/* Mobile App PWA Install Prompt */}
        <div className="hidden sm:block shrink-0">
          <PWAInstallPrompt variant="pill" label="Mobile App" />
        </div>

        {/* Telemetry */}
        <button
          onClick={() => setIsConfigOpen(true)}
          title={isCloud ? 'Cloud sync active — configure' : 'Local storage — configure'}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg shrink-0 cursor-pointer
                      font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] border
                      transition-all duration-200 hover:-translate-y-px ${
            isCloud
              ? 'bg-emerald-50/80 text-emerald-700 border-emerald-200 hover:border-emerald-300 hover:shadow-[0_0_12px_rgba(16,185,129,.22)]'
              : 'bg-amber-50/80 text-amber-700 border-amber-200 hover:border-amber-300 hover:shadow-[0_0_12px_rgba(245,158,11,.22)]'
          }`}
        >
          <span className="relative flex w-1.5 h-1.5 shrink-0">
            {isCloud && <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500 opacity-60 animate-ping" />}
            <span className={`relative inline-flex w-1.5 h-1.5 rounded-full ${isCloud ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </span>
          {isCloud ? <Cloud className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
          <span>{isCloud ? 'CLOUD' : 'LOCAL'}</span>
        </button>

        <div className="hidden lg:block scale-90 origin-right shrink-0">
          <AIStatusIndicator status={aiStatus} />
        </div>

        {/* Account — the second reactor */}
        <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => { setUserMenu(v => !v); setAdminMenu(false); }}
            aria-expanded={userMenu}
            aria-haspopup="menu"
            title={`${userName} (${currentRole})`}
            className="group flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-xl hover:bg-sky-50/80
                       transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          >
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0a6fd0] to-[#0044A0] text-white
                             flex items-center justify-center font-black text-[13px] shrink-0
                             ring-1 ring-cyan-300/40 shadow-[0_2px_10px_rgba(0,102,204,.30)]
                             transition-transform duration-200 group-hover:scale-105">
              {userInitial}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${userMenu ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {userMenu && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 top-full mt-2.5 w-64 bg-white rounded-2xl border border-slate-200
                           shadow-[0_18px_50px_rgba(2,32,71,.18)] py-1.5 z-[110] origin-top-right overflow-hidden"
              >
                <span aria-hidden="true" className="hud-rail absolute top-0 left-0 right-0 h-px" />

                <div className="px-3.5 py-3 border-b border-slate-100 flex items-center gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#0a6fd0] to-[#0044A0] text-white
                                   flex items-center justify-center font-black text-base shrink-0
                                   ring-1 ring-cyan-300/40 shadow-[0_2px_12px_rgba(0,102,204,.30)]">
                    {userInitial}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-extrabold text-slate-900 truncate leading-tight">{userName}</p>
                    <p className="text-[9.5px] font-mono font-bold text-[#0066CC] uppercase tracking-[0.14em] mt-0.5">
                      {currentRole}
                    </p>
                  </div>
                </div>

                <button
                  role="menuitem"
                  onClick={() => { setUserMenu(false); setIsConfigOpen(true); }}
                  className="group w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold
                             text-slate-600 hover:bg-sky-50 hover:text-[#0055B3] transition-colors cursor-pointer"
                >
                  {isCloud
                    ? <Cloud className="w-4 h-4 opacity-70 transition-transform group-hover:scale-110" />
                    : <HardDrive className="w-4 h-4 opacity-70 transition-transform group-hover:scale-110" />}
                  Storage &amp; sync
                </button>

                {onLogout && (
                  <button
                    role="menuitem"
                    onClick={() => { setUserMenu(false); onLogout(); }}
                    className="group w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold
                               text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 opacity-70 transition-transform group-hover:translate-x-0.5" />
                    Sign out
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <CloudConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />
    </>
  );
};

export default Sidebar;

