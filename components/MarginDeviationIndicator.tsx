import React from 'react';

interface MarginDeviationIndicatorProps {
  margin: number;
}

export const MarginDeviationIndicator: React.FC<MarginDeviationIndicatorProps> = ({ margin }) => {
  const deviation = margin - 25;
  const absDev = Math.abs(deviation);
  
  // Highlight when it deviates significantly from standard 25% (threshold of 2%)
  const isDeviating = absDev > 2;
  
  let barColor = "bg-emerald-500";
  let statusColor = "text-emerald-700 bg-emerald-50 border-emerald-150";
  
  if (isDeviating) {
    if (deviation < 0) {
      // Under-margined
      barColor = "bg-amber-500";
      statusColor = "text-amber-700 bg-amber-50 border-amber-200 animate-pulse";
    } else {
      // Over-margined
      barColor = "bg-[#3D52A0]";
      statusColor = "text-[#334486] bg-sky-50 border-sky-200";
    }
  }

  // Scale for filled bar: 0% to 50% max
  const fillWidth = Math.min((margin / 50) * 100, 100);

  return (
    <div className="inline-flex items-center gap-1.5" title={`Margin: ${margin.toFixed(1)}% (Deviation from 25% standard: ${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}%)`}>
      {/* Mini-bar visualization */}
      <div className="relative w-12 h-1.5 bg-slate-100 rounded-full border border-slate-200 overflow-hidden shrink-0">
        {/* Midpoint line at 25% */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-slate-400 opacity-40 z-10" />
        {/* Filled margin bar */}
        <div 
          className={`h-full ${barColor} rounded-full transition-all duration-300`}
          style={{ width: `${fillWidth}%` }}
        />
      </div>

      {/* Highlights when it deviates significantly */}
      {isDeviating && (
        <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded border ${statusColor} leading-none whitespace-nowrap`}>
          {deviation < 0 ? `-${absDev.toFixed(0)}% Low` : `+${absDev.toFixed(0)}% High`}
        </span>
      )}
    </div>
  );
};

export default MarginDeviationIndicator;
