import React, { useState } from 'react';
import { useCommunicationLog } from '../../hooks/useCommunicationLog';
import { updateCommunicationLog } from '../../services/communicationTrackerService';
import { CommunicationLogItem, CommunicationTemplateItem, TeamMember, ProjectContext } from '../../types';
import { resolveTemplate, stripHtml } from '../../lib/templateEngine';
import { CheckCircle, Clock, AlertTriangle, Send, MoreVertical, X, Calendar, User, FileText, Check, AlertCircle, Copy } from 'lucide-react';
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
    const { designItems, executionItems, healthScore, sentCount, pendingCount, naCount, loading, mergedItems } = useCommunicationLog(projectId, studioId);
    const [activeTab, setActiveTab] = useState<'design' | 'execution'>('design');
    const [selectedItem, setSelectedItem] = useState<{template: CommunicationTemplateItem, log: CommunicationLogItem} | null>(null);
    const [modalStep, setModalStep] = useState<1 | 2>(1);
    const [previewMode, setPreviewMode] = useState<'email' | 'whatsapp'>('email');
    const [copySuccess, setCopySuccess] = useState('');

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

    if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading tracker...</div>;

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

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-12">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h2 className="text-2xl font-semibold text-gray-900 tracking-tight flex items-center gap-3">
                        <Send className="w-6 h-6 text-indigo-500" />
                        Communication Tracker
                    </h2>
                    <p className="text-gray-500 mt-1">Audit log of all client emails and notifications</p>
                </div>
                <div className={`px-4 py-2 rounded-xl flex items-center gap-3 ${getHealthColor(healthScore)}`}>
                    <div className="text-3xl font-bold">{healthScore}%</div>
                    <div className="text-sm font-medium leading-tight">
                        Health<br/>Score
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex border-b border-gray-100">
                    <button 
                        onClick={() => setActiveTab('design')}
                        className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'design' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Design Phase ({(designItems || []).filter(i => i.log.status === 'sent').length}/{(designItems || []).filter(i => i.template.isRequired).length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('execution')}
                         className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'execution' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        Execution Phase ({(executionItems || []).filter(i => i.log.status === 'sent').length}/{(executionItems || []).filter(i => i.template.isRequired).length})
                    </button>
                </div>

                <div className="p-6 space-y-8">
                    {Object.entries(groupedItems).map(([category, items]) => (
                        <div key={category} className="space-y-4">
                            <h3 className="text-xs font-bold tracking-wider text-gray-400 uppercase">{category}</h3>
                            <div className="space-y-3">
                                {items.map((item) => (
                                    <div key={item.template.key} className={`flex items-stretch bg-white border rounded-xl overflow-hidden transition-all ${item.log.status === 'sent' ? 'border-gray-100 shadow-sm opacity-70' : item.log.needsAttention ? 'border-amber-200 shadow-md ring-1 ring-amber-100' : 'border-gray-200 hover:border-indigo-300 hover:shadow-md'}`}>
                                        <div className={`w-2 ${item.log.status === 'sent' ? 'bg-emerald-400' : item.log.status === 'not_applicable' ? 'bg-gray-200' : item.log.needsAttention ? 'bg-amber-400' : 'bg-indigo-400'}`} />
                                        
                                        <div className="flex-1 p-5 flex flex-col justify-center">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-start gap-4">
                                                    <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center ${item.log.status === 'sent' ? 'bg-emerald-500 border-emerald-500' : item.log.status === 'not_applicable' ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-300'}`}>
                                                        {item.log.status === 'sent' && <Check className="w-3.5 h-3.5 text-white" />}
                                                        {item.log.status === 'not_applicable' && <div className="w-2.5 h-0.5 bg-gray-400 rounded-full" />}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-3">
                                                            <h4 className={`font-semibold ${item.log.status === 'not_applicable' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.template.title}</h4>
                                                            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${item.template.isRequired ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                                                                {item.template.isRequired ? 'Required' : 'Optional'}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                                                            <Clock className="w-3.5 h-3.5" />
                                                            Trigger: {item.template.trigger}
                                                        </p>
                                                        
                                                        {item.log.status === 'sent' && (
                                                            <div className="mt-3 flex items-center gap-4 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
                                                                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/>{item.log.sentAt ? format(item.log.sentAt.toDate ? item.log.sentAt.toDate() : new Date(item.log.sentAt), 'dd MMM yyyy') : 'Unknown Date'}</span>
                                                                <span className="flex items-center gap-1"><User className="w-3.5 h-3.5"/>{item.log.sentByName || 'Unknown'}</span>
                                                                <span className="flex items-center gap-1 uppercase tracking-widest text-[9px]"><Send className="w-3.5 h-3.5"/>{item.log.sentVia}</span>
                                                                {item.log.invoiceRef && <span className="flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-emerald-200"># {item.log.invoiceRef}</span>}
                                                            </div>
                                                        )}

                                                        {item.log.needsAttention && item.log.status === 'pending' && (
                                                            <div className="mt-3 flex items-start gap-2 text-sm font-medium text-amber-800 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
                                                                <AlertCircle className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
                                                                <div>
                                                                    💡 Action completed in system. Has the email been sent?
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                <div className="flex flex-col items-end gap-2 ml-4">
                                                    {item.log.status === 'pending' && (
                                                        <>
                                                            <button 
                                                                onClick={() => openModal(item)}
                                                                className={`px-4 py-2 font-medium rounded-lg text-sm transition-colors ${item.log.needsAttention ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm' : 'bg-gray-900 hover:bg-gray-800 text-white shadow-sm'}`}
                                                            >
                                                                Mark Sent
                                                            </button>
                                                            <button 
                                                                onClick={() => handleMarkNA(item)}
                                                                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
                                                            >
                                                                Mark N/A ✓
                                                            </button>
                                                        </>
                                                    )}
                                                    {item.log.status === 'sent' && (
                                                        <button 
                                                            onClick={() => openModal(item)}
                                                            className="text-xs text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                                                        >
                                                            Edit Log
                                                        </button>
                                                    )}
                                                    {item.log.status === 'not_applicable' && (
                                                        <button 
                                                            onClick={() => handleRevertNA(item)}
                                                            className="text-xs text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                                                        >
                                                            Undo N/A
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {selectedItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                                                    className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${previewMode === mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
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
                                                    className="absolute top-3 right-3 text-gray-400 hover:text-indigo-600 p-1.5 rounded-md hover:bg-white border border-transparent hover:border-gray-200 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 text-xs font-medium"
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
                                                    className="absolute top-3 right-3 text-gray-400 hover:text-indigo-600 p-1.5 rounded-md hover:bg-white border border-transparent hover:border-gray-200 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 text-xs font-medium"
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
                                                    <div className="px-4 py-1.5 text-sm font-medium text-gray-500 rounded-md peer-checked:bg-white peer-checked:text-indigo-600 peer-checked:shadow-sm capitalize">
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
                                                className="w-full px-3 py-2 bg-gray-50 rounded-lg border-gray-200 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-sm" 
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
                                                className="w-full px-3 py-2 bg-white rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 text-sm" 
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
                                            className="w-full px-3 py-2 bg-white rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 text-sm resize-none" 
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
                                    <button onClick={() => setModalStep(2)} className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm flex items-center gap-2">
                                        Continue to Log <Send className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    <button type="submit" form="mark-sent-form" className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm flex items-center gap-2">
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
