
import React from 'react';
import { AiComparisonResult } from '../../types';

interface ClientComparisonMatrixProps {
  data: AiComparisonResult;
  tierNames: string[];
  isLoading: boolean;
}

const SpecRow: React.FC<{ label: string, values: string[], isLast?: boolean }> = ({ label, values, isLast }) => {
    // Check if all values are the same
    const isUniform = values.every(v => v === values[0]);
    
    return (
        <div className={`grid grid-cols-[180px_1fr] md:grid-cols-[220px_1fr_1fr_1fr] group ${!isLast ? 'border-b border-slate-200' : ''}`}>
            <div className="p-4 text-sm font-bold text-slate-700 bg-slate-50/50 flex items-center group-hover:bg-slate-100 transition-colors">
                {label}
            </div>
            {values.map((val, idx) => (
                <div key={idx} className={`p-4 text-xs md:text-sm flex items-center border-l border-slate-100 ${val === 'Included' ? 'text-emerald-700 font-bold bg-emerald-50/10' : val === '-' ? 'text-slate-300' : 'text-slate-600'} ${isUniform ? 'opacity-80' : ''}`}>
                    {val === 'Included' ? 'Included' : val}
                </div>
            ))}
        </div>
    )
}

const ClientComparisonMatrix: React.FC<ClientComparisonMatrixProps> = ({ data, tierNames, isLoading }) => {
  if (isLoading || !data || !data.materialMatrix?.length) return null;

  return (
    <div className="border-2 border-indigo-950 rounded-xl overflow-hidden shadow-sm">
        {/* Header Row - Updated to Slate-900 for uniform black theme */}
        <div className="grid grid-cols-[180px_1fr] md:grid-cols-[220px_1fr_1fr_1fr] bg-indigo-950 text-white">
            <div className="p-4 font-bold text-xs uppercase tracking-widest flex items-center">Specification</div>
            {tierNames.map((name, idx) => (
                <div key={idx} className="p-4 font-bold text-xs uppercase tracking-widest border-l border-slate-700 flex items-center justify-center text-center bg-indigo-950">
                    {name}
                </div>
            ))}
        </div>

        {/* Material Specs Only - Scope Inclusions Removed per Level 1 Rules */}
        {data.materialMatrix.length > 0 && (
            <div className="bg-white">
                <div className="bg-slate-50 p-3 px-4 text-[10px] font-bold uppercase text-slate-500 tracking-widest border-b border-slate-200">
                    Material Finishes & Hardware
                </div>
                {data.materialMatrix.map((row: any, idx) => (
                    <SpecRow 
                        key={idx} 
                        label={row.feature} 
                        values={tierNames.map(t => row[t] || '-')}
                        isLast={idx === data.materialMatrix.length - 1}
                    />
                ))}
            </div>
        )}
    </div>
  );
};

export default ClientComparisonMatrix;
