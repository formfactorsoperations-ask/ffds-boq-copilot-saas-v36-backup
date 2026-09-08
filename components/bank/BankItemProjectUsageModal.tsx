import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Item, FullProjectData } from '../../types';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { 
  X, 
  Briefcase, 
  ExternalLink, 
  Building2, 
  Layers, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  FolderKanban,
  Hash,
  Sparkles
} from 'lucide-react';

export interface ProjectUsageDetail {
  projectId: string;
  projectName: string;
  clientName: string;
  location: string;
  status: string;
  tierName: string;
  roomName: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
}

interface BankItemProjectUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: Item | null;
  projects: FullProjectData[];
  onOpenProject?: (projectId: string) => void;
}

export function computeItemProjectUsage(item: Item | null, projects: FullProjectData[]): ProjectUsageDetail[] {
  if (!item || !projects || projects.length === 0) return [];

  const usageList: ProjectUsageDetail[] = [];
  const targetId = item.id;
  const targetName = (item.name || '').trim().toLowerCase();

  projects.forEach((proj) => {
    const projId = proj.id;
    const projName = proj.context?.name || 'Untitled Project';
    const clientName = proj.context?.clientName || 'Client';
    const location = proj.context?.location || 'Mumbai';
    const status = proj.context?.status || 'draft';
    const rooms = proj.context?.rooms || [];

    // Check tiers
    if (proj.tiers && Array.isArray(proj.tiers)) {
      proj.tiers.forEach((tier) => {
        if (tier.boq && Array.isArray(tier.boq)) {
          tier.boq.forEach((boqItem) => {
            const isMatch = (boqItem.bankId && boqItem.bankId === targetId) || 
                            (boqItem.name && boqItem.name.trim().toLowerCase() === targetName);
            if (isMatch) {
              const room = rooms.find((r) => r.id === boqItem.roomId);
              const roomName = room ? room.name : 'General / Whole House';
              const sellRate = boqItem.selectedRate || calculateSellPrice(item.materials, item.labor, boqItem.marginOverride ?? item.margin);
              const qty = boqItem.qty || 1;
              
              usageList.push({
                projectId: projId,
                projectName: projName,
                clientName,
                location,
                status,
                tierName: tier.name || 'Default Tier',
                roomName,
                qty,
                unit: item.unit || 'nos',
                rate: sellRate,
                total: sellRate * qty,
              });
            }
          });
        }
      });
    }

    // Check canonical boq if present
    if (proj.canonical?.boq?.items && Array.isArray(proj.canonical.boq.items)) {
      proj.canonical.boq.items.forEach((cItem) => {
        const isMatch = (cItem.bankId && cItem.bankId === targetId) || 
                        (cItem.name && cItem.name.trim().toLowerCase() === targetName);
        if (isMatch) {
          // Avoid duplicate if already found in tier
          const alreadyAdded = usageList.some(u => u.projectId === projId && u.tierName === 'Canonical Baseline');
          if (!alreadyAdded) {
            const room = rooms.find((r) => r.id === cItem.roomId);
            const sellRate = calculateSellPrice(cItem.materials ?? item.materials, cItem.labor ?? item.labor, cItem.margin ?? item.margin);
            const qty = cItem.qty || 1;
            usageList.push({
              projectId: projId,
              projectName: projName,
              clientName,
              location,
              status,
              tierName: 'Canonical Baseline',
              roomName: room ? room.name : 'General Scope',
              qty,
              unit: item.unit || 'nos',
              rate: sellRate,
              total: sellRate * qty,
            });
          }
        }
      });
    }
  });

  return usageList;
}

const BankItemProjectUsageModal: React.FC<BankItemProjectUsageModalProps> = ({
  isOpen,
  onClose,
  item,
  projects,
  onOpenProject,
}) => {
  if (!isOpen || !item) return null;

  const usageList = computeItemProjectUsage(item, projects);

  // Group by project
  const distinctProjectsCount = new Set(usageList.map((u) => u.projectId)).size;
  const totalQtyUsed = usageList.reduce((sum, u) => sum + (u.qty || 0), 0);
  const totalValueQuoted = usageList.reduce((sum, u) => sum + (u.total || 0), 0);

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'won':
      case 'execution':
        return <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold">Execution</span>;
      case 'completed':
        return <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-[10px] font-bold">Completed</span>;
      case 'proposal_sent':
      case 'negotiation':
        return <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[10px] font-bold">Proposal Sent</span>;
      default:
        return <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-md text-[10px] font-bold">Draft / Lead</span>;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-6 bg-slate-50 border-b border-slate-200/80 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-sky-50 text-[#0066CC] border border-sky-200 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  {item.cat || 'General'}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Unit: {item.unit?.toUpperCase()}
                </span>
              </div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                {item.name || 'Untitled Item'}
              </h3>
              <p className="text-xs text-slate-500">
                Project Linkage & Live BOQ Deployments across Studio Projects
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-3 p-4 bg-white border-b border-slate-100">
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Deployments</div>
              <div className="text-lg font-black text-slate-900 mt-0.5">
                {distinctProjectsCount} {distinctProjectsCount === 1 ? 'Project' : 'Projects'}
              </div>
              <div className="text-[10px] text-slate-500">{usageList.length} BOQ entries</div>
            </div>

            <div className="bg-sky-50/60 p-3 rounded-2xl border border-sky-100">
              <div className="text-[10px] font-bold text-[#0066CC] uppercase">Total Quantity</div>
              <div className="text-lg font-black text-[#0066CC] mt-0.5">
                {totalQtyUsed} {item.unit}
              </div>
              <div className="text-[10px] text-sky-700/70">Sum across all projects</div>
            </div>

            <div className="bg-emerald-50/60 p-3 rounded-2xl border border-emerald-100">
              <div className="text-[10px] font-bold text-emerald-700 uppercase">Total Quoted Volume</div>
              <div className="text-lg font-black text-emerald-700 mt-0.5">
                {formatCurrency(totalValueQuoted)}
              </div>
              <div className="text-[10px] text-emerald-600">Aggregate Client BOQ Value</div>
            </div>
          </div>

          {/* Body: Projects Table */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            {usageList.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <FolderKanban className="w-12 h-12 mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-700">Not Currently Linked to Any Projects</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  This item exists in your Master Item Bank but has not yet been added to any active project BOQ or Proposal Tier.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Project & Client</th>
                      <th className="py-3 px-3">Room / Section</th>
                      <th className="py-3 px-3">Tier</th>
                      <th className="py-3 px-3 text-right">Qty</th>
                      <th className="py-3 px-3 text-right">Rate</th>
                      <th className="py-3 px-4 text-right">Total Amount</th>
                      <th className="py-3 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {usageList.map((usage, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-900">{usage.projectName}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span>{usage.clientName}</span>
                            <span>•</span>
                            <span>{usage.location}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-700">
                          {usage.roomName}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium">
                            {usage.tierName}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                          {usage.qty} {usage.unit}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-600">
                          {formatCurrency(usage.rate)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                          {formatCurrency(usage.total)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {getStatusBadge(usage.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default BankItemProjectUsageModal;
