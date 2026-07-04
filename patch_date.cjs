const fs = require('fs');
let content = fs.readFileSync('components/PaymentGatesTab.tsx', 'utf8');

const oldMarkPaid = `const markPaid = async (gateId: string) => {
        setSaveStatus('saving');
        const ref = doc(db, \`organizations/\${studioId}/projects/\${projectId}/paymentGates\`, gateId);
        await updateDoc(ref, {
            status: 'paid',
            paid_date: new Date().toISOString()
        });
        showSaveSuccess();
    };`;

const newMarkPaid = `const markPaid = async (gateId: string) => {
        setSaveStatus('saving');
        const ref = doc(db, \`organizations/\${studioId}/projects/\${projectId}/paymentGates\`, gateId);
        await updateDoc(ref, {
            status: 'paid',
            paid_date: new Date().toISOString()
        });
        showSaveSuccess();
    };

    const updatePaidDate = async (gateId: string, newDateStr: string) => {
        if (!newDateStr) return;
        setSaveStatus('saving');
        const ref = doc(db, \`organizations/\${studioId}/projects/\${projectId}/paymentGates\`, gateId);
        await updateDoc(ref, {
            paid_date: new Date(newDateStr).toISOString()
        });
        showSaveSuccess();
    };`;

content = content.replace(oldMarkPaid, newMarkPaid);

const oldStatusBlock = `{(computedStatus === 'invoice_raised' || computedStatus === 'breached') && (
                                        <div className="bg-slate-50 rounded-lg p-2 flex items-center gap-2 mb-4 border border-slate-100">
                                            <Clock size={14} className={computedStatus === 'breached' ? 'text-rose-500' : 'text-amber-500'} />
                                            <div className="text-xs">
                                                <span className="text-slate-500 font-medium">Pending: </span>
                                                <span className={\`font-bold \${computedStatus === 'breached' ? 'text-rose-600' : 'text-amber-700'}\`}>{daysPending} days</span>
                                            </div>
                                        </div>
                                    )}`;

const newStatusBlock = `{(computedStatus === 'invoice_raised' || computedStatus === 'breached') && (
                                        <div className="bg-slate-50 rounded-lg p-2 flex items-center gap-2 mb-4 border border-slate-100">
                                            <Clock size={14} className={computedStatus === 'breached' ? 'text-rose-500' : 'text-amber-500'} />
                                            <div className="text-xs">
                                                <span className="text-slate-500 font-medium">Pending: </span>
                                                <span className={\`font-bold \${computedStatus === 'breached' ? 'text-rose-600' : 'text-amber-700'}\`}>{daysPending} days</span>
                                            </div>
                                        </div>
                                    )}

                                    {computedStatus === 'paid' && (
                                        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100 flex flex-col gap-1.5 mb-4 mt-auto">
                                            <label className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Settled On</label>
                                            <input 
                                                type="date" 
                                                className="w-full bg-white border border-emerald-200 rounded-md px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 font-medium"
                                                value={gate.paid_date ? gate.paid_date.split('T')[0] : ''}
                                                onChange={(e) => updatePaidDate(gate.id, e.target.value)}
                                            />
                                        </div>
                                    )}`;

content = content.replace(oldStatusBlock, newStatusBlock);

fs.writeFileSync('components/PaymentGatesTab.tsx', content);
console.log('patched successfully');
