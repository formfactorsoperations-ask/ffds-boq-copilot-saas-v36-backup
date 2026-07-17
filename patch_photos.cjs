const fs = require('fs');
let code = fs.readFileSync('components/WeeklyProgressReportTab.tsx', 'utf8');

const newPhotos = `                    {/* Photos */}
                    {(currentPulse.photos?.length > 0 || (!isClientView && currentPulse?.status !== 'published')) && (
                        <div className="mt-8">
                            <h3 className="text-[11px] font-bold text-[#5a6577] uppercase tracking-widest mb-4">Site Photos</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {currentPulse.photos?.map((photo, i) => (
                                    <div key={i} className="relative aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                        <img src={photo} className="w-full h-full object-cover" alt="Site Update" />
                                        {!isClientView && currentPulse?.status !== 'published' && (
                                            <button 
                                                onClick={() => {
                                                    const updated = currentPulse.photos.filter((_, idx) => idx !== i);
                                                    updateCurrentPulse(p => ({ ...p, photos: updated }));
                                                }}
                                                className="absolute top-2 right-2 bg-white/80 p-1.5 rounded-full text-red-600 hover:bg-white"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {!isClientView && currentPulse?.status !== 'published' && (
                                    <label className="aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors">
                                        <Plus className="w-6 h-6 text-slate-400 mb-2" />
                                        <span className="text-xs font-bold text-slate-500">Add Photo</span>
                                        <input 
                                            type="file" 
                                            className="hidden" 
                                            accept="image/*"
                                            onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (e) => {
                                                        const result = e.target?.result as string;
                                                        updateCurrentPulse(p => ({
                                                            ...p,
                                                            photos: [...(p.photos || []), result]
                                                        }));
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                    </label>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Studio Notes */}`;

code = code.replace(/\{\/\* Studio Notes \*\/\}/, newPhotos);
fs.writeFileSync('components/WeeklyProgressReportTab.tsx', code);
console.log('Patched photos section');
