import React, { useState } from 'react';
import { useCashFlowForecast } from '../hooks/useCashFlowForecast';
import { useOrg } from '../contexts/OrgContext';
import { formatCurrency, formatINR } from '../lib/utils';
import { IndianRupee, AlertTriangle, Calendar, Clock, RefreshCw, Bell, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { buildWhatsAppURL } from '../lib/whatsappUtils';
import { useStudioSettings } from '../hooks/useStudioSettings';

export function CashFlowForecastDashboard() {
  const { orgData } = useOrg();
  const studioId = orgData?.tenantId || 'demo-tenant-01';
  const { 
      overdueTotal, 
      overdueItems, 
      unscheduledTotal, 
      unscheduledItems,
      monthlyForecast,
      loading,
      refresh
  } = useCashFlowForecast(studioId);
  const { settings } = useStudioSettings(studioId);

  if (loading) {
      return (
          <div className="py-24 text-center text-slate-500 flex flex-col items-center gap-4">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <p>Analyzing studio execution gates...</p>
          </div>
      );
  }

  // Flatten next 30 days essentially
  const now = new Date();
  const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const upcomingItems = monthlyForecast.flatMap(mf => mf.items).filter(item => {
      if (!item.expectedDate) return false;
      const expected = new Date(item.expectedDate);
      // It is not overdue, and within next 30 days
      return item.status !== 'overdue' && expected <= next30Days;
  });

  const next30DaysTotal = upcomingItems.reduce((sum, item) => sum + item.amount, 0);

  const handleSendReminder = (item: any) => {
      const template = settings?.emailTemplates?.paymentRequest || '';
      const variables = {
          clientName: item.clientName || 'Client',
          projectName: item.projectName,
          studioName: settings?.companyName || 'Our Studio',
          amount: formatINR(item.amount || 0),
          milestone: item.milestoneLabel,
          daysPending: item.daysOverdue || 0,
          supportContact: settings?.clientPortalConfig?.supportContact || ''
      };

      const defaultTemplate = "Hi {clientName}, this is a gentle reminder that payment for {milestone} ({amount}) is due for your {projectName} project. Please let us know once processed. Thank you! — {studioName}";
      
      let rendered = template || defaultTemplate;
      const expectedKeys = Object.keys(variables);
      expectedKeys.forEach(key => {
          const value = variables[key as keyof typeof variables];
          const regex = new RegExp(`{${key}}`, 'g');
          if (value === undefined || value === null || value === '') {
             rendered = rendered.replace(regex, `[${key}]`); 
          } else {
             rendered = rendered.replace(regex, String(value));
          }
      });

      const url = buildWhatsAppURL(item.clientPhone || '', rendered);
      window.open(url, '_blank');
  };

  const isEmpty = overdueItems.length === 0 && upcomingItems.length === 0 && unscheduledItems.length === 0;

  return (
    <div className="text-left w-full max-w-5xl mx-auto space-y-8">
       <div className="flex justify-between items-end mb-6">
           <div>
               <h2 className="text-3xl font-light tracking-tighter text-slate-800 uppercase">Payment Execution Gates</h2>
               <p className="text-slate-500 text-sm mt-1">Pending payments that are blocking or will block procurement and execution.</p>
           </div>
           <button onClick={refresh} className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-4 py-2 rounded-none transition-colors">
               <RefreshCw className="w-3.5 h-3.5" /> REFRESH
           </button>
       </div>

       {isEmpty ? (
           <div className="bg-slate-50 border border-slate-200 p-12 text-center text-slate-500">
               <CheckCircle2 className="w-8 h-8 mx-auto mb-4 text-emerald-500" />
               <p className="font-bold text-slate-800 text-lg">No Pending Execution Gates</p>
               <p className="text-sm">There are currently no active or overdue payment requests blocking execution across any projects.</p>
           </div>
       ) : (
           <div className="space-y-8">
               {/* 1. Critical Blockers */}
               {overdueItems.length > 0 && (
                   <div className="mb-10">
                       <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 pb-2 border-b-2 border-rose-100">
                           <div className="flex items-center gap-3">
                               <div className="bg-rose-100 p-2 text-rose-600">
                                   <ShieldAlert className="w-5 h-5" />
                               </div>
                               <div>
                                   <h3 className="text-sm font-bold tracking-widest text-rose-900 uppercase">Critical Blockers</h3>
                                   <p className="text-[10px] text-rose-600/80 font-bold uppercase tracking-wider mt-0.5">Payment overdue • Execution halted</p>
                               </div>
                           </div>
                           <h3 className="text-xl font-light tracking-tighter text-rose-600 mt-2 sm:mt-0">{formatCurrency(overdueTotal)}</h3>
                       </div>
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {overdueItems.map(item => (
                               <div key={item.id} className="bg-white border-l-4 border-rose-500 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col justify-between">
                                   <div className="flex justify-between items-start mb-4">
                                       <div>
                                           <div className="flex items-center gap-2 mb-1">
                                               <span className="bg-rose-100 text-rose-700 text-[9px] font-bold px-2 py-0.5 uppercase tracking-widest">
                                                   {item.daysOverdue} Days Overdue
                                               </span>
                                               {item.lastReminderAt && (
                                                   <span className="text-[9px] text-slate-400 font-medium">
                                                       Last nudge: {new Date((item.lastReminderAt.toDate ? item.lastReminderAt.toDate() : item.lastReminderAt)).toLocaleDateString()}
                                                   </span>
                                               )}
                                           </div>
                                           <h4 className="font-bold text-slate-900 text-base">{item.projectName}</h4>
                                           <p className="text-sm text-slate-600 font-medium">{item.milestoneLabel}</p>
                                       </div>
                                       <div className="text-right">
                                           <p className="font-bold text-lg text-slate-900 tracking-tight">{formatCurrency(item.amount)}</p>
                                       </div>
                                   </div>
                                   <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                                       <button 
                                          onClick={() => handleSendReminder(item)}
                                          className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase bg-rose-600 text-white px-4 py-2 hover:bg-rose-700 transition-colors shadow-sm"
                                       >
                                           <Bell className="w-3.5 h-3.5" /> Escalation Nudge
                                       </button>
                                   </div>
                               </div>
                           ))}
                       </div>
                   </div>
               )}

               {/* 2. Upcoming Gates */}
               {upcomingItems.length > 0 && (
                   <div className="mb-10">
                       <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 pb-2 border-b border-indigo-100">
                           <div className="flex items-center gap-3">
                               <div className="bg-indigo-50 p-2 text-indigo-600">
                                   <Calendar className="w-5 h-5" />
                               </div>
                               <div>
                                   <h3 className="text-sm font-bold tracking-widest text-indigo-900 uppercase">Upcoming Execution Gates</h3>
                                   <p className="text-[10px] text-indigo-600/70 font-bold uppercase tracking-wider mt-0.5">Next 30 days projection</p>
                               </div>
                           </div>
                           <h3 className="text-xl font-light tracking-tighter text-indigo-600 mt-2 sm:mt-0">{formatCurrency(next30DaysTotal)}</h3>
                       </div>
                       
                       <div className="bg-white border border-slate-200">
                           {upcomingItems.map((item, idx) => (
                               <div key={item.id} className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 hover:bg-indigo-50/30 transition-colors ${idx !== upcomingItems.length - 1 ? 'border-b border-slate-100' : ''}`}>
                                   <div className="flex items-center gap-4 w-full sm:w-auto mb-3 sm:mb-0">
                                       <div className="w-14 h-14 bg-indigo-50/50 border border-indigo-100 flex flex-col items-center justify-center shrink-0">
                                           <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                                               {item.expectedDate ? new Date(item.expectedDate).toLocaleString('default', { month: 'short' }) : '-'}
                                           </span>
                                           <span className="text-lg font-bold text-indigo-700 leading-none mt-1">
                                               {item.expectedDate ? new Date(item.expectedDate).getDate() : '-'}
                                           </span>
                                       </div>
                                       <div>
                                           <h4 className="font-bold text-slate-800 text-sm mb-0.5">{item.projectName}</h4>
                                           <div className="flex items-center gap-2 text-xs">
                                               <span className="text-slate-600 font-medium">{item.milestoneLabel}</span>
                                               <span className="text-slate-300">•</span>
                                               <span className="font-mono text-slate-500 font-semibold">{formatCurrency(item.amount)}</span>
                                           </div>
                                       </div>
                                   </div>
                                   <div className="shrink-0 w-full sm:w-auto text-right">
                                        <button 
                                            onClick={() => handleSendReminder(item)}
                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-[10px] font-bold tracking-widest uppercase border border-indigo-200 text-indigo-700 bg-white px-4 py-2 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                                        >
                                            Prepare Invoice
                                        </button>
                                   </div>
                               </div>
                           ))}
                       </div>
                   </div>
               )}

               {/* 3. Unscheduled Items */}
               {unscheduledItems.length > 0 && (
                   <div>
                       <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                           <div className="flex items-center gap-2">
                               <Clock className="w-4 h-4 text-slate-500" />
                               <h3 className="text-xs font-bold tracking-widest text-slate-600 uppercase">Dormant Execution Gates</h3>
                           </div>
                           <h3 className="text-xs font-bold tracking-widest text-slate-500 uppercase">{formatCurrency(unscheduledTotal)}</h3>
                       </div>
                       <div className="space-y-3 mt-4">
                           {Object.entries(
                               unscheduledItems.reduce((acc, item) => {
                                   if (!acc[item.projectName]) acc[item.projectName] = [];
                                   acc[item.projectName].push(item);
                                   return acc;
                               }, {} as Record<string, typeof unscheduledItems>)
                           ).map(([project, items]) => (
                               <div key={project} className="bg-white border border-slate-200 p-4 transition-all hover:border-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                   <div className="flex items-start sm:items-center gap-4 w-full">
                                       <div className="w-10 h-10 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 font-bold text-sm shrink-0">
                                           {project.substring(0, 2).toUpperCase()}
                                       </div>
                                       <div className="flex-grow">
                                           <h4 className="font-bold text-slate-800 text-sm">{project}</h4>
                                           <div className="flex flex-wrap gap-2 mt-2">
                                               {(items as any[]).map(i => (
                                                   <span key={i.id} className="text-[10px] uppercase font-semibold bg-slate-50 border border-slate-200 px-2 py-1 text-slate-600 whitespace-nowrap">
                                                       {i.milestoneLabel}
                                                   </span>
                                               ))}
                                           </div>
                                       </div>
                                   </div>
                                   <div className="text-right shrink-0 mt-2 sm:mt-0 w-full sm:w-auto border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0">
                                       <p className="text-[9px] text-slate-400 font-bold uppercase mb-1 tracking-widest">Locked Value</p>
                                       <p className="font-bold text-slate-800 tracking-tight">{formatCurrency((items as any[]).reduce((s, i) => s + i.amount, 0))}</p>
                                   </div>
                               </div>
                           ))}
                       </div>
                   </div>
               )}
           </div>
       )}
    </div>
  );
}

export function CashFlowSummaryWidget({ onNavigate }: { onNavigate?: () => void }) {
    const { orgData } = useOrg();
    const studioId = orgData?.tenantId || 'demo-tenant-01';
    const { 
        currentMonthTotal, 
        overdueTotal, 
        loading 
    } = useCashFlowForecast(studioId);

    if (loading) {
        return (
            <div className="bg-white/60 backdrop-blur-xl p-5 rounded-none border border-slate-200 flex items-center justify-center h-[90px] animate-pulse">
                <div className="h-4 bg-slate-200 w-1/2"></div>
            </div>
        );
    }

    if (currentMonthTotal === 0 && overdueTotal === 0) {
        return (
            <div className="bg-slate-50 p-4 border border-slate-200 flex flex-col justify-center gap-1 cursor-pointer hover:bg-slate-100 transition-colors" onClick={onNavigate}>
                <div className="flex items-center gap-2 mb-1">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">Execution Gates</p>
                </div>
                <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500"/> No active blockers</p>
            </div>
        );
    }

    return (
        <div 
          onClick={onNavigate}
          className="bg-white p-4 sm:p-5 border border-slate-200 flex flex-col justify-between group hover:border-slate-800 transition-all cursor-pointer"
        >
            <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-800 transition-colors">Execution Gates</p>
            </div>
            
            <div className="flex items-end gap-6 pb-1">
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">This Month</p>
                    <p className="text-xl font-light tracking-tighter text-slate-800 leading-none">
                        {currentMonthTotal > 0 ? formatCurrency(currentMonthTotal) : '—'}
                    </p>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Overdue</p>
                    <p className={`text-xl font-light tracking-tighter leading-none ${overdueTotal > 0 ? 'text-rose-600 font-semibold' : 'text-slate-300'}`}>
                        {overdueTotal > 0 ? formatCurrency(overdueTotal) : '—'}
                    </p>
                </div>
            </div>
        </div>
    );
}