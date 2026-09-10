import React, { useEffect, useState, useMemo } from 'react';
import { Vendor, POScope, FullProjectData } from '../types';
import { db } from '../services/dbService';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Search, 
  Phone, 
  Mail, 
  MessageCircle, 
  ExternalLink, 
  Copy, 
  Clock, 
  CreditCard, 
  Building2, 
  Boxes, 
  Users, 
  Sparkles, 
  Download, 
  Upload, 
  Filter, 
  ArrowUpDown, 
  LayoutGrid, 
  List, 
  Store, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Truck, 
  Send,
  Briefcase,
  ChevronRight,
  ShieldCheck,
  Tag,
  Share2,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
      active: vendors.filter(v => v.active).length,
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
      alert("Curated standard vendors are already in your directory.");
      return;
    }

    const combined = [...vendors, ...filteredNew];
    await db.saveVendors(combined);
    setVendors(combined);
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
      alert("No vendor names found in any project material selections to seed from.");
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
      alert("All project material vendors are already registered in the directory.");
      return;
    }

    const combined = [...vendors, ...toAdd];
    await db.saveVendors(combined);
    setVendors(combined);
    alert(`Successfully imported ${toAdd.length} vendors from project material selections!`);
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
      if (scopeFilter === 'active' && !v.active) return false;
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
    const active = vendors.filter(v => v.active !== false).length;
    const materialCount = vendors.filter(v => (v.supplies || []).includes('material')).length;
    const labourCount = vendors.filter(v => (v.supplies || []).includes('labour')).length;
    const turnkeyCount = vendors.filter(v => (v.supplies || []).includes('turnkey')).length;
    const avgLead = vendors.length > 0
      ? Math.round(vendors.reduce((acc, v) => acc + (v.defaultLeadDays || 0), 0) / vendors.length)
      : 0;

    return { total, active, materialCount, labourCount, turnkeyCount, avgLead };
  }, [vendors]);

  // Color generator for avatar
  const getAvatarGradient = (name: string, supplies: POScope[] = []) => {
    if (supplies.includes('turnkey')) {
      return 'from-violet-600 to-indigo-600 text-white';
    }
    if (supplies.includes('labour')) {
      return 'from-amber-500 to-orange-600 text-white';
    }
    if (supplies.includes('material')) {
      return 'from-sky-500 to-blue-600 text-white';
    }
    const colors = [
      'from-emerald-500 to-teal-600 text-white',
      'from-blue-600 to-cyan-600 text-white',
      'from-purple-500 to-pink-600 text-white',
      'from-rose-500 to-red-600 text-white',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return 'V';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-10 h-10 border-3 border-sky-500/20 border-t-sky-600 rounded-full animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Loading studio vendor network...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full pb-12">
      
      {/*
        Actions only. The title, the description and the reachability dial come
        from the shared console header the library shell renders above this --
        keeping a second heading here gave the screen two of everything.
      */}
      <div className="flex flex-wrap items-center justify-end gap-2.5">
            {vendors.length === 0 ? (
              <button
                id="btn-seed-curated"
                type="button"
                onClick={handleSeedCurated}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all border border-slate-200 flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>Load Sample Vendors</span>
              </button>
            ) : (
              <button
                id="btn-seed-from-projects"
                type="button"
                onClick={handleSeedFromProjects}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all border border-slate-200 flex items-center gap-1.5 cursor-pointer"
                title="Scan all project BOQs for new vendor names"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#0066CC]" />
                <span className="hidden sm:inline">Sync from Projects</span>
              </button>
            )}

            {vendors.length > 0 && (
              <button
                id="btn-export-csv"
                type="button"
                onClick={handleExportCSV}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all border border-slate-200 flex items-center gap-1.5 cursor-pointer"
                title="Export Vendor List as CSV"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            )}

            <button
              id="btn-add-vendor-main"
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white rounded-xl text-xs font-semibold transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Vendor</span>
            </button>
      </div>

      {/* 2. KPI METRIC SUMMARY STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 hud-panel-in">
        {/* Metric 1: Total Directory */}
        <div 
          onClick={() => { setScopeFilter('all'); setSelectedCategory('all'); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${scopeFilter === 'all' && selectedCategory === 'all' ? 'bg-[#0066CC]/5 border-[#0066CC]/40 ring-2 ring-[#0066CC]/15 shadow-sm' : 'hud-well border-slate-200/80 hover:border-slate-300'}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Directory</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{metrics.total}</span>
            <span className="text-[11px] font-semibold text-emerald-600">({metrics.active} active)</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Registered partners</p>
        </div>

        {/* Metric 2: Material Suppliers */}
        <div 
          onClick={() => setScopeFilter('material')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${scopeFilter === 'material' ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-400/20 shadow-sm' : 'hud-well border-slate-200/80 hover:border-slate-300'}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Material Suppliers</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{metrics.materialCount}</span>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">Material</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Raw materials & fittings</p>
        </div>

        {/* Metric 3: Labour Contractors */}
        <div 
          onClick={() => setScopeFilter('labour')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${scopeFilter === 'labour' ? 'bg-[#0066CC]/5 border-[#0066CC]/40 ring-2 ring-[#0066CC]/15 shadow-sm' : 'hud-well border-slate-200/80 hover:border-slate-300'}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Labour Contractors</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{metrics.labourCount}</span>
            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Labour</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Trade & artisan teams</p>
        </div>

        {/* Metric 4: Turnkey Subcontractors */}
        <div 
          onClick={() => setScopeFilter('turnkey')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${scopeFilter === 'turnkey' ? 'bg-[#0066CC]/5 border-[#0066CC]/40 ring-2 ring-[#0066CC]/15 shadow-sm' : 'hud-well border-slate-200/80 hover:border-slate-300'}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Turnkey Partners</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{metrics.turnkeyCount}</span>
            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Turnkey</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">End-to-end execution</p>
        </div>

        {/* Metric 5: Average Lead Time */}
        <div className="p-4 rounded-2xl border hud-well border-slate-200/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Avg Lead Time</span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">{metrics.avgLead}</span>
            <span className="text-xs font-bold text-slate-500">Days</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Order to site dispatch</p>
        </div>
      </div>

      {/* 3. SEARCH, FILTERS & CONTROLS STRIP */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search vendor by name, phone, GSTIN, category, or trade keywords..."
              className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Scope Filters Pills */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl shrink-0 overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All Partners' },
                { id: 'material', label: 'Material' },
                { id: 'labour', label: 'Labour' },
                { id: 'turnkey', label: 'Turnkey' },
                { id: 'active', label: 'Active Only' },
              ] as { id: ScopeFilter; label: string }[]
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScopeFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  scopeFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort & View Mode */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              aria-label="Sort vendors"
              className="px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 cursor-pointer"
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="lead_asc">Lead Time (Fastest)</option>
              <option value="recent">Recently Added</option>
            </select>

            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'grid' ? 'bg-white text-sky-600 shadow-xs' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'table' ? 'bg-white text-sky-600 shadow-xs' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Trade Category Quick Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Tag className="w-3 h-3" />
            Trade:
          </span>
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#0066CC] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Categories
          </button>
          {TRADE_CATEGORIES.map(cat => {
            const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
            const count = vendors.filter(v => (v.categories || []).some(c => c.toLowerCase() === cat.toLowerCase())).length;
            if (count === 0 && selectedCategory !== cat) return null;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? 'all' : cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{cat}</span>
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${isSelected ? 'bg-sky-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. VENDORS DIRECTORY CONTENT (GRID OR TABLE) */}
      {filteredVendors.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto border border-sky-100 shadow-sm">
            <Store className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-bold text-slate-900">
              {searchQuery || scopeFilter !== 'all' || selectedCategory !== 'all' ? "No matching vendors found" : "No vendors in studio directory"}
            </h3>
            <p className="text-xs text-slate-500">
              {searchQuery || scopeFilter !== 'all' || selectedCategory !== 'all'
                ? "Try clearing your search keyword or changing the filter selections."
                : "Add your trusted trade contractors, material suppliers, and modular partners to streamline BOQs and purchase orders."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {searchQuery || scopeFilter !== 'all' || selectedCategory !== 'all' ? (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setScopeFilter('all'); setSelectedCategory('all'); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                Reset All Filters
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSeedCurated}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all border border-slate-200 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Load 6 Curated Sample Vendors</span>
                </button>
                <button
                  type="button"
                  onClick={openAddModal}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-sky-600/20 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Add First Vendor</span>
                </button>
              </>
            )}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
          <AnimatePresence>
            {filteredVendors.map(vendor => {
              const usage = vendorUsageMap.get(vendor.name.toLowerCase().trim());
              const avatarGrad = getAvatarGradient(vendor.name, vendor.supplies);

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  key={vendor.id}
                  className={`group relative bg-white rounded-2xl border border-slate-200/90 hover:border-sky-300 shadow-2xs hover:shadow-lg hover:shadow-sky-500/8 transition-all p-5 flex flex-col justify-between ${
                    !vendor.active ? 'opacity-70 bg-slate-50/60' : ''
                  }`}
                >
                  <div>
                    {/* Header: Avatar, Name, Status & Categories */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarGrad} flex items-center justify-center font-black text-sm shrink-0 shadow-md shadow-slate-900/10`}>
                          {getInitials(vendor.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 
                              onClick={() => setSelectedVendor(vendor)}
                              className="font-bold text-slate-900 text-base leading-snug truncate hover:text-sky-600 cursor-pointer transition-colors"
                              title={vendor.name}
                            >
                              {vendor.name}
                            </h3>
                          </div>

                          {/* Categories Subtitle */}
                          {vendor.categories && vendor.categories.length > 0 ? (
                            <p className="text-[11px] font-semibold text-slate-500 truncate mt-0.5">
                              {vendor.categories.join(' · ')}
                            </p>
                          ) : (
                            <p className="text-[11px] font-medium text-slate-400 italic mt-0.5">
                              General Trade Partner
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Status Tag */}
                      <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                        vendor.active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${vendor.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        {vendor.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* Scope Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3.5">
                      {(vendor.supplies || ['material']).map(scope => {
                        if (scope === 'material') {
                          return (
                            <span key={scope} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200/80">
                              <Boxes className="w-3 h-3" />
                              <span>Material</span>
                            </span>
                          );
                        }
                        if (scope === 'labour') {
                          return (
                            <span key={scope} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/80">
                              <Users className="w-3 h-3" />
                              <span>Labour</span>
                            </span>
                          );
                        }
                        return (
                          <span key={scope} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                            <Briefcase className="w-3 h-3" />
                            <span>Turnkey</span>
                          </span>
                        );
                      })}

                      {vendor.defaultLeadDays ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200/70 ml-auto">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{vendor.defaultLeadDays}d Lead</span>
                        </span>
                      ) : null}
                    </div>

                    {/* Contact & Commercial Info Details */}
                    <div className="mt-4 space-y-2 text-xs font-medium border-t border-slate-100 pt-3 text-slate-600">
                      {/* Phone & WhatsApp Quick Actions */}
                      {vendor.phone && (
                        <div className="flex items-center justify-between group/contact">
                          <div className="flex items-center gap-2 truncate">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <a 
                              href={`tel:${vendor.phone}`} 
                              className="text-slate-700 font-mono text-xs hover:text-sky-600 hover:underline truncate"
                            >
                              {vendor.phone}
                            </a>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setCustomWhatsAppMsg(WHATSAPP_VENDOR_TEMPLATES[0].template(vendor.name, "Form Factors Design Studio"));
                                setShowWhatsAppModal(vendor);
                              }}
                              className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopy(vendor.phone || '', `phone_${vendor.id}`)}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                              title="Copy Phone"
                            >
                              {copiedId === `phone_${vendor.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Email */}
                      {vendor.email && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 truncate">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <a 
                              href={`mailto:${vendor.email}`} 
                              className="text-slate-700 text-xs hover:text-sky-600 hover:underline truncate"
                            >
                              {vendor.email}
                            </a>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(vendor.email || '', `email_${vendor.id}`)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                            title="Copy Email"
                          >
                            {copiedId === `email_${vendor.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}

                      {/* GSTIN */}
                      {vendor.gstin && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">GST:</span>
                            <span className="font-mono text-[11px] font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              {vendor.gstin}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(vendor.gstin || '', `gst_${vendor.id}`)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                            title="Copy GSTIN"
                          >
                            {copiedId === `gst_${vendor.id}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}

                      {/* Payment Terms */}
                      {vendor.paymentTerms && (
                        <div className="flex items-start gap-2 pt-0.5 text-slate-600">
                          <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="text-[11px] font-medium leading-tight">
                            {vendor.paymentTerms}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Internal Notes Snippet */}
                    {vendor.notes && (
                      <p className="mt-3 text-[11px] text-slate-500 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/70 leading-relaxed italic line-clamp-2">
                        "{vendor.notes}"
                      </p>
                    )}

                    {/* Project Usage Tag */}
                    {usage && usage.projectCount > 0 && (
                      <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-50/70 border border-sky-100 text-[11px] font-semibold text-sky-800">
                        <Building2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>Used in {usage.projectCount} project{usage.projectCount > 1 ? 's' : ''} ({usage.materialCount} items)</span>
                      </div>
                    )}
                  </div>

                  {/* Card Bottom Footer Actions */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3.5 mt-4">
                    <button
                      type="button"
                      onClick={() => setSelectedVendor(vendor)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-800 transition-colors"
                    >
                      <span>View Dossier</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1">
                      {vendor.phone && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomWhatsAppMsg(WHATSAPP_VENDOR_TEMPLATES[0].template(vendor.name, "Form Factors Design Studio"));
                            setShowWhatsAppModal(vendor);
                          }}
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-all"
                          title="Open WhatsApp Messaging"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditModal(vendor)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-all"
                        title="Edit vendor profile"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(vendor.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                        title="Delete vendor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Vendor / Company</th>
                  <th className="py-3.5 px-3">Scope</th>
                  <th className="py-3.5 px-3">Categories</th>
                  <th className="py-3.5 px-3">Contact</th>
                  <th className="py-3.5 px-3">GSTIN</th>
                  <th className="py-3.5 px-3">Payment Terms</th>
                  <th className="py-3.5 px-3">Lead Time</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredVendors.map(vendor => {
                  const avatarGrad = getAvatarGradient(vendor.name, vendor.supplies);
                  return (
                    <tr key={vendor.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${avatarGrad} flex items-center justify-center font-bold text-xs shrink-0`}>
                            {getInitials(vendor.name)}
                          </div>
                          <div>
                            <span 
                              onClick={() => setSelectedVendor(vendor)}
                              className="font-bold text-slate-900 hover:text-sky-600 cursor-pointer block"
                            >
                              {vendor.name}
                            </span>
                            {vendor.notes && (
                              <span className="text-[10px] text-slate-400 truncate max-w-xs block">
                                {vendor.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {(vendor.supplies || ['material']).map(s => (
                            <span 
                              key={s} 
                              className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                s === 'material' ? 'bg-sky-50 text-sky-700 border border-sky-200/70' :
                                s === 'labour' ? 'bg-amber-50 text-amber-700 border border-amber-200/70' :
                                'bg-indigo-50 text-indigo-700 border border-indigo-200/70'
                              }`}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-3 max-w-[180px] truncate">
                        <span className="text-[11px] text-slate-600" title={(vendor.categories || []).join(', ')}>
                          {(vendor.categories || []).join(', ') || '—'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          {vendor.phone && (
                            <div className="flex items-center gap-1 font-mono text-[11px]">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <a href={`tel:${vendor.phone}`} className="hover:text-sky-600 hover:underline">{vendor.phone}</a>
                            </div>
                          )}
                          {vendor.email && (
                            <div className="flex items-center gap-1 text-[11px]">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <a href={`mailto:${vendor.email}`} className="hover:text-sky-600 hover:underline truncate max-w-[140px] inline-block">{vendor.email}</a>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono text-[11px]">
                        {vendor.gstin ? (
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 uppercase font-semibold">
                            {vendor.gstin}
                          </span>
                        ) : '—'}
                      </td>

                      <td className="py-3 px-3 text-[11px] max-w-[160px] truncate" title={vendor.paymentTerms}>
                        {vendor.paymentTerms || '—'}
                      </td>

                      <td className="py-3 px-3 text-[11px]">
                        {vendor.defaultLeadDays ? `${vendor.defaultLeadDays} days` : '—'}
                      </td>

                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          vendor.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${vendor.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {vendor.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {vendor.phone && (
                            <button
                              type="button"
                              onClick={() => {
                                setCustomWhatsAppMsg(WHATSAPP_VENDOR_TEMPLATES[0].template(vendor.name, "Form Factors Design Studio"));
                                setShowWhatsAppModal(vendor);
                              }}
                              className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50"
                              title="WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(vendor)}
                            className="p-1 rounded-md text-slate-400 hover:text-sky-600 hover:bg-sky-50"
                            title="Edit"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(vendor.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. ADD / EDIT VENDOR MODAL */}
      <AnimatePresence>
        {showAddModal && editingVendor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center font-bold">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">
                      {editingVendor.id ? "Edit Vendor Profile" : "Register New Vendor"}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Configure supplier credentials, trade scope, payment terms & lead times.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setEditingVendor(null); }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form Content */}
              <form onSubmit={handleSaveVendor} className="p-6 overflow-y-auto space-y-5">
                
                {/* 1. Name & Active Status */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Company / Vendor Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editingVendor.name || ''}
                      onChange={e => setEditingVendor(p => ({ ...p, name: e.target.value }))}
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-semibold text-slate-900"
                      placeholder="e.g. Italian Marble Hub / Hafele Solutions"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Status
                    </label>
                    <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setEditingVendor(p => ({ ...p, active: true }))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          editingVendor.active !== false ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingVendor(p => ({ ...p, active: false }))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          editingVendor.active === false ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-600'
                        }`}
                      >
                        Inactive
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Primary Supply Scope */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    What does this partner supply? *
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['material', 'labour', 'turnkey'] as POScope[]).map(scope => {
                      const currentScopes = editingVendor.supplies || [];
                      const isSelected = currentScopes.includes(scope);
                      return (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => {
                            const nextScopes = isSelected
                              ? currentScopes.filter(s => s !== scope)
                              : [...currentScopes, scope];
                            setEditingVendor(p => ({ ...p, supplies: nextScopes.length > 0 ? nextScopes : ['material'] }));
                          }}
                          className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                            isSelected
                              ? scope === 'material' ? 'bg-sky-50/80 border-sky-300 ring-2 ring-sky-400/20 text-sky-950' :
                                scope === 'labour' ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/20 text-amber-950' :
                                'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-400/20 text-indigo-950'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold uppercase tracking-wider">{scope}</span>
                            {isSelected && <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />}
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {scope === 'material' ? 'Raw materials & fittings' : scope === 'labour' ? 'Skilled craftsmanship' : 'Full turnkey delivery'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Trade Categories Selection */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Specialist Trade Categories
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                    {TRADE_CATEGORIES.map(cat => {
                      const currentCats = editingVendor.categories || [];
                      const isSelected = currentCats.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            const next = isSelected
                              ? currentCats.filter(c => c !== cat)
                              : [...currentCats, cat];
                            setEditingVendor(p => ({ ...p, categories: next }));
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                            isSelected
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Phone, Email & GSTIN */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={editingVendor.phone || ''}
                      onChange={e => setEditingVendor(p => ({ ...p, phone: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 font-mono text-slate-900"
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={editingVendor.email || ''}
                      onChange={e => setEditingVendor(p => ({ ...p, email: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 text-slate-900"
                      placeholder="orders@vendor.com"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      GSTIN Number
                    </label>
                    <input
                      type="text"
                      value={editingVendor.gstin || ''}
                      onChange={e => setEditingVendor(p => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 font-mono uppercase text-slate-900"
                      placeholder="27AAAAA1234A1Z1"
                    />
                  </div>
                </div>

                {/* 5. Lead Time & Payment Terms */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Lead Time (Days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingVendor.defaultLeadDays ?? 7}
                      onChange={e => setEditingVendor(p => ({ ...p, defaultLeadDays: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 font-semibold text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Payment Terms
                    </label>
                    <div className="space-y-2">
                      <select
                        value={PAYMENT_TERM_PRESETS.includes(editingVendor.paymentTerms || '') ? editingVendor.paymentTerms : 'custom'}
                        onChange={e => {
                          if (e.target.value === 'custom') {
                            setEditingVendor(p => ({ ...p, paymentTerms: '' }));
                          } else {
                            setEditingVendor(p => ({ ...p, paymentTerms: e.target.value }));
                          }
                        }}
                        className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-sky-500"
                      >
                        {PAYMENT_TERM_PRESETS.map(preset => (
                          <option key={preset} value={preset}>{preset}</option>
                        ))}
                        <option value="custom">-- Custom Terms Text --</option>
                      </select>

                      <input
                        type="text"
                        value={editingVendor.paymentTerms || ''}
                        onChange={e => setEditingVendor(p => ({ ...p, paymentTerms: e.target.value }))}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 text-slate-900"
                        placeholder="e.g. 50% Advance, 50% on site delivery"
                      />
                    </div>
                  </div>
                </div>

                {/* 6. Notes */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Internal Studio Notes / POC Details
                  </label>
                  <textarea
                    value={editingVendor.notes || ''}
                    onChange={e => setEditingVendor(p => ({ ...p, notes: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 font-medium text-slate-800 leading-relaxed"
                    rows={2}
                    placeholder="e.g. Main contact is Mr. Sanjay (Director). Provides priority dispatch on Saturday."
                  />
                </div>

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); setEditingVendor(null); }}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/20 transition-all"
                  >
                    {editingVendor.id ? "Save Changes" : "Create Vendor"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. VENDOR DOSSIER DETAIL DRAWER / SLIDE-OVER */}
      <AnimatePresence>
        {selectedVendor && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Drawer Top Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${getAvatarGradient(selectedVendor.name, selectedVendor.supplies)} flex items-center justify-center font-black text-base shadow-md`}>
                    {getInitials(selectedVendor.name)}
                  </div>
                  <div>
                    <h2 className="font-bold text-lg leading-tight text-white">{selectedVendor.name}</h2>
                    <p className="text-xs text-sky-300 font-medium mt-0.5">
                      {(selectedVendor.supplies || []).join(' · ').toUpperCase()} PARTNER
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedVendor(null)}
                  className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body Scroll */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* 1. Status & Quick Communication */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    selectedVendor.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${selectedVendor.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    {selectedVendor.active ? 'Active Studio Supplier' : 'Inactive'}
                  </span>

                  {selectedVendor.phone && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomWhatsAppMsg(WHATSAPP_VENDOR_TEMPLATES[0].template(selectedVendor.name, "Form Factors Design Studio"));
                        setShowWhatsAppModal(selectedVendor);
                      }}
                      className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>WhatsApp Launch</span>
                    </button>
                  )}
                </div>

                {/* 2. Contact Credentials */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Contact & Tax Info</h4>
                  
                  {selectedVendor.phone && (
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-slate-400">Phone:</span>
                      <div className="flex items-center gap-2">
                        <a href={`tel:${selectedVendor.phone}`} className="font-mono font-bold text-slate-800 hover:text-sky-600">{selectedVendor.phone}</a>
                        <button 
                          type="button"
                          onClick={() => handleCopy(selectedVendor.phone || '', 'drawer_phone')}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          {copiedId === 'drawer_phone' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedVendor.email && (
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-slate-400">Email:</span>
                      <div className="flex items-center gap-2">
                        <a href={`mailto:${selectedVendor.email}`} className="font-semibold text-slate-800 hover:text-sky-600">{selectedVendor.email}</a>
                        <button 
                          type="button"
                          onClick={() => handleCopy(selectedVendor.email || '', 'drawer_email')}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          {copiedId === 'drawer_email' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedVendor.gstin && (
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-slate-400">GSTIN:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-800 uppercase">{selectedVendor.gstin}</span>
                        <button 
                          type="button"
                          onClick={() => handleCopy(selectedVendor.gstin || '', 'drawer_gst')}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          {copiedId === 'drawer_gst' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Commercials & Lead Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Lead Time</span>
                    <p className="text-base font-black text-slate-900 mt-0.5">
                      {selectedVendor.defaultLeadDays || 0} <span className="text-xs font-semibold text-slate-500">Days</span>
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Payment Terms</span>
                    <p className="text-xs font-bold text-slate-800 mt-0.5 line-clamp-2">
                      {selectedVendor.paymentTerms || 'Standard Terms'}
                    </p>
                  </div>
                </div>

                {/* 4. Trade Categories */}
                {selectedVendor.categories && selectedVendor.categories.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Trade Categories</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedVendor.categories.map(cat => (
                        <span key={cat} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200/80">
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Notes */}
                {selectedVendor.notes && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Internal Studio Notes</h4>
                    <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/60 text-xs text-amber-950 leading-relaxed italic">
                      "{selectedVendor.notes}"
                    </div>
                  </div>
                )}

                {/* 6. Linked Project Selections */}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Project Material Selections</h4>
                    <span className="text-xs font-semibold text-slate-400">
                      {vendorUsageMap.get(selectedVendor.name.toLowerCase().trim())?.projectCount || 0} Projects Linked
                    </span>
                  </div>

                  {projects.filter(p => (p.context?.materialSelections || []).some(s => s.vendor?.toLowerCase().trim() === selectedVendor.name.toLowerCase().trim())).length === 0 ? (
                    <p className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center">
                      No active project material selections have referenced this vendor yet.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {projects.map(p => {
                        const projName = p.context?.name || p.context?.clientName || "Untitled Project";
                        const matched = (p.context?.materialSelections || []).filter(s => s.vendor?.toLowerCase().trim() === selectedVendor.name.toLowerCase().trim());
                        if (matched.length === 0) return null;

                        return (
                          <div key={p.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{projName}</span>
                              <span className="text-[10px] font-bold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">
                                {matched.length} Item{matched.length > 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="space-y-1 text-[11px] text-slate-600">
                              {matched.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between truncate">
                                  <span className="truncate">{item.itemName || 'Selected Material'}</span>
                                  {item.quotedPrice != null && (
                                    <span className="font-mono text-slate-500 shrink-0">₹{item.quotedPrice.toLocaleString('en-IN')}</span>
                                  )}
                                </div>
                              ))}
                              {matched.length > 3 && (
                                <p className="text-[10px] text-slate-400 italic">+ {matched.length - 3} more items...</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    const v = selectedVendor;
                    setSelectedVendor(null);
                    setDeleteConfirmId(v.id);
                  }}
                  className="p-2.5 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Vendor</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const v = selectedVendor;
                      setSelectedVendor(null);
                      openEditModal(v);
                    }}
                    className="px-5 py-2.5 bg-[#0066CC] hover:bg-[#0055B3] text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Edit Profile</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 7. WHATSAPP TEMPLATE DISPATCH MODAL */}
      <AnimatePresence>
        {showWhatsAppModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-5 border-b border-slate-100 bg-emerald-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <MessageCircle className="w-5 h-5" />
                  <div>
                    <h3 className="font-bold text-base">Direct WhatsApp Message</h3>
                    <p className="text-xs text-emerald-100">Send direct dispatch or RFQ to {showWhatsAppModal.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWhatsAppModal(null)}
                  className="p-1.5 rounded-lg text-emerald-100 hover:text-white hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Template Chips */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Quick Studio Message Templates
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {WHATSAPP_VENDOR_TEMPLATES.map(tpl => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setCustomWhatsAppMsg(tpl.template(showWhatsAppModal.name, "Form Factors Design Studio"))}
                        className="p-2.5 rounded-xl border border-slate-200 text-left hover:bg-emerald-50 hover:border-emerald-300 transition-all text-xs"
                      >
                        <span className="font-bold text-slate-900 block truncate">{tpl.title}</span>
                        <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{tpl.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message Textarea */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Message Preview
                  </label>
                  <textarea
                    rows={5}
                    value={customWhatsAppMsg}
                    onChange={e => setCustomWhatsAppMsg(e.target.value)}
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 font-medium text-slate-800 leading-relaxed"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowWhatsAppModal(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => sendWhatsApp(showWhatsAppModal, customWhatsAppMsg)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Launch WhatsApp Web</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 8. DELETE CONFIRMATION DIALOG */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-sm p-6 space-y-4 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 text-base">Delete Vendor Record?</h3>
                <p className="text-xs text-slate-500">
                  This will remove this vendor from your directory. Existing BOQ items and project material records will retain their text history.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteVendor(deleteConfirmId)}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
