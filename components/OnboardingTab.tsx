
import React from 'react';
import { ProjectContext, ProposalTier } from '../types';
import Card from './shared/Card';
import ClientOnboarding from './client/ClientOnboarding';
import { PrintIcon, ExportIcon } from './Icons';

interface OnboardingTabProps {
    projectContext: ProjectContext;
    setProjectContext: React.Dispatch<React.SetStateAction<ProjectContext>>;
    activeTier?: ProposalTier;
}

const OnboardingTab: React.FC<OnboardingTabProps> = ({ projectContext, setProjectContext, activeTier }) => {
    
    const handlePrint = () => {
        const content = document.getElementById('onboarding-kit');
        if (!content) return;

        const doc = document.cloneNode(true) as Document;
        doc.body.innerHTML = '';
        doc.body.appendChild(content.cloneNode(true));
        doc.body.className = 'bg-white p-0 m-0';
        doc.title = `Onboarding_${projectContext.name}`;

        doc.querySelectorAll('.no-print').forEach(el => el.remove());

        const script = document.createElement('script');
        script.textContent = `window.onload = () => { setTimeout(() => window.print(), 500); };`;
        doc.body.appendChild(script);

        const htmlContent = doc.documentElement.outerHTML;
        const blob = new Blob([`<!DOCTYPE html>${htmlContent}`], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    };

    const handleExportHtml = () => {
        const content = document.getElementById('onboarding-kit');
        if (!content) return;

        // Clone and clean
        const wrapper = content.cloneNode(true) as HTMLElement;
        wrapper.querySelectorAll('.no-print').forEach(el => el.remove());

        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Onboarding Kit - ${projectContext.name}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet">
                <style>
                    body { font-family: "Open Sans", sans-serif; background: #f8fafc; padding: 40px; }
                    .print-container { background: white; margin: 0 auto; box-shadow: 0 10px 40px -10px rgba(0,0,0,0.1); }
                    @media print {
                        body { background: white; padding: 0; }
                        .print-container { box-shadow: none; margin: 0; width: 100%; max-width: none; }
                        @page { margin: 0; }
                        .no-print { display: none; }
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                </style>
            </head>
            <body>
                <div class="print-container max-w-[210mm]">
                    ${wrapper.innerHTML}
                </div>
            </body>
            </html>
        `;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Onboarding_Kit_${(projectContext.name || 'Project').replace(/\s+/g, '_')}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <Card title="Client Onboarding Kit" titleIcon={<span className="text-xl">🤝</span>}>
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 p-4 bg-slate-50 rounded-xl no-print">
                    <div>
                        <h4 className="font-bold text-slate-800">Ready to Send?</h4>
                        <p className="text-sm text-slate-600">
                            Configure bank details and QR code first. Then export to share with the client.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={handleExportHtml}
                            className="px-5 py-3 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 flex items-center gap-2 transition-all"
                        >
                            <ExportIcon className="w-4 h-4"/> Export HTML
                        </button>
                        <button 
                            onClick={handlePrint}
                            className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-black flex items-center gap-2 transition-all active:scale-95"
                        >
                            <PrintIcon className="w-4 h-4"/> Quick Print
                        </button>
                    </div>
                </div>

                <div className="bg-slate-200/50 p-4 md:p-8 rounded-xl overflow-auto border border-slate-200 flex justify-center">
                    <div id="onboarding-kit" className="w-full flex justify-center">
                        <ClientOnboarding projectContext={projectContext} setProjectContext={setProjectContext} activeTier={activeTier} />
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default OnboardingTab;
