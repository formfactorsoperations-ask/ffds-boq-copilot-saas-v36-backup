import React, { useEffect, useState } from 'react';
import { ProjectHealthReport, PillarScore } from './types';
import { formatCurrency, formatINR } from '../../lib/utils';
import { ShieldCheck, AlertTriangle, AlertOctagon, TrendingUp, CheckCircle2, ChevronRight, Zap, Target, Lock, DollarSign, Wrench } from 'lucide-react';
import { scoreTone } from '../../lib/reportPalette';

interface HealthIndexRadarProps {
  report: ProjectHealthReport;
  onSelectAction?: (actionId: string) => void;
}

export const HealthIndexRadar: React.FC<HealthIndexRadarProps> = ({ report, onSelectAction }) => {
  const { compositeScore, overallGrade, statusLabel, headlineSummary, primaryRisk, nextRecommendedAction, pillars, metrics } = report;

  // Grade color tokens
  const getGradeTheme = (grade: string) => {
    switch (grade) {
      case 'PRIME':
        return {
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
          badge: 'bg-emerald-500 text-white',
          glow: 'from-emerald-500/20 to-teal-500/10',
          bar: 'bg-emerald-500',
          border: 'border-emerald-500/30'
        };
      case 'SOUND':
        return {
          bg: 'bg-sky-50 border-sky-200 text-sky-800',
          badge: 'bg-sky-600 text-white',
          glow: 'from-sky-500/20 to-blue-500/10',
          bar: 'bg-sky-500',
          border: 'border-sky-500/30'
        };
      case 'CAUTION':
        return {
          bg: 'bg-amber-50 border-amber-200 text-amber-800',
          badge: 'bg-amber-500 text-white',
          glow: 'from-amber-500/20 to-orange-500/10',
          bar: 'bg-amber-500',
          border: 'border-amber-500/30'
        };
      case 'CRITICAL':
      default:
        return {
          bg: 'bg-rose-50 border-rose-200 text-rose-800',
          badge: 'bg-rose-600 text-white',
          glow: 'from-rose-500/20 to-red-500/10',
          bar: 'bg-rose-500',
          border: 'border-rose-500/30'
        };
    }
  };

  const theme = getGradeTheme(overallGrade);

  // SVG Radial Gauge Calculations
  const radius = 70;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (compositeScore / 100) * circumference;

  /* The score sweeps up from zero on mount. A gauge that is already at its
     value when you arrive reads as a label; one that travels reads as a
     measurement being taken. */
  const [charged, setCharged] = useState(false);
  useEffect(() => { const t = setTimeout(() => setCharged(true), 80); return () => clearTimeout(t); }, []);
  const liveOffset = charged ? strokeDashoffset : circumference;

  return (
    <div className="space-y-6">
      {/* 1. HERO RADAR BANNER */}
      <div className="bg-[#0B1528] text-white rounded-3xl p-8 md:p-10 relative overflow-hidden shadow-2xl border border-slate-800">
        {/* Background Subtle Luxury Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#B5945B]/15 via-sky-600/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Radial Score Gauge */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center text-center">
            <div className="relative w-44 h-44 flex items-center justify-center hud-frame hud-frame-dark">
              <svg height={radius * 2 + 40} width={radius * 2 + 40} className="transform -rotate-90">
                <circle
                  stroke="#1E293B"
                  fill="transparent"
                  strokeWidth={stroke}
                  r={normalizedRadius}
                  cx={radius + 20}
                  cy={radius + 20}
                />
                {/* Blurred twin: the arc reads as emitted light, not paint. */}
                <circle
                  stroke={scoreTone(compositeScore)}
                  fill="transparent"
                  strokeWidth={stroke}
                  strokeDasharray={circumference + ' ' + circumference}
                  style={{ strokeDashoffset: liveOffset, filter: 'blur(6px)', opacity: .55,
                           transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)' }}
                  strokeLinecap="round"
                  r={normalizedRadius}
                  cx={radius + 20}
                  cy={radius + 20}
                />
                <circle
                  stroke={scoreTone(compositeScore)}
                  fill="transparent"
                  strokeWidth={stroke}
                  strokeDasharray={circumference + ' ' + circumference}
                  style={{ strokeDashoffset: liveOffset,
                           transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)' }}
                  strokeLinecap="round"
                  r={normalizedRadius}
                  cx={radius + 20}
                  cy={radius + 20}
                />
              </svg>
              {charged && <span className="hud-lock" />}
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-5xl font-extralight tracking-tighter text-white font-mono">
                  {compositeScore}
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mt-0.5">
                  / 100 PTS
                </span>
              </div>
            </div>

            <div className="mt-3 inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase bg-white/10 backdrop-blur-md border border-white/15">
              <span className="w-2 h-2 rounded-full hud-alert" style={{ background: scoreTone(compositeScore) }} />
              {statusLabel}
            </div>
          </div>

          {/* Core Diagnosis Summary */}
          <div className="lg:col-span-8 space-y-5">
            <div>
              <div className="flex items-center gap-2 text-[#B5945B] text-xs font-bold uppercase tracking-widest mb-1.5">
                <ShieldCheck className="w-4 h-4" />
                Forensic Health Assessment
              </div>
              <h2 className="text-2xl md:text-3xl font-light tracking-tight text-white leading-snug">
                {headlineSummary}
              </h2>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-800">
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Blended Margin</p>
                <p className="text-lg font-bold text-white mt-0.5 font-mono">{metrics.blendedMarginPct.toFixed(1)}%</p>
                {/* 22-26% margin is the studio's 28-35% markup restated. The
                    colour follows the number rather than always reading green,
                    which made a 9.5% margin look like it was on target. */}
                <span className={`text-[10px] ${
                  metrics.blendedMarginPct >= 22 ? 'text-emerald-400'
                  : metrics.blendedMarginPct >= 18 ? 'text-amber-400'
                  : 'text-rose-400'
                }`}>Target: 22-26%</span>
              </div>

              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Net Profit (Est.)</p>
                <p className="text-lg font-bold text-[#B5945B] mt-0.5 font-mono">{formatINR(metrics.netProfit)}</p>
                <span className="text-[10px] text-slate-400">Exec + Design</span>
              </div>

              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">E1 Advance Gate</p>
                <p className={`text-lg font-bold mt-0.5 ${metrics.e1PaymentCleared ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {metrics.e1PaymentCleared ? 'CLEARED' : 'PENDING'}
                </p>
                <span className="text-[10px] text-slate-400">{formatINR(metrics.e1PaymentAmount)} required</span>
              </div>

              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Cost Balance</p>
                <p className="text-lg font-bold text-white mt-0.5 font-mono">{metrics.materialRatio.toFixed(0)} : {metrics.laborRatio.toFixed(0)}</p>
                <span className="text-[10px] text-slate-400">Mat : Labor %</span>
              </div>
            </div>

            {/* Strategic Warning & Next Step Alert */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="flex-1 flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-rose-300 block font-bold uppercase text-[10px] tracking-wider">Primary Risk:</strong>
                  <span>{primaryRisk}</span>
                </div>
              </div>

              <div className="flex-1 flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs">
                <Zap className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-emerald-300 block font-bold uppercase text-[10px] tracking-wider">Recommended Next Action:</strong>
                  <span>{nextRecommendedAction}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. FOUR PILLAR SCORECARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Pillar 1: Scope Completeness */}
        <PillarCard
          pillar={pillars.scopeCompleteness}
          icon={<Target className="w-4 h-4 text-blue-600" />}
          onActionClick={onSelectAction}
        />

        {/* Pillar 2: Margin Integrity */}
        <PillarCard
          pillar={pillars.marginIntegrity}
          icon={<TrendingUp className="w-4 h-4 text-emerald-600" />}
          onActionClick={onSelectAction}
        />

        {/* Pillar 3: Cash Flow & Hard-Gates */}
        <PillarCard
          pillar={pillars.cashflowHardgates}
          icon={<DollarSign className="w-4 h-4 text-amber-600" />}
          onActionClick={onSelectAction}
        />

        {/* Pillar 4: Site Governance & Audit */}
        <PillarCard
          pillar={pillars.siteGovernance}
          icon={<Lock className="w-4 h-4 text-purple-600" />}
          onActionClick={onSelectAction}
        />
      </div>
    </div>
  );
};

interface PillarCardProps {
  pillar: PillarScore;
  icon: React.ReactNode;
  onActionClick?: (actionId: string) => void;
}

const PillarCard: React.FC<PillarCardProps> = ({ pillar, icon, onActionClick }) => {
  const { score, maxScore, grade, title, summary, findings } = pillar;
  const pct = (score / maxScore) * 100;

  const getPillarColor = (g: string) => {
    switch (g) {
      case 'PRIME': return 'text-emerald-600 bg-emerald-50 border-emerald-200 progress-emerald';
      case 'SOUND': return 'text-sky-600 bg-sky-50 border-sky-200 progress-sky';
      case 'CAUTION': return 'text-amber-600 bg-amber-50 border-amber-200 progress-amber';
      case 'CRITICAL':
      default: return 'text-rose-600 bg-rose-50 border-rose-200 progress-rose';
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 rounded-xl bg-slate-100 border border-slate-200/60">
            {icon}
          </div>
          <div className="text-right">
            <span className="text-xl font-bold font-mono text-slate-900">{score}</span>
            <span className="text-xs text-slate-400 font-mono">/{maxScore}</span>
          </div>
        </div>

        <h3 className="text-sm font-bold text-slate-800 leading-tight mb-1">{title}</h3>
        <p className="text-xs text-slate-500 mb-4">{summary}</p>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-4">
          <div
            className="h-full rounded-full hud-charge"
            style={{ width: `${pct}%`, background: scoreTone(pct) }}
          />
        </div>

        {/* Findings List */}
        <div className="space-y-2 text-xs">
          {findings.map((f, i) => (
            <div key={i} className="flex items-start gap-2 py-1 border-t border-slate-100 first:border-0">
              {f.type === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />}
              {f.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
              {f.type === 'critical' && <AlertOctagon className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />}
              {f.type === 'info' && <ShieldCheck className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" />}
              
              <span className={`flex-1 leading-snug ${f.type === 'critical' ? 'text-rose-700 font-medium' : f.type === 'warning' ? 'text-amber-800' : 'text-slate-600'}`}>
                {f.message}
              </span>

              {f.actionable && f.actionId && onActionClick && (
                <button
                  onClick={() => onActionClick(f.actionId!)}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider shrink-0 underline"
                >
                  Fix
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
