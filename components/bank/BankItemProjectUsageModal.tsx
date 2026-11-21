import React from 'react';
import { Item, FullProjectData } from '../../types';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { FolderKanban } from '@/lib/lucide-shim';
import { Button, Chip, EmptyState, SummaryStrip, LABEL, type Tone } from '../ui/kit';
import { CountUp } from '../ui/HudBits';
import BankModal from './BankModal';

/*
  Item bank → where an item is used (DESIGN.md "Item bank motion"): every BOQ
  line that carries it, by project, room and option, with what it was quoted at.
  It reads the projects and changes nothing.
*/

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
    const location = proj.context?.location || '';
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

/** A project's stage, as a chip: state colours only. */
const STAGE: Record<string, { label: string; tone: Tone }> = {
  won: { label: 'Execution', tone: 'good' },
  execution: { label: 'Execution', tone: 'good' },
  completed: { label: 'Completed', tone: 'brand' },
  proposal_sent: { label: 'Proposal sent', tone: 'warn' },
  negotiation: { label: 'Proposal sent', tone: 'warn' },
};

const BankItemProjectUsageModal: React.FC<BankItemProjectUsageModalProps> = ({
  isOpen,
  onClose,
  item,
  projects,
}) => {
  if (!isOpen || !item) return null;

  const usageList = computeItemProjectUsage(item, projects);
  const distinctProjectsCount = new Set(usageList.map((u) => u.projectId)).size;
  const totalQtyUsed = usageList.reduce((sum, u) => sum + (u.qty || 0), 0);
  const totalValueQuoted = usageList.reduce((sum, u) => sum + (u.total || 0), 0);

  return (
    <BankModal
      label={`Where ${item.name || 'this item'} is used`}
      eyebrow={`${item.cat || 'General'} · ${String(item.unit || 'nos').toUpperCase()}`}
      title={item.name || 'Unnamed item'}
      blurb="Every BOQ line that uses this item, and what it was quoted at. Nothing here is changed."
      size="xl"
      onClose={onClose}
      footer={<><span /><Button variant="primary" onClick={onClose}>Close</Button></>}
    >
      <div className="space-y-4">
        <SummaryStrip stats={[
          { label: 'Projects', value: <CountUp value={distinctProjectsCount} />, sub: `${usageList.length} BOQ ${usageList.length === 1 ? 'line' : 'lines'}` },
          { label: 'Quantity', value: <><CountUp value={totalQtyUsed} format={(v) => String(Math.round(v * 100) / 100)} /> <span className="text-sm font-bold text-slate-500">{item.unit}</span></>, sub: 'Across all projects' },
          { label: 'Quoted', value: <CountUp value={totalValueQuoted} format={(v) => formatCurrency(Math.round(v))} />, sub: 'At each line\'s rate' },
        ]} />

        {usageList.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No project uses this item" text="It is in the bank, but not on any project's BOQ or option yet." />
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th scope="col" className={`${LABEL} py-2.5 px-3`}>Project and client</th>
                  <th scope="col" className={`${LABEL} py-2.5 px-3`}>Room</th>
                  <th scope="col" className={`${LABEL} py-2.5 px-3`}>Option</th>
                  <th scope="col" className={`${LABEL} py-2.5 px-3 text-right`}>Qty</th>
                  <th scope="col" className={`${LABEL} py-2.5 px-3 text-right`}>Rate</th>
                  <th scope="col" className={`${LABEL} py-2.5 px-3 text-right`}>Amount</th>
                  <th scope="col" className={`${LABEL} py-2.5 px-3`}>Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {usageList.map((usage, idx) => {
                  const stage = STAGE[String(usage.status || '').toLowerCase()] || { label: 'Draft', tone: 'slate' as Tone };
                  return (
                    <tr key={idx} className="hud-row-in hover:bg-slate-50 transition-colors" style={{ animationDelay: `${Math.min(idx, 14) * 20}ms` }}>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{usage.projectName}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{[usage.clientName, usage.location].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{usage.roomName}</td>
                      <td className="py-2.5 px-3"><Chip tone="slate">{usage.tierName}</Chip></td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">{usage.qty} {usage.unit}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-slate-600 whitespace-nowrap">{formatCurrency(usage.rate)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-800 whitespace-nowrap">{formatCurrency(usage.total)}</td>
                      <td className="py-2.5 px-3"><Chip tone={stage.tone}>{stage.label}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </BankModal>
  );
};

export default BankItemProjectUsageModal;
