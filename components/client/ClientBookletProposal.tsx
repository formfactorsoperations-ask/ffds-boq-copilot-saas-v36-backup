import React, { useMemo, useState } from 'react';
import { ProposalTier, ProjectContext, TimelinePhase, PaymentMilestone, FullBoqItem, ProposalLevel } from '../../types';
import { formatCurrency, calculateSellPrice } from '../../lib/utils';
import { CheckIcon, XIcon, ShieldCheckIcon, HelpCircleIcon, Pencil, Save } from 'lucide-react';
import { useOrg } from '../../contexts/OrgContext';

interface ClientBookletProposalProps {
    tiers: ProposalTier[];
    projectContext: ProjectContext;
    timelinePhases: TimelinePhase[];
    paymentMilestones: PaymentMilestone[];
    level: ProposalLevel;
    settings: any;
    paymentStructure?: any;
    onEditSection?: (sectionId: string) => void;
    setProjectContext?: React.Dispatch<React.SetStateAction<ProjectContext>>;
    isClientViewOnly?: boolean;
}

export const ClientBookletProposal: React.FC<ClientBookletProposalProps> = ({
    tiers = [],
    projectContext,
    timelinePhases = [],
    paymentMilestones = [],
    level,
    settings,
    paymentStructure,
    onEditSection,
    setProjectContext,
    isClientViewOnly = false
}) => {
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const { currentRole } = useOrg();
    const isDesigner = currentRole === 'Designer';
    const showScopePricing = projectContext?.showScopePricing || false;
    
    // Determine the latest Terms Docket from the project context
    const latestDocket = useMemo(() => {
        const dockets = projectContext?.termsDockets || [];
        if (dockets.length === 0) return undefined;
        return dockets.reduce((prev, curr) => (prev.generatedAt > curr.generatedAt) ? prev : curr);
    }, [projectContext?.termsDockets]);
    
    // --- STATE FOR EDITING SPECIFICATIONS ---
    const [isEditingSpecs, setIsEditingSpecs] = useState(false);
    const [editedValues, setEditedValues] = useState<Record<string, string>>({});
    
    // Determine the active tier based on approved tier or first tier
    const isL2 = level === 'LEVEL_2';
    const isL15 = level === 'LEVEL_1_5';
    const approvedTier = useMemo(() => {
        return tiers.find(t => t.id === projectContext.approvedTierId) || tiers[0] || {
            name: "Standard Package",
            summary: { totalSell: 0, designFee: 0 },
            fullBoq: [],
            groupedBoq: {}
        };
    }, [tiers, projectContext.approvedTierId]);

    const activeTier = isL2 ? approvedTier : (tiers[0] || {
        name: "Standard Package",
        summary: { totalSell: 0, designFee: 0 },
        fullBoq: [],
        groupedBoq: {}
    });

    // --- ESTIMATED DURATION & TIMELINE ---
    const totalDays = useMemo(() => {
        if (!timelinePhases || timelinePhases.length === 0) {
            const config = (projectContext?.config || '').toLowerCase();
            if (config.includes('1-bhk') || config.includes('studio')) return 45;
            if (config.includes('2-bhk')) return 60;
            if (config.includes('3-bhk')) return 75;
            if (config.includes('4-bhk') || config.includes('duplex')) return 90;
            if (config.includes('bath')) return 25;
            return 48; // Standard booklet design says 48 working days
        }
        return Math.max(...timelinePhases.map(p => (p.startDay || 0) + p.durationDays));
    }, [timelinePhases, projectContext]);

    const designDays = useMemo(() => {
        if (!timelinePhases || timelinePhases.length === 0) return 14;
        const designPhase = timelinePhases.find(p => p.phaseName === 'Design & Planning');
        return designPhase ? designPhase.durationDays : 14;
    }, [timelinePhases]);

    const executionDays = useMemo(() => {
        return totalDays - designDays > 0 ? totalDays - designDays : 34;
    }, [totalDays, designDays]);

    // --- FINANCIAL CALCULATIONS ---
    const financials = projectContext?.financials;
    const discounts = financials?.discounts || [];
    const gstRate = projectContext?.gstRate || 18;
    const isExecutionGstWaived = financials?.executionGstEnabled === false;

    const baseExecution = isL2 ? (approvedTier.summary?.totalSell || 0) : (activeTier.summary?.totalSell || 0);
    const baseDesign = isL2 ? (approvedTier.summary?.designFee || 0) : (activeTier.summary?.designFee || 0);

    const executionSavings = discounts
        .filter(d => d.target === 'execution')
        .reduce((sum, d) => sum + (d.type === 'percentage' ? baseExecution * (d.value / 100) : d.value), 0);
    const designSavings = discounts
        .filter(d => d.target === 'design')
        .reduce((sum, d) => sum + (d.type === 'percentage' ? baseDesign * (d.value / 100) : d.value), 0);

    const taxableExecution = Math.max(0, baseExecution - executionSavings);
    const taxableDesign = Math.max(0, baseDesign - designSavings);

    const gstOnDesign = taxableDesign * (gstRate / 100);
    const chargedGstOnExecution = isExecutionGstWaived ? 0 : (taxableExecution * (gstRate / 100));

    const finalDesignTotal = taxableDesign + gstOnDesign;
    const finalExecutionTotal = taxableExecution + chargedGstOnExecution;
    const netTaxableValue = taxableExecution + taxableDesign;
    const totalProposedInvestment = finalDesignTotal + finalExecutionTotal;

    // Calculate all-inclusive total investment for each tier for accurate min/max ranges
    const tierInvestments = useMemo(() => {
        if (!tiers || tiers.length === 0) return [totalProposedInvestment];
        return tiers.map(t => {
            const baseExec = t.summary?.totalSell || 0;
            const baseDes = t.summary?.designFee || 0;
            
            const execSavings = discounts
                .filter(d => d.target === 'execution')
                .reduce((sum, d) => sum + (d.type === 'percentage' ? baseExec * (d.value / 100) : d.value), 0);
            const desSavings = discounts
                .filter(d => d.target === 'design')
                .reduce((sum, d) => sum + (d.type === 'percentage' ? baseDes * (d.value / 100) : d.value), 0);
                
            const taxExec = Math.max(0, baseExec - execSavings);
            const taxDes = Math.max(0, baseDes - desSavings);
            
            const gstDes = taxDes * (gstRate / 100);
            const gstExec = isExecutionGstWaived ? 0 : (taxExec * (gstRate / 100));
            
            return taxExec + taxDes + gstDes + gstExec;
        });
    }, [tiers, discounts, gstRate, isExecutionGstWaived, totalProposedInvestment]);

    const investmentMin = useMemo(() => {
        if (tierInvestments.length === 0) return totalProposedInvestment;
        return Math.min(...tierInvestments);
    }, [tierInvestments, totalProposedInvestment]);

    const investmentMax = useMemo(() => {
        if (tierInvestments.length === 0) return totalProposedInvestment;
        return Math.max(...tierInvestments);
    }, [tierInvestments, totalProposedInvestment]);

    // --- GROUP BOQ ITEMS ---
    const carpentryItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('carpentry') || cat.includes('wood') || cat.includes('furniture') || name.includes('wardrobe') || name.includes('loft') || name.includes('cabinet') || name.includes('panelling') || name.includes('tv unit');
        });
    }, [activeTier]);

    const otherItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return !cat.includes('carpentry') && !cat.includes('wood') && !cat.includes('furniture') && !name.includes('wardrobe') && !name.includes('loft') && !name.includes('cabinet') && !name.includes('panelling') && !name.includes('tv unit');
        });
    }, [activeTier]);

    // --- DYNAMIC QUANTUMS FROM BOQ ---
    const civilItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('civil') || cat.includes('masonry') || cat.includes('tile') || cat.includes('plumbing') || cat.includes('demolition') || name.includes('civil') || name.includes('tile') || name.includes('plumbing') || name.includes('demolition');
        });
    }, [activeTier]);

    const ceilingItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('ceiling') || cat.includes('gypsum') || name.includes('ceiling') || name.includes('gypsum');
        });
    }, [activeTier]);

    const paintItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('paint') || cat.includes('finishing') || cat.includes('polish') || name.includes('paint') || name.includes('polish') || name.includes('putty');
        });
    }, [activeTier]);

    const electricalItems = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.filter(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('electrical') || cat.includes('service') || cat.includes('light') || cat.includes('wiring') || name.includes('electrical') || name.includes('point') || name.includes('switch') || name.includes('wiring');
        });
    }, [activeTier]);

    const carpentryQuantum = useMemo(() => {
        if (carpentryItems.length === 0) return '0 sq ft';
        const sqftSum = carpentryItems
            .filter(i => {
                const u = (i.unit || '').toLowerCase();
                return u.includes('sq') || u.includes('sft');
            })
            .reduce((sum, i) => sum + (i.qty || 0), 0);
        const rftSum = carpentryItems
            .filter(i => {
                const u = (i.unit || '').toLowerCase();
                return u.includes('rft') || u.includes('run');
            })
            .reduce((sum, i) => sum + (i.qty || 0), 0);
        const nosSum = carpentryItems
            .filter(i => {
                const u = (i.unit || '').toLowerCase();
                return u.includes('no') || u.includes('pc') || u.includes('unit');
            })
            .reduce((sum, i) => sum + (i.qty || 0), 0);

        const parts = [];
        if (sqftSum > 0) parts.push(`${sqftSum.toFixed(0)} sq ft`);
        if (rftSum > 0) parts.push(`${rftSum.toFixed(0)} Rft`);
        if (nosSum > 0) parts.push(`${nosSum.toFixed(0)} nos`);
        return parts.join(', ') || `${carpentryItems.reduce((sum, i) => sum + (i.qty || 0), 0).toFixed(0)} items`;
    }, [carpentryItems]);

    const ceilingQuantum = useMemo(() => {
        const sum = ceilingItems.reduce((sum, i) => sum + (i.qty || 0), 0);
        return sum > 0 ? `${sum.toFixed(0)} sq ft` : null;
    }, [ceilingItems]);

    const paintQuantum = useMemo(() => {
        const sum = paintItems.reduce((sum, i) => sum + (i.qty || 0), 0);
        return sum > 0 ? `${sum.toFixed(0)} sq ft` : null;
    }, [paintItems]);

    const ceilingAndPaintQuantum = useMemo(() => {
        const parts = [];
        if (ceilingQuantum) parts.push(`${ceilingQuantum} Ceiling`);
        if (paintQuantum) parts.push(`${paintQuantum} Paint`);
        return parts.join(' + ') || 'As per design';
    }, [ceilingQuantum, paintQuantum]);

    const electricalQuantum = useMemo(() => {
        if (electricalItems.length === 0) return '0 points';
        const pointsSum = electricalItems
            .filter(i => {
                const u = (i.unit || '').toLowerCase();
                return u.includes('point') || u.includes('no') || u.includes('pc') || u.includes('unit');
            })
            .reduce((sum, i) => sum + (i.qty || 0), 0);
        const otherSum = electricalItems
            .filter(i => {
                const u = (i.unit || '').toLowerCase();
                return !u.includes('point') && !u.includes('no') && !u.includes('pc') && !u.includes('unit');
            })
            .reduce((sum, i) => sum + (i.qty || 0), 0);

        if (pointsSum > 0) {
            return `${pointsSum.toFixed(0)} points`;
        }
        if (otherSum > 0) {
            return `${otherSum.toFixed(0)} items`;
        }
        return `${electricalItems.reduce((sum, i) => sum + (i.qty || 0), 0).toFixed(0)} items`;
    }, [electricalItems]);

    const hasKitchenInBoq = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('kitchen') || name.includes('kitchen');
        });
    }, [activeTier]);

    const hasWardrobeInBoq = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const cat = (i.cat || '').toLowerCase();
            const name = (i.name || '').toLowerCase();
            return cat.includes('wardrobe') || name.includes('wardrobe') || name.includes('loft');
        });
    }, [activeTier]);

    const hasLooseFurnitureInBoq = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('sofa') || name.includes('dining table') || name.includes('mattress') || name.includes('chair') || name.includes('recliner');
        });
    }, [activeTier]);

    const hasElectricalFixturesInBoq = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('fixture') || name.includes('chandelier') || name.includes('pendant') || name.includes('led strip') || name.includes('appliance');
        });
    }, [activeTier]);

    const dynamicInclusions = useMemo(() => {
        const list = [];
        if (carpentryItems.length > 0) {
            list.push({
                title: 'Custom Carpentry Works',
                desc: carpentryItems.slice(0, 3).map(i => i.name).join(', ') + (carpentryItems.length > 3 ? ' and more.' : '.')
            });
        }
        if (ceilingItems.length > 0) {
            list.push({
                title: 'POP False Ceiling',
                desc: ceilingItems.slice(0, 2).map(i => i.name).join(', ') + (ceilingItems.length > 2 ? ' and more.' : '.')
            });
        }
        if (paintItems.length > 0) {
            list.push({
                title: 'Premium Painting & Finishing',
                desc: paintItems.slice(0, 2).map(i => i.name).join(', ') + (paintItems.length > 2 ? ' and more.' : '.')
            });
        }
        if (electricalItems.length > 0) {
            list.push({
                title: 'Electrical Work & Services',
                desc: electricalItems.slice(0, 3).map(i => i.name).join(', ') + (electricalItems.length > 3 ? ' and more.' : '.')
            });
        }
        if (civilItems.length > 0) {
            list.push({
                title: 'Civil & Masonry Works',
                desc: civilItems.slice(0, 3).map(i => i.name).join(', ') + (civilItems.length > 3 ? ' and more.' : '.')
            });
        }
        if (list.length === 0) {
            list.push({
                title: 'Interior Design & Turnkey Scope',
                desc: 'A complete custom interior package tailored for your residence, as listed in the detailed BOQ pages.'
            });
        }
        return list;
    }, [carpentryItems, ceilingItems, paintItems, electricalItems, civilItems]);

    const dynamicExclusions = useMemo(() => {
        const list = [];
        if (!hasKitchenInBoq) {
            list.push({
                title: 'Modular Kitchen base & wall cabinetry',
                desc: 'Can be quoted separately as an addendum based on finalized appliance selection.'
            });
        }
        if (!hasWardrobeInBoq) {
            list.push({
                title: 'Wardrobes, Lofts & Bedroom Carpentry',
                desc: 'Can be added as per layouts and priced based on required sheets.'
            });
        }
        if (!hasElectricalFixturesInBoq) {
            list.push({
                title: 'Electrical fixtures and fitting materials',
                desc: 'Charged separately as actuals against vendor bills or direct client purchase.'
            });
        }
        if (!hasLooseFurnitureInBoq) {
            list.push({
                title: 'Loose Furniture, Accessories & Decor',
                desc: 'Sofas, dining tables, mattresses, and decorative wall arts are excluded.'
            });
        }
        if (list.length === 0) {
            list.push({
                title: 'Structural alterations & external works',
                desc: 'Major core cutting, external waterproofing, and society exterior changes.'
            });
        }
        return list;
    }, [hasKitchenInBoq, hasWardrobeInBoq, hasElectricalFixturesInBoq, hasLooseFurnitureInBoq]);

    const dynamicBulletPoints = useMemo(() => {
        const bullets = [];
        bullets.push('✓ Professional, turnkey management from site setup to handover');
        
        if (carpentryItems.length > 0) {
            const sampleCarp = carpentryItems.slice(0, 2).map(i => i.name).join(', ');
            bullets.push(`✓ Custom carpentry: including ${sampleCarp}`);
        }
        if (ceilingItems.length > 0) {
            bullets.push('✓ Premium gypsum false ceilings with planned electrical cut-outs');
        }
        if (paintItems.length > 0) {
            bullets.push('✓ Complete interior painting and finishing using premium paint materials');
        }
        if (electricalItems.length > 0) {
            bullets.push('✓ Systematic electrical wiring, switches, and service point coordination');
        }
        if (civilItems.length > 0) {
            bullets.push('✓ Custom civil/masonry works, structural tweaks, and surface tiling as per layouts');
        }
        
        while (bullets.length < 4) {
            bullets.push('✓ Strict supervision and daily quality check reports');
        }
        return bullets.slice(0, 4);
    }, [carpentryItems, ceilingItems, paintItems, electricalItems, civilItems]);

    const dynamicSpecExclusions = useMemo(() => {
        const specs = [];
        if (!hasKitchenInBoq) {
            specs.push('✕ Kitchen shutters & base carcass');
        }
        if (!hasWardrobeInBoq) {
            specs.push('✕ Wardrobe carcass, shutters & lofts');
        }
        
        const hasCounterStone = activeTier.fullBoq?.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('stone') || name.includes('quartz') || name.includes('countertop');
        });
        if (!hasCounterStone) {
            specs.push('✕ Premium countertop quartz or granite');
        }
        
        specs.push('✕ White goods and kitchen appliances');
        specs.push('✕ Decorative wallpaper and customized art');
        
        return specs.slice(0, 4);
    }, [hasKitchenInBoq, hasWardrobeInBoq, activeTier]);

    // --- DYNAMIC SPECIFICATIONS FROM BOQ OR OVERRIDES ---
    const dynamicSpecs = useMemo(() => {
        const items = activeTier.fullBoq || [];
        const overrides = projectContext?.proposalContent?.materials?.overrides || {};

        const specsConfig = [
            {
                category: 'Plywood',
                matcher: (i: FullBoqItem) => (i.cat || '').toLowerCase().includes('carpentry') || (i.cat || '').toLowerCase().includes('wood') || (i.cat || '').toLowerCase().includes('kitchen'),
                keywords: ['BWP', 'BWR', 'Marine', 'MR Grade', 'Commercial', '710', '303', 'Century', 'Greenply', 'Kitply'],
                defaultMat: 'Commercial / MR Grade Plywood (BWP for wet areas)'
            },
            {
                category: 'Hardware System',
                matcher: (i: FullBoqItem) => (i.cat || '').toLowerCase().includes('hardware') || (i.specs || '').toLowerCase().includes('hinge') || (i.specs || '').toLowerCase().includes('channel') || (i.name || '').toLowerCase().includes('drawer'),
                keywords: ['Soft-close', 'Hettich', 'Ebco', 'Godrej', 'Hinges', 'Channels', 'Blum', 'Hafele'],
                defaultMat: 'SS soft-close hinges & telescopic channels'
            },
            {
                category: 'Laminate — Inner',
                matcher: (i: FullBoqItem) => (i.specs || '').toLowerCase().includes('laminate') && ((i.specs || '').toLowerCase().includes('inner') || (i.specs || '').toLowerCase().includes('liner') || (i.name || '').toLowerCase().includes('inner')),
                keywords: ['0.8mm', 'white liner', 'balancing', 'liner'],
                defaultMat: '0.8mm balancing white liner laminate'
            },
            {
                category: 'Laminate — Outer',
                matcher: (i: FullBoqItem) => (i.specs || '').toLowerCase().includes('laminate') && !((i.specs || '').toLowerCase().includes('inner') || (i.specs || '').toLowerCase().includes('liner') || (i.name || '').toLowerCase().includes('inner')),
                keywords: ['Merino', 'Greenlam', 'Royal Touche', 'Century', '1mm', '1.25mm', 'Acrylic', 'PU', 'Suede', 'Gloss', 'Matt'],
                defaultMat: '1.0mm premium suede/gloss finish laminate'
            },
            {
                category: 'Paint Finish',
                matcher: (i: FullBoqItem) => (i.cat || '').toLowerCase().includes('paint') || (i.cat || '').toLowerCase().includes('finishing') || (i.cat || '').toLowerCase().includes('polish'),
                keywords: ['Royale', 'Apcolite', 'Asian Paints', 'Dulux', 'Velvet', 'Matt', 'Royale Matt'],
                defaultMat: 'Premium emulsion paint (Asian Paints Royale / equivalent)'
            },
            {
                category: 'False Ceiling',
                matcher: (i: FullBoqItem) => (i.cat || '').toLowerCase().includes('ceiling') || (i.cat || '').toLowerCase().includes('gypsum') || (i.name || '').toLowerCase().includes('ceiling') || (i.name || '').toLowerCase().includes('pop'),
                keywords: ['Gypsum', 'Saint Gobain', 'POP', 'Grid'],
                defaultMat: 'Gypsum board ceiling with metal framework & POP finish'
            },
            {
                category: 'Electrical',
                matcher: (i: FullBoqItem) => (i.cat || '').toLowerCase().includes('electrical') || (i.cat || '').toLowerCase().includes('service') || (i.cat || '').toLowerCase().includes('wiring'),
                keywords: ['Polycab', 'Finolex', 'Anchor', 'Legrand', 'GM', 'Schneider', 'Norisys', 'Havells'],
                defaultMat: 'FRLS copper wiring (Polycab/Finolex) with modular switches (GM/Anchor)'
            }
        ];

        return specsConfig.map(config => {
            let overriddenValue = '';
            
            const normKey = config.category.toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const key of Object.keys(overrides)) {
                const normOverrideKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normOverrideKey.includes(normKey) || normKey.includes(normOverrideKey)) {
                    const overrideObj = overrides[key];
                    if (overrideObj) {
                        overriddenValue = overrideObj['material'] || overrideObj[activeTier.name] || overrideObj['Specified Standard'] || '';
                        break;
                    }
                }
            }

            if (overriddenValue) {
                return {
                    category: config.category,
                    value: overriddenValue
                };
            }

            const relevantItems = items.filter(config.matcher);
            const foundKeywords = new Set<string>();
            relevantItems.forEach(i => {
                const text = `${i.name} ${i.specs || ''}`;
                config.keywords.forEach(k => {
                    if (text.toLowerCase().includes(k.toLowerCase())) {
                        foundKeywords.add(k);
                    }
                });
            });

            const value = foundKeywords.size > 0 
                ? Array.from(foundKeywords).join(', ') 
                : config.defaultMat;

            return {
                category: config.category,
                value: value
            };
        });
    }, [activeTier, projectContext]);

    const startEditingSpecs = () => {
        const initialValues: Record<string, string> = {};
        dynamicSpecs.forEach(spec => {
            initialValues[spec.category] = spec.value;
        });
        setEditedValues(initialValues);
        setIsEditingSpecs(true);
    };

    const saveSpecs = () => {
        if (!setProjectContext) return;
        setProjectContext((prev: any) => {
            const activeMode = prev.activeProposalMode || 'TURNKEY';
            const modeContent = prev.proposalContentByMode?.[activeMode] || prev.proposalContent || {};
            const materials = modeContent.materials || {};
            const overs = materials.overrides ? { ...materials.overrides } : {};

            Object.entries(editedValues).forEach(([category, val]) => {
                if (!overs[category]) overs[category] = {};
                overs[category]['material'] = val;
                overs[category]['Specified Standard'] = val;
                overs[category][activeTier.name] = val;
            });

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
        setIsEditingSpecs(false);
    };

    // --- CLARITY - NOT IN SCOPE DYNAMIC CHECKS ---
    const hasKitchenBaseWall = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            const cat = (i.cat || '').toLowerCase();
            return (cat.includes('kitchen') || name.includes('kitchen')) && 
                   (name.includes('base') || name.includes('wall') || name.includes('cabinet') || name.includes('carcass'));
        });
    }, [activeTier]);

    const hasKitchenShutters = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            const cat = (i.cat || '').toLowerCase();
            return (cat.includes('kitchen') || name.includes('kitchen')) && name.includes('shutter');
        });
    }, [activeTier]);

    const hasCountertop = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            const cat = (i.cat || '').toLowerCase();
            return name.includes('counter') || name.includes('quartz') || name.includes('granite') || name.includes('stone') || name.includes('platform');
        });
    }, [activeTier]);

    const hasTallUnit = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('tall') || name.includes('pantry');
        });
    }, [activeTier]);

    const hasKitchenAccessories = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            const cat = (i.cat || '').toLowerCase();
            return name.includes('basket') || name.includes('hardware') || name.includes('tandem') || name.includes('pull out') || name.includes('accessory') || name.includes('cutlery');
        });
    }, [activeTier]);

    const hasWardrobes = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            const cat = (i.cat || '').toLowerCase();
            return name.includes('wardrobe') || name.includes('sliding wardrobe') || name.includes('swing wardrobe');
        });
    }, [activeTier]);

    const hasLofts = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            const cat = (i.cat || '').toLowerCase();
            return name.includes('loft') || name.includes('overhead');
        });
    }, [activeTier]);

    const hasBeds = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('bed') || name.includes('headboard') || name.includes('cot');
        });
    }, [activeTier]);

    const hasStudy = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('study') || name.includes('desk') || name.includes('writing');
        });
    }, [activeTier]);

    const hasVanity = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('vanity') || name.includes('basin cabinet') || name.includes('under counter');
        });
    }, [activeTier]);

    const hasMirrorUnit = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('mirror') || name.includes('looking glass');
        });
    }, [activeTier]);

    const hasBathroomStorage = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            const cat = (i.cat || '').toLowerCase();
            return (cat.includes('bath') || cat.includes('toilet') || cat.includes('vanity')) && 
                   (name.includes('storage') || name.includes('cabinet') || name.includes('shelf') || name.includes('rack'));
        });
    }, [activeTier]);

    const hasAnyCarpentryIncluded = useMemo(() => {
        return hasKitchenBaseWall || hasKitchenShutters || hasCountertop || hasTallUnit || hasKitchenAccessories ||
               hasWardrobes || hasLofts || hasBeds || hasStudy ||
               hasVanity || hasMirrorUnit || hasBathroomStorage;
    }, [
        hasKitchenBaseWall, hasKitchenShutters, hasCountertop, hasTallUnit, hasKitchenAccessories,
        hasWardrobes, hasLofts, hasBeds, hasStudy,
        hasVanity, hasMirrorUnit, hasBathroomStorage
    ]);

    const hasElectricalFittings = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('fixture') || name.includes('chandelier') || name.includes('pendant') || name.includes('appliance') || name.includes('switchgear') || name.includes('fitting');
        });
    }, [activeTier]);

    const hasLooseFurniture = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('sofa') || name.includes('dining table') || name.includes('chair') || name.includes('recliner') || name.includes('dining set') || name.includes('loose');
        });
    }, [activeTier]);

    const hasWhiteGoods = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('hob') || name.includes('chimney') || name.includes('microwave') || name.includes('refrigerator') || name.includes('appliance') || name.includes('ac') || name.includes('television') || name.includes('washing machine');
        });
    }, [activeTier]);

    const hasDecor = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('wallpaper') || name.includes('curtain') || name.includes('blind') || name.includes('decor') || name.includes('soft furnishing') || name.includes('mattress');
        });
    }, [activeTier]);

    const hasPlumbing = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            const cat = (i.cat || '').toLowerCase();
            return cat.includes('plumbing') || name.includes('plumbing') || name.includes('sanitary') || name.includes('faucet') || name.includes('diverter') || name.includes('toilet') || name.includes('commode') || name.includes('basin') || name.includes('sink') || name.includes('tap');
        });
    }, [activeTier]);

    const hasWaterproofing = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            const cat = (i.cat || '').toLowerCase();
            return cat.includes('waterproof') || name.includes('waterproof');
        });
    }, [activeTier]);

    const hasFlooring = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            const cat = (i.cat || '').toLowerCase();
            return cat.includes('flooring') || cat.includes('tile') || name.includes('flooring') || name.includes('tile') || name.includes('marble') || name.includes('granite') || name.includes('stone work');
        });
    }, [activeTier]);

    const hasProfileCove = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('profile') || name.includes('cove') || name.includes('strip') || name.includes('led');
        });
    }, [activeTier]);

    const hasVeneerFluted = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('veneer') || name.includes('fluted') || name.includes('charcoal') || name.includes('louver') || name.includes('louvers') || name.includes('upgraded panel');
        });
    }, [activeTier]);

    const hasDbUpgrades = useMemo(() => {
        const boq = activeTier.fullBoq || [];
        return boq.some(i => {
            const name = (i.name || '').toLowerCase();
            return name.includes('distribution board') || name.includes('db upgrade') || name.includes('earthing') || name.includes('switchgear');
        });
    }, [activeTier]);

    const kitchenExclusionText = useMemo(() => {
        const missing = [];
        if (!hasKitchenBaseWall) missing.push("base & wall units");
        if (!hasKitchenShutters) missing.push("shutters");
        if (!hasCountertop) missing.push("countertop");
        if (!hasTallUnit) missing.push("tall unit");
        if (!hasKitchenAccessories) missing.push("accessories");
        if (missing.length === 5) {
            return "Modular kitchen — base and wall units, shutters, counter, tall unit, accessories";
        }
        if (missing.length > 0) {
            return `Modular kitchen components: ${missing.join(", ")}`;
        }
        return null;
    }, [hasKitchenBaseWall, hasKitchenShutters, hasCountertop, hasTallUnit, hasKitchenAccessories]);

    const wardrobeExclusionText = useMemo(() => {
        const missing = [];
        if (!hasWardrobes) missing.push("wardrobes");
        if (!hasLofts) missing.push("lofts");
        if (!hasBeds) missing.push("beds");
        if (!hasStudy) missing.push("study units");
        if (missing.length === 4) {
            return "Wardrobes, lofts, beds and study units";
        }
        if (missing.length > 0) {
            return `Bedroom carpentry components: ${missing.join(", ")}`;
        }
        return null;
    }, [hasWardrobes, hasLofts, hasBeds, hasStudy]);

    const bathroomExclusionText = useMemo(() => {
        const missing = [];
        if (!hasVanity) missing.push("vanity base");
        if (!hasMirrorUnit) missing.push("mirror unit");
        if (!hasBathroomStorage) missing.push("storage");
        if (missing.length === 3) {
            return "Bathroom vanity, mirror unit and storage";
        }
        if (missing.length > 0) {
            return `Bathroom carpentry components: ${missing.join(", ")}`;
        }
        return null;
    }, [hasVanity, hasMirrorUnit, hasBathroomStorage]);

    const electricalFittingsExclusionText = useMemo(() => {
        return !hasElectricalFittings ? "Electrical fittings, decorative fixtures, switchgear and wiring materials" : null;
    }, [hasElectricalFittings]);

    const dbExclusionText = useMemo(() => {
        return !hasDbUpgrades ? "Distribution board upgrades and earthing works" : null;
    }, [hasDbUpgrades]);

    const looseFurnitureExclusionText = useMemo(() => {
        return !hasLooseFurniture ? "Loose furniture — sofas, chairs, dining sets, coffee tables" : null;
    }, [hasLooseFurniture]);

    const whiteGoodsExclusionText = useMemo(() => {
        return !hasWhiteGoods ? "White goods, kitchen hobs, chimneys, and electrical appliances" : null;
    }, [hasWhiteGoods]);

    const decorExclusionText = useMemo(() => {
        return !hasDecor ? "Décor, mattresses, wallpapers, curtains, blinds and soft furnishing" : null;
    }, [hasDecor]);

    const plumbingExclusionText = useMemo(() => {
        const missing = [];
        if (!hasPlumbing) missing.push("plumbing lines & fittings");
        if (!hasWaterproofing) missing.push("waterproofing works");
        if (missing.length === 2) {
            return "Plumbing, waterproofing and sanitaryware";
        }
        if (missing.length > 0) {
            return `${missing.join(" and ").replace(/^\w/, c => c.toUpperCase())}`;
        }
        return null;
    }, [hasPlumbing, hasWaterproofing]);

    const flooringExclusionText = useMemo(() => {
        return !hasFlooring ? "Flooring, tiling and stone work" : null;
    }, [hasFlooring]);

    const stoneCounterExclusionText = useMemo(() => {
        return !hasCountertop ? "Stone or quartz counter tops and cladding" : null;
    }, [hasCountertop]);

    const profileCoveExclusionText = useMemo(() => {
        return !hasProfileCove ? "Profile, cove and integrated LED lighting" : null;
    }, [hasProfileCove]);

    const veneerExclusionText = useMemo(() => {
        return !hasVeneerFluted ? "Veneer, fluted or upgraded panel finishes unless separately approved" : null;
    }, [hasVeneerFluted]);

    const administrativeExclusionText = "Government, municipal and society charges, deposits and permissions";

    const annexureExclusionsList = useMemo(() => {
        const raw = [
            kitchenExclusionText,
            wardrobeExclusionText,
            bathroomExclusionText,
            electricalFittingsExclusionText,
            dbExclusionText,
            looseFurnitureExclusionText,
            whiteGoodsExclusionText,
            decorExclusionText,
            plumbingExclusionText,
            flooringExclusionText,
            stoneCounterExclusionText,
            profileCoveExclusionText,
            veneerExclusionText,
            administrativeExclusionText
        ].filter(Boolean) as string[];
        
        const half = Math.ceil(raw.length / 2);
        const col1 = raw.slice(0, half);
        const col2 = raw.slice(half);
        return { col1, col2 };
    }, [
        kitchenExclusionText,
        wardrobeExclusionText,
        bathroomExclusionText,
        electricalFittingsExclusionText,
        dbExclusionText,
        looseFurnitureExclusionText,
        whiteGoodsExclusionText,
        decorExclusionText,
        plumbingExclusionText,
        flooringExclusionText,
        stoneCounterExclusionText,
        profileCoveExclusionText,
        veneerExclusionText
    ]);

    const renderScopeItem = (label: string, isIncluded: boolean) => {
        if (isIncluded) {
            return (
                <span key={label} className="text-slate-700 text-xs py-1 font-medium flex items-center gap-1.5">
                    <span className="text-slate-900 font-serif">✓</span> {label}
                </span>
            );
        } else {
            return (
                <span key={label} className="text-slate-400 text-xs py-1 line-through flex items-center gap-1.5">
                    <span className="text-slate-300 font-serif">✕</span> {label}
                </span>
            );
        }
    };

    // Format utility
    const formatINR = (val: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(val);
    };

    return (
        <div className="vnext-proposal-wrapper bg-white min-h-screen text-slate-800 font-sans print:bg-white print:text-black">
            
            {/* ================= PAGE 1: COVER ================= */}
            {/* ================= PAGE 1: COVER ================= */}
            {(() => {
                const coverStyle = (projectContext as any).coverStyle || 'photo';
                
                if (coverStyle === 'minimal') {
                    return (
                        <div className="relative h-[29.7cm] flex flex-col justify-between bg-slate-50 text-[#1C1917] p-16 md:p-24 print:h-[28.5cm] print:page-break-after-always">
                            {/* Inner gold hairline frame */}
                            <div className="absolute inset-8 border border-[#C5A880]/30 pointer-events-none"></div>
                            
                            <div className="flex flex-col gap-1 border-l-2 border-[#C5A880] pl-4 relative z-10">
                                <span className="text-xl font-black tracking-widest text-[#0F172A] font-serif">{settings?.companyName?.toUpperCase() || 'FORM FACTORS'}</span>
                                <span className="text-[9px] uppercase tracking-[0.3em] text-stone-500 font-sans">DESIGN STUDIO</span>
                            </div>

                            <div className="flex-1 flex flex-col justify-center space-y-8 relative z-10 max-w-3xl">
                                <div className="space-y-3">
                                    <span className="text-[11px] uppercase tracking-[0.4em] text-[#C5A880] font-extrabold block font-sans">
                                        {isL2 ? 'Level 2 · Planning & Readiness Booklet' : isL15 ? 'Level 1.5 · Interim Scope Review' : 'Level 1 · Design-led Turnkey Proposal'}
                                    </span>
                                    <div className="h-[1px] w-12 bg-[#C5A880]"></div>
                                </div>
                                
                                <div className="space-y-4">
                                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-none text-stone-900 font-serif">
                                        {projectContext.name || 'Your Residence'}
                                    </h1>
                                    <p className="text-lg md:text-xl text-[#C5A880] tracking-wider font-sans font-semibold uppercase">
                                        {projectContext.config || '2 BHK Residence'} — {projectContext.location || 'Site Location'}
                                    </p>
                                </div>
                                
                                <p className="text-stone-500 font-light max-w-xl text-sm leading-relaxed font-sans">
                                    A curated turnkey architectural journey integrating spatial design, detailed craftsmanship, material procurement, and precise on-site execution under a singular, cohesive design intent.
                                </p>
                                
                                <div className="inline-flex w-fit items-center gap-2 px-4 py-2 border border-[#C5A880]/40 rounded bg-white/70 text-[9px] font-bold uppercase tracking-widest text-[#C5A880] shadow-sm font-sans">
                                    DESIGN + EXECUTION + HANDOVER · COHESIVE SYSTEM
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-8 border-t border-stone-200 mt-auto relative z-10">
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold">PREPARED FOR</span>
                                    <span className="text-sm font-extrabold text-stone-900 mt-1 block">{projectContext.clientName || 'Valued Client'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold">LOCATION</span>
                                    <span className="text-sm font-extrabold text-stone-900 mt-1 block">{projectContext.location || 'Mumbai'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold">DATE</span>
                                    <span className="text-sm font-extrabold text-stone-900 mt-1 block">{today}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold">CONFIDENTIALITY</span>
                                    <span className="text-sm font-extrabold text-stone-900 mt-1 block">CONFIDENTIAL</span>
                                </div>
                            </div>
                        </div>
                    );
                }

                if (coverStyle === 'photo') {
                    return (
                        <div className="relative h-[29.7cm] flex flex-col justify-between bg-slate-50 text-stone-800 p-16 md:p-24 print:h-[28.5cm] print:page-break-after-always overflow-hidden">
                            {/* Abstract linear layout mimicking architecture blueprint */}
                            <div className="absolute top-0 right-0 w-2/5 h-full opacity-10 border-l border-dashed border-[#C5A880]/50 pointer-events-none hidden md:block">
                                <div className="absolute top-1/4 right-0 w-96 h-96 rounded-full border border-[#C5A880]"></div>
                                <div className="absolute top-1/3 right-12 w-64 h-64 rounded-full border border-stone-400"></div>
                                <div className="absolute top-0 right-24 w-[1px] h-full bg-stone-300"></div>
                                <div className="absolute top-[40%] right-0 w-full h-[1px] bg-[#C5A880]/50"></div>
                            </div>

                            <div className="flex flex-col gap-1 border-l-2 border-[#C5A880] pl-4 relative z-10">
                                <span className="text-xl font-bold tracking-widest text-stone-900">{settings?.companyName?.toUpperCase() || 'FORM FACTORS'}</span>
                                <span className="text-[10px] uppercase tracking-[0.3em] text-stone-500">DESIGN STUDIO</span>
                            </div>

                            <div className="flex-1 flex flex-col justify-center space-y-8 relative z-10 max-w-3xl">
                                <div className="space-y-2">
                                    <span className="text-xs uppercase tracking-[0.4em] text-[#C5A880] font-bold">
                                        {isL2 ? 'Level 2 · Planning & Readiness Booklet' : isL15 ? 'Level 1.5 · Interim Scope Review' : 'Level 1 · Design-led Turnkey Proposal'}
                                    </span>
                                    <div className="h-[2px] w-16 bg-stone-900 mt-2"></div>
                                </div>

                                <div className="space-y-6">
                                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-none text-stone-950">
                                        {projectContext.name || 'Your Residence'}
                                    </h1>
                                    <p className="text-xl text-stone-600 font-light">
                                        {projectContext.config || '2 BHK Residence'} — {projectContext.location || 'Site Location'}
                                    </p>
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-100 border border-stone-200 rounded text-[10px] font-bold uppercase tracking-wider text-stone-500">
                                        DESIGN + PLAN + BUILD
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-8 border-t border-stone-200 mt-auto relative z-10">
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold font-sans">PREPARED FOR</span>
                                    <span className="text-sm font-bold text-stone-950 mt-block mt-1">{projectContext.clientName || 'Valued Client'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold font-sans">LOCATION</span>
                                    <span className="text-sm font-bold text-stone-950 mt-block mt-1">{projectContext.location || 'Mumbai'}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold font-sans">DATE</span>
                                    <span className="text-sm font-bold text-stone-950 mt-block mt-1">{today}</span>
                                </div>
                                <div>
                                    <span className="block text-[9px] uppercase tracking-widest text-[#C5A880] font-bold font-sans">CONFIDENTIALITY</span>
                                    <span className="text-sm font-bold text-stone-950 mt-block mt-1">CONFIDENTIAL</span>
                                </div>
                            </div>
                        </div>
                    );
                }

                // Default "bold" (dark luxury slate)
                return (
                    <div className="relative h-[29.7cm] flex flex-col justify-between bg-[#0F172A] text-white p-16 md:p-24 print:h-[28.5cm] print:page-break-after-always">
                        <div className="flex flex-col gap-1 border-l-2 border-[#C5A880] pl-4">
                            <span className="text-xl font-bold tracking-widest text-[#C5A880]">{settings?.companyName?.toUpperCase() || 'FORM FACTORS'}</span>
                            <span className="text-xs uppercase tracking-[0.3em] text-slate-400">DESIGN STUDIO</span>
                        </div>

                        <div className="flex-1 flex flex-col justify-center space-y-6">
                            <span className="text-xs uppercase tracking-[0.4em] text-[#C5A880] font-bold">
                                {isL2 ? 'Level 2 · Planning & Readiness Booklet' : isL15 ? 'Level 1.5 · Interim Scope Review' : 'Level 1 · Design-led Turnkey Proposal'}
                            </span>
                            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-none text-white">
                                {projectContext.name || 'Your Residence'}
                            </h1>
                            <p className="text-xl md:text-2xl text-slate-300 font-light max-w-2xl">
                                {projectContext.config || '2 BHK Residence'} — {projectContext.location || 'Site Location'}
                            </p>
                            
                            <div className="inline-flex w-fit items-center gap-2 px-4 py-2 border border-slate-700 rounded bg-slate-800/50 text-xs font-bold uppercase tracking-widest text-slate-300">
                                DESIGN + EXECUTION + HANDOVER · ONE ENGAGEMENT
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-8 border-t border-slate-800 mt-auto">
                            <div>
                                <span className="block text-[10px] uppercase tracking-widest text-[#C5A880] font-bold">Prepared For</span>
                                <span className="text-base font-bold text-white mt-1 block">{projectContext.clientName || 'Valued Client'}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase tracking-widest text-[#C5A880] font-bold">Location</span>
                                <span className="text-base font-bold text-white mt-1 block">{projectContext.location || 'Mumbai'}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase tracking-widest text-[#C5A880] font-bold">Date</span>
                                <span className="text-base font-bold text-white mt-1 block">{today}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase tracking-widest text-[#C5A880] font-bold">Confidentiality</span>
                                <span className="text-base font-bold text-white mt-1 block">Confidential</span>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ================= PAGE 2: RECOMMENDATION ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-slate-50 border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">Our Recommendation</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">One team, one responsibility</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-center">
                    <div className="lg:col-span-6 space-y-6">
                        <p className="text-xl font-bold leading-relaxed text-slate-800">
                            We recommend delivering your home as a <strong className="text-[#0F172A] border-b border-[#C5A880]">single design-led turnkey engagement</strong>.
                        </p>
                        <p className="text-slate-600 text-base leading-relaxed">
                            Design, materials, procurement, execution, and handover stay under one coordinated responsibility. This completely eliminates alignment friction, vendor gaps, and surprise budget overruns, leaving you with one professional team to hold accountable rather than a fragmented chain of contractors.
                        </p>
                    </div>

                    <div className="lg:col-span-6 space-y-4">
                        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm flex gap-4">
                            <span className="text-2xl font-black text-[#C5A880] shrink-0 font-mono">01</span>
                            <div>
                                <h4 className="font-bold text-slate-900 text-base">End-to-end execution</h4>
                                <p className="text-xs text-slate-500 mt-1">{settings?.companyName || 'FFDS'} contracts, procures, executes and supervises the listed scope entirely.</p>
                            </div>
                        </div>

                        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm flex gap-4">
                            <span className="text-2xl font-black text-[#C5A880] shrink-0 font-mono">02</span>
                            <div>
                                <h4 className="font-bold text-slate-900 text-base">Written specifications</h4>
                                <p className="text-xs text-slate-500 mt-1">Every material grade, brand and finish is explicitly documented and confirmed against physical samples.</p>
                            </div>
                        </div>

                        <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm flex gap-4">
                            <span className="text-2xl font-black text-[#C5A880] shrink-0 font-mono">03</span>
                            <div>
                                <h4 className="font-bold text-slate-900 text-base">Defined programme</h4>
                                <p className="text-xs text-slate-500 mt-1">{totalDays} working days with start conditions clearly defined, ensuring any delay has a transparent, visible cause.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page 2 of 15</span>
                </div>
            </div>

            {/* ================= PAGE 3: INVESTMENT ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-white border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">The Investment</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">Total proposed project investment</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-stretch">
                    <div className="lg:col-span-5 bg-[#0F172A] text-white p-8 rounded-2xl flex flex-col justify-between shadow-xl">
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-bold">TOTAL, ALL INCLUSIVE</span>
                            <div className="text-3xl md:text-4xl font-black mt-4 font-mono text-white">
                                {isL2 || investmentMin === investmentMax ? formatINR(totalProposedInvestment) : `${formatINR(investmentMin)} - ${formatINR(investmentMax)}`}
                            </div>
                            <span className="text-xs text-slate-400 mt-2 block">Inclusive of applicable GST at {gstRate}%</span>
                        </div>

                        <div className="mt-8 pt-8 border-t border-slate-800 text-xs text-slate-300 leading-relaxed space-y-3">
                            <p>
                                <strong className="text-white">Current proposed value.</strong> The final turnkey order value is confirmed after site validation, design freeze, Schedule of Finishes approval and final BOQ sign-off.
                            </p>
                        </div>
                    </div>

                    <div className="lg:col-span-7 flex flex-col justify-center">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider">
                                    <th className="text-left py-3">Component</th>
                                    <th className="text-left py-3">Basis</th>
                                    <th className="text-right py-3">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                <tr>
                                    <td className="py-4 font-bold text-slate-800">Turnkey Execution Value</td>
                                    <td className="py-4 text-slate-500">As listed scope</td>
                                    <td className="py-4 text-right font-mono font-bold text-slate-950">{formatINR(taxableExecution)}</td>
                                </tr>
                                <tr>
                                    <td className="py-4 font-bold text-slate-800">Design & Coordination Fee</td>
                                    <td className="py-4 text-slate-500">Fixed fee</td>
                                    <td className="py-4 text-right font-mono font-bold text-slate-950">{formatINR(taxableDesign)}</td>
                                </tr>
                                <tr className="bg-slate-50 font-bold">
                                    <td className="py-4 px-3 text-slate-800">Net Taxable Value</td>
                                    <td className="py-4 px-3"></td>
                                    <td className="py-4 px-3 text-right font-mono text-slate-950">{formatINR(netTaxableValue)}</td>
                                </tr>
                                <tr>
                                    <td className="py-4 font-bold text-slate-800">Applicable GST</td>
                                    <td className="py-4 text-slate-500">{gstRate}% on {settings?.companyName || 'FFDS'} invoiced value</td>
                                    <td className="py-4 text-right font-mono font-bold text-slate-950">{formatINR(gstOnDesign + chargedGstOnExecution)}</td>
                                </tr>
                                <tr className="border-t-2 border-[#0F172A] font-black text-base">
                                    <td className="py-4 text-slate-950">Total Project Investment</td>
                                    <td className="py-4"></td>
                                    <td className="py-4 text-right font-mono text-[#0F172A]">{formatINR(totalProposedInvestment)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page 3 of 15</span>
                </div>
            </div>

            {/* ================= PAGE 4: AT A GLANCE ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-slate-50 border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">At a Glance</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">What is included</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 my-auto">
                    <div className="space-y-6">
                        <span className="text-xs uppercase tracking-wider text-slate-400 font-bold block border-b border-slate-200 pb-2">IN THE TURNKEY SCOPE</span>
                        <ul className="space-y-4">
                            {dynamicInclusions.map((inc, i) => (
                                <li key={i} className="flex items-start gap-3 text-slate-700">
                                    <CheckIcon className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                                    <div>
                                        <strong className="text-slate-900 block font-medium">{inc.title}</strong>
                                        <span className="text-xs text-slate-500 block">{inc.desc}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="space-y-6">
                        <span className="text-xs uppercase tracking-wider text-slate-400 font-bold block border-b border-slate-200 pb-2">NOT INCLUDED IN BASELINE</span>
                        <ul className="space-y-4">
                            {dynamicExclusions.map((exc, i) => (
                                <li key={i} className="flex items-start gap-3 text-slate-500">
                                    <XIcon className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
                                    <div>
                                        <span className="text-slate-400 block line-through">{exc.title}</span>
                                        <span className="text-xs text-slate-400 block">{exc.desc}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 text-xs text-slate-600 flex justify-between items-center">
                    <span><strong>Scope Discipline:</strong> This booklet prices only the turnkey package items. Other carpentry can be quoted separately as addendums.</span>
                    <span className="font-bold uppercase tracking-wider text-slate-900 shrink-0 ml-4">Full Exclusions · Annexure A</span>
                </div>
            </div>

            {/* ================= PAGE 5: HOW WE WORK ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-white border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">How We Work</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">From concept to handover</h2>
                </div>

                <div className="grid grid-cols-5 gap-4 my-auto relative pt-12">
                    {/* Connecting line */}
                    <div className="absolute top-16 left-[10%] right-[10%] h-[2px] bg-slate-200 -z-10 hidden md:block" />

                    <div className="text-center px-2">
                        <span className="w-10 h-10 rounded-full bg-[#0F172A] text-white font-bold font-mono flex items-center justify-center mx-auto mb-4 border-2 border-white shadow-md">01</span>
                        <h4 className="font-bold text-[#0F172A] text-xs uppercase tracking-wide">Discovery</h4>
                        <p className="text-[10px] text-slate-500 mt-2">Brief capture & initial space measurement survey.</p>
                    </div>

                    <div className="text-center px-2">
                        <span className="w-10 h-10 rounded-full bg-[#0F172A] text-white font-bold font-mono flex items-center justify-center mx-auto mb-4 border-2 border-white shadow-md">02</span>
                        <h4 className="font-bold text-[#0F172A] text-xs uppercase tracking-wide">Concept & 3D</h4>
                        <p className="text-[10px] text-slate-500 mt-2">Detailed layout designs & 3D visual renders for approval.</p>
                    </div>

                    <div className="text-center px-2">
                        <span className="w-10 h-10 rounded-full bg-[#0F172A] text-white font-bold font-mono flex items-center justify-center mx-auto mb-4 border-2 border-white shadow-md">03</span>
                        <h4 className="font-bold text-[#0F172A] text-xs uppercase tracking-wide">Design Freeze</h4>
                        <p className="text-[10px] text-slate-500 mt-2">GFC technical drawing releases & BOQ freeze.</p>
                    </div>

                    <div className="text-center px-2">
                        <span className="w-10 h-10 rounded-full bg-[#0F172A] text-white font-bold font-mono flex items-center justify-center mx-auto mb-4 border-2 border-white shadow-md">04</span>
                        <h4 className="font-bold text-[#0F172A] text-xs uppercase tracking-wide">Procurement</h4>
                        <p className="text-[10px] text-slate-500 mt-2">Material ordering, carcass fabrication, and setup.</p>
                    </div>

                    <div className="text-center px-2">
                        <span className="w-10 h-10 rounded-full bg-[#C5A880] text-white font-bold font-mono flex items-center justify-center mx-auto mb-4 border-2 border-white shadow-md">05</span>
                        <h4 className="font-bold text-[#0F172A] text-xs uppercase tracking-wide">Finishing</h4>
                        <p className="text-[10px] text-slate-500 mt-2">Final site installations, quality audit, and handover.</p>
                    </div>
                </div>

                <div className="bg-slate-900 text-white p-6 rounded-xl space-y-2">
                    <p className="text-xs text-slate-300">
                        <strong className="text-white block mb-1 text-sm">Why the order matters:</strong>
                        Stages 1 to 3 fix the scope, the specification and the quantities. Once Stage 3 is signed off, the order value, the material list and the programme all work from the same document. Each stage begins on receipt of the corresponding approval and stage payment.
                    </p>
                </div>
            </div>

            {/* ================= PAGE 6: DESIGN INTEGRATION ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-slate-50 border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">Design & Execution</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">Design is integrated into the turnkey process</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-stretch">
                    <div className="lg:col-span-6 space-y-6 flex flex-col justify-center">
                        <p className="text-lg text-slate-700 leading-relaxed">
                            Planning, visualisation, detailing, and material specification are completed <strong className="text-[#0F172A] font-extrabold">before procurement and execution decisions are taken</strong>.
                        </p>
                        <p className="text-sm text-slate-500 leading-relaxed">
                            This reduces rework, controls scope changes, and gives the site team one clear reference to build to. Design is not an add-on — it is what makes a firm turnkey value possible.
                        </p>
                    </div>

                    <div className="lg:col-span-6 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">DESIGN & COORDINATION FEE</span>
                            <div className="text-3xl font-black font-mono text-[#0F172A]">{formatINR(taxableDesign)}</div>
                            <span className="text-xs text-slate-400 block mt-1">Fixed fee, exclusive of GST</span>
                        </div>

                        <div className="mt-6">
                            <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-black block mb-3">WHAT IT COVERS</span>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium">Layouts & space planning</span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium">3D views</span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium">GFC & joinery drawings</span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium">Electrical & ceiling layouts</span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium">Material specification</span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium">Schedule of Finishes</span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium">Final BOQ</span>
                                <span className="bg-slate-50 py-1.5 px-3 rounded border border-slate-100 text-slate-700 font-medium">Site coordination</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 text-xs text-slate-500">
                    <strong>One engagement.</strong> The design fee and execution value are shown separately for billing clarity only. They are not separable commitments.
                </div>
            </div>

            {/* ================= PAGE 7: PROPOSED PACKAGE ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-white border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">Section 3 · Scope</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">Proposed turnkey package</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-stretch">
                    <div className="lg:col-span-7 bg-slate-50 p-8 rounded-2xl border border-slate-200 flex flex-col justify-between">
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">RECOMMENDED EXECUTION PACKAGE</span>
                            <h3 className="text-2xl font-extrabold text-[#0F172A] mt-1">{projectContext.name} Turnkey Package</h3>
                            
                            <ul className="mt-6 space-y-3 text-slate-600 text-sm">
                                {dynamicBulletPoints.map((bullet, i) => (
                                    <li key={i} className="flex gap-2">{bullet}</li>
                                ))}
                            </ul>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-200 flex justify-between items-center">
                            <span className="text-xs text-slate-500">Quantities are presently estimated.</span>
                            <span className="text-xs font-bold text-slate-800">VARIATION TERMS · ANNEXURE A</span>
                        </div>
                    </div>

                    <div className="lg:col-span-5 flex flex-col justify-between border border-slate-200 rounded-2xl p-8">
                        <div>
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">QUANTUM OF WORK</span>
                            
                            <div className="mt-6 space-y-4">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-sm">
                                    <span className="font-bold text-[#0F172A]">Carpentry</span>
                                    <span className="font-mono text-slate-600 font-bold">{carpentryQuantum}</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-sm">
                                    <span className="font-bold text-[#0F172A]">Ceiling & paint</span>
                                    <span className="font-mono text-slate-600 font-bold">{ceilingAndPaintQuantum}</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-sm">
                                    <span className="font-bold text-[#0F172A]">Electrical</span>
                                    <span className="font-mono text-slate-600 font-bold">{electricalQuantum}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 py-3 border-y border-slate-200 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            SINGLE PACKAGE · NO TIERS
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page 7 of 15</span>
                </div>
            </div>

            {/* ================= PAGE 8: SCOPE - CARPENTRY ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-white border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">Section 3.1</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">Scope of works — carpentry</h2>
                </div>

                <div className="my-auto overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider text-left">
                                <th className="py-3">Item</th>
                                <th className="py-3">Area</th>
                                <th className="py-3 text-right">Qty</th>
                                <th className="py-3 text-left pl-4">Unit</th>
                                {showScopePricing && !isDesigner && (
                                    <>
                                        <th className="py-3 text-right">Rate</th>
                                        <th className="py-3 text-right">Amount</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {carpentryItems.length > 0 ? (
                                carpentryItems.map((item, idx) => {
                                    const sellRate = calculateSellPrice(item.materials, item.labor, item.margin);
                                    const lineTotal = sellRate * item.qty;
                                    return (
                                        <tr key={idx}>
                                            <td className="py-3 font-bold text-slate-800">{item.name}</td>
                                            <td className="py-3 text-slate-500">{item.roomId || 'General'}</td>
                                            <td className="py-3 text-right font-mono font-bold text-[#0F172A]">{item.qty}</td>
                                            <td className="py-3 text-left pl-4 text-slate-500">{item.unit}</td>
                                            {showScopePricing && !isDesigner && (
                                                <>
                                                    <td className="py-3 text-right font-mono text-slate-600">{formatINR(sellRate)}</td>
                                                    <td className="py-3 text-right font-mono font-bold text-[#0F172A]">{formatINR(lineTotal)}</td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })
                            ) : (
                                <>
                                    <tr>
                                        <td className="py-4 font-bold text-slate-800">Security door laminate finish</td>
                                        <td className="py-4 text-slate-500">Entrance</td>
                                        <td className="py-4 text-right font-mono font-bold text-[#0F172A]">21</td>
                                        <td className="py-4 text-left pl-4 text-slate-500">sq ft</td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-4 text-right font-mono text-slate-600">{formatINR(1200)}</td>
                                                <td className="py-4 text-right font-mono font-bold text-[#0F172A]">{formatINR(25200)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-4 font-bold text-slate-800">T.V. unit (drawer)</td>
                                        <td className="py-4 text-slate-500">Living</td>
                                        <td className="py-4 text-right font-mono font-bold text-[#0F172A]">12</td>
                                        <td className="py-4 text-left pl-4 text-slate-500">sq ft</td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-4 text-right font-mono text-slate-600">{formatINR(1500)}</td>
                                                <td className="py-4 text-right font-mono font-bold text-[#0F172A]">{formatINR(18000)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-4 font-bold text-slate-800">TV wall panelling</td>
                                        <td className="py-4 text-slate-500">Living</td>
                                        <td className="py-4 text-right font-mono font-bold text-[#0F172A]">24</td>
                                        <td className="py-4 text-left pl-4 text-slate-500">sq ft</td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-4 text-right font-mono text-slate-600">{formatINR(800)}</td>
                                                <td className="py-4 text-right font-mono font-bold text-[#0F172A]">{formatINR(19200)}</td>
                                            </>
                                        )}
                                    </tr>
                                </>
                            )}
                            {showScopePricing && !isDesigner && carpentryItems.length > 0 && (
                                <tr className="border-t-2 border-slate-200 bg-slate-50/50 font-bold">
                                    <td className="py-3 text-slate-800" colSpan={2}>Total Carpentry</td>
                                    <td className="py-3 text-right font-mono text-[#0F172A]">
                                        {carpentryItems.reduce((sum, item) => sum + item.qty, 0)}
                                    </td>
                                    <td className="py-3 text-left pl-4 text-slate-500" colSpan={2}>units (Total:)</td>
                                    <td className="py-3 text-right font-mono font-extrabold text-[#0F172A]">
                                        {formatINR(carpentryItems.reduce((sum, item) => sum + (calculateSellPrice(item.materials, item.labor, item.margin) * item.qty), 0))}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    <div className="mt-8 p-6 bg-slate-50 rounded-xl space-y-2 text-xs text-slate-600">
                        <p><strong>Included in every carpentry line:</strong> Custom fabrication and installation including carcass, shutters and panels, basic hardware, and laminate or paint finish as per approved drawings.</p>
                        <p><strong>Excluded:</strong> Stone or quartz tops, profile and cove lighting, TV brackets, veneer or fluted upgrades, and replacement door hardware or lock sets.</p>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page 8 of 15</span>
                </div>
            </div>

            {/* ================= PAGE 9: SCOPE - CIVIL & FINISHING ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-white border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">Section 3.2</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">Scope of works — civil, services, finishing</h2>
                </div>

                <div className="my-auto overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider text-left">
                                <th className="py-3">Item</th>
                                <th className="py-3">Trade</th>
                                <th className="py-3 text-right">Qty</th>
                                <th className="py-3 text-left pl-4">Unit</th>
                                {showScopePricing && !isDesigner && (
                                    <>
                                        <th className="py-3 text-right">Rate</th>
                                        <th className="py-3 text-right">Amount</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {otherItems.length > 0 ? (
                                otherItems.map((item, idx) => {
                                    const sellRate = calculateSellPrice(item.materials, item.labor, item.margin);
                                    const lineTotal = sellRate * item.qty;
                                    return (
                                        <tr key={idx}>
                                            <td className="py-2 font-bold text-slate-800">{item.name}</td>
                                            <td className="py-2 text-slate-500">{item.cat || 'Finishing'}</td>
                                            <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{item.qty}</td>
                                            <td className="py-2 text-left pl-4 text-slate-500">{item.unit}</td>
                                            {showScopePricing && !isDesigner && (
                                                <>
                                                    <td className="py-2 text-right font-mono text-slate-600">{formatINR(sellRate)}</td>
                                                    <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(lineTotal)}</td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })
                            ) : (
                                <>
                                    <tr>
                                        <td className="py-2 font-bold text-slate-800">POP false ceiling (Standard)</td>
                                        <td className="py-2 text-slate-500">Civil</td>
                                        <td className="py-2 text-right font-mono font-bold text-[#0F172A]">720</td>
                                        <td className="py-2 text-left pl-4 text-slate-500">sq ft</td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-2 text-right font-mono text-slate-600">{formatINR(120)}</td>
                                                <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(86400)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-bold text-slate-800">Electrical (labour / point)</td>
                                        <td className="py-2 text-slate-500">Services</td>
                                        <td className="py-2 text-right font-mono font-bold text-[#0F172A]">30</td>
                                        <td className="py-2 text-left pl-4 text-slate-500">nos</td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-2 text-right font-mono text-slate-600">{formatINR(250)}</td>
                                                <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(7500)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-bold text-slate-800">Electrical fittings (as actuals)</td>
                                        <td className="py-2 text-slate-500">Services</td>
                                        <td className="py-2 text-right font-mono font-bold text-[#0F172A]">1</td>
                                        <td className="py-2 text-left pl-4 text-slate-500">lumpsum</td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-2 text-right font-mono text-slate-600">{formatINR(15000)}</td>
                                                <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(15000)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-bold text-slate-800">Interior painting (Standard)</td>
                                        <td className="py-2 text-slate-500">Finishing</td>
                                        <td className="py-2 text-right font-mono font-bold text-[#0F172A]">1,575</td>
                                        <td className="py-2 text-left pl-4 text-slate-500">sq ft</td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-2 text-right font-mono text-slate-600">{formatINR(35)}</td>
                                                <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(55125)}</td>
                                            </>
                                        )}
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-bold text-slate-800">Interior ceiling painting</td>
                                        <td className="py-2 text-slate-500">Finishing</td>
                                        <td className="py-2 text-right font-mono font-bold text-[#0F172A]">750</td>
                                        <td className="py-2 text-left pl-4 text-slate-500">sq ft</td>
                                        {showScopePricing && !isDesigner && (
                                            <>
                                                <td className="py-2 text-right font-mono text-slate-600">{formatINR(30)}</td>
                                                <td className="py-2 text-right font-mono font-bold text-[#0F172A]">{formatINR(22500)}</td>
                                            </>
                                        )}
                                    </tr>
                                </>
                            )}
                            {showScopePricing && !isDesigner && otherItems.length > 0 && (
                                <tr className="border-t-2 border-slate-200 bg-slate-50/50 font-bold">
                                    <td className="py-2 text-slate-800" colSpan={2}>Total Civil, Services & Finishing</td>
                                    <td className="py-2 text-right font-mono text-[#0F172A]">
                                        {otherItems.reduce((sum, item) => sum + item.qty, 0)}
                                    </td>
                                    <td className="py-2 text-left pl-4 text-slate-500" colSpan={2}>units (Total:)</td>
                                    <td className="py-2 text-right font-mono font-extrabold text-[#0F172A]">
                                        {formatINR(otherItems.reduce((sum, item) => sum + (calculateSellPrice(item.materials, item.labor, item.margin) * item.qty), 0))}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    <div className="mt-6 p-6 bg-slate-50 rounded-xl text-xs text-slate-500 leading-relaxed">
                        Electrical fittings are billed at actual supplier cost against your approved selection and are not part of the fixed value. Electrical labour covers wiring, conduit, fixing and testing per point; materials are charged separately. Painting includes surface preparation, primer and two coats.
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page 9 of 15</span>
                </div>
            </div>

            {/* ================= PAGE 10: CLARITY / NOT IN SCOPE ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-slate-50 border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">Clarity</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">
                        {hasAnyCarpentryIncluded ? "Scope boundaries & status" : "Not in the current scope"}
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 my-auto text-center">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200">
                        <span className="text-xs uppercase tracking-wider text-[#C5A880] font-black block mb-4">KITCHEN</span>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {renderScopeItem('Base & wall units', hasKitchenBaseWall)}
                            {renderScopeItem('Shutters', hasKitchenShutters)}
                            {renderScopeItem('Counter', hasCountertop)}
                            {renderScopeItem('Tall unit', hasTallUnit)}
                            {renderScopeItem('Accessories', hasKitchenAccessories)}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200">
                        <span className="text-xs uppercase tracking-wider text-[#C5A880] font-black block mb-4">BEDROOMS</span>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {renderScopeItem('Wardrobes', hasWardrobes)}
                            {renderScopeItem('Lofts', hasLofts)}
                            {renderScopeItem('Beds', hasBeds)}
                            {renderScopeItem('Study', hasStudy)}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200">
                        <span className="text-xs uppercase tracking-wider text-[#C5A880] font-black block mb-4">BATHROOMS</span>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {renderScopeItem('Vanity', hasVanity)}
                            {renderScopeItem('Mirror unit', hasMirrorUnit)}
                            {renderScopeItem('Storage', hasBathroomStorage)}
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 text-xs text-slate-500 leading-relaxed text-center">
                    {hasAnyCarpentryIncluded ? (
                        <span>
                            Standard services (ceiling, paint, electrical) cover all rooms as shown. The specific carpentry items highlighted above with <strong className="text-emerald-700">✓</strong> are fully covered in your current contracted BOQ. Any pending items marked with <strong className="text-slate-400">✕</strong> can be added later via a priced addendum if needed.
                        </span>
                    ) : (
                        <span>
                            False ceiling, painting and electrical works on page 9 do cover these rooms, to the quantities shown. Should you wish to add kitchen or bedroom carpentry, we will issue a priced addendum for your approval and revise the order value accordingly.
                        </span>
                    )}
                </div>
            </div>

            {/* ================= PAGE 11: SPECIFICATIONS ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-white border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">Section 4</span>
                            <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">Specifications</h2>
                        </div>
                        {!isClientViewOnly && setProjectContext && (
                            <button
                                onClick={startEditingSpecs}
                                className="flex items-center gap-2 px-4 py-2 border border-[#C5A880] text-xs font-bold text-[#C5A880] rounded hover:bg-[#C5A880]/10 transition duration-150 shadow-sm no-print"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit Specifications
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-stretch">
                    <div className="lg:col-span-7">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider text-left">
                                    <th className="py-3">Category</th>
                                    <th className="py-3">Specified Standard</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                {dynamicSpecs.map((spec, idx) => (
                                    <tr key={idx}>
                                        <td className="py-3 font-bold">{spec.category}</td>
                                        <td className="py-3">{spec.value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="lg:col-span-5 flex flex-col justify-between border border-slate-200 rounded-2xl p-6 bg-slate-50">
                        <div>
                            <span className="text-xs font-bold text-slate-900 block mb-2">Sample approvals</span>
                            <p className="text-xs text-slate-500 leading-relaxed">Final brands, shades and finishes are selected against physical samples during the Schedule of Finishes stage and recorded in writing. No substitution is made without your approval.</p>
                        </div>

                        <div className="mt-6 pt-6 border-t border-slate-200">
                            <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-black block mb-3">NOT SPECIFIED — NOT IN SCOPE</span>
                            <div className="flex flex-col gap-2 text-xs text-slate-400">
                                {dynamicSpecExclusions.map((spec, i) => (
                                    <span key={i}>{spec}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page 11 of 15</span>
                </div>
            </div>

            {/* ================= PAGE 12: PROGRAMME ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-white border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">Section 5</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">{totalDays}-day planned project programme</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 my-auto">
                    <div className="p-5 border border-slate-200 bg-slate-50 rounded-xl text-center">
                        <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-bold block mb-1">DAY 1-14</span>
                        <h4 className="font-bold text-[#0F172A] text-sm mb-2">Design & Planning</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">Validation, layouts, 3D, SOF freeze, GFC, final BOQ.</p>
                    </div>

                    <div className="p-5 border border-slate-200 bg-slate-50 rounded-xl text-center">
                        <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-bold block mb-1">DAY 15-21</span>
                        <h4 className="font-bold text-[#0F172A] text-sm mb-2">Setup & Rough-ins</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">Mobilisation, protection, civil, electrical rough-in.</p>
                    </div>

                    <div className="p-5 border border-slate-200 bg-slate-50 rounded-xl text-center">
                        <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-bold block mb-1">DAY 22-31</span>
                        <h4 className="font-bold text-[#0F172A] text-sm mb-2">Structure & Utilities</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">Ceiling framing, boarding, carcass assembly on site.</p>
                    </div>

                    <div className="p-5 border border-slate-200 bg-slate-50 rounded-xl text-center">
                        <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-bold block mb-1">DAY 32-43</span>
                        <h4 className="font-bold text-[#0F172A] text-sm mb-2">Finishes & Surfaces</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">Laminate, polish, putty, panelling, first coat paint.</p>
                    </div>

                    <div className="p-5 border border-slate-200 bg-slate-50 rounded-xl text-center">
                        <span className="text-[10px] uppercase tracking-wider text-[#C5A880] font-bold block mb-1">DAY 44-{totalDays}</span>
                        <h4 className="font-bold text-[#0F172A] text-sm mb-2">Snagging & Handover</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">Fittings, final coat, joint snag, deep clean, handover.</p>
                    </div>
                </div>

                <div className="bg-[#0F172A] text-white p-6 rounded-xl space-y-2">
                    <p className="text-xs text-slate-300">
                        <strong className="text-white block mb-1">PROGRAMME STARTS WHEN ALL FOUR ARE IN PLACE:</strong>
                        Design and material freeze with SOF approved · Stage payment received · Site vacant and available · Society permissions confirmed. {totalDays} working days, excluding Sundays and public holidays. Custom or imported materials need 4-6 weeks and sit outside this baseline unless ordered at freeze.
                    </p>
                </div>
            </div>

            {/* ================= PAGE 13: PAYMENT SCHEDULE ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-white border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">Section 6</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">Payment schedule</h2>
                </div>

                <div className="my-auto overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider text-left">
                                <th className="py-3">Stage</th>
                                <th className="py-3">Trigger</th>
                                <th className="py-3 text-right">Share</th>
                                <th className="py-3 text-right pl-4">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            <tr>
                                <td className="py-3 font-bold text-[#0F172A]">Initiation</td>
                                <td className="py-3 text-slate-500">On appointment, to commence site validation & planning</td>
                                <td className="py-3 text-right font-mono font-bold">-</td>
                                <td className="py-3 text-right font-mono font-bold text-slate-900">{formatINR(4999)}</td>
                            </tr>
                            <tr className="bg-slate-50 font-bold">
                                <td className="py-2.5 px-2 text-xs uppercase text-[#C5A880]" colSpan={2}>DESIGN & COORDINATION FEE — {formatINR(taxableDesign)}</td>
                                <td className="py-2.5 px-2"></td>
                                <td className="py-2.5 px-2"></td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700">Design 1</td>
                                <td className="py-2.5 text-xs text-slate-500">Brief freeze, site measurement and commencement of concept</td>
                                <td className="py-2.5 text-right font-mono text-slate-600">25%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableDesign * 0.25)}</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700">Design 2</td>
                                <td className="py-2.5 text-xs text-slate-500">On presentation of layouts and 3D views for approval</td>
                                <td className="py-2.5 text-right font-mono text-slate-600">40%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableDesign * 0.40)}</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700">Design 3</td>
                                <td className="py-2.5 text-xs text-slate-500">On release of GFC drawings, Schedule of Finishes and final BOQ</td>
                                <td className="py-2.5 text-right font-mono text-slate-600">35%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableDesign * 0.35)}</td>
                            </tr>
                            <tr className="bg-slate-50 font-bold">
                                <td className="py-2.5 px-2 text-xs uppercase text-[#C5A880]" colSpan={2}>TURNKEY EXECUTION VALUE — {formatINR(taxableExecution)}</td>
                                <td className="py-2.5 px-2"></td>
                                <td className="py-2.5 px-2"></td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700">Execution 1</td>
                                <td className="py-2.5 text-xs text-slate-500">Before mobilisation and placement of material orders</td>
                                <td className="py-2.5 text-right font-mono text-slate-600">40%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableExecution * 0.40)}</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700">Execution 2</td>
                                <td className="py-2.5 text-xs text-slate-500">On completion of civil, services, ceiling framework and carcasses</td>
                                <td className="py-2.5 text-right font-mono text-slate-600">30%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableExecution * 0.30)}</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700">Execution 3</td>
                                <td className="py-2.5 text-xs text-slate-500">Before shutters, finishes, hardware and final paint</td>
                                <td className="py-2.5 text-right font-mono text-slate-600">20%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableExecution * 0.20)}</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pl-6 font-medium text-slate-700">Execution 4</td>
                                <td className="py-2.5 text-xs text-slate-500">Before final handover and key release, following agreed scope & snag list closure</td>
                                <td className="py-2.5 text-right font-mono text-slate-600">10%</td>
                                <td className="py-2.5 text-right font-mono text-slate-700">{formatINR(taxableExecution * 0.10)}</td>
                            </tr>
                            <tr className="border-t-2 border-[#0F172A] font-black">
                                <td className="py-3 text-[#0F172A]">Net taxable value</td>
                                <td className="py-3"></td>
                                <td className="py-3 text-right font-mono">100%</td>
                                <td className="py-3 text-right font-mono text-[#0F172A]">{formatINR(netTaxableValue)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex justify-between gap-4">
                        <span>Payable in advance of each stage. GST at 18% is added on every FFDS invoice. The ₹4,999 is adjusted against Design 1 and is not additional to the total.</span>
                        <span className="font-bold shrink-0 text-slate-800">FULL TERMS · ANNEXURE A</span>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page 13 of 15</span>
                </div>
            </div>

            {/* ================= PAGE 14: NEXT STEPS ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-slate-50 border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">Next Step</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">Proceed with design-led turnkey execution</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-stretch">
                    <div className="lg:col-span-6 space-y-4">
                        <span className="text-xs uppercase tracking-wider text-slate-400 font-bold block border-b pb-2">WHAT HAPPENS NEXT</span>
                        
                        <div className="space-y-3 text-sm text-slate-700">
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">01</span>
                                <p>Project initiation fee payment of ₹4,999.</p>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">02</span>
                                <p>Site measurement and scope validation survey.</p>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">03</span>
                                <p>Layout, concept and detailed design development.</p>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">04</span>
                                <p>Schedule of Finishes (SOF) and physical material approvals.</p>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">05</span>
                                <p>Final detailed BOQ and commercial confirmation sign-off.</p>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-bold text-[#C5A880] font-mono">06</span>
                                <p>Execution agreement sign-off and site mobilization.</p>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-8 flex flex-col justify-between shadow-sm">
                        <div className="text-center">
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">PROJECT INITIATION FEE</span>
                            <div className="text-4xl font-black font-mono text-[#0F172A] mt-2">₹4,999</div>
                            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                                Commences site validation, requirement documentation, and preliminary scope finalisation. Non-refundable, but fully adjustable against the final turnkey order value.
                            </p>
                        </div>

                        <div className="mt-6 pt-6 border-t border-slate-100">
                            <p className="text-[10px] text-slate-400 text-center italic mb-4">Not covered by this fee: layouts, 3D views, GFC drawings, SOF and final BOQ. These commence under main engagement design stages.</p>
                            <button className="w-full bg-[#0066CC] text-white py-3.5 rounded-xl font-bold hover:bg-[#0055B3] transition-all text-sm uppercase tracking-wider shadow-md">
                                Initiate Turnkey Planning
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page 14 of 15</span>
                </div>
            </div>

            {/* ================= PAGE 15: CONFIRMATION ================= */}
            <div className="h-[29.7cm] flex flex-col justify-between p-16 md:p-24 bg-white border-b border-slate-200 print:h-[28.5cm] print:page-break-after-always">
                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#C5A880]">Acceptance</span>
                    <h2 className="text-4xl font-extrabold text-[#0F172A] mt-2 tracking-tight">Confirmation of engagement</h2>
                </div>

                <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 text-slate-600 text-sm leading-relaxed my-auto space-y-4">
                    <p>
                        By signing below, the client confirms acceptance of the scope, specifications, programme conditions and payment schedule in this booklet, together with <strong className="text-slate-900 font-bold">Annexure A — Commercial Terms & Conditions</strong>, as the basis for the design-led turnkey engagement. The Final Turnkey Order Value will be issued for separate written acceptance after design freeze and final BOQ.
                    </p>
                    {latestDocket ? (
                        <div className="pt-3 border-t border-slate-200/80 flex items-start gap-2.5 text-xs text-slate-500">
                            <div className="p-1 bg-[#C5A880]/10 rounded-md text-[#C5A880] shrink-0 mt-0.5">
                                <ShieldCheckIcon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <span className="font-bold text-slate-700">Contractual Integration & Alignment:</span> This proposal and Annexure A are verbally and legally linked with Master Terms Docket <strong className="font-semibold text-slate-800">{latestDocket.docketRef}</strong> (Status: <span className="font-bold text-[#C5A880]">{latestDocket.status.toUpperCase()}</span>), which governs the overarching terms of service. In the event of any operational conflict, the clauses of the Master Terms Docket shall prevail.
                            </div>
                        </div>
                    ) : (
                        <div className="pt-3 border-t border-slate-200/80 flex items-start gap-2.5 text-xs text-slate-500">
                            <div className="p-1 bg-[#C5A880]/10 rounded-md text-[#C5A880] shrink-0 mt-0.5">
                                <ShieldCheckIcon className="w-3.5 h-3.5" />
                            </div>
                            <div>
                                <span className="font-bold text-slate-700">Contractual Integration & Alignment:</span> This proposal and Annexure A are verbally and legally linked to the Master Terms Docket once issued for this project. The Master Terms Docket governs the overarching terms of service and takes precedence over any generic operational clauses.
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-12 mt-12 pt-12 border-t border-slate-200">
                    <div className="space-y-8">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">FOR FORM FACTORS DESIGN STUDIO</span>
                        <div className="h-12 border-b border-slate-300"></div>
                        <span className="text-[10px] text-slate-500 uppercase block tracking-widest">AUTHORISED SIGNATORY · NAME, SIGNATURE & DATE</span>
                    </div>

                    <div className="space-y-8">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">ACCEPTED & APPROVED BY CLIENT</span>
                        <div className="h-12 border-b border-slate-300"></div>
                        <span className="text-[10px] text-slate-500 uppercase block tracking-widest">{projectContext.clientName?.toUpperCase() || 'CLIENT'} · SIGNATURE & DATE</span>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-400 border-t border-slate-200 pt-8 mt-auto">
                    <span>{settings?.companyName || 'Form Factors Studio'}</span>
                    <span>Page 15 of 15</span>
                </div>
            </div>

            {/* ================= ANNEXURE A: TERMS & CONDITIONS ================= */}
            <div className="p-16 md:p-24 bg-white space-y-8 print:p-8 print:page-break-before-always">
                <div className="border-b-2 border-[#0F172A] pb-4">
                    <span className="text-[11px] font-bold text-[#C5A880] uppercase tracking-wider block">ANNEXURE A</span>
                    <h2 className="text-3xl font-extrabold tracking-tight text-[#0F172A] mt-1">Commercial Terms & Conditions</h2>
                    <p className="text-xs text-slate-500 mt-1">Forms part of the Design-led Turnkey Proposal booklet and is to be read together with it.</p>
                </div>

                {latestDocket ? (
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed flex items-start gap-3 max-w-4xl">
                        <div className="p-1 bg-[#C5A880]/10 rounded text-[#C5A880] shrink-0 mt-0.5">
                            <ShieldCheckIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <strong className="text-slate-800 font-bold block mb-1">Contractual Integration & Alignment Note</strong>
                            This commercial Annexure forms part of the master contractual framework and is verbally and legally integrated with <strong className="text-slate-900 font-semibold">Master Terms Docket {latestDocket.docketRef}</strong> (Status: <span className="font-bold text-[#C5A880]">{latestDocket.status.toUpperCase()}</span>), issued for this project. The Master Terms Docket governs overarching service level agreements, legal boundaries, and liabilities, and shall take precedence in case of any operational discrepancies.
                        </div>
                    </div>
                ) : (
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 leading-relaxed flex items-start gap-3 max-w-4xl">
                        <div className="p-1 bg-[#C5A880]/10 rounded text-[#C5A880] shrink-0 mt-0.5">
                            <ShieldCheckIcon className="w-4 h-4" />
                        </div>
                        <div>
                            <strong className="text-slate-800 font-bold block mb-1">Contractual Integration & Alignment Note</strong>
                            These Commercial Terms & Conditions are legally integrated with the Master Terms Docket once issued for this project. The Master Terms Docket serves as the overarching master service agreement and defines all legal, structural, and liability parameters.
                        </div>
                    </div>
                )}

                <div className="space-y-8 text-slate-700 text-xs leading-relaxed max-w-4xl">
                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">1 · ENGAGEMENT MODEL AND BASIS OF VALUE</h4>
                        <ol className="list-decimal pl-4 space-y-1.5 text-slate-600">
                            <li>This engagement is a <strong className="text-[#0F172A]">single design-led turnkey engagement</strong>. FFDS contracts, procures, executes and supervises the scope listed in the proposal booklet, and carries contractual execution responsibility for that scope.</li>
                            <li>The figure stated in the booklet is the <strong className="text-[#0F172A]">Current Proposed Project Value</strong>, based on the scope, quantities and specifications presently recorded.</li>
                            <li>The <strong className="text-[#0F172A]">Final Turnkey Order Value</strong> will be issued after site validation, design freeze, Schedule of Finishes approval and final BOQ sign-off. Once accepted in writing, it becomes the contracted value for execution.</li>
                            <li>Rates underlying the proposal are held for the validity period stated above.</li>
                        </ol>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">2 · COMMERCIAL SUMMARY</h4>
                        <table className="w-full text-left border-collapse border border-slate-200 text-slate-600">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 font-bold">
                                    <th className="p-2">Component</th>
                                    <th className="p-2">Basis</th>
                                    <th className="p-2 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                <tr>
                                    <td className="p-2">Turnkey Execution Value</td>
                                    <td className="p-2">As listed scope</td>
                                    <td className="p-2 text-right font-mono">{formatINR(taxableExecution)}</td>
                                </tr>
                                <tr>
                                    <td className="p-2">Design & Coordination Fee</td>
                                    <td className="p-2">Fixed fee</td>
                                    <td className="p-2 text-right font-mono">{formatINR(taxableDesign)}</td>
                                </tr>
                                <tr className="bg-slate-50 font-bold border-t border-slate-300">
                                    <td className="p-2">Net Taxable Value</td>
                                    <td className="p-2"></td>
                                    <td className="p-2 text-right font-mono">{formatINR(netTaxableValue)}</td>
                                </tr>
                                <tr>
                                    <td className="p-2">Applicable GST</td>
                                    <td className="p-2">18% on FFDS invoiced value</td>
                                    <td className="p-2 text-right font-mono">{formatINR(gstOnDesign + chargedGstOnExecution)}</td>
                                </tr>
                                <tr className="bg-slate-900 text-white font-bold">
                                    <td className="p-2">Total Proposed Project Investment</td>
                                    <td className="p-2"></td>
                                    <td className="p-2 text-right font-mono">{formatINR(totalProposedInvestment)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-[10px] text-slate-400 mt-2 italic">This is the only commercial summary; no other figure in any document supersedes it.</p>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">3 · TAXES</h4>
                        <p>GST shall be applicable on amounts invoiced by Form Factors Design Studio at the prevailing statutory rate, currently 18%, on both the execution value and the design and coordination fee.</p>
                        <p className="mt-2">Where a direct client purchase or a payment to a third-party supplier is specifically agreed and documented in writing, that item shall be invoiced separately by the respective supplier and falls outside the FFDS contracted value.</p>
                        <p className="mt-2">Any change in statutory rates or the introduction of any new levy after the date of this proposal shall apply to invoices raised thereafter.</p>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">4 · PAYMENT TERMS</h4>
                        <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                            <li>All stage payments are payable in advance of the corresponding stage. Material orders are placed only against cleared funds.</li>
                            <li>Design fee shares are percentages of {formatINR(taxableDesign)}; execution shares are percentages of {formatINR(taxableExecution)}. Stage amounts are rounded to the nearest rupee, with Execution 1 carrying the rounding adjustment so that stages sum exactly to the net taxable value.</li>
                            <li>GST is added on each invoice at the prevailing rate.</li>
                            <li>The Project Initiation Fee of ₹4,999 is adjusted against the Design 1 invoice and is not additional to the total above.</li>
                            <li>Delays in approvals or payments will proportionately revise the project programme.</li>
                        </ol>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">5 · PROJECT INITIATION FEE</h4>
                        <div className="grid grid-cols-2 gap-4 border border-slate-200 rounded p-4 bg-slate-50">
                            <div>
                                <strong className="text-slate-800 text-xs block mb-1">Covered by the fee</strong>
                                <ul className="list-disc pl-4 text-slate-500">
                                    <li>Site measurement</li>
                                    <li>Requirement documentation</li>
                                    <li>Preliminary scope validation</li>
                                </ul>
                            </div>
                            <div>
                                <strong className="text-slate-800 text-xs block mb-1 font-bold">Not covered by the fee</strong>
                                <ul className="list-disc pl-4 text-slate-400">
                                    <li>✕ Layouts and space planning</li>
                                    <li>✕ 3D visualisation</li>
                                    <li>✕ GFC and joinery drawings</li>
                                    <li>✕ Schedule of Finishes</li>
                                    <li>✕ Final BOQ</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">6 · SCOPE, QUANTITIES AND VARIATIONS</h4>
                        <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                            <li>Only items listed in the proposal booklet are included. Any item not written into the scope is not included.</li>
                            <li>Quantities are as presently measured or estimated and are re-verified at site validation. Variation of more than 5% on any line will be notified in writing with the revised value before the affected work is ordered or commenced. Quantities are then adjusted to actual measured quantity at the rates underlying this proposal.</li>
                            <li>Any addition, deletion or specification change after design freeze will be quoted as a written variation and becomes payable with the next stage invoice once approved.</li>
                            <li>Items marked as actuals are billed at actual supplier cost against the client's approved selection and are not part of the fixed value. An indicative allowance for electrical fittings will be issued with the Schedule of Finishes for budgeting.</li>
                            <li>Kitchen, wardrobes, beds, lofts and bathroom carpentry are not priced in this proposal. If required, {settings?.companyName || 'the studio'} will issue a priced addendum with quantities and specifications for approval, and the order value will be revised.</li>
                        </ol>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">7 · EXCLUSIONS</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-500 text-[11px]">
                            <ul className="space-y-1">
                                {annexureExclusionsList.col1.map((exc, idx) => (
                                    <li key={idx}>✕ {exc}</li>
                                ))}
                            </ul>
                            <ul className="space-y-1">
                                {annexureExclusionsList.col2.map((exc, idx) => (
                                    <li key={idx}>✕ {exc}</li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">8 · PROGRAMME AND START CONDITIONS</h4>
                        <p>The programme is {totalDays} working days, excluding Sundays and public holidays, comprising {designDays} working days of design and {executionDays} working days of site execution. It is calculated from the date on which all four of the following are in place:</p>
                        <ul className="list-disc pl-6 text-slate-600 mt-2">
                            <li>Design and material selection freeze, with the Schedule of Finishes approved in writing</li>
                            <li>Receipt of the required stage payment</li>
                            <li>Availability of the site for uninterrupted work, vacant and free of stored goods</li>
                            <li>Society permissions, work timings and lift or hoist access confirmed</li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">9 · ASSUMPTIONS AND CLIENT RESPONSIBILITIES</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                            <div>
                                <span className="font-bold text-slate-800 block mb-1">Assumptions</span>
                                <ul className="list-disc pl-4 space-y-1 text-slate-500">
                                    <li>Single continuous mobilisation, flat vacant and available</li>
                                    <li>Existing walls, slab, flooring and plumbing sound and reusable as-is</li>
                                    <li>Existing distribution board adequate for the proposed load</li>
                                    <li>Normal society working hours, lift or hoist access available</li>
                                    <li>Water and power available at site for construction use</li>
                                    <li>No structural alteration, waterproofing or slab work required</li>
                                </ul>
                            </div>
                            <div>
                                <span className="font-bold text-slate-800 block mb-1">Client responsibilities</span>
                                <ul className="list-disc pl-4 space-y-1 text-slate-500">
                                    <li>Timely approval of layouts, 3D views, samples and the Schedule of Finishes</li>
                                    <li>Society intimation, permissions and any refundable deposits</li>
                                    <li>Statutory, municipal and society charges</li>
                                    <li>Vacant possession of the flat for the execution period</li>
                                    <li>Selection of electrical fittings and appliances within the agreed window</li>
                                    <li>Stage payments in advance of each stage</li>
                                    <li>Attendance at the joint snag inspection before handover</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">10 · MATERIALS, SAMPLES AND WORKMANSHIP</h4>
                        <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                            <li>Final brands, shades and finishes are selected against physical samples during the Schedule of Finishes stage and recorded in writing.</li>
                            <li>Where a specified brand is unavailable, {settings?.companyName || 'FFDS'} will propose an equivalent of the same or higher grade for written approval before ordering. No substitution will be made without approval.</li>
                            <li>Carpentry is built to approved GFC drawings. Exposed surfaces are laminated, edges banded and carcass interiors finished. Electrical points are tested and recorded before ceiling closure.</li>
                        </ol>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">11 · HANDOVER, WARRANTY AND VALIDITY</h4>
                        <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                            <li>Handover follows closure of the joint snag list, deep cleaning of the worked areas, and release of the handover dossier and warranty note.</li>
                            <li>{settings?.companyName || 'FFDS'} provides a workmanship warranty of 6 months from handover on carpentry executed under this contract, covering manufacturing and installation defects.</li>
                            <li>Manufacturer warranties on hardware, laminates, paint and electrical fittings apply as issued by the respective brand.</li>
                            <li>Warranty excludes damage arising from misuse, water ingress, alteration by others and normal wear.</li>
                            <li>This proposal is valid for 15 days from {today} and supersedes all prior estimates, verbal indications and written communication on this project. Where any earlier document conflicts, the proposal booklet and this Annexure prevail.</li>
                            <li>On confirmation, the turnkey agreement and the final BOQ together form the contract; the proposal booklet forms the basis of scope.</li>
                        </ol>
                    </div>

                    <div>
                        <h4 className="font-extrabold text-[#0F172A] uppercase tracking-wider mb-2">12 · ACKNOWLEDGEMENT</h4>
                        <p>The client acknowledges having read and accepted these Commercial Terms & Conditions together with the Design-led Turnkey Proposal booklet for the project named above.</p>
                        
                        <div className="grid grid-cols-2 gap-8 mt-6 pt-6 border-t border-slate-200">
                            <div>
                                <span className="text-[10px] text-slate-400 block font-bold">FOR {(settings?.companyName || 'FORM FACTORS DESIGN STUDIO').toUpperCase()}</span>
                                <div className="h-8 border-b border-slate-200 my-2"></div>
                                <span className="text-[8px] text-slate-400">AUTHORISED SIGNATORY</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 block font-bold">ACCEPTED & APPROVED BY CLIENT</span>
                                <div className="h-8 border-b border-slate-200 my-2"></div>
                                <span className="text-[8px] text-slate-400">{projectContext.clientName?.toUpperCase() || 'CLIENT'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ================= MODAL: EDIT SPECIFICATIONS ================= */}
            {isEditingSpecs && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/60 backdrop-blur-sm no-print">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="font-bold text-lg text-slate-900">Edit Material Specifications</h3>
                                <p className="text-xs text-slate-500">Update values to override dynamic specifications for this project.</p>
                            </div>
                            <button 
                                onClick={() => setIsEditingSpecs(false)}
                                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                            >
                                <XIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                            {Object.keys(editedValues).map((category) => (
                                <div key={category} className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-700 block">{category}</label>
                                    <textarea
                                        value={editedValues[category] || ''}
                                        onChange={(e) => setEditedValues(prev => ({ ...prev, [category]: e.target.value }))}
                                        rows={2}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A880]/50 focus:border-[#C5A880] bg-slate-50 hover:bg-slate-50/50 transition duration-150 resize-none"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsEditingSpecs(false)}
                                className="px-4 py-2 border border-slate-200 text-xs font-bold text-slate-500 rounded-lg hover:bg-slate-100 transition duration-150"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveSpecs}
                                className="flex items-center gap-2 px-4 py-2 bg-[#0066CC] hover:bg-[#0055B3] text-white text-xs font-bold rounded-lg transition duration-150 shadow-sm"
                            >
                                <Save className="w-3.5 h-3.5" />
                                Save Overrides
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ClientBookletProposal;
