
import React from 'react';
import { AiComparisonResult, FullBoqItem } from '../../types';
import { specOverride, withSpecOverride } from '../../lib/specOverrides';

interface ClientMaterialSpecsProps {
    comparisonData: AiComparisonResult;
    tiers: { id?: string, name: string, executionTotal?: number, fullBoq?: FullBoqItem[] }[];
    isLevel2?: boolean;
    projectContext?: any;
    setProjectContext?: any;
}

const ClientMaterialSpecs: React.FC<ClientMaterialSpecsProps> = ({ comparisonData, tiers, isLevel2 = false, projectContext, setProjectContext }) => {
    // If no data, return null to avoid empty section
    if (!tiers || tiers.length === 0) return null;

    /*
      One set of rows for every level, from the matrix `lib/comparison.ts` builds,
      with the studio's edits keyed by option name.

      Level 2 used to build its own rows by scanning the option's BOQ for brand
      keywords, under different headings and with its own edits, so the
      specifications it gave for an option did not match what Level 1 had
      already shown the client for that same option. Level 2 now shows the
      Level 1 rows for its one option, and an edit in either level is the same edit.
    */
    const l1OrderedKeys = [
        'Plywood (Kitchen & Bath)',
        'Plywood (Rest of House)',
        'Hardware System',
        'Laminate – Inner Finish',
        'Laminate – Outer Finish',
        'Wardrobe Drawers & Lofts',
        'Kitchen Shutters',
        'Paint Finish',
        'False Ceiling Material',
        'Electrical Fittings'
    ];

    const l1Rows = l1OrderedKeys.map(key => {
        const foundRow = (comparisonData.materialMatrix || []).find(r => r.feature === key);
        const rowObj: any = { category: key };
        tiers.forEach(t => {
            if (!t) return;
            rowObj[t.name] = foundRow ? (foundRow[t.name] || '-') : '-';
        });
        return rowObj;
    });

    const overrides = projectContext?.proposalContent?.materials?.overrides || {};

    /* Edits are kept with the option, not its name, so a rename keeps them (lib/specOverrides.ts). */
    const handleOverride = (category: string, option: { id?: string; name: string }, newValue: string) => {
        if (!setProjectContext) return;
        setProjectContext((prev: any) => {
            const activeMode = prev.activeProposalMode || 'TURNKEY';
            const modeContent = prev.proposalContentByMode?.[activeMode] || prev.proposalContent || {};
            const materials = modeContent.materials || {};
            const overs = withSpecOverride(materials.overrides, category, option, newValue);

            const updatedModeContent = {
                ...modeContent,
                materials: { ...materials, overrides: overs }
            };

            const newProposalContentByMode = {
                ...(prev.proposalContentByMode || {}),
                [activeMode]: updatedModeContent
            };

            const mainUpdate = activeMode === 'TURNKEY'
                ? { proposalContent: updatedModeContent }
                : {};

            return {
                ...prev,
                proposalContentByMode: newProposalContentByMode,
                ...mainUpdate
            };
        });
    };

    const isSingleTier = tiers.length === 1;
    const sectionTitle = isLevel2 ? "Material Specifications" : "Detailed Specifications & Differences";
    const finalRows = l1Rows;

    return (
        <section id="material-specs" className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 scroll-mt-24">
            <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {isLevel2 ? 'Technical Specs' : (isSingleTier ? 'Specification Sheet' : 'Section 6')}
                </div>
                <h2 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
                    {sectionTitle}
                </h2>
                {(!isLevel2 || isSingleTier) && (
                    <p className="mt-2 text-slate-600 max-w-3xl">
                        {isSingleTier 
                            ? `Detailed material specifications for the ${tiers[0].name} package.`
                            : 'A detailed breakdown of the technical specifications and material grades proposed for each option.'
                        }
                    </p>
                )}
            </div>

            {/* DESKTOP VIEW: TABLE */}
            <div className="hidden md:block mt-6 border-2 border-slate-100 rounded-2xl overflow-hidden">
                <table className="w-full text-sm text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className={`py-4 px-6 font-bold text-slate-800 border-r border-slate-200 ${isSingleTier ? 'w-1/3' : 'w-1/4'}`}>Category</th>
                                    {tiers.map((tier, idx) => (
                                        <th key={tier.id || tier.name} className={`py-4 px-6 font-bold text-slate-800 min-w-[200px] ${idx !== tiers.length - 1 ? 'border-r border-slate-200' : ''}`}>
                                            {!isSingleTier && (
                                                <span className="block text-[10px] font-normal text-slate-500 uppercase tracking-wide mb-1">Option {String.fromCharCode(65 + idx)}</span>
                                            )}
                                            {tier.name}
                                        </th>
                                    ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {finalRows.map((row: any, idx) => (
                            <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                                <td className="py-4 px-6 font-bold text-slate-900 border-r border-slate-100 bg-slate-50/30">
                                    {row.category}
                                </td>
                                {tiers.map((tier, tIdx) => (
                                        <td key={tier.id || tier.name} className={`py-4 px-6 text-slate-700 leading-relaxed align-top ${tIdx !== tiers.length - 1 ? 'border-r border-slate-100' : ''}`}>
                                            <div 
                                               contentEditable={!!setProjectContext} 
                                               suppressContentEditableWarning
                                               onBlur={(e) => handleOverride(row.category, tier, e.currentTarget.innerText)}
                                               className={`whitespace-pre-line ${setProjectContext ? 'hover:bg-slate-100 p-1 rounded min-w-[50px] outline-none focus:ring-2 focus:ring-[#3D52A0]' : ''}`}
                                            >{specOverride(overrides, row.category, tier) ?? row[tier.name]}</div>
                                        </td>
                                    ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* MOBILE VIEW: STACKED CARDS */}
            <div className="md:hidden mt-6 space-y-4">
                {finalRows.map((row: any, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                        <h4 className="font-bold text-slate-900 text-sm mb-4 border-b border-slate-200 pb-2">{row.category}</h4>
                        <div className="space-y-4">
                            {tiers.map((tier) => (
                                    <div key={tier.id || tier.name} className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{tier.name}</span>
                                        <div 
                                           contentEditable={!!setProjectContext} 
                                           suppressContentEditableWarning
                                           onBlur={(e) => handleOverride(row.category, tier, e.currentTarget.innerText)}
                                           className={`text-sm text-slate-800 font-medium bg-white p-2 rounded-lg border border-slate-100 shadow-sm whitespace-pre-line ${setProjectContext ? 'hover:bg-slate-100 outline-none focus:ring-2 focus:ring-[#3D52A0]' : ''}`}
                                        >{specOverride(overrides, row.category, tier) ?? row[tier.name]}</div>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="mt-6 p-4 bg-slate-50 md:bg-white rounded-xl text-center md:border md:border-dashed md:border-slate-300">
                <p className="text-xs md:text-sm font-medium text-slate-500">
                    “Final brands, shades, and finishes will be selected based on sample approvals during project execution.”
                </p>
            </div>
        </section>
    );
};

export default ClientMaterialSpecs;
