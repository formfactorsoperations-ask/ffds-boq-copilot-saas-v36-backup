import React, { useState } from 'react';
import TemplateEditorTab from './TemplateEditorTab';
import BankTab from './BankTab';
import VendorsManager from './VendorsManager';
import { Item } from '../types';
import { Layers, Boxes, Store, Sparkles } from 'lucide-react';

export default function TemplatesAndBankTab({ 
  bank, setBank, templates, setTemplates, isDraftBankMode, setIsDraftBankMode, draftBank, setDraftBank, aiStrategy, highlightedBankItemId, setHighlightedBankItemId, projects = []
}: any) {
  const [tab, setTab] = useState<'templates' | 'bank' | 'vendors'>('vendors');

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top Header Navigation Tab Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200/80 bg-white shadow-2xs">
        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60">
          <button 
            id="tab-btn-templates"
            type="button"
            onClick={() => setTab('templates')} 
            className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-xl transition-all cursor-pointer ${
              tab === 'templates' 
                ? 'bg-white text-sky-700 shadow-sm border border-slate-200/80' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Std. Templates</span>
          </button>

          <button 
            id="tab-btn-bank"
            type="button"
            onClick={() => setTab('bank')} 
            className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-xl transition-all cursor-pointer ${
              tab === 'bank' 
                ? 'bg-white text-sky-700 shadow-sm border border-slate-200/80' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Item Bank</span>
          </button>

          <button 
            id="tab-btn-vendors"
            type="button"
            onClick={() => setTab('vendors')} 
            className={`flex items-center gap-2 px-4 py-2 font-bold text-xs rounded-xl transition-all cursor-pointer ${
              tab === 'vendors' 
                ? 'bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 text-white shadow-md shadow-sky-500/20 border border-sky-400/30' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Vendors Directory</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-400">
          <span>Studio Master Library</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === 'templates' && (
          <TemplateEditorTab
            bank={bank}
            setBank={setBank}
            templates={templates}
            setTemplates={setTemplates}
            aiStrategy={aiStrategy}
          />
        )}
        {tab === 'vendors' && (
          <VendorsManager projects={projects} />
        )}
        {tab === 'bank' && (
          <div className="space-y-4">
             {/* The draft bank mode buttons copied from App.tsx */}
             <div className="flex justify-end gap-3 items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm w-full">
                <div className="text-sm font-medium text-slate-700">
                  Currently Editing:{" "}
                  <span className={isDraftBankMode ? "text-amber-600 font-bold" : "text-emerald-600 font-bold"}>
                    {isDraftBankMode ? "Draft Sandbox" : "Live Item Bank"}
                  </span>
                </div>
                <button
                  onClick={() => setIsDraftBankMode(!isDraftBankMode)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all border ${isDraftBankMode ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"}`}
                >
                  Switch to {isDraftBankMode ? "Live Bank" : "Draft Sandbox"}
                </button>
                {isDraftBankMode && (
                  <button
                    onClick={() => {
                      if (window.confirm("Are you sure you want to completely overwrite the LIVE item bank with your Draft sandbox? This will affect new projects and prices.")) {
                        setBank(draftBank);
                        setIsDraftBankMode(false);
                        alert("Draft successfully published to Live Bank!");
                      }
                    }}
                    className="px-4 py-2 bg-[#0066CC] text-white rounded-lg text-sm font-bold hover:bg-[#0055B3] shadow-sm transition-colors"
                  >
                    Publish Draft to Live
                  </button>
                )}
                {!isDraftBankMode && (
                  <button
                    onClick={() => {
                      if (window.confirm("This will wipe your current Sandbox Draft and mirror the Live Bank. Continue?")) {
                        setDraftBank(bank);
                        setIsDraftBankMode(true);
                      }
                    }}
                    className="px-4 py-2 bg-[#0066CC]/90 backdrop-blur-md border border-white/20 text-white rounded-lg text-sm font-bold hover:bg-[#0055B3] shadow-sm transition-colors"
                  >
                    Sync Draft from Live
                  </button>
                )}
              </div>
              <BankTab
                bank={isDraftBankMode ? draftBank : bank}
                setBank={isDraftBankMode ? setDraftBank : setBank}
                aiStrategy={aiStrategy}
                highlightedBankItemId={highlightedBankItemId}
                onHighlightClear={() => setHighlightedBankItemId(null)}
                projects={projects}
              />
          </div>
        )}
      </div>
    </div>
  );
}

