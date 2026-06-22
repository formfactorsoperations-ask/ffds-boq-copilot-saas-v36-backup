const fs = require('fs');

const f = fs.readFileSync('components/RevisionStudio.tsx', 'utf8');

const startIndex = f.indexOf('{/* Updated Payment Stages Preview */}');
const endMarker = '{/* Communication Drafts */}';
const endIndex = f.indexOf(endMarker);

if(startIndex === -1 || endIndex === -1) {
  console.log("Could not find start or end block.");
  process.exit(1);
}

const replacement = `{/* Updated Payment Stages Preview */}
        {(() => {
          const activeTier = tiers.find(t => t.id === activeTierId) || tiers[0];
          const paymentMilestones = projectContext?.paymentMilestones || [];
          if (paymentMilestones.length === 0) return null;
          
          const designMilestones = paymentMilestones.filter(m => m.type === 'design');
          const executionMilestones = paymentMilestones.filter(m => m.type === 'execution');

          return (
            <div className="mt-6 space-y-6 flex flex-col">
              {designMilestones.length > 0 && (
                <Card className="p-6 border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <h4 className="font-semibold text-slate-800 uppercase tracking-wider text-sm mb-4">
                    Design fee schedule
                  </h4>
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
                    {designMilestones.flatMap((m, idx) => {
                      const current = calculateMilestone(m, false, idx);
                      const isCleared = current.isCleared;
                      const statBadge = isCleared ? m.status : 'Open';

                      const rowStyle = { borderBottom: '1px solid #f1f5f9', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' };
                      
                      const rows = [];
                      if (current.deductedInitiationFee > 0) {
                        rows.push(
                          <div key={\`\${idx}-gross\`} style={rowStyle}>
                            <span className="font-medium text-slate-800">{m.name} (Gross)</span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-slate-900">{formatINR(Math.round(current.revisedTotal + current.deductedInitiationFee))}</span>
                              <span className={\`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider \${isCleared ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}\`}>
                                {statBadge}
                              </span>
                            </div>
                          </div>
                        );
                        rows.push(
                          <div key={\`\${idx}-init\`} style={{...rowStyle, backgroundColor: '#fffbeb'}}>
                            <span className="text-amber-800 pl-4">↳ Less: Project Initiation Fee (Paid)</span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-amber-700">-{formatINR(Math.round(current.deductedInitiationFee))}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">Paid</span>
                            </div>
                          </div>
                        );
                        rows.push(
                          <div key={\`\${idx}-bal\`} style={{...rowStyle, backgroundColor: '#eff6ff'}}>
                            <span className="text-blue-800 font-medium pl-4">↳ Balance Payable</span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-blue-800">{formatINR(Math.round(current.revisedTotal))}</span>
                              <span className={\`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider \${isCleared ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}\`}>
                                {statBadge}
                              </span>
                            </div>
                          </div>
                        );
                      } else {
                        rows.push(
                          <div key={\`\${idx}\`} style={rowStyle}>
                            <span className="font-medium text-slate-800">{m.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-slate-900">{formatINR(Math.round(current.revisedTotal))}</span>
                              <span className={\`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider \${isCleared ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}\`}>
                                {statBadge}
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return rows;
                    })}
                  </div>
                </Card>
              )}

              {executionMilestones.length > 0 && (
                <Card className="p-6 border border-slate-200 bg-white shadow-sm overflow-x-auto w-full">
                  <h4 className="font-semibold text-slate-800 uppercase tracking-wider text-sm mb-6">
                    Payment journey
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%', gap: 0, minWidth: '400px' }}>
                    {executionMilestones.map((m, idx) => {
                      const current = calculateMilestone(m, true, idx);
                      const isLast = idx === executionMilestones.length - 1;
                      
                      let circleBg = '#f9f8f6';
                      let circleBorder = '#d3d1c7';
                      let circleColor = '#888';
                      let circleContent = (idx + 1).toString();
                      const statUpper = m.status ? m.status.toUpperCase() : 'OPEN';
                      
                      if (statUpper === 'PAID') {
                        circleBg = '#eaf3de'; circleBorder = '#97c459'; circleColor = '#3b6d11';
                        circleContent = '✓';
                      } else if (statUpper === 'INVOICED') {
                        circleBg = '#faeeda'; circleBorder = '#ef9f27'; circleColor = '#854f0b';
                        circleContent = '●';
                      }
                      
                      return (
                        <React.Fragment key={idx}>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ 
                              width: '28px', height: '28px', minWidth: '28px', minHeight: '28px', borderRadius: '50%', 
                              border: \`2px solid \${circleBorder}\`, backgroundColor: circleBg, color: circleColor,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '12px', fontWeight: 'bold', zIndex: 2
                            }}>
                              {circleContent}
                            </div>
                            <div style={{ maxWidth: '72px', fontSize: '10px', textAlign: 'center', color: '#666', marginTop: '4px', lineHeight: '1.2' }}>
                              {m.name}
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#1a1a2e', marginTop: '2px' }}>
                              {formatINR(Math.round(current.revisedTotal))}
                            </div>
                            <div style={{ fontSize: '9px', textTransform: 'uppercase', color: '#aaa', marginTop: '2px' }}>
                              {statUpper === 'PAID' ? 'PAID' : statUpper === 'INVOICED' ? 'INVOICED' : 'OPEN'}
                            </div>
                          </div>
                          {!isLast && (
                            <div style={{ flex: 1, height: '2px', background: '#e0ddd6', marginTop: '13px', marginLeft: '-2px', marginRight: '-2px', zIndex: 1 }} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          );
        })()}

        `;

fs.writeFileSync('components/RevisionStudio.tsx', f.substring(0, startIndex) + replacement + f.substring(endIndex));
console.log("Patched UI Tables successfully");
