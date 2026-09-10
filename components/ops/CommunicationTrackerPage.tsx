import { showSuccessWithNext } from '../SuccessWithNextToast';
import React, { useState } from 'react';
import { useCommunicationLog } from '../../hooks/useCommunicationLog';
import { updateCommunicationLog } from '../../services/communicationTrackerService';
import { CommunicationLogItem, CommunicationTemplateItem, TeamMember, ProjectContext } from '../../types';
import { resolveTemplate, stripHtml } from '../../lib/templateEngine';
import { CheckCircle, Clock, AlertTriangle, Send, MoreVertical, X, Calendar, User, FileText, Check, AlertCircle, Copy, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useStudioSettings } from '../../hooks/useStudioSettings';

interface Props {
    projectId: string;
    studioId: string;
    projectContext: ProjectContext;
    teamMembers: TeamMember[];
    currentUserName: string;
    currentUserId: string;
}

export function CommunicationTracker({ projectId, studioId, projectContext, teamMembers, currentUserName, currentUserId }: Props) {
    const { designItems, executionItems, healthScore, sentCount, pendingCount, naCount, loading, mergedItems, error } = useCommunicationLog(projectId, studioId);
    const [activeTab, setActiveTab] = useState<'design' | 'execution'>('design');
    const [selectedItem, setSelectedItem] = useState<{template: CommunicationTemplateItem, log: CommunicationLogItem} | null>(null);
    const [modalStep, setModalStep] = useState<1 | 2>(1);
    const [previewMode, setPreviewMode] = useState<'email' | 'whatsapp'>('email');
    const [copySuccess, setCopySuccess] = useState('');
    /* Twenty-four rows is a list you work through, not one you read. */
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'attention' | 'pending' | 'sent' | 'na'>('all');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const { settings: studioSettings } = useStudioSettings(studioId);

    const openModal = (item: any) => {
        setSelectedItem(item);
        setModalStep(item.log.status === 'sent' ? 2 : 1);
        setPreviewMode('email');
        setCopySuccess('');
    };

    const getVariables = () => {
        return {
            clientName: projectContext?.clientName || 'Client',
            projectName: projectContext?.name || 'Project',
            // @ts-ignore
            studioName: studioSettings?.branding?.orgName || 'Studio',
            // @ts-ignore
            studioPhone: studioSettings?.branding?.contactInfo || '',
            studioEmail: '',
            designerName: currentUserName,
            // @ts-ignore
            designerTitle: studioSettings?.team?.[currentUserId]?.title || 'Architect',
            date: format(new Date(), 'dd MMM yyyy'),
            amount: '₹0', // TODO: Fetch from actual if needed
            invoiceRef: selectedItem?.log?.invoiceRef || '',
            dueDate: '', 
            portalLink: "https://portal.ffds.in" 
        };
    };

    const handleCopy = (html: string, type: string) => {
        const text = stripHtml(html);
        navigator.clipboard.writeText(text);
        setCopySuccess(type);
        setTimeout(() => setCopySuccess(''), 2000);
    };

    const handleMarkSent = async (data: Partial<CommunicationLogItem>) => {
        if (!selectedItem) return;
        
        // Optimistic / recalculate health stats to send to updateCommunicationLog
        const newLogs = mergedItems.map(m => m.template.key === selectedItem.template.key ? { ...m.log, ...data } : m.log);
        const reqItems = mergedItems.filter(m => m.template.isRequired);
        const reqSentCount = reqItems.filter(m => 
            (m.template.key === selectedItem.template.key ? data.status : m.log.status) === 'sent' || 
            (m.template.key === selectedItem.template.key ? data.status : m.log.status) === 'not_applicable'
        ).length;
        const newHealthScore = reqItems.length > 0 ? Math.round((reqSentCount / reqItems.length) * 100) : 100;
        
        const newSentCount = (newLogs || []).filter(m => m.status === 'sent').length;
        const newPendingCount = (newLogs || []).filter(m => m.status === 'pending').length;
        
        await updateCommunicationLog(projectId, { ...data, key: selectedItem.template.key }, {
            commsHealth: newHealthScore,
            commsSentCount: newSentCount,
            commsPendingCount: newPendingCount
        });
        
        setSelectedItem(null);
        showSuccessWithNext('Communication logged successfully');
    };

    const handleMarkNA = async (item: {template: CommunicationTemplateItem, log: CommunicationLogItem}) => {
        if (!window.confirm("Mark this as not applicable for this project?")) return;
        
        const newLogs = mergedItems.map(m => m.template.key === item.template.key ? { ...m.log, status: 'not_applicable' } : m.log);
        const reqItems = mergedItems.filter(m => m.template.isRequired);
        const reqSentCount = reqItems.filter(m => 
            (m.template.key === item.template.key ? 'not_applicable' : m.log.status) === 'sent' || 
            (m.template.key === item.template.key ? 'not_applicable' : m.log.status) === 'not_applicable'
        ).length;
        const newHealthScore = reqItems.length > 0 ? Math.round((reqSentCount / reqItems.length) * 100) : 100;
        
        await updateCommunicationLog(projectId, { status: 'not_applicable', key: item.template.key }, {
            commsHealth: newHealthScore,
            commsPendingCount: (newLogs || []).filter(m => m.status === 'pending').length
        });
    };
    
    const handleRevertNA = async (item: {template: CommunicationTemplateItem, log: CommunicationLogItem}) => {
        const newLogs = mergedItems.map(m => m.template.key === item.template.key ? { ...m.log, status: 'pending' } : m.log);
         const reqItems = mergedItems.filter(m => m.template.isRequired);
        const reqSentCount = reqItems.filter(m => 
            (m.template.key === item.template.key ? 'pending' : m.log.status) === 'sent' || 
            (m.template.key === item.template.key ? 'pending' : m.log.status) === 'not_applicable'
        ).length;
        const newHealthScore = reqItems.length > 0 ? Math.round((reqSentCount / reqItems.length) * 100) : 100;

        await updateCommunicationLog(projectId, { status: 'pending', key: item.template.key }, {
             commsHealth: newHealthScore,
             commsPendingCount: (newLogs || []).filter(m => m.status === 'pending').length
        });
    };

    const toggleSelected = (key: string) =>
        setSelected(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });

    /*
      Bulk "not applicable" — but deliberately NOT bulk "sent".

      This is an audit log. Marking a batch as sent would have to invent a date,
      a sender and a channel for each one, and the whole value of the record is
      that those fields are true. Declaring a batch irrelevant to this project
      invents nothing, so that is the one that can be done in bulk.
    */
    const handleBulkNA = async () => {
        const keys = [...selected];
        if (!keys.length) return;
        if (!window.confirm(`Mark ${keys.length} communication${keys.length > 1 ? 's' : ''} as not applicable?`)) return;

        // Project the end state once — recomputing per item inside the loop
        // reads stale counts and lands a wrong health score.
        const keySet = new Set(keys);
        const projected = mergedItems.map(m => (keySet.has(m.template.key) ? { ...m.log, status: 'not_applicable' } : m.log));
        const reqItems = mergedItems.filter(m => m.template.isRequired);
        const reqDone = reqItems.filter(m => {
            const st = keySet.has(m.template.key) ? 'not_applicable' : m.log.status;
            return st === 'sent' || st === 'not_applicable';
        }).length;
        const stats = {
            commsHealth: reqItems.length ? Math.round((reqDone / reqItems.length) * 100) : 100,
            commsSentCount: projected.filter(m => m.status === 'sent').length,
            commsPendingCount: projected.filter(m => m.status === 'pending').length,
        };
        for (const key of keys) {
            await updateCommunicationLog(projectId, { status: 'not_applicable', key }, stats);
        }
        setSelected(new Set());
    };

    /* The message, on the clipboard, without opening anything. Most of the
       time that is the entire job this page is asked to do. */
    const copyEmail = async (item: any) => {
        const v = getVariables();
        const subject = stripHtml(resolveTemplate(item.template.email?.subject || '', v));
        const body = stripHtml(resolveTemplate(item.template.email?.body || '', v));
        await navigator.clipboard.writeText(`${subject}\n\n${body}`.trim());
        setCopiedKey(item.template.key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading tracker...</div>;

    /*
      A failed listener used to be indistinguishable from a slow one: the page
      simply never finished loading. Saying what went wrong is the difference
      between "the app is broken" and "the rules need deploying".
    */
    if (error) {
        const denied = (error as any)?.code === 'permission-denied';
        return (
            <div className="p-8">
                <div className="max-w-xl mx-auto rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
                    <span className="font-bold block mb-1">The communication log could not be read</span>
                    {denied ? (
                        <>
                            Firestore denied access to this project's communication log. This
                            usually means the security rules for{' '}
                            <code className="mx-1 px-1 rounded bg-amber-100">projects/&lt;id&gt;/communicationLog</code>{' '}
                            have not been deployed yet.
                        </>
                    ) : (
                        <>Something went wrong reading the log: {String((error as any)?.message || error)}</>
                    )}
                    <span className="block mt-2 text-xs opacity-80">Nothing has been lost — this page only reads.</span>
                </div>
            </div>
        );
    }

    const itemsToShow = activeTab === 'design' ? designItems : executionItems;
    
    // Group by category
    const groupedItems: Record<string, typeof itemsToShow> = {};
    itemsToShow.forEach(item => {
        if (!groupedItems[item.template.category]) {
            groupedItems[item.template.category] = [];
        }
        groupedItems[item.template.category].push(item);
    });

    const getHealthColor = (score: number) => {
        if (score >= 90) return 'text-emerald-600 bg-emerald-50';
        if (score >= 60) return 'text-amber-600 bg-amber-50';
        return 'text-rose-600 bg-rose-50';
    };

    const all = itemsToShow || [];
    const counts = {
        all: all.length,
        attention: all.filter(i => i.log.needsAttention && i.log.status === 'pending').length,
        pending: all.filter(i => i.log.status === 'pending').length,
        sent: all.filter(i => i.log.status === 'sent').length,
        na: all.filter(i => i.log.status === 'not_applicable').length,
    };

    const q = query.trim().toLowerCase();
    const visible = all.filter(i => {
        if (q && !i.template.title.toLowerCase().includes(q) && !(i.template.category || '').toLowerCase().includes(q)) return false;
        const st = i.log.status;
        if (statusFilter === 'attention') return i.log.needsAttention && st === 'pending';
        if (statusFilter === 'pending') return st === 'pending';
        if (statusFilter === 'sent') return st === 'sent';
        if (statusFilter === 'na') return st === 'not_applicable';
        return true;
    });

    const grouped: Record<string, typeof visible> = {};
    visible.forEach(i => { (grouped[i.template.category] ||= []).push(i); });

    const selectablePending = visible.filter(i => i.log.status === 'pending');
    const allPendingSelected = selectablePending.length > 0 && selectablePending.every(i => selected.has(i.template.key));

    const FILTERS = [
        { id: 'all' as const, label: 'All', n: counts.all },
        { id: 'attention' as const, label: 'Needs confirming', n: counts.attention },
        { id: 'pending' as const, label: 'Pending', n: counts.pending },
        { id: 'sent' as const, label: 'Sent', n: counts.sent },
        { id: 'na' as const, label: 'N/A', n: counts.na },
    ];

    const PHASES = [
        { id: 'design' as const, label: 'Design phase', items: designItems || [] },
        { id: 'execution' as const, label: 'Execution phase', items: executionItems || [] },
    ];

    return (
        <div className="space-y-4 pb-12">

            <section className="rounded-2xl border border-slate-200/80 bg-white p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Send className="w-4 h-4 text-[#0066CC]" />
                            Communication tracker
                        </h2>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Every client email and notification, and whether it actually went out.
                        </p>
                    </div>
                    <div className="flex items-baseline gap-2 shrink-0">
                        <span className={`text-2xl font-extrabold tabular-nums leading-none ${
                            healthScore >= 90 ? 'text-emerald-600' : healthScore >= 60 ? 'text-amber-600' : 'text-rose-600'
                        }`}>{healthScore}%</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Health</span>
                    </div>
                </div>

                <div className="mt-4 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${
                            healthScore >= 90 ? 'bg-emerald-500' : healthScore >= 60 ? 'bg-amber-400' : 'bg-[#0066CC]'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, healthScore))}%` }}
                    />
                </div>

                <p className="mt-2.5 text-[11px] font-semibold text-slate-500">
                    {sentCount} sent · {pendingCount} pending · {naCount} not applicable
                </p>
            </section>

            <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">

                {/* Phase, then search and status — the three ways anyone
                    actually narrows a list this long. */}
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex gap-1 rounded-2xl bg-slate-50 p-1 w-fit ring-1 ring-slate-200/70">
                            {PHASES.map(ph => {
                                const on = activeTab === ph.id;
                                const done = ph.items.filter(i => i.log.status === 'sent').length;
                                const req = ph.items.filter(i => i.template.isRequired).length;
                                return (
                                    <button
                                        key={ph.id}
                                        onClick={() => { setActiveTab(ph.id); setSelected(new Set()); }}
                                        aria-current={on ? 'page' : undefined}
                                        className={`px-3.5 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap cursor-pointer
                                                    transition-colors flex items-center gap-2 ${
                                            on ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                                               : 'text-slate-500 hover:text-slate-900'
                                        }`}
                                    >
                                        {ph.label}
                                        <span className={`text-[10px] font-extrabold tabular-nums rounded-full px-1.5 leading-[18px] ${
                                            on ? 'bg-sky-50 text-[#0055B3]' : 'bg-slate-100 text-slate-500'
                                        }`}>{done}/{req}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="relative ml-auto min-w-[190px] flex-1 max-w-xs">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search communications…"
                                className="w-full pl-8.5 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white
                                           text-[12px] font-medium outline-none focus:border-[#0066CC] transition-colors"
                                style={{ paddingLeft: '2.1rem' }}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                        {FILTERS.map(f => {
                            const on = statusFilter === f.id;
                            return (
                                <button
                                    key={f.id}
                                    onClick={() => setStatusFilter(f.id)}
                                    aria-pressed={on}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer border transition-colors ${
                                        on ? 'bg-sky-50 text-[#0055B3] border-sky-200'
                                           : 'text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-900'
                                    } ${f.id === 'attention' && f.n > 0 && !on ? 'text-amber-700' : ''}`}
                                >
                                    {f.label}
                                    <span className="ml-1.5 tabular-nums font-extrabold opacity-70">{f.n}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Only appears once something is selected, so it never sits
                    there as chrome. */}
                {selected.size > 0 && (
                    <div className="px-5 py-2.5 bg-sky-50 border-b border-sky-100 flex items-center gap-3 flex-wrap">
                        <p className="text-[12px] font-bold text-[#0055B3]">
                            {selected.size} selected
                        </p>
                        <button
                            onClick={handleBulkNA}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-[#0066CC] hover:bg-[#0055B3] cursor-pointer transition-colors"
                        >
                            Mark not applicable
                        </button>
                        <button
                            onClick={() => setSelected(new Set())}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-900 hover:bg-white cursor-pointer transition-colors"
                        >
                            Clear
                        </button>
                        <span className="text-[10.5px] text-slate-500 font-medium ml-auto">
                            Sending is logged one at a time — the date and channel have to be real.
                        </span>
                    </div>
                )}

                {selectablePending.length > 0 && (
                    <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-2">
                        <button
                            onClick={() => setSelected(allPendingSelected ? new Set() : new Set(selectablePending.map(i => i.template.key)))}
                            className="text-[11px] font-bold text-slate-500 hover:text-[#0055B3] cursor-pointer transition-colors"
                        >
                            {allPendingSelected ? 'Deselect all' : `Select all ${selectablePending.length} pending`}
                        </button>
                    </div>
                )}

                {visible.length === 0 ? (
                    <p className="px-5 py-12 text-center text-sm text-slate-500">
                        {q || statusFilter !== 'all'
                            ? 'Nothing matches that filter.'
                            : 'Nothing is scheduled for this phase yet.'}
                    </p>
                ) : Object.entries(grouped).map(([category, items]) => {
                    const catSent = items.filter(i => i.log.status === 'sent').length;
                    return (
                        <div key={category} className="border-b border-slate-100 last:border-b-0">
                            <div className="px-5 py-2 bg-slate-50/70 flex items-center justify-between gap-3">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{category}</p>
                                <p className="text-[10px] font-bold text-slate-400 tabular-nums">{catSent}/{items.length} sent</p>
                            </div>

                            <ul>
                                {items.map(item => {
                                    const st = item.log.status;
                                    const attention = item.log.needsAttention && st === 'pending';
                                    const isSel = selected.has(item.template.key);
                                    const copied = copiedKey === item.template.key;
                                    return (
                                        <li
                                            key={item.template.key}
                                            className={`group px-5 py-2.5 border-t border-slate-50 first:border-t-0 flex items-center gap-3
                                                        transition-colors ${
                                                isSel ? 'bg-sky-50/60' : attention ? 'bg-amber-50/40' : 'hover:bg-sky-50/30'
                                            }`}
                                        >
                                            {st === 'pending' ? (
                                                <input
                                                    type="checkbox"
                                                    checked={isSel}
                                                    onChange={() => toggleSelected(item.template.key)}
                                                    aria-label={`Select ${item.template.title}`}
                                                    className="w-4 h-4 shrink-0 rounded border-slate-300 accent-[#0066CC] cursor-pointer"
                                                />
                                            ) : (
                                                <span className={`w-4 h-4 rounded shrink-0 grid place-items-center border ${
                                                    st === 'sent' ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-100 border-slate-300'
                                                }`}>
                                                    {st === 'sent'
                                                        ? <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                                                        : <span className="w-2 h-px bg-slate-400" />}
                                                </span>
                                            )}

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className={`text-[13px] font-bold leading-snug ${
                                                        st === 'not_applicable' ? 'text-slate-400 line-through' : 'text-slate-900'
                                                    }`}>{item.template.title}</p>
                                                    {!item.template.isRequired && (
                                                        <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                                            Optional
                                                        </span>
                                                    )}
                                                    {attention && (
                                                        <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                                            Confirm it went out
                                                        </span>
                                                    )}
                                                    {item.template.trigger && (
                                                        <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                                                            <Clock className="w-3 h-3 shrink-0" />
                                                            {item.template.trigger}
                                                        </span>
                                                    )}
                                                </div>

                                                {st === 'sent' && (
                                                    <p className="text-[10px] font-semibold text-emerald-700 mt-0.5 flex flex-wrap items-center gap-x-3">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-3 h-3" />
                                                            {item.log.sentAt
                                                                ? format(item.log.sentAt.toDate ? item.log.sentAt.toDate() : new Date(item.log.sentAt), 'dd MMM yyyy')
                                                                : 'Date not recorded'}
                                                        </span>
                                                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{item.log.sentByName || 'Unknown'}</span>
                                                        {item.log.sentVia && <span className="uppercase tracking-wider">{item.log.sentVia}</span>}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                {/* Copy first: most of the time the job is to grab
                                                    the text and send it from a real mail client. */}
                                                {st !== 'not_applicable' && (
                                                    <button
                                                        onClick={() => copyEmail(item)}
                                                        title="Copy the email text"
                                                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 ${
                                                            copied ? 'text-emerald-700 bg-emerald-50'
                                                                   : 'text-slate-500 hover:text-[#0055B3] hover:bg-sky-50'
                                                        }`}
                                                    >
                                                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                        {copied ? 'Copied' : 'Copy'}
                                                    </button>
                                                )}

                                                {st === 'pending' && (
                                                    <>
                                                        <button
                                                            onClick={() => openModal(item)}
                                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border transition-colors ${
                                                                attention
                                                                    ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                                                                    : 'bg-sky-50 border-sky-200 text-[#0055B3] hover:bg-[#0066CC] hover:border-[#0066CC] hover:text-white'
                                                            }`}
                                                        >
                                                            Mark sent
                                                        </button>
                                                        <button
                                                            onClick={() => handleMarkNA(item)}
                                                            className="px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors
                                                                       opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                        >
                                                            N/A
                                                        </button>
                                                    </>
                                                )}
                                                {st === 'sent' && (
                                                    <button
                                                        onClick={() => openModal(item)}
                                                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 border border-slate-200 hover:border-sky-300 hover:text-[#0055B3] cursor-pointer transition-colors"
                                                    >
                                                        Edit log
                                                    </button>
                                                )}
                                                {st === 'not_applicable' && (
                                                    <button
                                                        onClick={() => handleRevertNA(item)}
                                                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 border border-slate-200 hover:border-sky-300 hover:text-[#0055B3] cursor-pointer transition-colors"
                                                    >
                                                        Undo N/A
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </div>

            {selectedItem && (
                <div className="fixed inset-0 bg-[#0066CC]/90 backdrop-blur-md border border-white/20/60 backdrop-blur-md backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
                            <h3 className="font-semibold text-gray-900">
                                {modalStep === 1 ? 'Preview Template' : 'Log Communication'} - {selectedItem.template.title}
                            </h3>
                            <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-gray-600 p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1">
                            {modalStep === 1 ? (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-max">
                                            {(['email', 'whatsapp'] as const).map(mode => (
                                                <button
                                                    key={mode}
                                                    onClick={() => setPreviewMode(mode)}
                                                    className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${previewMode === mode ? 'bg-white text-[#0066CC] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    {mode}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {previewMode === 'email' ? (
                                        <div className="space-y-4">
                                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 relative group">
                                                <h4 className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Subject</h4>
                                                <div 
                                                    className="text-gray-900 font-medium"
                                                    dangerouslySetInnerHTML={{ __html: resolveTemplate(selectedItem.template.email?.subject || '', getVariables()) }}
                                                />
                                                <button 
                                                    onClick={() => handleCopy(resolveTemplate(selectedItem.template.email?.subject || '', getVariables()), 'email_subject')}
                                                    className="absolute top-3 right-3 text-gray-400 hover:text-[#0066CC] p-1.5 rounded-md hover:bg-white border border-transparent hover:border-gray-200 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 text-xs font-medium"
                                                >
                                                    {copySuccess === 'email_subject' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />} {copySuccess === 'email_subject' ? 'Copied!' : 'Copy'}
                                                </button>
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 relative group">
                                                <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Body</h4>
                                                <div 
                                                    className="text-gray-800 whitespace-pre-wrap text-sm"
                                                    dangerouslySetInnerHTML={{ __html: resolveTemplate(selectedItem.template.email?.body || '', getVariables()) }}
                                                />
                                                <button 
                                                    onClick={() => handleCopy(resolveTemplate(selectedItem.template.email?.body || '', getVariables()), 'email_body')}
                                                    className="absolute top-3 right-3 text-gray-400 hover:text-[#0066CC] p-1.5 rounded-md hover:bg-white border border-transparent hover:border-gray-200 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 text-xs font-medium"
                                                >
                                                    {copySuccess === 'email_body' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />} {copySuccess === 'email_body' ? 'Copied!' : 'Copy'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-green-50 rounded-lg p-4 border border-green-100 relative group">
                                            <h4 className="text-xs font-medium text-green-700 mb-2 uppercase tracking-wider">WhatsApp Message</h4>
                                            <div 
                                                className="text-green-900 whitespace-pre-wrap text-sm"
                                                dangerouslySetInnerHTML={{ __html: resolveTemplate(selectedItem.template.whatsapp?.body || '', getVariables()) }}
                                            />
                                            <button 
                                                onClick={() => handleCopy(resolveTemplate(selectedItem.template.whatsapp?.body || '', getVariables()), 'whatsapp')}
                                                className="absolute top-3 right-3 text-green-600 hover:text-green-800 p-1.5 rounded-md hover:bg-green-100 border border-transparent hover:border-green-200 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 text-xs font-medium"
                                            >
                                                {copySuccess === 'whatsapp' ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copySuccess === 'whatsapp' ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <form id="mark-sent-form" className="space-y-5" onSubmit={(e) => {
                                    e.preventDefault();
                                    const fd = new FormData(e.currentTarget);
                                    handleMarkSent({
                                        status: 'sent',
                                        sentVia: fd.get('sentVia') as any,
                                        sentBy: currentUserId,
                                        sentByName: currentUserName, 
                                        sentAt: new Date(fd.get('sentAt') as string),
                                        invoiceRef: fd.get('invoiceRef') as string || null,
                                        notes: fd.get('notes') as string || ''
                                    });
                                }}>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Sent via <span className="text-rose-500">*</span></label>
                                        <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-max">
                                            {['email', 'whatsapp', 'both'].map(method => (
                                                <label key={method} className="cursor-pointer">
                                                    <input type="radio" name="sentVia" value={method} className="peer sr-only" required defaultChecked={selectedItem.log.sentVia === method} />
                                                    <div className="px-4 py-1.5 text-sm font-medium text-gray-500 rounded-md peer-checked:bg-white peer-checked:text-[#0066CC] peer-checked:shadow-sm capitalize">
                                                        {method}
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Date Sent <span className="text-rose-500">*</span></label>
                                            <input 
                                                type="date" 
                                                name="sentAt"
                                                required 
                                                defaultValue={selectedItem.log.sentAt ? format(selectedItem.log.sentAt.toDate ? selectedItem.log.sentAt.toDate() : new Date(selectedItem.log.sentAt), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')}
                                                className="w-full px-3 py-2 bg-gray-50 rounded-lg border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#0066CC] text-sm" 
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Sent by <span className="text-rose-500">*</span></label>
                                            <input 
                                                type="text" 
                                                value={selectedItem.log.sentByName || currentUserName}
                                                disabled
                                                className="w-full px-3 py-2 bg-gray-100 text-gray-500 cursor-not-allowed rounded-lg border-gray-200 text-sm" 
                                            />
                                        </div>
                                    </div>

                                    {selectedItem.template.linkedFeature === 'payment_calc' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Reference (Optional)</label>
                                            <input 
                                                type="text" 
                                                name="invoiceRef"
                                                defaultValue={selectedItem.log.invoiceRef || ''}
                                                placeholder="e.g. INV-2023-014"
                                                className="w-full px-3 py-2 bg-white rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066CC] text-sm" 
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes (Optional)</label>
                                        <textarea 
                                            name="notes"
                                            defaultValue={selectedItem.log.notes}
                                            rows={3}
                                            placeholder="Add any specific context or links..."
                                            className="w-full px-3 py-2 bg-white rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#0066CC] text-sm resize-none" 
                                        />
                                    </div>
                                </form>
                            )}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between gap-3 flex-shrink-0">
                            {modalStep === 2 && selectedItem.log.status !== 'sent' ? (
                                <button onClick={() => setModalStep(1)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 bg-white rounded-lg hover:bg-gray-50">
                                    Back to Preview
                                </button>
                            ) : <div></div>}
                            
                            <div className="flex gap-2">
                                <button onClick={() => setSelectedItem(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                                    Cancel
                                </button>
                                {modalStep === 1 ? (
                                    <button onClick={() => setModalStep(2)} className="px-5 py-2 text-sm font-medium text-white bg-[#0066CC] rounded-lg hover:bg-[#0055B3] shadow-sm flex items-center gap-2">
                                        Continue to Log <Send className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    <button type="submit" form="mark-sent-form" className="px-5 py-2 text-sm font-medium text-white bg-[#0066CC] rounded-lg hover:bg-[#0055B3] shadow-sm flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        {selectedItem.log.status === 'sent' ? 'Update Log' : 'Log as Sent'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
