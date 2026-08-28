import re

with open('./components/StudioDashboard.tsx', 'r') as f:
    content = f.read()

old_logic_block = """              let firmTotal = 0;
              let estimateExposure = 0;
              let clientProcuredCount = 0;
              let excludedCount = 0;
              
              fullBoq.forEach(item => {
                  const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin);
                  const val = sellPrice * item.qty;
                  
                  if (item.boqStatus === 'client_procured') {
                      clientProcuredCount++;
                  } else if (item.boqStatus === 'excluded') {
                      excludedCount++;
                  } else if (item.boqStatus === 'as_actuals' || item.boqStatus === 'provisional_sum' || item.boqStatus === 'pending_finalisation') {
                      estimateExposure += val;
                  } else if (item.boqStatus !== 'deleted' && item.boqStatus !== 'substituted') {
                      firmTotal += val;
                  }
              });
              
              const grandTotal = firmTotal + estimateExposure;"""

new_logic_block = """              let firmTotal = 0;
              let estimateExposure = 0;
              let clientProcuredCount = 0;
              let excludedCount = 0;
              let firmBaseCost = 0;
              let firmMarginValue = 0;
              
              fullBoq.forEach(item => {
                  const basePrice = (item.materials + item.labor) * item.qty;
                  const sellPrice = calculateSellPrice(item.materials, item.labor, item.margin) * item.qty;
                  const marginVal = sellPrice - basePrice;
                  
                  if (item.boqStatus === 'client_procured') {
                      clientProcuredCount++;
                  } else if (item.boqStatus === 'excluded') {
                      excludedCount++;
                  } else if (item.boqStatus === 'as_actuals' || item.boqStatus === 'provisional_sum' || item.boqStatus === 'pending_finalisation') {
                      estimateExposure += sellPrice;
                  } else if (item.boqStatus !== 'deleted' && item.boqStatus !== 'substituted') {
                      firmTotal += sellPrice;
                      firmBaseCost += basePrice;
                      firmMarginValue += marginVal;
                  }
              });
              
              const grandTotal = firmTotal + estimateExposure;
              const firmMarginPercent = firmTotal > 0 ? ((firmTotal - firmBaseCost) / firmBaseCost) * 100 : 0;"""

content = content.replace(old_logic_block, new_logic_block)

old_ui_block = """                  <div className="pt-4">
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

new_ui_block = """                  <div className="pt-4">
                      <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-5 text-sm flex flex-col lg:flex-row justify-between gap-6">
                          {/* Financials (Owners Only) */}
                          {isOwner ? (
                              <div className="flex flex-1 gap-6">
                                  {/* Base Costs */}
                                  <div className="flex flex-col flex-1 border-r border-slate-100 pr-6 justify-center">
                                      <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1.5">Project Base Cost</span>
                                      <span className="font-mono text-slate-700 font-black text-lg">₹ {firmBaseCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                      <div className="text-[10px] font-medium text-slate-500 mt-1">Materials + Labor</div>
                                  </div>
                                  {/* Margin */}
                                  <div className="flex flex-col flex-1 border-r border-slate-100 pr-6 justify-center">
                                      <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1.5">Firm Margin</span>
                                      <span className="font-mono text-emerald-600 font-black text-lg">₹ {firmMarginValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                      <div className="mt-1"><span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{firmMarginPercent.toFixed(1)}% Avg</span></div>
                                  </div>
                                  {/* Value */}
                                  <div className="flex flex-col flex-1 border-r border-slate-100 pr-6 justify-center">
                                      <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mb-1.5">Firm Scope Value</span>
                                      <span className="font-mono text-slate-900 font-black text-lg">₹ {firmTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                      <div className="text-[10px] font-medium text-slate-500 mt-1">Total Billable</div>
                                  </div>
                              </div>
                          ) : (
                              <div className="flex flex-1 items-center justify-center border-r border-slate-100 pr-6">
                                  <span className="text-slate-400 text-xs font-medium italic">Financial details restricted to Owner role.</span>
                              </div>
                          )}
                          
                          {/* Item Counts (Everyone) */}
                          <div className="flex flex-col flex-1 border-r border-slate-100 pr-6 justify-center gap-1.5">
                               <div className="flex justify-between items-center">
                                   <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Client-Procured</span>
                                   <span className="font-bold text-slate-700 text-xs">{clientProcuredCount} items</span>
                               </div>
                               <div className="flex justify-between items-center">
                                   <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Excluded</span>
                                   <span className="font-bold text-slate-700 text-xs">{excludedCount} items</span>
                               </div>
                               <div className="flex justify-between items-center">
                                   <div className="flex items-center gap-1.5">
                                       <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Estimated Value</span>
                                       <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1 rounded">EST</span>
                                   </div>
                                   <span className="font-bold text-slate-700 text-xs">{estimateExposure > 0 ? (isOwner ? `₹ ${estimateExposure.toLocaleString('en-IN')}` : 'Included') : 'None'}</span>
                               </div>
                          </div>

                          {/* Grand Total */}
                          <div className="flex flex-col min-w-[180px] justify-center items-end">
                              <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-1">Total Project Value</span>
                              {isOwner ? (
                                  <span className="font-mono text-[#0066CC] font-black text-2xl">₹ {grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                              ) : (
                                  <span className="font-mono text-slate-300 font-black text-2xl">₹ --</span>
                              )}
                          </div>
                      </div>
                  </div>"""

content = content.replace(old_ui_block, new_ui_block)

with open('./components/StudioDashboard.tsx', 'w') as f:
    f.write(content)
