import React from 'react';
import { OrganizationContext } from '../../../types';

interface StudioDocumentShellProps {
    children: React.ReactNode;
    orgData: OrganizationContext;
    docHeaderType: string;
    docHeaderTitle: string;
    pageCount?: number;
}

export function StudioDocumentShell({ children, orgData, docHeaderType, docHeaderTitle, pageCount = 1 }: StudioDocumentShellProps) {
    return (
        <div className="pdf-document bg-white mx-auto shadow-md" style={{ width: '210mm', minHeight: '297mm', position: 'relative' }}>
            <div className="print-content" style={{ padding: '24mm 18mm 18mm 18mm' }}>
                <StudioDocumentHeader orgData={orgData} type={docHeaderType} title={docHeaderTitle} />
                <div className="mt-8">
                    {children}
                </div>
            </div>
            
            {/* Standard Footer - Note: html2pdf handles headers/footers poorly across multiple pages if done this way, 
                so we use print CSS @page rules or just position it at bottom of standard flow. For exact A4 layout, 
                we might rely on CSS regions or just stick it at the very end of the document for simple 1-pagers, 
                or split content. 
            */}
            <StudioFooter orgData={orgData} />
        </div>
    );
}

export function StudioDocumentHeader({ orgData, type, title }: { orgData: OrganizationContext, type: string, title: string }) {
    return (
        <div className="flex justify-between items-start border-b border-[#d9d6cc] pb-6 mb-8">
            <div className="flex-1">
                {orgData.orgLogo ? (
                    <img src={orgData.orgLogo} alt={orgData.orgName} style={{ maxWidth: '150px', maxHeight: '60px', objectFit: 'contain' }} />
                ) : (
                    <div className="space-y-1">
                        <h2 className="text-[#2f4a2e] text-lg font-bold uppercase tracking-wide m-0" style={{ fontFamily: 'Open Sans, sans-serif' }}>{orgData.orgName || "FORM FACTORS DESIGN STUDIO"}</h2>
                        <p className="text-[#666666] text-xs italic m-0">Minimal Design. Maximum Impact.</p>
                    </div>
                )}
            </div>
            <div className="text-right flex-1 border border-[#d9d6cc] bg-[#f7f1e6] rounded-md p-3 max-w-[280px]">
                <p className="text-[10px] uppercase font-bold text-[#6f7f52] leading-tight mb-1" style={{ whiteSpace: 'pre-line' }}>{type}</p>
                <p className="text-xs font-semibold text-[#222222] uppercase tracking-wide m-0 leading-tight" style={{ whiteSpace: 'pre-line' }}>{title.replace(/\\n/g, '\n')}</p>
            </div>
        </div>
    );
}

export function StudioFooter({ orgData }: { orgData: OrganizationContext }) {
    const address = orgData.officeAddress ? ` · ${orgData.officeAddress.replace(/\n/g, ', ')}` : '';
    const phone = orgData.contactPhone ? ` · ${orgData.contactPhone}` : '';
    const email = orgData.contactEmail ? ` · ${orgData.contactEmail}` : '';
    
    return (
        <div className="mt-16 pt-4 border-t border-[#d9d6cc] text-[#666666] text-[9px] flex flex-col items-center justify-center pdf-footer" style={{ pageBreakInside: 'avoid' }}>
            <p className="m-0 font-semibold">{orgData.orgName || "Form Factors Design Studio"}{address}{phone}{email}</p>
            <p className="m-0 mt-1 italic">Minimal Design. Maximum Impact.</p>
        </div>
    );
}
