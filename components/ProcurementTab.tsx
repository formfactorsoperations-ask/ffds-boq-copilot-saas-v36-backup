import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ProjectContext, FullBoqItem, PurchaseOrder, ProcurementMode } from '../types';
import { db } from '../services/dbService';
import { buildEnvelopes, Envelope, defaultModeFor, envelopeKey } from '../lib/procurement';
import { formatINR, formatClientValue } from '../lib/utils';
import { AlertTriangle, PackageCheck, Plus, RefreshCw } from 'lucide-react';
import RaisePOModal from './RaisePOModal';

interface Props {
  projectContext: ProjectContext;
  setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
  boq: FullBoqItem[];
  projectId: string;
  currentRole?: string;
}

export default function ProcurementTab({ projectContext, setProjectContext, boq, projectId }: Props) {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [showRaisePO, setShowRaisePO] = useState(false);
  const [raisePoRoomId, setRaisePoRoomId] = useState<string>('');
  const [raisePoCategory, setRaisePoCategory] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setPos(await db.getPurchaseOrders(projectId)); }
    catch { setPos([]); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const modes = projectContext.procurementModes || {};
  const envelopes = useMemo(() => buildEnvelopes(boq, pos, modes), [boq, pos, modes]);

  const setMode = (env: Envelope, mode: ProcurementMode) => {
    setProjectContext(prev => ({
      ...prev,
      procurementModes: { ...(prev.procurementModes || {}), [env.key]: mode },
    }));
  };

  const totals = useMemo(() => envelopes.reduce((a, e) => ({
    budget: a.budget + e.budgetTotal,
    committed: a.committed + e.committedTotal,
    billed: a.billed + e.billedTotal,
    over: a.over + e.overBy,
  }), { budget: 0, committed: 0, billed: 0, over: 0 }), [envelopes]);

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading procurement…</div>;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Budget (from BOQ)" value={totals.budget} />
        <Stat label="Committed" value={totals.committed} tone={totals.committed > totals.budget ? 'rose' : 'slate'} />
        <Stat label="Billed" value={totals.billed} />
        <Stat label="Over plan" value={totals.over} tone={totals.over > 0 ? 'rose' : 'emerald'} />
      </div>

      {totals.over > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>{formatINR(totals.over)} committed above plan.</strong>{' '}
            {envelopes.filter(e => e.overBy > 0).map(e => `${e.roomId} · ${e.category}`).join(', ')}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Budget envelopes</span>
        <button onClick={load} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-[#3D52A0] uppercase tracking-wider">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="space-y-3">
        {envelopes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <PackageCheck className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">No BOQ lines yet</p>
            <p className="text-xs text-slate-400 mt-1">Budgets appear here as soon as the BOQ has items.</p>
          </div>
        )}
        {envelopes.map(e => (
          <EnvelopeCard
            key={e.key}
            env={e}
            onMode={m => setMode(e, m)}
            matchingPOs={pos.filter(po => po.roomId === e.roomId && po.category === e.category)}
            onRaisePO={() => {
              setRaisePoRoomId(e.roomId);
              setRaisePoCategory(e.category);
              setShowRaisePO(true);
            }}
          />
        ))}
      </div>

      {/* Raise PO Modal */}
      {showRaisePO && projectId && (
        <RaisePOModal
          projectId={projectId}
          projectContext={projectContext}
          selectedSelections={[]}
          defaultRoomId={raisePoRoomId}
          defaultCategory={raisePoCategory}
          onClose={() => {
            setShowRaisePO(false);
            setRaisePoRoomId('');
            setRaisePoCategory('');
          }}
          onSuccess={() => {
            setShowRaisePO(false);
            setRaisePoRoomId('');
            setRaisePoCategory('');
            load(); // Reload purchase orders list
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'rose' | 'emerald' }) {
  const c = tone === 'rose' ? 'text-rose-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-slate-800';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className={`text-xl font-bold tabular-nums ${c}`}>{formatClientValue(value)}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-1.5">{label}</p>
    </div>
  );
}

function EnvelopeCard({
  env,
  onMode,
  matchingPOs = [],
  onRaisePO
}: {
  env: Envelope;
  onMode: (m: ProcurementMode) => void;
  matchingPOs: PurchaseOrder[];
  onRaisePO: () => void;
  key?: React.Key;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = (n: number, d: number) => (d > 0 ? Math.min(100, (n / d) * 100) : 0);
  const over = env.overBy > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 space-y-4">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="flex flex-col">
          <strong className="text-sm text-slate-900">{env.roomId} · {env.category}</strong>
          {matchingPOs.length > 0 && (
            <span className="text-[10px] text-slate-400 font-medium mt-0.5">
              {matchingPOs.length} Purchase Order{matchingPOs.length > 1 ? 's' : ''} raised
            </span>
          )}
        </div>
        <span className="flex-1 min-w-[12px]" />
        
        {over
          ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">over</span>
          : env.committedTotal > 0
            ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">on plan</span>
            : <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">not ordered</span>}
            
        <div className="inline-flex gap-0.5 p-0.5 rounded-lg bg-slate-100">
          {(['split', 'turnkey'] as ProcurementMode[]).map(m => (
            <button key={m} onClick={() => onMode(m)}
              className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-md transition-colors ${env.mode === m ? 'bg-white text-[#334486] shadow-sm' : 'text-slate-400'}`}>
              {m}
            </button>
          ))}
        </div>

        <button
          onClick={onRaisePO}
          className="bg-[#3D52A0] hover:bg-[#3D52A0] text-white px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-1 shrink-0"
        >
          <Plus className="w-3 h-3" /> Raise PO
        </button>
      </div>

      {env.mode === 'split' ? (
        <div className="space-y-3">
          <Bar label="Materials" committed={env.committedMaterials} billed={0} budget={env.budgetMaterials} pct={pct} />
          <Bar label="Labour" committed={env.committedLabour} billed={0} budget={env.budgetLabour} pct={pct} />
        </div>
      ) : (
        <div className="space-y-2">
          <Bar label="All-in (subcontracted)" committed={env.committedTotal} billed={env.billedTotal} budget={env.budgetTotal} pct={pct} />
          <p className="text-[11px] text-slate-400">
            Material and labour are not shown separately — the subcontractor owns that split.
          </p>
        </div>
      )}

      {/* Matching POs list */}
      {matchingPOs.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#3D52A0] transition-colors"
          >
            {expanded ? 'Hide Purchase Orders' : `View Purchase Orders (${matchingPOs.length})`}
          </button>

          {expanded && (
            <div className="mt-3 space-y-2.5">
              {matchingPOs.map(po => {
                const paidTotal = po.payments?.reduce((sum, pay) => sum + pay.amount, 0) || 0;
                const balance = po.total - paidTotal;
                
                return (
                  <div key={po.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 font-mono">{po.poNumber}</span>
                        <span className="text-[10px] text-slate-500">•</span>
                        <span className="text-[11px] font-bold text-slate-700">{po.vendorName}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full ${
                          po.status === 'issued' ? 'bg-sky-50 text-[#3D52A0] border border-sky-100' :
                          po.status === 'closed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          po.status === 'received' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                          po.status === 'pending_approval' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {po.status.replace('_', ' ')}
                        </span>
                        
                        <span className="text-xs font-black text-slate-900">{formatINR(po.total)}</span>
                      </div>
                    </div>

                    {/* PO lines summaries */}
                    <div className="text-[11px] text-slate-500 space-y-0.5 pl-1 border-l-2 border-slate-200">
                      {po.lines.map((line, idx) => (
                        <div key={line.id || idx} className="flex justify-between">
                          <span>{line.description} {line.qty && line.unit ? `(x${line.qty} ${line.unit})` : ''}</span>
                          <span className="font-mono">{formatINR(line.amount)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Payments progress */}
                    {po.total > 0 && (
                      <div className="flex items-center justify-between text-[10px] text-slate-400 bg-white rounded-lg p-1.5 border border-slate-100">
                        <span>Paid: <strong className="text-emerald-600">{formatINR(paidTotal)}</strong></span>
                        <span>Balance: <strong className={balance > 0 ? 'text-amber-600' : 'text-slate-500'}>{formatINR(balance)}</strong></span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function Bar({ label, committed, billed, budget, pct }:
  { label: string; committed: number; billed: number; budget: number; pct: (n: number, d: number) => number }) {
  const over = committed > budget;
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className="text-slate-500">{label}</span>
        <span className={`font-mono tabular-nums ${over ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
          {formatINR(committed)} <span className="text-slate-400">of {formatINR(budget)}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
        <div className="h-full bg-emerald-500" style={{ width: `${pct(billed, budget)}%` }} />
        <div className="h-full bg-amber-400" style={{ width: `${pct(Math.max(0, committed - billed), budget)}%` }} />
        {over && <div className="h-full bg-rose-500" style={{ width: `${Math.min(20, ((committed - budget) / (budget || 1)) * 100)}%` }} />}
      </div>
    </div>
  );
}
