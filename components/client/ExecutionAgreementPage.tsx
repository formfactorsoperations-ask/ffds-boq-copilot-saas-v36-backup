import React, { useMemo, useRef, useState } from 'react';
import { getCurrentIssue } from '../../services/documentIssueEngine';
import { agreementScope } from '../../services/documentReleaseEngine';
import ExecutionStamp from '../documents/ExecutionStamp';
import ExecutionAgreementSheet from '../documents/ExecutionAgreementSheet';
import { ProjectContext, DigitalSignatureDocket } from '../../types';
import { useOrg } from '../../contexts/OrgContext';
import { useStudioSettings } from '../../hooks/useStudioSettings';
import { studioDisplayName } from '../../lib/studioName';
import { useProjectProgramme } from '../../hooks/useProjectProgramme';
import { Download, Share2, Copy, ExternalLink, Tablet, KeyRound, Check, Pencil, GitCompare, Clock, ListChecks, BookOpen, ShieldCheck, Send, Mail, XIcon } from '@/lib/lucide-shim';
import { calculateSellPrice, formatCurrency } from '../../lib/utils';
import { approvedOption, resolveAgreement, AGREEMENT_ARTICLES, type AgreementOverrides } from '../../lib/executionAgreement';
import { pendingRevision } from '../../lib/revisionMoneyPreview';
import { sendAgreementSignoffRequest } from '../../services/emailService';
import { db as dbService } from '../../services/dbService';
import { db as firestore } from '../../services/firebaseClient';
import { doc, updateDoc } from 'firebase/firestore';
import { downloadSectionsAsPdf } from '../../lib/documentPdf';
import DigitalSignatureDocketView from '../common/DigitalSignatureDocket';
import DigitalSignaturePad from '../common/DigitalSignaturePad';
import ManualAcceptanceOverrideModal from '../ops/ManualAcceptanceOverrideModal';
import { publicAppOrigin } from '../../lib/publicUrl';
import { Panel, Button, Chip, Segmented, StateDot, LABEL, INPUT, buttonClass } from '../ui/kit';
import '../projectHeader/projectHeader.css';

interface ExecutionAgreementPageProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    tenantId?: string;
    projectId?: string;
    activeTier?: any;
    fullBoq?: any[];
    /** The project's options (with their Pricing & Tiers summaries) and the item bank: the approved option's figures, Annexure F, and its specifications. */
    tiers?: any[];
    bank?: any[];
}

/*
  The page renders the same ExecutionAgreementSheet the client's issued copy
  renders, from the same resolver (lib/executionAgreement). It used to carry
  its own copy of all eleven pages, with its own figures: the money it stated
  was whatever was typed into the agreement the first time, so Money's
  discounts and GST never reached it.
*/
export default function ExecutionAgreementPage({ projectContext, setProjectContext, tenantId, projectId: propProjectId, activeTier, fullBoq, tiers, bank }: ExecutionAgreementPageProps) {
    const { orgData } = useOrg();
    /* Signature evidence lives on the issue. */
    const execIssue = getCurrentIssue(projectContext, 'execution_agreement');
    const { settings } = useStudioSettings(tenantId || '');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [viewMode, setViewMode] = useState<'summary' | 'doc'>('summary');
    const contentRef = useRef<HTMLDivElement>(null);

    const studioName = settings?.companyName || orgData.orgName || 'Form Factors Design Studio';
    const studioAddress = orgData.officeAddress || '534, 5th Floor, Lodha Signet A, Kolshet Road, Thane West, Maharashtra 400607';
    const studioEmail = orgData.contactEmail || 'formfactors.operations@gmail.com';
    const repName = orgData.signatoryName || 'Principal Name';
    const projectId = propProjectId || (projectContext as any).projectId || (projectContext as any).id || (projectContext.name ? projectContext.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Project');
    // The Timeline's programme, so the agreement states the duration the chart shows.
    const programme = useProjectProgramme(propProjectId || (projectContext as any).id, projectContext, fullBoq);

    /*
      Annexure F: the approved scope, priced and described as the client's
      copy will be (agreementScope). The raw option lines this used to list
      carried "Details missing from bank" for every line whose bank item had
      moved. The calculated option is the fallback when there are no stored
      options to read.
    */
    const scopeLines = useMemo(() => {
        const scope = agreementScope(projectContext, { tiers: tiers || [], bank: bank || [] } as any);
        if (scope.lines.length) return scope.lines;
        return (fullBoq || []).map((item: any, i: number) => {
            const rate = item.unitCost !== undefined ? item.unitCost : calculateSellPrice(item.materials, item.labor, item.margin);
            return {
                id: String(item.id || `line-${i}`),
                name: item.name || item.description || 'Item',
                room: item.roomId || 'General Scope',
                cat: item.cat || item.category || item.roomId || '',
                unit: item.unit,
                qty: Number(item.qty) || 0,
                unitCost: rate,
                finalCost: item.finalCost !== undefined ? item.finalCost : rate * (Number(item.qty) || 0),
                specs: item.internalSpecs || item.specs || item.commercialNote || '',
            };
        });
    }, [projectContext, tiers, bank, fullBoq]);

    const option = useMemo(() => approvedOption(projectContext, tiers, bank || []), [projectContext, tiers, bank]);

    /*
      The agreement states the scope in force. A revision still open (with the
      client, or signed and not yet applied) is not in it yet, and a studio
      reading a newer Revised BOQ elsewhere needs to be told why the two differ.
    */
    const openRevision = useMemo(() => {
        try {
            const r = pendingRevision(projectContext, (tiers || []) as any, (bank || []) as any);
            return r && r.state !== 'draft' ? r : null;
        } catch {
            return null;
        }
    }, [projectContext, tiers, bank]);

    const agreement = useMemo(() => resolveAgreement(projectContext, {
        tierSummary: activeTier?.summary,
        option,
        scopeLines,
        studioName,
        defaultDuration: settings?.procurementLeadTimeWeeks ? settings.procurementLeadTimeWeeks * 7 + 45 : 60,
        /*
          The project's Timeline (useProjectProgramme): design and site days
          that add up to the Timeline's Total Duration. The agreement states
          these rather than a figure of its own, so it reads what the chart reads.
        */
        programme: programme ? {
            designDays: programme.designDays,
            siteDays: programme.siteDays,
            designWorkDays: programme.designWorkDays,
            siteWorkDays: programme.siteWorkDays,
            totalDays: programme.totalDays,
            finishISO: programme.finishISO,
        } : null,
    }), [projectContext, activeTier, option, scopeLines, studioName, settings?.procurementLeadTimeWeeks,
        programme?.designDays, programme?.siteDays, programme?.designWorkDays, programme?.siteWorkDays,
        programme?.totalDays, programme?.finishISO]);

    /* Edits are saved on the project as they are typed. A key set to undefined goes back to the live value. */
    const changeOverrides = (update: Partial<AgreementOverrides> | ((o: AgreementOverrides) => Partial<AgreementOverrides>)) => {
        setProjectContext((prev: any) => {
            const current: AgreementOverrides = prev.executionAgreementOverrides || {};
            const patch = typeof update === 'function' ? update(current) : update;
            const next: AgreementOverrides = { ...current, ...patch };
            Object.keys(next).forEach((k) => { if (next[k] === undefined) delete next[k]; });
            return { ...prev, executionAgreementOverrides: next };
        });
    };

    /*
      The agreement is laid out on screen as A4 "page cards" with grey gaps
      between them, and each card grows past A4 when its section is long. The
      old export (html2pdf) cut that whole strip at fixed A4 heights, so cuts
      fell mid-section: half-empty pages, grey bands, and the cards' own
      "Page 1" footers in the middle of a page.

      Now the sheets are laid out as print for the capture (no cards, no
      gaps), and each section goes through the shared document PDF builder on
      its own: every section starts a new page, a clause or table row is never
      cut in two, and the page header, footer and "Page x of y" are drawn on
      every page.
    */
    const handleDownloadPdf = () => {
        const wasEditing = isEditMode;
        if (wasEditing) {
            setIsEditMode(false);
        }
        setIsGenerating(true);

        setTimeout(async () => {
            const element = contentRef.current;
            try {
                if (!element) return;
                element.classList.add('ea-printing');
                // A timer, not animation frames: frames pause while the tab is in the background.
                await new Promise((r) => setTimeout(r, 120));
                const sections = Array.from(element.querySelectorAll('.ea-page')) as HTMLElement[];
                await downloadSectionsAsPdf(sections, {
                    filename: `FFDS-Execution-Agreement-${(projectContext as any).projectId || 'Draft'}.pdf`,
                    title: `Integrated Execution Agreement · ${(projectContext as any)?.name || ''}`.trim(),
                    studioName,
                    keepTogether: '.ea-clause,.ea-box,.ea-sig-grid,.ea-avoid-break,.ea-annex-title',
                    // A section starts on the same page when at least a third of it is left.
                    flowWhenRemaining: 0.33,
                });
            } catch (err) {
                console.error('Failed to generate the agreement PDF', err);
                alert('The PDF could not be made. Please try again.');
            } finally {
                element?.classList.remove('ea-printing');
                setIsGenerating(false);
                if (wasEditing) setIsEditMode(true);
            }
        }, 150);
    };

    /*
      Summary first, like the Terms Docket (DESIGN.md "Screen kit",
      standardisation PR 6): where the agreement stands, the figures a client
      asks about, and the outline. The agreement itself is one click away, and
      is what the PDF is captured from, so the PDF shows it first.
    */
    const signoff = (projectContext as any).executionSignoff;
    const signState: 'pending' | 'sent' | 'signed' = signoff?.status === 'signed' ? 'signed' : signoff?.status === 'sent' ? 'sent' : 'pending';
    const statusChip = signState === 'signed'
        ? <Chip tone="good">Signed</Chip>
        : signState === 'sent' ? <Chip tone="warn">Sent · awaiting signature</Chip> : <Chip tone="slate">Not sent</Chip>;
    const when = (t?: string | number | null) => (t ? new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
    const steps = [
        { label: 'Prepared', sub: agreement.agreementDate || 'From the approved option', done: true },
        { label: 'Sent to client', sub: signoff?.sentAt ? when(signoff.sentAt) : signState === 'signed' ? 'Recorded by the studio' : 'Not yet', done: signState !== 'pending' },
        { label: 'Signed', sub: signState === 'signed' ? (when(signoff?.signedAt) || 'Signed') : 'Not yet', done: signState === 'signed' },
    ];
    const m = agreement.money;
    const figures = [
        { topic: 'Contract value', text: `${formatCurrency(m.grandTotal)} including GST`, to: '4' },
        { topic: 'Execution', text: `${formatCurrency(m.netExecution)}${m.executionDiscount > 0 ? ` after ${m.executionDiscountLabel || 'a discount'} of ${formatCurrency(m.executionDiscount)}` : ''}${m.optionName ? ` · ${m.optionName}` : ''}`, to: '2' },
        m.netDesign > 0 ? { topic: 'Design fee', text: `${formatCurrency(m.netDesign)}${m.designDiscount > 0 ? ` after ${m.designDiscountLabel || 'a discount'} of ${formatCurrency(m.designDiscount)}` : ''}`, to: '3' } : null,
        { topic: 'GST', text: `${m.gstRate}% · ${formatCurrency(m.executionGst + m.designGst)}`, to: '4' },
        { topic: 'Payments', text: agreement.schedule.length ? `${agreement.schedule.length} stages, from ${agreement.schedule[0].name}` : 'No stages in Money yet', to: 'A' },
        { topic: 'Duration', text: agreement.programme
            ? `${agreement.programme.totalDays} days, start to handover (design ${agreement.programme.designDays} + site ${agreement.programme.siteDays}), from ${agreement.commencementTrigger}`
            : `${agreement.estimatedDuration} working days from ${agreement.commencementTrigger}`, to: '5' },
        { topic: 'Scope', text: `${agreement.boq.length} BOQ ${agreement.boq.length === 1 ? 'line' : 'lines'}`, to: 'F' },
        { topic: 'Client', text: [agreement.parties.clientName, agreement.parties.projectAddress].filter(Boolean).join(' · ') || 'Not set', to: '1' },
    ].filter(Boolean) as Array<{ topic: string; text: string; to: string }>;
    const ANNEXURES = [
        { no: 'A', title: 'Payment Schedule' },
        { no: 'B', title: 'Revision and Change Request Charges' },
        { no: 'C', title: 'As-Actuals and Client-Procured Items' },
        { no: 'D', title: 'Scope Exclusion Checklist' },
        { no: 'E', title: 'Execution Start Readiness Checklist' },
        { no: 'F', title: 'Final Approved BOQ & Technical Specifications' },
    ];
    /* Articles carry ids (sec-1 … sec-10); an annexure is found by its title. */
    const findPart = (to: string) => /^\d+$/.test(to)
        ? contentRef.current?.querySelector(`#sec-${to}`)
        : (Array.from(contentRef.current?.querySelectorAll('.ea-annex-title') || []) as HTMLElement[]).find((el) => (el.textContent || '').startsWith(`Annexure ${to}`));
    const openPart = (to?: string) => {
        setViewMode('doc');
        if (to) window.setTimeout(() => (findPart(to) as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    };
    const pickView = (v: 'summary' | 'doc') => {
        if (v === 'summary') setIsEditMode(false);
        setViewMode(v);
    };
    const toggleEdit = () => {
        if (!isEditMode) setViewMode('doc');
        setIsEditMode(!isEditMode);
    };
    /* The PDF is captured from the agreement on screen, so show it first when the summary is open. */
    const downloadPdf = () => {
        if (viewMode === 'doc' && contentRef.current) { handleDownloadPdf(); return; }
        setViewMode('doc');
        window.setTimeout(() => handleDownloadPdf(), 300);
    };

    const signoffBlock = (
        <ExecutionAgreementSignoffBlock
            clientName={agreement.parties.clientName || 'Client'}
            location={projectContext.location || 'Site'}
            projectId={projectId}
            setProjectContext={setProjectContext}
            projectContext={projectContext}
            grandTotal={agreement.money.grandTotal}
            tenantId={tenantId}
        />
    );

    return (
        <div className="w-full space-y-4 pb-20">
            {/* One row: the view, where the agreement stands, and what can be done with it. */}
            <div className="flex flex-wrap items-center gap-2 no-print">
                <Segmented
                    label="Execution Agreement view"
                    size="sm"
                    value={viewMode}
                    options={[
                        { id: 'summary', label: 'Summary' },
                        { id: 'doc', label: 'Agreement' },
                    ]}
                    onChange={pickView}
                />
                {statusChip}
                {isEditMode && <Chip tone="brand">Editing</Chip>}
                <span className="text-xs text-slate-500 tabular-nums">{projectId}</span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Button size="sm" variant={isEditMode ? 'primary' : 'secondary'} icon={isEditMode ? Check : Pencil} onClick={toggleEdit}>
                        {isEditMode ? 'Done editing' : 'Edit agreement'}
                    </Button>
                    <Button size="sm" icon={Download} onClick={downloadPdf} disabled={isGenerating}>
                        {isGenerating ? 'Making the PDF…' : 'Download PDF'}
                    </Button>
                </div>
            </div>

            {openRevision && (
                <Panel
                    icon={GitCompare}
                    title={`Scope Revision ${openRevision.number}${openRevision.reference ? ` (${openRevision.reference})` : ''} is not in this agreement yet`}
                    badge={<Chip tone="warn">{openRevision.state === 'approved' ? 'Signed, not applied' : openRevision.state === 'sent_back' ? 'Sent back' : 'With the client'}</Chip>}
                    blurb={openRevision.state === 'approved'
                        ? 'It is signed but not applied. Apply it in Scope & Strategy, then Annexure F, its specifications and the figures here follow the revised BOQ.'
                        : openRevision.state === 'sent_back'
                            ? 'The client sent it back. Until a revision is signed and applied, this agreement states the scope in force.'
                            : 'It is with the client. Once it is signed and applied, Annexure F, its specifications and the figures here follow the revised BOQ.'}
                    className="no-print"
                />
            )}

            {viewMode === 'summary' && (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)] gap-4 items-start no-print">
                    <div className="space-y-4 min-w-0">
                        <Panel
                            icon={Clock}
                            title="Where it stands"
                            badge={statusChip}
                            blurb={signState === 'signed'
                                ? 'Signed: this is the agreement the site work runs on.'
                                : signState === 'sent'
                                    ? 'With the client for their signature.'
                                    : 'Not sent yet. The client signs this before work starts on site.'}
                        >
                            <ol className="grid grid-cols-3 gap-3">
                                {steps.map((st, i) => (
                                    <li key={st.label} className="hud-row-in min-w-0" style={{ animationDelay: `${i * 30}ms` }}>
                                        <span className={`block h-1 rounded-full ${st.done ? 'bg-[#3D52A0]' : 'bg-slate-200'}`} />
                                        <b className="block mt-2 text-sm font-semibold text-slate-800">{st.label}</b>
                                        <span className="block text-[11px] text-slate-500">{st.sub}</span>
                                    </li>
                                ))}
                            </ol>
                        </Panel>

                        <Panel icon={ShieldCheck} title="Client signature" blurb="Send the agreement for a digital signature, or record one given another way." delay={30}>
                            {signoffBlock}
                        </Panel>

                        <Panel icon={ListChecks} title="What the client agrees to" blurb="From Money, the approved option and the Timeline, as they stand now. Open one to read it in the agreement." delay={60}>
                            <div className="divide-y divide-slate-100">
                                {figures.map((f) => (
                                    <button key={f.topic} type="button" onClick={() => openPart(f.to)}
                                        className="w-full grid grid-cols-[120px_minmax(0,1fr)_auto] gap-3 items-baseline py-2.5 text-left hover:bg-slate-50 rounded-lg px-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{f.topic}</span>
                                        <span className="text-sm text-slate-700 tabular-nums">{f.text}</span>
                                        <span className="text-xs font-bold text-[#3D52A0]">{/^\d+$/.test(f.to) ? `Art. ${f.to}` : `Annex ${f.to}`}</span>
                                    </button>
                                ))}
                            </div>
                        </Panel>
                    </div>

                    <div className="space-y-4 min-w-0">
                        <Panel icon={BookOpen} title="The agreement" blurb={`Integrated execution agreement · ${AGREEMENT_ARTICLES.length} articles and ${ANNEXURES.length} annexures`} delay={90}>
                            <ol>
                                {AGREEMENT_ARTICLES.map((a) => (
                                    <li key={a.no}>
                                        <button type="button" onClick={() => openPart(a.no)} className="w-full flex gap-2 px-1 py-1.5 rounded-lg text-left text-sm text-slate-700 hover:bg-slate-50">
                                            <span className="w-6 shrink-0 text-slate-400 tabular-nums">{a.no}</span>
                                            <span className="min-w-0">{a.title}</span>
                                        </button>
                                    </li>
                                ))}
                                {ANNEXURES.map((a) => (
                                    <li key={a.no}>
                                        <button type="button" onClick={() => openPart(a.no)} className="w-full flex gap-2 px-1 py-1.5 rounded-lg text-left text-sm text-slate-700 hover:bg-slate-50">
                                            <span className="w-6 shrink-0 text-slate-400">{a.no}</span>
                                            <span className="min-w-0">{a.title}</span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                            <Button size="sm" className="mt-3" icon={BookOpen} onClick={() => openPart()}>Read the agreement</Button>
                        </Panel>
                    </div>
                </div>
            )}

            {viewMode === 'doc' && (
                <div className="grid grid-cols-1 2xl:grid-cols-[220px_minmax(0,1fr)] gap-4 items-start">
                    <nav aria-label="Articles" className="no-print hidden 2xl:block sticky top-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-3 max-h-[80vh] overflow-y-auto">
                        <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Articles</p>
                        {AGREEMENT_ARTICLES.map((a) => (
                            <button key={a.no} type="button" onClick={() => openPart(a.no)} className="w-full flex gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-slate-700 hover:bg-slate-50">
                                <span className="w-5 shrink-0 text-slate-400 tabular-nums">{a.no}</span>
                                <span className="min-w-0">{a.title}</span>
                            </button>
                        ))}
                        <p className="px-2 pt-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Annexures</p>
                        {ANNEXURES.map((a) => (
                            <button key={a.no} type="button" onClick={() => openPart(a.no)} className="w-full flex gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-slate-700 hover:bg-slate-50">
                                <span className="w-5 shrink-0 text-slate-400">{a.no}</span>
                                <span className="min-w-0">{a.title}</span>
                            </button>
                        ))}
                    </nav>

                    <div className="space-y-4 min-w-0">
                        {isEditMode && (
                            <Panel
                                icon={Pencil}
                                title="Editing this agreement"
                                blurb={`Client and project details, the representatives, the payment schedule wording, Annexures B and C and each BOQ line's description can be changed on the pages below. Use "Add clause" at the end of any article to add your own clauses and sub-clauses. Figures come from Money and the approved BOQ as they stand now. Everything is saved as you type and goes into the copy the client receives when you next issue it.`}
                                className="no-print"
                            />
                        )}

                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto p-4 sm:p-6 flex justify-center">
                            <ExecutionAgreementSheet
                                agreement={agreement}
                                studioName={studioName}
                                studioAddress={studioAddress}
                                studioEmail={studioEmail}
                                repName={repName}
                                repTitle={orgData.signatoryTitle}
                                projectId={projectId}
                                contentRef={contentRef}
                                signature={execIssue?.clientSignature || execIssue?.counterSignature
                                    ? <ExecutionStamp issue={execIssue} mode="signature" />
                                    : undefined}
                                isEditMode={isEditMode}
                                onChange={changeOverrides}
                            />
                        </div>

                        {/* Sign-off: the same block as on the summary, after the agreement it signs. */}
                        <Panel icon={ShieldCheck} title="Client signature" blurb="Send the agreement for a digital signature, or record one given another way." className="no-print break-inside-avoid">
                            {signoffBlock}
                        </Panel>
                    </div>
                </div>
            )}
        </div>
    );
}

const ExecutionAgreementSignoffBlock: React.FC<{ clientName: string, location: string, projectId: string, setProjectContext: any, projectContext: ProjectContext, grandTotal: number, tenantId?: string }> = ({ clientName, location, projectId, setProjectContext, projectContext, grandTotal, tenantId }) => {
    const { orgData } = useOrg();
    const { settings } = useStudioSettings(tenantId || '');
    const studioName = studioDisplayName(settings, orgData);
    const [isSending, setIsSending] = useState(false);
    const [showSendConfirm, setShowSendConfirm] = useState(false);
    const [showMarkManual, setShowMarkManual] = useState(false);
    const [showInPersonModal, setShowInPersonModal] = useState(false);
    const [manualRef, setManualRef] = useState("Digital Confirmation");
    const [localError, setLocalError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [pinCopied, setPinCopied] = useState(false);

    const currentSignoff = (projectContext as any).executionSignoff;
    const status = currentSignoff?.status || 'pending';

    const getSignoffUrl = (token: string) => {
        let appDomain = publicAppOrigin();
        if (appDomain.includes('ais-dev-')) {
            appDomain = appDomain.replace('ais-dev-', 'ais-pre-');
        }
        return `${appDomain}/?agreementSignoff=${token}`;
    };

    const sendEmailSignoff = async () => {
        setLocalError(null);
        if (!projectContext.clientEmail || !projectContext.clientEmail.trim()) {
            setLocalError("Client email is required to send the digital agreement. Please enter a valid email address in the input field below.");
            return;
        }

        setIsSending(true);
        try {
            const result = await sendAgreementSignoffRequest(
                projectId || '', 
                projectContext, 
                grandTotal, 
                undefined, 
                tenantId || orgData?.tenantId || 'demo-tenant-01', 
                'execution'
            );
            
            const tokenToUse = result.token || `EXEC_AGREEMENT_${projectId}_${Date.now()}`;
            const accessPinToUse = result.accessPin || `SEC-${Math.floor(1000 + Math.random() * 9000)}`;
            const newSignoff = {
                status: 'sent' as const,
                token: tokenToUse,
                accessPin: accessPinToUse,
                docketHash: result.docketHash,
                sentAt: new Date().toISOString()
            };

            const updatedContext = { ...projectContext, executionSignoff: newSignoff };
            setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: newSignoff }));
            setShowSendConfirm(false);

            // Immediate persistence to ensure client link works instantly without race conditions
            try {
                const allProjects = await dbService.getProjects();
                const currentProj = allProjects.find(p => p.id === projectId);
                if (currentProj) {
                    await dbService.saveProject({
                        ...currentProj,
                        context: updatedContext,
                        lastModified: Date.now()
                    });
                }
                if (firestore && projectId) {
                    await updateDoc(doc(firestore, 'projects', projectId), {
                        'context.executionSignoff': newSignoff,
                        lastModified: Date.now()
                    });
                }
            } catch (pErr) {
                console.warn("Immediate signoff sync note:", pErr);
            }

            if (result.error) {
                setLocalError(`Email dispatch status: ${result.error}. The digital sign-off link & access PIN are active below.`);
            }
        } catch (err: any) {
            console.error("Signoff send error:", err);
            const fallbackToken = `EXEC_AGREEMENT_${projectId}_${Date.now()}`;
            const fallbackPin = `SEC-${Math.floor(1000 + Math.random() * 9000)}`;
            const fallbackSignoff = {
                status: 'sent' as const,
                token: fallbackToken,
                accessPin: fallbackPin,
                sentAt: new Date().toISOString()
            };
            const updatedContext = { ...projectContext, executionSignoff: fallbackSignoff };
            setProjectContext?.((prev: any) => ({ 
                ...prev, 
                executionSignoff: fallbackSignoff 
            }));
            setShowSendConfirm(false);

            try {
                const allProjects = await dbService.getProjects();
                const currentProj = allProjects.find(p => p.id === projectId);
                if (currentProj) {
                    await dbService.saveProject({
                        ...currentProj,
                        context: updatedContext,
                        lastModified: Date.now()
                    });
                }
            } catch (pErr) {
                console.warn("Fallback signoff persistence note:", pErr);
            }

            setLocalError(`Notice: ${err.message || 'Email dispatch skipped in sandbox mode'}. Digital signature URL & PIN generated successfully below.`);
        } finally {
            setIsSending(false);
        }
    };

    const handleConfirmManualOverride = (docket: DigitalSignatureDocket) => {
        const newSignoff = {
            status: 'signed' as const,
            clientName: docket.signatoryName,
            clientEmail: docket.signatoryEmail,
            ipAddress: docket.ipAddress,
            refId: docket.docketHash,
            signedAt: docket.signedAt,
            signatureType: docket.signatureType,
            signatureDataUrl: docket.signatureDataUrl,
            docket: docket,
            manualOverride: docket.manualOverride
        };
        setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: newSignoff }));
        setShowMarkManual(false);
    };

    const handleInPersonSignSubmit = (docket: DigitalSignatureDocket) => {
        const newSignoff = {
            status: 'signed' as const,
            clientName: docket.signatoryName,
            clientEmail: docket.signatoryEmail,
            ipAddress: 'In-Person (Studio Device)',
            refId: docket.docketHash,
            signedAt: docket.signedAt,
            signatureType: docket.signatureType,
            signatureDataUrl: docket.signatureDataUrl,
            docket: {
                ...docket,
                ipAddress: 'In-Person (Studio Device)'
            }
        };
        setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: newSignoff }));
        setShowInPersonModal(false);
    };

    const handleReset = () => {
        setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: { status: 'pending' } }));
    };

    const handleCopy = (txt: string) => {
        navigator.clipboard.writeText(txt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyPin = (pin: string) => {
        navigator.clipboard.writeText(pin);
        setPinCopied(true);
        setTimeout(() => setPinCopied(false), 2000);
    };

    const shareViaWhatsApp = (link: string, pin: string) => {
        const text = encodeURIComponent(
            `Dear ${projectContext.clientName || 'Client'},\n\n` +
            `Your official Execution Agreement for *${projectContext.name || 'Interior Design Project'}* has been dispatched for authorization by ${studioName}.\n\n` +
            `🔒 *Document Access PIN:* ${pin}\n\n` +
            `Direct Review & Sign Link:\n${link}\n\n` +
            `You can also open our studio portal and verify via your Access PIN without clicking unknown links.`
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    // View: EXECUTED (Stamped)
    if (status === 'signed') {
        const docketToRender: DigitalSignatureDocket = currentSignoff?.docket || {
            signatoryName: currentSignoff?.clientName || clientName || 'Client Signatory',
            signatoryEmail: currentSignoff?.clientEmail || projectContext.clientEmail,
            signedAt: currentSignoff?.signedAt || new Date().toISOString(),
            signatureType: currentSignoff?.signatureType || (currentSignoff?.ipAddress === 'Internal' ? 'manual_override' : 'draw'),
            signatureDataUrl: currentSignoff?.signatureDataUrl,
            ipAddress: currentSignoff?.ipAddress || 'Client Portal Web',
            docketHash: currentSignoff?.refId?.startsWith('SHA256') ? currentSignoff.refId : `SHA256:${currentSignoff?.refId || 'EXEC_SEALED'}`,
            verified: true,
            legalAffirmation: true,
            manualOverride: currentSignoff?.manualOverride || (currentSignoff?.ipAddress === 'Internal' ? {
                isOverride: true,
                recordedBy: 'Ops Director',
                recordedAt: currentSignoff?.signedAt || new Date().toISOString(),
                overrideReason: 'Manual Ops Acceptance',
                approvalMedium: 'paper_wet_ink'
            } : undefined)
        };

        return (
            <div className="break-inside-avoid">
                <DigitalSignatureDocketView
                    docket={docketToRender}
                    documentTitle="Integrated Interior Execution Agreement"
                    projectId={projectId}
                    projectName={projectContext.name}
                    studioName={studioName}
                    canReset={true}
                    onReset={handleReset}
                />
            </div>
        );
    }

    // View: SENT
    if (status === 'sent') {
        const sentTimestamp = currentSignoff?.sentAt ? new Date(currentSignoff.sentAt).toLocaleString() : 'N/A';
        const link = currentSignoff?.token ? getSignoffUrl(currentSignoff.token) : '';
        const accessPin = currentSignoff?.accessPin || 'SEC-8492';

        return (
            <div className="space-y-4 break-inside-avoid">
                <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                    <StateDot tone="warn" />
                    <span>Sent {sentTimestamp} to <b className="font-semibold text-slate-800">{projectContext.clientEmail || 'the client'}</b>. Waiting for their signature.</span>
                </p>

                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)] gap-4 items-start">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className={LABEL}>Access PIN</p>
                        <p className="mt-1 flex items-center gap-2">
                            <KeyRound className="w-4 h-4 text-[#3D52A0]" />
                            <b className="text-lg font-bold text-slate-800 tabular-nums tracking-wider">{accessPin}</b>
                        </p>
                        <Button size="sm" variant="quiet" className="mt-2" icon={pinCopied ? Check : Copy} onClick={() => handleCopyPin(accessPin)}>
                            {pinCopied ? 'PIN copied' : 'Copy PIN'}
                        </Button>
                    </div>
                    <div className="min-w-0">
                        <p className={LABEL}>Sign-off link</p>
                        <p className="mt-1 text-xs text-slate-600 break-all bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{link}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button size="sm" icon={copied ? Check : Copy} onClick={() => handleCopy(link)}>{copied ? 'Link copied' : 'Copy link'}</Button>
                            <a href={link} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
                                <ExternalLink className="w-3.5 h-3.5" /> Open sign-off screen
                            </a>
                            <Button size="sm" icon={Share2} onClick={() => shareViaWhatsApp(link, accessPin)}>Share on WhatsApp</Button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-100 no-print">
                    <Button size="sm" variant="primary" icon={Tablet} onClick={() => setShowInPersonModal(true)}>Sign in person</Button>
                    <Button size="sm" onClick={() => setShowMarkManual(true)} title="Record a signature given by WhatsApp, email or on paper">Record acceptance</Button>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        {showSendConfirm ? (
                            <>
                                <span className="text-xs text-slate-600">Send the agreement again?</span>
                                <Button size="sm" variant="primary" onClick={sendEmailSignoff}>Yes, resend</Button>
                                <Button size="sm" variant="quiet" onClick={() => setShowSendConfirm(false)}>Cancel</Button>
                            </>
                        ) : (
                            <Button size="sm" variant="quiet" icon={Mail} onClick={() => setShowSendConfirm(true)} disabled={isSending}>
                                {isSending ? 'Sending…' : 'Resend email'}
                            </Button>
                        )}
                        <Button size="sm" variant="quiet" onClick={handleReset}>Cancel request</Button>
                    </div>
                </div>
                {localError && <p className="text-xs text-rose-700">{localError}</p>}

                {showInPersonModal && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="In-person signing">
                        <div className="phd-scrim absolute inset-0 bg-[#12182F]/40 backdrop-blur-sm" onClick={() => setShowInPersonModal(false)} />
                        <div className="phd-pop relative bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
                            <div className="px-6 pt-5 pb-4 flex items-start gap-4">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#3D52A0]">Execution Agreement</p>
                                    <h3 className="text-lg font-bold text-slate-800">Sign in person</h3>
                                    <p className="text-xs text-slate-500">
                                        Hand your device or tablet to <b className="font-semibold text-slate-700">{projectContext.clientName || 'the client'}</b> to sign here.
                                    </p>
                                </div>
                                <button type="button" onClick={() => setShowInPersonModal(false)} aria-label="Close" className="w-9 h-9 rounded-xl grid place-items-center text-slate-400 hover:bg-slate-100">
                                    <XIcon className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="px-6 pb-6">
                                <DigitalSignaturePad
                                    initialName={projectContext.clientName || ''}
                                    initialEmail={projectContext.clientEmail || ''}
                                    documentTitle="Integrated Interior Execution Agreement"
                                    projectTitle={projectContext.name}
                                    onSignComplete={handleInPersonSignSubmit}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {showMarkManual && (
                    <ManualAcceptanceOverrideModal
                        documentTitle="Integrated Interior Execution Agreement"
                        projectName={projectContext.name}
                        defaultClientName={projectContext.clientName}
                        defaultClientEmail={projectContext.clientEmail}
                        onConfirmOverride={handleConfirmManualOverride}
                        onClose={() => setShowMarkManual(false)}
                    />
                )}
            </div>
        );
    }

    // View: PENDING (Instructions)
    const emailSet = !!projectContext.clientEmail && projectContext.clientEmail.includes('@');
    return (
        <div className="space-y-4 break-inside-avoid">
            <p className="text-sm text-slate-600">
                No physical signature needed. Send the agreement and the client signs it with a link and an access PIN.
            </p>

            <div className="max-w-xl">
                <label htmlFor="ea-client-email" className={LABEL}>Client email</label>
                <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                        id="ea-client-email"
                        type="email"
                        value={projectContext.clientEmail || ''}
                        onChange={e => {
                            const emailVal = e.target.value;
                            setProjectContext?.((prev: any) => ({ ...prev, clientEmail: emailVal }));
                        }}
                        className={INPUT}
                        placeholder="client@example.com"
                    />
                    {emailSet ? <Chip tone="good" className="self-start sm:self-auto">Set</Chip> : <Chip tone="warn" className="self-start sm:self-auto">Missing</Chip>}
                </div>
                {!projectContext.clientEmail && (
                    <p className="text-xs text-rose-700 mt-1.5">An email address is needed to send the sign-off link.</p>
                )}
            </div>

            {localError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 space-y-2">
                    <p className="text-xs text-rose-700"><b className="font-semibold">The email did not go.</b> {localError}</p>
                    <Button
                        size="sm"
                        onClick={async () => {
                            setLocalError(null);
                            setIsSending(true);
                            try {
                                const randomPart = Math.random().toString(36).substring(2, 15);
                                const token = `EXEC_AGREEMENT_${projectId}_${randomPart}`;
                                const newSignoff = {
                                    status: 'sent',
                                    token: token,
                                    sentAt: new Date().toISOString()
                                };
                                setProjectContext?.((prev: any) => ({ ...prev, executionSignoff: newSignoff }));
                            } catch (e: any) {
                                setLocalError(e.message);
                            } finally {
                                setIsSending(false);
                            }
                        }}
                    >
                        Make the sign-off link without email
                    </Button>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-100 no-print">
                {!showSendConfirm ? (
                    <Button variant="primary" size="sm" icon={Send} onClick={() => setShowSendConfirm(true)} disabled={isSending}>
                        {isSending ? 'Sending…' : 'Send to client'}
                    </Button>
                ) : (
                    <>
                        <span className="text-xs text-slate-600">Email the agreement to {projectContext.clientEmail || 'the client'}?</span>
                        <Button variant="primary" size="sm" onClick={sendEmailSignoff} disabled={isSending}>{isSending ? 'Sending…' : 'Confirm send'}</Button>
                        <Button variant="quiet" size="sm" onClick={() => setShowSendConfirm(false)} disabled={isSending}>Cancel</Button>
                    </>
                )}
                <Button size="sm" onClick={() => setShowMarkManual(true)} title="Record a signature given by WhatsApp, email or on paper">Record acceptance</Button>
            </div>

            {showMarkManual && (
                <ManualAcceptanceOverrideModal
                    documentTitle="Integrated Interior Execution Agreement"
                    projectName={projectContext.name}
                    defaultClientName={projectContext.clientName}
                    defaultClientEmail={projectContext.clientEmail}
                    onConfirmOverride={handleConfirmManualOverride}
                    onClose={() => setShowMarkManual(false)}
                />
            )}
        </div>
    );
}
