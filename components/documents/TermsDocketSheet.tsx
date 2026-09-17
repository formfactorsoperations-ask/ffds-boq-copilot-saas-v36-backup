/**
 * TERMS OF ENGAGEMENT DOCKET SHEET
 *
 * The studio's real Terms of Engagement docket, lifted verbatim out of
 * TermsDocketPage so it can render in more than one place.
 *
 * The app is the source of truth for every client document. The client portal
 * renders THIS component from a frozen snapshot — it never rebuilds a document
 * of its own. Same markup, same styles, same clause numbering on both sides.
 *
 * Clause bodies go through the shared DocumentBlock primitive, so token
 * substitution and the warranty / snag tables behave identically everywhere.
 */

import React from 'react';
import { TermsSettings, TermsDocket } from '../../types';
import { DocumentBlock, resolveTokens } from './DocumentBlocks';

export interface TermsDocketSheetProps {
  /** The authored terms configuration, frozen at issue. */
  activeTermsConfig: TermsSettings | null;
  /** The docket record — supplies ref and status. */
  latestDocket: Pick<TermsDocket, 'docketRef' | 'status'> & Record<string, any>;
  /** Client identity as captured on the docket. */
  snapshotClientData?: { clientName?: string; projectName?: string; date?: string } | null;
  /** Studio letterhead, frozen so it never drifts. */
  orgData: {
    orgName?: string;
    officeAddress?: string;
    contactEmail?: string;
    signatoryName?: string;
    signatoryTitle?: string;
  };
  previewMode?: boolean;
  /** Studio-only: edit the issued date while the docket is still a draft.
   *  The portal never passes this, so the field renders as plain text. */
  onUpdateIssuedDate?: (value: string) => void;
}

const TermsDocketSheet: React.FC<TermsDocketSheetProps> = ({
  activeTermsConfig,
  latestDocket,
  snapshotClientData,
  orgData,
  previewMode = false,
  onUpdateIssuedDate
}) => {
  return (
    <div id="terms-docket-pdf-render" className={`terms-docket-template ${previewMode ? 'print-only' : ''}`}>
        <style dangerouslySetInnerHTML={{__html: `
            :root{
                --ink:#1f2328; --ink-soft:#3f464e; --muted:#727a82;
                --line:#e6e3dc; --line-soft:#efece6; --paper:#fbfaf7; --card:#ffffff;
                --slate:#1f2328; --accent:#1e3a8a; --accent-soft:#eef2fb; --gold:#b08d57;
            }
            .terms-docket-template {
                background:var(--paper); color:var(--ink);
                font-family:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
                line-height:1.62; font-size:14px; -webkit-font-smoothing:antialiased;
                width: 100%; max-width: 820px;
            }
            .terms-docket-template * { box-sizing:border-box; }
            .terms-docket-template .sheet{max-width:820px; margin:0 auto; background:var(--card); padding:40px 52px 50px;}
            .terms-docket-template header.mast{border-bottom:2px solid var(--slate); padding-bottom:18px; display:flex; justify-content:space-between; align-items:flex-end;}
            .terms-docket-template .brand{font-size:14px; letter-spacing:.22em; text-transform:uppercase; font-weight:800;}
            .terms-docket-template .tagline{font-size:11px; color:var(--muted); letter-spacing:.05em; margin-top:3px;}
            .terms-docket-template .docnum{font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--gold); font-weight:700; text-align:right;}
            .terms-docket-template .title{margin:20px 0 4px; font-size:21px; font-weight:800; letter-spacing:-.01em;}
            .terms-docket-template .preamble{font-size:12.5px; color:var(--ink-soft); margin:0 0 14px;}
            .terms-docket-template .metabar{display:grid; grid-template-columns:1fr 1fr; border:1px solid var(--line); border-radius:10px; overflow:hidden; margin:18px 0 6px;}
            .terms-docket-template .metabar div{padding:10px 14px; border-bottom:1px solid var(--line-soft);}
            .terms-docket-template .metabar div:nth-child(odd){background:#faf9f5; border-right:1px solid var(--line-soft);}
            .terms-docket-template .metabar .k{font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:700;}
            .terms-docket-template .metabar .v{font-weight:700; color:var(--ink); margin-top:2px; font-size:13.5px;}
            .terms-docket-template h2.sec{font-size:13px; letter-spacing:.12em; text-transform:uppercase; font-weight:800; color:var(--slate);
                margin:24px 0 4px; padding-top:14px; border-top:1px solid var(--line); display:flex; gap:10px; align-items:baseline;}
            .terms-docket-template h2.sec .n{color:var(--accent); font-size:12px;}
            .terms-docket-template .added{font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--gold); border:1px solid var(--gold);
                border-radius:999px; padding:1px 7px; font-weight:700; margin-left:auto;}
            .terms-docket-template.html2pdf-active .added { display: none !important; }
            .terms-docket-template .cl{margin:6px 0; display:flex; gap:12px;}
            .terms-docket-template .cl .num{flex:0 0 34px; font-weight:700; color:var(--accent); font-variant-numeric:tabular-nums; font-size:12.5px;}
            .terms-docket-template .cl .body{color:var(--ink-soft); font-size:13px;}
            .terms-docket-template .cl .body b{color:var(--ink);}
            .terms-docket-template .principle{background:var(--accent-soft); border:1px solid #d6e0f5; border-left:3px solid var(--accent);
                border-radius:0 10px 10px 0; padding:12px 16px; margin:10px 0;}
            .terms-docket-template .principle .lab{font-size:10px; letter-spacing:.12em; text-transform:uppercase; font-weight:800; color:var(--accent); display:block; margin-bottom:4px;}
            .terms-docket-template .principle p{margin:0; color:#27324a; font-size:13px;}
            .terms-docket-template .highlight{background:#fdf8ef; border:1px solid #ecdcc0; border-left:3px solid var(--gold); border-radius:0 10px 10px 0; padding:12px 16px; margin:10px 0;}
            .terms-docket-template .highlight .lab{font-size:10px; letter-spacing:.12em; text-transform:uppercase; font-weight:800; color:#8a6b34; display:block; margin-bottom:4px;}
            .terms-docket-template .highlight p{margin:0 0 8px; color:#5c4a2a; font-size:13px;} 
            .terms-docket-template .highlight p:last-child{margin:0;}
            .terms-docket-template table.mini{width:100%; border-collapse:collapse; margin:8px 0 4px; font-size:13px;}
            .terms-docket-template table.mini th{text-align:left; background:#f4f2ec; padding:7px 11px; font-size:10px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); font-weight:700; border-bottom:1px solid var(--line);}
            .terms-docket-template table.mini td{padding:7px 11px; border-bottom:1px solid var(--line-soft); color:var(--ink-soft);}
            .terms-docket-template table.mini tr:last-child td{border-bottom:none;}
            .terms-docket-template .print-only { display: none; }
            .terms-docket-template.html2pdf-active .print-only { display: inline-block !important; }
            .terms-docket-template.html2pdf-active .no-print { display: none !important; }
            .terms-docket-template .sig{display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:32px;}
            .terms-docket-template .sig .line{border-top:1px solid var(--ink); padding-top:9px; margin-top:40px; font-size:12px; color:var(--muted);}
            .terms-docket-template .sig .line b{display:block; color:var(--ink); font-size:12.5px; margin-bottom:2px;}
            .terms-docket-template footer{margin-top:32px; padding-top:12px; border-top:1px solid var(--line); font-size:10.5px; color:var(--muted); text-align:center; letter-spacing:.04em;}
            @media print{ 
                .terms-docket-template {background:#fff;} 
                .terms-docket-template .sheet{padding:0 8px;} 
                .terms-docket-template .sec-group { break-inside: avoid; page-break-inside: avoid; }
                .terms-docket-template h2.sec{break-after:avoid;} 
                .terms-docket-template .cl, .terms-docket-template .principle, .terms-docket-template .highlight, .terms-docket-template table.mini, .terms-docket-template .sig{break-inside:avoid;} 
                .terms-docket-template footer { display: none; }
                .terms-docket-template .print-only { display: inline-block !important; }
                .terms-docket-template .no-print { display: none !important; }
                .terms-docket-template .added { display: none !important; }
            }
            @media(max-width:600px){ 
                .terms-docket-template .sheet{padding:32px 22px 56px;} 
                .terms-docket-template .metabar, .terms-docket-template .sig{grid-template-columns:1fr;} 
            }
        `}} />
        <div className="sheet">
            <header className="mast">
                <div>
                    <div className="brand">{orgData.orgName || 'Form Factors Design Studio'}</div>
                    <div className="tagline">Minimal Design. Maximum Impact.</div>
                </div>
                <div className="docnum">
                    {latestDocket.docketRef?.includes('-AMD-') ? 'Document Addendum' : 'Document 1 of 2'}<br/>
                    {latestDocket.docketRef?.includes('-AMD-') ? 'Contract Amendment' : 'Governing Docket'}
                </div>
            </header>

            <h1 className="title">
                {latestDocket.docketRef?.includes('-AMD-') 
                    ? 'Amendment & Addendum to Terms of Engagement' 
                    : 'Terms of Engagement — Governing Docket'}
            </h1>
            <p className="preamble">
                {activeTermsConfig?.preamble || "This document establishes the framework governing all projects undertaken by Form Factors Design Studio. It is to be read and acknowledged before any design work, proposal, or Discovery Workshop commences. Specific project scope and the advance payment schedule are covered in separate documents."}
            </p>

            <div className="metabar">
                <div><div className="k">Client Name</div><div className="v">{snapshotClientData?.clientName || 'Client Name'}</div></div>
                <div><div className="k">Project Name</div><div className="v">{snapshotClientData?.projectName || 'Project Name'}</div></div>
                <div>
                    <div className="k">Date Issued</div>
                    <div className="v">
                        {latestDocket.status === 'draft' && onUpdateIssuedDate ? (
                            <>
                                <input 
                                    type="text"
                                    value={snapshotClientData?.date || ''}
                                    onChange={(e) => onUpdateIssuedDate(e.target.value)}
                                    className="bg-stone-50 border border-stone-200 rounded px-1.5 py-0.5 text-xs text-stone-850 font-bold outline-none focus:ring-1 focus:ring-[#3D52A0] w-full no-print"
                                    placeholder="DD/MM/YYYY"
                                />
                                <span className="print-only">{snapshotClientData?.date || ''}</span>
                            </>
                        ) : (
                            snapshotClientData?.date || 'Date Issued'
                        )}
                    </div>
                </div>
                <div><div className="k">Docket Reference</div><div className="v">{latestDocket.docketRef || 'Docket Reference'}</div></div>
            </div>

            {/* Dynamic Section Rendering */}
            {activeTermsConfig?.sections && activeTermsConfig.sections.length > 0 ? (
                activeTermsConfig.sections.map((sec, sIdx) => (
                    <div
                        key={sec.n || sIdx}
                        className="sec-group"
                        /* Anchors the reading ceremony: dwell tracking and
                           "read this section" both key off the real clause
                           number, so evidence maps to the actual document. */
                        id={`sec-${sec.n}`}
                        data-section-ref={String(sec.n)}
                    >
                        <h2 className="sec">
                            {/* Titles carry the same {{studioName}} tokens the
                                bodies do, but resolveTokens was only ever
                                applied to blocks — so section 1 of a signed
                                contract read "ABOUT {{studioName}}". */}
                            <span className="n">{sec.n}</span>{' '}
                            {resolveTokens(sec.title || '', activeTermsConfig, orgData.orgName || 'the Studio')}
                            {sec.recommended && <span className="added">Recommended</span>}
                        </h2>
                        {sec.blocks?.map((block, bIdx) => (
                                                <DocumentBlock
                                                    key={bIdx}
                                                    block={block}
                                                    settings={activeTermsConfig}
                                                    studioName={orgData.orgName || 'the Studio'}
                                                    surface="print"
                                                />
                                            ))}
                    </div>
                ))
            ) : (
                <div className="p-8 text-center text-slate-400 italic">
                    No terms clauses configured. Click "Amend Terms" to initialize or write custom sections.
                </div>
            )}

            <div className="sig">
                <div><div className="line"><b>Client Signature &amp; Date</b>{snapshotClientData?.clientName || 'Client Name'}</div></div>
                <div><div className="line"><b>For {orgData.orgName || 'Form Factors Design Studio'}</b>{orgData.signatoryName || activeTermsConfig?.signatory?.name || (activeTermsConfig as any)?.signatoryName || '[Principal Name]'}</div></div>
            </div>

            <footer>{orgData.orgName || 'Form Factors Design Studio'} &middot; Minimal Design. Maximum Impact. &middot; {orgData.officeAddress || '[studio address]'} &middot; {orgData.contactEmail || 'formfactors.operations@gmail.com'}</footer>
        </div>
    </div>
  );
};

export default TermsDocketSheet;
