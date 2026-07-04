const fs = require('fs');

let content = fs.readFileSync('components/studio/StudioSettingsTab.tsx', 'utf8');

const signatorySection = `                    </div>
                    {/* Studio Signature Authority */}
                    <div className="pt-6 border-t border-slate-100">
                        <h3 className="font-bold text-indigo-900 text-lg mb-4">Studio Signature Authority</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Principal Name</label><input type="text" name="signatoryName" value={data.signatoryName || ''} onChange={onChange} placeholder="e.g. Jane Doe" className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Principal Title</label><input type="text" name="signatoryTitle" value={data.signatoryTitle || ''} onChange={onChange} placeholder="e.g. Principal Architect" className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                        </div>`;

content = content.replace(
    '                    {/* Financial Defaults */}',
    signatorySection + '\n                    </div>\n                    {/* Financial Defaults */}'
);

fs.writeFileSync('components/studio/StudioSettingsTab.tsx', content);
console.log('patched branding tab again');
