import React, { useEffect, useState, useMemo } from 'react';
import { Vendor, POScope, FullProjectData } from '../types';
import { db } from '../services/dbService';
import {
  Plus, Trash2, Edit3, Check, X, Search, Phone, Mail, MessageCircle, Copy, Clock, CreditCard, Boxes, Users,
  Sparkles, Download, Store, FileText, Send, Briefcase, RefreshCw, ChevronDown, LayoutGrid, List, Lock,
} from '@/lib/lucide-shim';
import { motion } from 'framer-motion';
import { useOrg } from '../contexts/OrgContext';
import BankModal from './bank/BankModal';
import { Tile } from './bank/BankCommandBar';
import { Button, Chip, EmptyState, Segmented, StateDot, INPUT, LABEL } from './ui/kit';
import { CountUp } from './ui/HudBits';
import { listV } from './people/PeopleBits';
import './playground/playground.css';
import './projectHeader/projectHeader.css';

interface Props {
  projects?: FullProjectData[];
  /*
    Reports the directory's shape upward so the library header can show it.

    The counts are held here because this is where the vendors are loaded; the
    shell has no access to them, and duplicating the load to draw one dial
    would mean two readers that could disagree.
  */
  onStats?: (stats: { total: number; active: number; reachable: number }) => void;
}

type ScopeFilter = 'all' | 'material' | 'labour' | 'turnkey' | 'active';

/*
  The Vendor directory (DESIGN.md "Item bank motion", Vendor directory).

  Top to bottom: five figures (the three kinds of supplier filter the list),
  one card with the view switch, the actions, search, sort and the filters,
  then the vendors as cards or a table. A vendor opens in a drawer; adding,
  editing, messaging and deleting each open in the shared window.
*/

const SCOPE_LABEL: Record<POScope, string> = { material: 'Material', labour: 'Labour', turnkey: 'Turnkey' } as Record<POScope, string>;
const isActive = (v: Pick<Vendor, 'active'>) => v.active !== false;
const nameKey = (name: string | undefined) => (name || '').trim().toLowerCase();
const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'V';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};
type SortOption = 'name_asc' | 'name_desc' | 'lead_asc' | 'recent';

const TRADE_CATEGORIES = [
  'Carpentry & Woodwork',
  'Modular Kitchen & Wardrobes',
  'Marble, Granite & Stone',
  'Tiles & Flooring',
  'Painting, PU & Polish',
  'False Ceiling & POP',
  'Electrical & Automation',
  'Plumbing & Sanitaryware',
  'Glass, Mirrors & Partitions',
  'Metal Fabrication & MS Work',
  'HVAC & Air Conditioning',
  'Lighting & Fixtures',
  'Hardware & Architectural Fittings',
  'Wallpaper & Wall Coverings',
  'Curtains & Soft Furnishings',
  'Civil & Masonry',
  'Deep Cleaning & Handover'
];

const PAYMENT_TERM_PRESETS = [
  '100% Advance before dispatch',
  '50% Advance, 50% on Delivery',
  '40% Advance, 40% on Delivery, 20% on Installation',
  '30% Advance, 50% on Delivery, 20% Retention',
  '15 Days Credit Period',
  '30 Days Credit Period',
  'Weekly Labour Running Bill',
  'Custom Agreement'
];

const CURATED_DEMO_VENDORS: Partial<Vendor>[] = [
  {
    name: "Estillo Surfaces & Marbles",
    supplies: ["material"],
    categories: ["Marble, Granite & Stone", "Tiles & Flooring"],
    phone: "+91 98201 44520",
    email: "orders@estillosurfaces.com",
    gstin: "27AAACE1234F1Z8",
    paymentTerms: "50% Advance, 50% on Delivery",
    defaultLeadDays: 7,
    notes: "Primary supplier for imported Italian Botticino, Statuario & composite quartz. Contact Mr. Rajesh.",
    active: true
  },
  {
    name: "Poonam Hardware & Architectural Fittings",
    supplies: ["material"],
    categories: ["Hardware & Architectural Fittings", "Modular Kitchen & Wardrobes"],
    phone: "+91 98082 23669",
    email: "sales@poonamhardware.in",
    gstin: "27ABCFP5678M1Z4",
    paymentTerms: "100% Advance before dispatch",
    defaultLeadDays: 3,
    notes: "Authorized dealer for Hafele, Hettich, Blum and custom brass handles. Delivers directly to site.",
    active: true
  },
  {
    name: "Royal Woodcrafters & Joinery",
    supplies: ["material", "labour"],
    categories: ["Carpentry & Woodwork", "Modular Kitchen & Wardrobes"],
    phone: "+91 97654 32109",
    email: "contact@royalwoodcrafters.com",
    gstin: "27AABCR9012K1Z2",
    paymentTerms: "40% Advance, 40% on Delivery, 20% on Installation",
    defaultLeadDays: 14,
    notes: "High-end bespoke carpentry team. Skilled in veneer pressing, solid wood fluting & laminate edge-banding.",
    active: true
  },
  {
    name: "Apex Modular Solutions",
    supplies: ["turnkey"],
    categories: ["Modular Kitchen & Wardrobes", "Hardware & Architectural Fittings"],
    phone: "+91 98331 99002",
    email: "projects@apexmodular.com",
    gstin: "27AACCA3456L1Z9",
    paymentTerms: "50% Advance, 50% on Delivery",
    defaultLeadDays: 21,
    notes: "Factory-finished German machinery modular carcases with 10-year warranty. Fast 3-week turnaround.",
    active: true
  },
  {
    name: "Luxe Polish & Asian Paints Pro",
    supplies: ["labour", "material"],
    categories: ["Painting, PU & Polish"],
    phone: "+91 91234 56780",
    email: "luxe.polish@gmail.com",
    gstin: "27AADCL7890N1Z3",
    paymentTerms: "Weekly Labour Running Bill",
    defaultLeadDays: 2,
    notes: "Specialized in PU Matt/Gloss spray finishing, Asian Paints Royale Aspira & concrete texture finishes.",
    active: true
  },
  {
    name: "Saint-Gobain Glass & Metalcraft",
    supplies: ["material", "turnkey"],
    categories: ["Glass, Mirrors & Partitions", "Metal Fabrication & MS Work"],
    phone: "+91 98888 12345",
    email: "studio@sgmetalcraft.com",
    gstin: "27AABCS4567P1Z5",
    paymentTerms: "50% Advance, 50% on Delivery",
    defaultLeadDays: 10,
    notes: "Fluted glass, tinted bronze mirrors, slim aluminium partition systems and brass PVD profiles.",
    active: true
  }
];

const WHATSAPP_VENDOR_TEMPLATES = [
  {
    id: "rfq",
    title: "Request for Quotation (RFQ)",
    description: "Send item specifications and request latest rate card",
    template: (vendorName: string, studioName: string) =>
      `Hi ${vendorName}, this is ${studioName}. We are preparing a new project estimate and would like to request your latest rates and availability for materials/labour. Could you please share your updated catalog/rate sheet? Thank you!`
  },
  {
    id: "po_followup",
    title: "PO & Material Dispatch Follow-up",
    description: "Check status of material processing & dispatch date",
    template: (vendorName: string, studioName: string) =>
      `Hi ${vendorName}, following up from ${studioName} regarding our pending material order. Could you kindly update us on the dispatch timeline and expected site delivery date?`
  },
  {
    id: "site_delivery",
    title: "Site Delivery & Unloading Alert",
    description: "Coordinate site supervisor and delivery address",
    template: (vendorName: string, studioName: string) =>
      `Hi ${vendorName}, greetings from ${studioName}. Our site supervisor is ready to receive the shipment today. Please share the driver's contact number and vehicle details for gate entry.`
  },
  {
    id: "payment_update",
    title: "Payment Milestone / Ledger Confirmation",
    description: "Inform vendor regarding payment transfer or invoice",
    template: (vendorName: string, studioName: string) =>
      `Hi ${vendorName}, we have initiated the payment transfer as per our agreed terms from ${studioName}. Please check your account and share the receipt / tax invoice. Thank you!`
  }
];

export default function VendorsManager({ projects = [], onStats }: Props) {
  /* Messages go out in the studio's own name. They were all signed "Form Factors Design Studio", whichever studio sent them. */
  const { orgData } = useOrg() as any;
  const studioName = orgData?.orgName || 'our studio';
  /* What an action did, said on the screen rather than in an alert. */
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  // Drawer / Modal States
  useEffect(() => {
    onStats?.({
      total: vendors.length,
      active: vendors.filter(isActive).length,
      // A directory entry nobody can contact is not a supplier, it is a note.
      reachable: vendors.filter(v => !!(v.phone || v.email)).length,
    });
  }, [vendors, onStats]);

  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [editingVendor, setEditingVendor] = useState<Partial<Vendor> | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState<Vendor | null>(null);
  const [customWhatsAppMsg, setCustomWhatsAppMsg] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    setLoading(true);
    try {
      const list = await db.getVendors();
      setVendors(list || []);
    } catch (e) {
      console.error("Failed to load vendors:", e);
    } finally {
      setLoading(false);
    }
  };

  // Copy helper with visual confirmation
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Calculate project usages for vendors
  const vendorUsageMap = useMemo(() => {
    const map = new Map<string, { projectCount: number; projectNames: string[]; materialCount: number }>();
    
    projects.forEach(project => {
      const projectName = project.context?.name || project.context?.clientName || "Untitled Project";
      const selections = project.context?.materialSelections || [];
      
      selections.forEach(sel => {
        if (!sel.vendor || !sel.vendor.trim()) return;
        const normalized = sel.vendor.trim().toLowerCase();
        
        const existing = map.get(normalized) || { projectCount: 0, projectNames: [], materialCount: 0 };
        existing.materialCount += 1;
        if (!existing.projectNames.includes(projectName)) {
          existing.projectNames.push(projectName);
          existing.projectCount += 1;
        }
        map.set(normalized, existing);
      });
    });

    return map;
  }, [projects]);

  // Seed curated demo vendors or from project selections
  const handleSeedCurated = async () => {
    const newVendors: Vendor[] = CURATED_DEMO_VENDORS.map((v, i) => ({
      id: `v_curated_${Date.now()}_${i}`,
      name: v.name || "Vendor",
      supplies: v.supplies || ['material'],
      categories: v.categories || [],
      phone: v.phone || '',
      email: v.email || '',
      gstin: v.gstin || '',
      paymentTerms: v.paymentTerms || '',
      defaultLeadDays: v.defaultLeadDays || 0,
      notes: v.notes || '',
      active: true,
      createdAt: Date.now() - i * 86400000
    }));

    const existingNames = new Set(vendors.map(v => v.name.toLowerCase().trim()));
    const filteredNew = newVendors.filter(v => !existingNames.has(v.name.toLowerCase().trim()));

    if (filteredNew.length === 0) {
      setNotice('The sample vendors are already in the directory.');
      return;
    }

    const combined = [...vendors, ...filteredNew];
    await db.saveVendors(combined);
    setVendors(combined);
    setNotice(`${filteredNew.length} sample vendors added. They are made-up examples: delete them before the directory is used for real orders.`);
  };

  const handleSeedFromProjects = async () => {
    const seedNames = new Set<string>();
    projects.forEach(p => {
      const selections = p.context?.materialSelections || [];
      selections.forEach(sel => {
        if (sel.vendor && sel.vendor.trim()) {
          seedNames.add(sel.vendor.trim());
        }
      });
    });

    if (seedNames.size === 0) {
      setNotice('No project names a vendor in its material selections yet.');
      return;
    }

    const existingNames = new Set(vendors.map(v => v.name.toLowerCase().trim()));
    const toAdd: Vendor[] = [];

    Array.from(seedNames).forEach((name, index) => {
      if (!existingNames.has(name.toLowerCase().trim())) {
        toAdd.push({
          id: `v_seed_${Date.now()}_${index}`,
          name,
          supplies: ['material'],
          categories: [],
          active: true,
          createdAt: Date.now()
        });
      }
    });

    if (toAdd.length === 0) {
      setNotice('Every vendor the projects name is already in the directory.');
      return;
    }

    const combined = [...vendors, ...toAdd];
    await db.saveVendors(combined);
    setVendors(combined);
    setNotice(`${toAdd.length} ${toAdd.length === 1 ? 'vendor' : 'vendors'} added from the projects' material selections. Open each to add a phone or email.`);
  };

  // Export vendors to CSV
  const handleExportCSV = () => {
    if (vendors.length === 0) return;
    const headers = ['Vendor Name', 'Supplies', 'Categories', 'Phone', 'Email', 'GSTIN', 'Payment Terms', 'Lead Days', 'Status', 'Notes'];
    const rows = vendors.map(v => [
      `"${(v.name || '').replace(/"/g, '""')}"`,
      `"${(v.supplies || []).join('; ')}"`,
      `"${(v.categories || []).join('; ')}"`,
      `"${v.phone || ''}"`,
      `"${v.email || ''}"`,
      `"${v.gstin || ''}"`,
      `"${(v.paymentTerms || '').replace(/"/g, '""')}"`,
      v.defaultLeadDays || 0,
      v.active !== false ? 'Active' : 'Inactive',
      `"${(v.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `studio_vendors_directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor?.name?.trim()) return;

    let updatedList: Vendor[];
    if (editingVendor.id) {
      // Edit existing
      updatedList = vendors.map(v => v.id === editingVendor.id ? { ...v, ...editingVendor } as Vendor : v);
      if (selectedVendor && selectedVendor.id === editingVendor.id) {
        setSelectedVendor({ ...selectedVendor, ...editingVendor } as Vendor);
      }
    } else {
      // Add new
      const newVendor: Vendor = {
        id: `v_${Date.now()}`,
        name: editingVendor.name.trim(),
        supplies: editingVendor.supplies && editingVendor.supplies.length > 0 ? editingVendor.supplies : ['material'],
        categories: editingVendor.categories || [],
        phone: editingVendor.phone || '',
        email: editingVendor.email || '',
        gstin: editingVendor.gstin?.toUpperCase() || '',
        paymentTerms: editingVendor.paymentTerms || '',
        defaultLeadDays: editingVendor.defaultLeadDays || 0,
        notes: editingVendor.notes || '',
        active: editingVendor.active !== false,
        createdAt: Date.now()
      };
      updatedList = [newVendor, ...vendors];
    }

    await db.saveVendors(updatedList);
    setVendors(updatedList);
    setEditingVendor(null);
    setShowAddModal(false);
  };

  const handleDeleteVendor = async (id: string) => {
    const updatedList = vendors.filter(v => v.id !== id);
    await db.saveVendors(updatedList);
    setVendors(updatedList);
    setDeleteConfirmId(null);
    if (selectedVendor?.id === id) {
      setSelectedVendor(null);
    }
  };

  const openAddModal = () => {
    setEditingVendor({
      name: '',
      supplies: ['material'],
      categories: [],
      phone: '',
      email: '',
      gstin: '',
      paymentTerms: '50% Advance, 50% on Delivery',
      defaultLeadDays: 7,
      notes: '',
      active: true
    });
    setShowAddModal(true);
  };

  const openEditModal = (v: Vendor) => {
    setEditingVendor({ ...v });
    setShowAddModal(true);
  };

  // Open WhatsApp with direct web link
  const sendWhatsApp = (vendor: Vendor, message: string) => {
    if (!vendor.phone) return;
    const cleanPhone = vendor.phone.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    window.open(url, '_blank');
    setShowWhatsAppModal(null);
  };

  // Filter & Search Logic
  const filteredVendors = useMemo(() => {
    return vendors.filter(v => {
      // Scope filter
      if (scopeFilter === 'active' && !isActive(v)) return false;
      if (scopeFilter === 'material' && !(v.supplies || []).includes('material')) return false;
      if (scopeFilter === 'labour' && !(v.supplies || []).includes('labour')) return false;
      if (scopeFilter === 'turnkey' && !(v.supplies || []).includes('turnkey')) return false;

      // Category filter
      if (selectedCategory !== 'all') {
        const cats = v.categories || [];
        if (!cats.some(c => c.toLowerCase() === selectedCategory.toLowerCase())) {
          return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (v.name || '').toLowerCase().includes(q);
        const matchPhone = (v.phone || '').toLowerCase().includes(q);
        const matchEmail = (v.email || '').toLowerCase().includes(q);
        const matchGstin = (v.gstin || '').toLowerCase().includes(q);
        const matchNotes = (v.notes || '').toLowerCase().includes(q);
        const matchCats = (v.categories || []).some(c => c.toLowerCase().includes(q));
        const matchScope = (v.supplies || []).some(s => s.toLowerCase().includes(q));

        if (!matchName && !matchPhone && !matchEmail && !matchGstin && !matchNotes && !matchCats && !matchScope) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
      if (sortBy === 'lead_asc') return (a.defaultLeadDays || 0) - (b.defaultLeadDays || 0);
      if (sortBy === 'recent') return (b.createdAt || 0) - (a.createdAt || 0);
      return 0;
    });
  }, [vendors, scopeFilter, selectedCategory, searchQuery, sortBy]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = vendors.length;
    const active = vendors.filter(isActive).length;
    const materialCount = vendors.filter(v => (v.supplies || []).includes('material')).length;
    const labourCount = vendors.filter(v => (v.supplies || []).includes('labour')).length;
    const turnkeyCount = vendors.filter(v => (v.supplies || []).includes('turnkey')).length;
    /* Over the vendors that have a lead time: one added from a project has none, and counting it as zero days pulled the average down. */
    const timed = vendors.filter(v => (v.defaultLeadDays || 0) > 0);
    const avgLead = timed.length > 0
      ? Math.round(timed.reduce((acc, v) => acc + (v.defaultLeadDays || 0), 0) / timed.length)
      : 0;

    return { total, active, materialCount, labourCount, turnkeyCount, avgLead, timed: timed.length };
  }, [vendors]);

  /* ── What the screen shows ─────────────────────────────────────────────── */

  const usageOf = (v: Vendor) => vendorUsageMap.get(nameKey(v.name)) || { projectCount: 0, projectNames: [], materialCount: 0 };
  /* The trades the directory's vendors are in, each with how many. */
  const tradeCounts = useMemo(() => {
    const n = new Map<string, number>();
    vendors.forEach(v => (v.categories || []).forEach(c => n.set(c, (n.get(c) || 0) + 1)));
    return [...n.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [vendors]);
  const filtersOn = !!searchQuery.trim() || scopeFilter !== 'all' || selectedCategory !== 'all';
  const clearFilters = () => { setSearchQuery(''); setScopeFilter('all'); setSelectedCategory('all'); };
  const toggleScope = (s: ScopeFilter) => () => setScopeFilter(scopeFilter === s ? 'all' : s);
  const openMessage = (v: Vendor) => {
    setCustomWhatsAppMsg(WHATSAPP_VENDOR_TEMPLATES[0].template(v.name, studioName));
    setShowWhatsAppModal(v);
  };
  const closeForm = () => { setShowAddModal(false); setEditingVendor(null); };

  const iconButton = 'p-1.5 rounded-lg text-slate-400 transition-colors hover:text-[#3D52A0] hover:bg-[#3D52A0]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30';
  const avatar = (v: Vendor, size = 'w-10 h-10 text-sm') => (
    <span aria-hidden className={`${size} rounded-xl grid place-items-center font-bold shrink-0 ${isActive(v) ? 'bg-[#3D52A0]/10 text-[#3D52A0]' : 'bg-slate-100 text-slate-400'}`}>{initialsOf(v.name)}</span>
  );
  /* A value with a button that copies it; the button turns to a tick for a moment. */
  const copyable = (text: string, id: string, label: string) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); handleCopy(text, id); }} className={iconButton} title={`Copy the ${label}`} aria-label={`Copy the ${label}`}>
      {copiedId === id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
  const pill = (on: boolean, onClick: () => void, label: React.ReactNode, count: number | undefined, group: string, key?: string) => (
    <button key={key} type="button" onClick={onClick} aria-pressed={on}
      className={`relative inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30 ${on ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
      {on && <motion.span layoutId={`vendor-pill-${group}`} className="absolute inset-0 rounded-full bg-[#3D52A0]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
      <span className="relative inline-flex items-center gap-1.5">{label}{count != null && <span className={`text-[11px] font-bold tabular-nums ${on ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>}</span>
    </button>
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center gap-3 hud-scanning" role="status">
        <span className="w-4 h-4 border-2 border-[#3D52A0] border-t-transparent rounded-full motion-safe:animate-spin shrink-0" />
        <span className="text-xs text-slate-600">Loading the vendor directory.</span>
      </div>
    );
  }

  const v0 = selectedVendor;
  const form = editingVendor;

  return (
    <div className="space-y-4 w-full">
      {/* The figures. The three kinds of supplier filter the list. */}
      <motion.div variants={listV} initial="hidden" animate="show" className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Tile icon={Store} label="Vendors" value={metrics.total} sub={`${metrics.active} active`} />
        <Tile icon={Boxes} label="Material" value={metrics.materialCount} sub="Supply materials and fittings"
          onClick={toggleScope('material')} on={scopeFilter === 'material'} title="Show only material suppliers" />
        <Tile icon={Users} label="Labour" value={metrics.labourCount} sub="Trade contractors"
          onClick={toggleScope('labour')} on={scopeFilter === 'labour'} title="Show only labour contractors" />
        <Tile icon={Briefcase} label="Turnkey" value={metrics.turnkeyCount} sub="Supply and install"
          onClick={toggleScope('turnkey')} on={scopeFilter === 'turnkey'} title="Show only turnkey partners" />
        <Tile icon={Clock} label="Average lead time" value={metrics.avgLead} format={(n) => `${Math.round(n)} ${Math.round(n) === 1 ? 'day' : 'days'}`}
          sub={metrics.timed ? `Across ${metrics.timed} with a lead time` : 'No lead times set yet'} wide />
      </motion.div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 hud-panel-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented label="View" value={viewMode} onChange={setViewMode}
            options={[{ id: 'grid', label: <><LayoutGrid className="w-4 h-4" aria-hidden />Cards</> }, { id: 'table', label: <><List className="w-4 h-4" aria-hidden />Table</> }]} />
          <div className="flex flex-wrap items-center gap-2">
            {vendors.length === 0 ? (
              <Button size="sm" onClick={handleSeedCurated} title="Six made-up vendors, to see how the directory works. Delete them before real use.">
                <Sparkles className="w-3.5 h-3.5 text-[#3D52A0]" aria-hidden />Load sample vendors
              </Button>
            ) : (
              <>
                <Button size="sm" icon={RefreshCw} onClick={handleSeedFromProjects} title="Add any vendor a project's material selections name that the directory does not have">Add from projects</Button>
                <Button size="sm" icon={Download} onClick={handleExportCSV} title="Download the whole directory as a CSV file">Export CSV</Button>
              </>
            )}
            <Button size="sm" variant="primary" onClick={openAddModal} className="group motion-safe:active:scale-[0.97]">
              <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" aria-hidden />Add vendor
            </Button>
          </div>
        </div>

        {notice && (
          <p role="status" className="hud-row-in flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
          </p>
        )}

        {vendors.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative grow basis-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search the vendor directory"
                  onKeyDown={(e) => { if (e.key === 'Escape' && searchQuery) { e.stopPropagation(); setSearchQuery(''); } }}
                  placeholder="Search by name, trade, phone, email, GSTIN or notes" className={`${INPUT} !rounded-xl pl-9 pr-9`} />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                )}
              </div>
              <p role="status" className="text-xs text-slate-500 whitespace-nowrap">
                <span className="font-bold text-slate-800 tabular-nums">{filteredVendors.length}</span>
                {filtersOn ? ` of ${vendors.length} vendors` : ` ${vendors.length === 1 ? 'vendor' : 'vendors'}`}
              </p>
              {filtersOn && <Button size="sm" variant="quiet" icon={X} onClick={clearFilters} className="hud-row-in">Clear filters</Button>}
              <select aria-label="Sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)} className={`${INPUT} !w-auto !rounded-xl bg-white cursor-pointer`}>
                <option value="name_asc">Name, A to Z</option>
                <option value="name_desc">Name, Z to A</option>
                <option value="lead_asc">Shortest lead time</option>
                <option value="recent">Newest first</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show">
              <span className={`${LABEL} w-14 shrink-0`}>Show</span>
              {pill(scopeFilter === 'all', () => setScopeFilter('all'), 'All', metrics.total, 'scope')}
              {pill(scopeFilter === 'active', () => setScopeFilter('active'), 'Active', metrics.active, 'scope')}
              {pill(scopeFilter === 'material', () => setScopeFilter('material'), 'Material', metrics.materialCount, 'scope')}
              {pill(scopeFilter === 'labour', () => setScopeFilter('labour'), 'Labour', metrics.labourCount, 'scope')}
              {pill(scopeFilter === 'turnkey', () => setScopeFilter('turnkey'), 'Turnkey', metrics.turnkeyCount, 'scope')}
            </div>

            {tradeCounts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Trade">
                <span className={`${LABEL} w-14 shrink-0`}>Trade</span>
                {pill(selectedCategory === 'all', () => setSelectedCategory('all'), 'All', undefined, 'trade')}
                {tradeCounts.map(([c, n]) => pill(selectedCategory.toLowerCase() === c.toLowerCase(), () => setSelectedCategory(c), c, n, 'trade', c))}
              </div>
            )}
          </>
        )}
      </section>

      {/* The vendors. */}
      <div key={viewMode} className="hud-swap">
        {vendors.length === 0 ? (
          <EmptyState icon={Store} className="bg-white" title="No vendors yet"
            text="Add the suppliers and contractors the studio buys from, so orders and messages start from their details."
            action={<Button size="sm" variant="primary" icon={Plus} onClick={openAddModal}>Add vendor</Button>} />
        ) : filteredVendors.length === 0 ? (
          <EmptyState icon={Search} className="bg-white" title="No vendor matches" text="Nothing passes the search and filters that are on."
            action={<Button size="sm" icon={X} onClick={clearFilters}>Clear filters</Button>} />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredVendors.map((v, i) => {
              const usage = usageOf(v);
              return (
                <article key={v.id} aria-label={v.name}
                  className={`group hud-row-in pp-lift bg-white rounded-2xl border p-5 flex flex-col gap-3 transition-colors hover:border-[#3D52A0]/40 ${isActive(v) ? 'border-slate-200' : 'border-slate-200 bg-slate-50'}`}
                  style={{ animationDelay: `${Math.min(i, 11) * 25}ms` }}>
                  <div className="flex items-start gap-3">
                    {avatar(v)}
                    <button type="button" onClick={() => setSelectedVendor(v)} className="min-w-0 flex-1 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D52A0]/30" title="Open this vendor">
                      <span className="block text-sm font-bold text-slate-800 break-words group-hover:text-[#3D52A0] transition-colors">{v.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500 break-words">{(v.categories || []).join(' · ') || 'No trade set'}</span>
                    </button>
                    {!isActive(v) && <Chip tone="slate">Inactive</Chip>}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(v.supplies || []).map(s => <Chip key={s} tone="brand">{SCOPE_LABEL[s] || s}</Chip>)}
                    {usage.projectCount > 0 && <Chip tone="slate" title={usage.projectNames.join(', ')}>{usage.projectCount} {usage.projectCount === 1 ? 'project' : 'projects'}</Chip>}
                  </div>

                  <dl className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                      <dt className="sr-only">Phone</dt>
                      {v.phone ? <><dd className="flex-1 min-w-0 font-semibold text-slate-700 tabular-nums truncate">{v.phone}</dd>{copyable(v.phone, `${v.id}-phone`, 'phone number')}</> : <dd className="text-slate-400">No phone</dd>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                      <dt className="sr-only">Email</dt>
                      {v.email ? <><dd className="flex-1 min-w-0 text-slate-700 truncate" title={v.email}>{v.email}</dd>{copyable(v.email, `${v.id}-email`, 'email')}</> : <dd className="text-slate-400">No email</dd>}
                    </div>
                    {v.gstin && (
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                        <dt className="sr-only">GSTIN</dt>
                        <dd className="flex-1 min-w-0 text-slate-700 tabular-nums truncate">{v.gstin}</dd>{copyable(v.gstin, `${v.id}-gstin`, 'GSTIN')}
                      </div>
                    )}
                  </dl>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
                    <span className={LABEL}>Lead time</span>
                    <span className={LABEL}>Payment terms</span>
                    <span className="text-xs font-bold text-slate-800 tabular-nums">{v.defaultLeadDays ? `${v.defaultLeadDays} ${v.defaultLeadDays === 1 ? 'day' : 'days'}` : 'Not set'}</span>
                    <span className="text-xs text-slate-700 break-words">{v.paymentTerms || 'Not set'}</span>
                  </div>

                  {v.notes && <p className="text-xs text-slate-500 line-clamp-2" title={v.notes}>{v.notes}</p>}

                  <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <Button size="sm" icon={MessageCircle} onClick={() => openMessage(v)} disabled={!v.phone} title={v.phone ? 'Write a WhatsApp message to this vendor' : 'Add a phone number to message this vendor'}>Message</Button>
                    <span className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button type="button" onClick={() => openEditModal(v)} className={iconButton} title="Edit" aria-label={`Edit ${v.name}`}><Edit3 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => setDeleteConfirmId(v.id)} className={`${iconButton} hover:!text-rose-600 hover:!bg-rose-50`} title="Delete" aria-label={`Delete ${v.name}`}><Trash2 className="w-4 h-4" /></button>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Vendor', 'Supplies', 'Phone', 'Email', 'Lead time', 'Payment terms', 'Projects'].map(h => <th key={h} scope="col" className={`${LABEL} px-3 py-3`}>{h}</th>)}
                    <th scope="col" className="w-28 px-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredVendors.map((v, i) => {
                    const usage = usageOf(v);
                    return (
                      <tr key={v.id} className={`group hud-row-in transition-colors hover:bg-slate-50 ${isActive(v) ? '' : 'text-slate-400'}`} style={{ animationDelay: `${Math.min(i, 14) * 18}ms` }}>
                        <td className="px-3 py-2.5">
                          <button type="button" onClick={() => setSelectedVendor(v)} className="flex items-center gap-2.5 text-left" title="Open this vendor">
                            {avatar(v, 'w-8 h-8 text-xs')}
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 font-semibold text-slate-800 group-hover:text-[#3D52A0]">{v.name}{!isActive(v) && <Chip tone="slate">Inactive</Chip>}</span>
                              <span className="block text-[11px] text-slate-500">{(v.categories || []).join(' · ') || 'No trade set'}</span>
                            </span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5"><span className="flex flex-wrap gap-1">{(v.supplies || []).map(s => <Chip key={s} tone="brand">{SCOPE_LABEL[s] || s}</Chip>)}</span></td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-slate-700">{v.phone || <span className="text-slate-300">–</span>}</td>
                        <td className="px-3 py-2.5 text-slate-700">{v.email || <span className="text-slate-300">–</span>}</td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap font-semibold text-slate-800">{v.defaultLeadDays ? `${v.defaultLeadDays} d` : <span className="font-normal text-slate-300">–</span>}</td>
                        <td className="px-3 py-2.5 text-slate-700">{v.paymentTerms || <span className="text-slate-300">–</span>}</td>
                        <td className="px-3 py-2.5 tabular-nums">{usage.projectCount > 0 ? <Chip tone="slate" title={usage.projectNames.join(', ')}>{usage.projectCount}</Chip> : <span className="text-slate-300">–</span>}</td>
                        <td className="pl-1 pr-3 py-2.5">
                          <span className="flex items-center justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <button type="button" onClick={() => openMessage(v)} disabled={!v.phone} className={`${iconButton} disabled:opacity-40 disabled:pointer-events-none`} title={v.phone ? 'Message on WhatsApp' : 'No phone number'} aria-label={`Message ${v.name}`}><MessageCircle className="w-4 h-4" /></button>
                            <button type="button" onClick={() => openEditModal(v)} className={iconButton} title="Edit" aria-label={`Edit ${v.name}`}><Edit3 className="w-4 h-4" /></button>
                            <button type="button" onClick={() => setDeleteConfirmId(v.id)} className={`${iconButton} hover:!text-rose-600 hover:!bg-rose-50`} title="Delete" aria-label={`Delete ${v.name}`}><Trash2 className="w-4 h-4" /></button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add or edit a vendor. */}
      {showAddModal && form && (
        <BankModal label={form.id ? 'Edit vendor' : 'Add a vendor'} eyebrow="Vendor directory" title={form.id ? `Edit ${form.name || 'vendor'}` : 'Add a vendor'}
          blurb="Who they are, what they supply and how to reach them. Orders and messages start from these details." size="lg" onClose={closeForm}
          footer={
            <>
              <Button onClick={closeForm}>Cancel</Button>
              <Button variant="primary" icon={Check} type="submit" form="vendor-form" disabled={!form.name?.trim()} title={!form.name?.trim() ? 'Give the vendor a name' : undefined}>
                {form.id ? 'Save changes' : 'Add vendor'}
              </Button>
            </>
          }>
          <form id="vendor-form" onSubmit={handleSaveVendor} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-4 items-end">
              <label className="block">
                <span className={`${LABEL} block mb-1.5`}>Name</span>
                <input autoFocus required type="text" value={form.name || ''} onChange={e => setEditingVendor(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Royal Woodcrafters" className={INPUT} />
              </label>
              <div>
                <span className={`${LABEL} block mb-1.5`}>Status</span>
                <Segmented label="Status" value={form.active !== false ? 'on' : 'off'} onChange={(x) => setEditingVendor(p => ({ ...p, active: x === 'on' }))}
                  options={[{ id: 'on', label: 'Active' }, { id: 'off', label: 'Inactive' }]} />
              </div>
            </div>

            <div>
              <span className={`${LABEL} block mb-1.5`}>What they supply</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="What they supply">
                {(['material', 'labour', 'turnkey'] as POScope[]).map(scope => {
                  const cur = form.supplies || [];
                  const on = cur.includes(scope);
                  return (
                    <button key={scope} type="button" aria-pressed={on}
                      onClick={() => { const next = on ? cur.filter(s => s !== scope) : [...cur, scope]; setEditingVendor(p => ({ ...p, supplies: next.length > 0 ? next : ['material'] })); }}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors motion-safe:active:scale-[0.97] ${on ? 'bg-[#3D52A0] border-[#3D52A0] text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'}`}>
                      {SCOPE_LABEL[scope]}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">A vendor may supply more than one. Turnkey means they supply and install.</p>
            </div>

            <div>
              <span className={`${LABEL} block mb-1.5`}>Trades</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Trades">
                {TRADE_CATEGORIES.map(cat => {
                  const cur = form.categories || [];
                  const on = cur.includes(cat);
                  return (
                    <button key={cat} type="button" aria-pressed={on}
                      onClick={() => setEditingVendor(p => ({ ...p, categories: on ? cur.filter(c => c !== cat) : [...cur, cat] }))}
                      className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-colors motion-safe:active:scale-[0.97] ${on ? 'bg-[#3D52A0]/10 border-[#3D52A0]/30 text-[#3D52A0]' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block">
                <span className={`${LABEL} block mb-1.5`}>Phone</span>
                <input type="tel" value={form.phone || ''} onChange={e => setEditingVendor(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98200 00000" className={INPUT} />
              </label>
              <label className="block">
                <span className={`${LABEL} block mb-1.5`}>Email</span>
                <input type="email" value={form.email || ''} onChange={e => setEditingVendor(p => ({ ...p, email: e.target.value }))} placeholder="orders@vendor.com" className={INPUT} />
              </label>
              <label className="block">
                <span className={`${LABEL} block mb-1.5`}>GSTIN</span>
                <input type="text" value={form.gstin || ''} onChange={e => setEditingVendor(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} placeholder="27AAAAA0000A1Z5" className={`${INPUT} uppercase tabular-nums`} />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block">
                <span className={`${LABEL} block mb-1.5`}>Lead time, days</span>
                <input type="number" min="0" value={form.defaultLeadDays ?? ''} onChange={e => setEditingVendor(p => ({ ...p, defaultLeadDays: Math.max(0, parseInt(e.target.value) || 0) }))} className={`${INPUT} tabular-nums`} />
              </label>
              <div className="sm:col-span-2">
                <label htmlFor="vendor-terms" className={`${LABEL} block mb-1.5`}>Payment terms</label>
                <input id="vendor-terms" type="text" list="vendor-terms-usual" value={form.paymentTerms || ''} onChange={e => setEditingVendor(p => ({ ...p, paymentTerms: e.target.value }))}
                  placeholder="Pick a usual one or type your own" className={INPUT} />
                <datalist id="vendor-terms-usual">{PAYMENT_TERM_PRESETS.filter(t => t !== 'Custom Agreement').map(t => <option key={t} value={t} />)}</datalist>
              </div>
            </div>

            <label className="block">
              <span className={`${LABEL} flex items-center gap-1 mb-1.5`}><Lock className="w-3 h-3" aria-hidden />Notes for the studio</span>
              <textarea rows={3} value={form.notes || ''} onChange={e => setEditingVendor(p => ({ ...p, notes: e.target.value }))}
                placeholder="e.g. Speak to Mr. Sanjay. Dispatches on Saturdays." className={INPUT} />
            </label>
          </form>
        </BankModal>
      )}

      {/* A vendor, opened: a drawer from the right, as the Item bank's recipe is. */}
      {v0 && (
        <div className="fixed inset-0 z-[300]" onKeyDown={(e) => { if (e.key === 'Escape') setSelectedVendor(null); }}>
          <div className="absolute inset-0 phd-scrim bg-[#12182F]/40 backdrop-blur-sm" onClick={() => setSelectedVendor(null)} />
          <aside className="absolute right-0 top-0 bottom-0 w-full max-w-[560px] bg-white shadow-2xl flex flex-col pg-slide" role="dialog" aria-modal="true" aria-label={v0.name}>
            <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
              {avatar(v0, 'w-12 h-12 text-base')}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Vendor directory</p>
                <h2 className="text-lg font-bold text-slate-800 break-words">{v0.name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Chip tone={isActive(v0) ? 'good' : 'slate'}><StateDot tone={isActive(v0) ? 'good' : 'slate'} />{isActive(v0) ? 'Active' : 'Inactive'}</Chip>
                  {(v0.supplies || []).map(s => <Chip key={s} tone="brand">{SCOPE_LABEL[s] || s}</Chip>)}
                </div>
              </div>
              <button type="button" autoFocus onClick={() => setSelectedVendor(null)} aria-label="Close" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" aria-hidden /></button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-5">
              <div>
                <span className={`${LABEL} block mb-1.5`}>How to reach them</span>
                <dl className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                  {([['Phone', v0.phone, Phone, 'phone number'], ['Email', v0.email, Mail, 'email'], ['GSTIN', v0.gstin, FileText, 'GSTIN']] as const).map(([label, value, Icon, what], i) => (
                    <div key={label} className="hud-row-in flex items-center gap-3 px-3 py-2.5" style={{ animationDelay: `${i * 40}ms` }}>
                      <Icon className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
                      <dt className={`${LABEL} w-14 shrink-0`}>{label}</dt>
                      <dd className={`flex-1 min-w-0 break-words ${value ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{value || 'Not set'}</dd>
                      {value && copyable(value, `d-${label}`, what)}
                    </div>
                  ))}
                </dl>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" icon={MessageCircle} onClick={() => openMessage(v0)} disabled={!v0.phone} title={v0.phone ? undefined : 'Add a phone number to message this vendor'}>Message on WhatsApp</Button>
                  {v0.phone && <a href={`tel:${v0.phone.replace(/[^0-9+]/g, '')}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl font-bold whitespace-nowrap transition-colors px-3 py-1.5 text-xs bg-white text-slate-700 hover:bg-slate-50 border border-slate-300"><Phone className="w-3.5 h-3.5" aria-hidden />Call</a>}
                  {v0.email && <a href={`mailto:${v0.email}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl font-bold whitespace-nowrap transition-colors px-3 py-1.5 text-xs bg-white text-slate-700 hover:bg-slate-50 border border-slate-300"><Mail className="w-3.5 h-3.5" aria-hidden />Email</a>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 px-4 py-3">
                  <span className={`${LABEL} flex items-center gap-1.5`}><Clock className="w-3 h-3" aria-hidden />Lead time</span>
                  <span className="mt-1 block text-xl font-black text-slate-800 tabular-nums leading-tight">{v0.defaultLeadDays ? <><CountUp value={v0.defaultLeadDays} /> <span className="text-sm font-bold text-slate-500">{v0.defaultLeadDays === 1 ? 'day' : 'days'}</span></> : <span className="text-sm font-semibold text-slate-400">Not set</span>}</span>
                </div>
                <div className="rounded-xl border border-slate-200 px-4 py-3">
                  <span className={`${LABEL} flex items-center gap-1.5`}><CreditCard className="w-3 h-3" aria-hidden />Payment terms</span>
                  <span className={`mt-1 block text-sm break-words ${v0.paymentTerms ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{v0.paymentTerms || 'Not set'}</span>
                </div>
              </div>

              <div>
                <span className={`${LABEL} block mb-1.5`}>Trades</span>
                {(v0.categories || []).length > 0
                  ? <div className="flex flex-wrap gap-1.5">{(v0.categories || []).map(c => <span key={c} className="px-2.5 py-1 rounded-full border border-slate-200 text-xs font-semibold text-slate-700">{c}</span>)}</div>
                  : <p className="text-xs text-slate-500">No trade set.</p>}
              </div>

              {v0.notes && (
                <div>
                  <span className={`${LABEL} flex items-center gap-1 mb-1.5`}><Lock className="w-3 h-3" aria-hidden />Notes for the studio</span>
                  <p className="text-sm text-slate-700 whitespace-pre-line">{v0.notes}</p>
                </div>
              )}

              {/* Where the projects name this vendor. Every selection, not the first three. */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={LABEL}>In projects' material selections</span>
                  <Chip tone="slate">{usageOf(v0).projectCount} {usageOf(v0).projectCount === 1 ? 'project' : 'projects'}</Chip>
                </div>
                {usageOf(v0).projectCount === 0 ? (
                  <p className="text-xs text-slate-500 rounded-xl border border-dashed border-slate-300 px-3 py-3">No project's material selections name this vendor yet.</p>
                ) : (
                  <div className="space-y-2">
                    {projects.map(p => {
                      const matched = (p.context?.materialSelections || []).filter(s => nameKey(s.vendor) === nameKey(v0.name));
                      if (matched.length === 0) return null;
                      return (
                        <div key={p.id} className="rounded-xl border border-slate-200">
                          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100 rounded-t-xl">
                            <span className="text-xs font-semibold text-slate-800 break-words">{p.context?.name || p.context?.clientName || 'Untitled project'}</span>
                            <Chip tone="slate">{matched.length} {matched.length === 1 ? 'item' : 'items'}</Chip>
                          </div>
                          <ul className="divide-y divide-slate-100">
                            {matched.map((item, idx) => (
                              <li key={idx} className="px-3 py-1.5 flex items-start justify-between gap-3 text-xs">
                                <span className="min-w-0 break-words text-slate-700">{item.itemName || 'Material'}</span>
                                {item.quotedPrice != null && <span className="font-semibold text-slate-800 tabular-nums shrink-0">₹{item.quotedPrice.toLocaleString('en-IN')}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              <Button variant="danger" icon={Trash2} onClick={() => { setSelectedVendor(null); setDeleteConfirmId(v0.id); }}>Delete</Button>
              <Button variant="primary" icon={Edit3} onClick={() => { setSelectedVendor(null); openEditModal(v0); }}>Edit</Button>
            </div>
          </aside>
        </div>
      )}

      {/* A WhatsApp message to a vendor. */}
      {showWhatsAppModal && (
        <BankModal label="Message a vendor" eyebrow="Vendor directory" title={`Message ${showWhatsAppModal.name}`}
          blurb={`Opens WhatsApp with this message, to ${showWhatsAppModal.phone}. Nothing is sent until you press send there.`} size="md" onClose={() => setShowWhatsAppModal(null)}
          footer={
            <>
              <Button onClick={() => setShowWhatsAppModal(null)}>Cancel</Button>
              <Button variant="primary" icon={Send} onClick={() => sendWhatsApp(showWhatsAppModal, customWhatsAppMsg)} disabled={!customWhatsAppMsg.trim()}>Open in WhatsApp</Button>
            </>
          }>
          <div className="space-y-4">
            <div>
              <span className={`${LABEL} block mb-1.5`}>Start from</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {WHATSAPP_VENDOR_TEMPLATES.map((t, i) => {
                  const text = t.template(showWhatsAppModal.name, studioName);
                  const on = customWhatsAppMsg === text;
                  return (
                    <button key={t.id} type="button" aria-pressed={on} onClick={() => setCustomWhatsAppMsg(text)}
                      className={`hud-row-in p-2.5 rounded-xl border text-left transition-colors ${on ? 'border-[#3D52A0] ring-2 ring-[#3D52A0]/15 bg-[#3D52A0]/[0.03]' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                      style={{ animationDelay: `${i * 30}ms` }}>
                      <span className="block text-xs font-semibold text-slate-800">{t.title}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">{t.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="block">
              <span className={`${LABEL} block mb-1.5`}>Message</span>
              <textarea rows={6} value={customWhatsAppMsg} onChange={e => setCustomWhatsAppMsg(e.target.value)} className={INPUT} />
            </label>
          </div>
        </BankModal>
      )}

      {/* Deleting asks first. */}
      {deleteConfirmId && (() => {
        const doomed = vendors.find(v => v.id === deleteConfirmId);
        return (
          <BankModal label="Delete a vendor" eyebrow="Vendor directory" title={`Delete ${doomed?.name || 'this vendor'}?`}
            blurb="It is removed from the directory. Projects that name it in their material selections keep the name as text." size="md" onClose={() => setDeleteConfirmId(null)}
            footer={
              <>
                <Button onClick={() => setDeleteConfirmId(null)}>Keep</Button>
                <Button variant="danger" icon={Trash2} onClick={() => handleDeleteVendor(deleteConfirmId)}>Delete vendor</Button>
              </>
            }>
            <p className="text-xs text-slate-600">
              {doomed && usageOf(doomed).projectCount > 0
                ? `${usageOf(doomed).projectCount} ${usageOf(doomed).projectCount === 1 ? 'project names' : 'projects name'} this vendor. This cannot be undone.`
                : 'No project names this vendor. This cannot be undone.'}
            </p>
          </BankModal>
        );
      })()}
    </div>
  );
}
