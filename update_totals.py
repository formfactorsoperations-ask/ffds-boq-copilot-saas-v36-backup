import re

with open('./components/StudioDashboard.tsx', 'r') as f:
    content = f.read()

old_totals_block = """                  <div className="flex justify-end pt-4">
                      <div className="w-full sm:w-[360px] bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-sm">
                          <div className="flex justify-between items-center mb-2">
                              <span className="text-slate-600 font-medium">Firm scope</span>
                              <span className="font-mono text-slate-800 font-bold">₹ {firmTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="flex justify-between items-center mb-3">
                              <div className="flex items-center gap-2">
                                  <span className="text-slate-600 font-medium">Estimated items</span>
                                  <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded cursor-help" title="As actuals, provisional sum, or pending finalisation">EST</span>
                              </div>
                              <span className="font-mono text-amber-600 font-bold">₹ {estimateExposure.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="flex justify-between items-center border-t border-slate-100 pt-3 mb-3">
                              <span className="text-slate-800 font-bold text-base">Grand total</span>
                              <span className="font-mono text-slate-900 font-black text-lg">₹ {grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs text-slate-400">
                              <span>Client-procured: {clientProcuredCount} items (₹0 in FFDS billing) &middot; Excluded: {excludedCount}</span>
                          </div>
                      </div>
                  </div>"""

new_totals_block = """                  <div className="pt-4">
                      <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 text-sm flex flex-col sm:flex-row justify-between items-center gap-8">
                          <div className="flex flex-col gap-3 flex-1 border-b sm:border-b-0 sm:border-r border-slate-100 pb-6 sm:pb-0 sm:pr-8 w-full sm:w-auto">
                              <div className="flex justify-between items-center">
                                  <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Firm scope</span>
                                  <span className="font-mono text-slate-700 font-bold text-base">₹ {firmTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-2">
                                      <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">Estimated items</span>
                                      <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded cursor-help" title="As actuals, provisional sum, or pending finalisation">EST</span>
                                  </div>
                                  <span className="font-mono text-amber-600 font-bold text-base">₹ {estimateExposure.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                              </div>
                              <div className="text-[11px] font-medium text-slate-400 mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                  Client-procured: <span className="font-bold text-slate-600">{clientProcuredCount}</span> items (₹0 in FFDS billing) &middot; Excluded: <span className="font-bold text-slate-600">{excludedCount}</span>
                              </div>
                          </div>
                          
                          <div className="flex-1 sm:pl-4 w-full sm:w-auto flex flex-col justify-center">
                              <div className="flex justify-between items-end">
                                  <div className="flex flex-col">
                                      <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-1">Total Project Value</span>
                                      <span className="text-slate-900 font-black text-2xl">Grand total</span>
                                  </div>
                                  <span className="font-mono text-[#0066CC] font-black text-4xl">₹ {grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                              </div>
                          </div>
                      </div>
                  </div>"""

if old_totals_block in content:
    content = content.replace(old_totals_block, new_totals_block)
    print("Replaced successfully")
else:
    print("Could not find old_totals_block")
    
with open('./components/StudioDashboard.tsx', 'w') as f:
    f.write(content)
