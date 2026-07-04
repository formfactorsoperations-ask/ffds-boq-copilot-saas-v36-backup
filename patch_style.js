const fs = require('fs');
const file = 'components/client/ExecutionAgreementPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const newCSS = `                        .ea-doc * { box-sizing: border-box; }
                        .ea-doc {
                            margin: 0;
                            padding: 0;
                            color: #334155;
                            font-family: 'Open Sans', ui-sans-serif, system-ui, sans-serif;
                            font-size: 13.5px;
                            line-height: 1.6;
                            text-align: left;
                        }
                        .ea-page {
                            width: 210mm;
                            min-height: 297mm;
                            margin: 0 auto 18px auto;
                            background: #fff;
                            padding: 20mm 18mm;
                            page-break-after: always;
                            position: relative;
                        }
                        .ea-page:last-child { page-break-after: auto; margin-bottom: 0; }
                        .ea-header {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            border-bottom: 4px solid #1e1b4b;
                            padding-bottom: 16px;
                            margin-bottom: 24px;
                        }
                        .ea-logo {
                            letter-spacing: 5px;
                            font-weight: 700;
                            font-size: 16px;
                            text-transform: uppercase;
                            color: #1e1b4b;
                        }
                        .ea-tagline {
                            color: #64748b;
                            font-size: 11px;
                            margin-top: 4px;
                            letter-spacing: .2px;
                        }
                        .ea-meta {
                            text-align: right;
                            font-size: 10.5px;
                            color: #64748b;
                            text-transform: uppercase;
                            letter-spacing: 1.2px;
                        }
                        .ea-doc h1, .ea-doc h2, .ea-doc h3 { margin: 0; color: #1e1b4b; }
                        .ea-doc h1 {
                            font-size: 26px;
                            line-height: 1.2;
                            margin: 24px 0 12px;
                            letter-spacing: .2px;
                            font-weight: 800;
                        }
                        .ea-doc h2 {
                            font-size: 18px;
                            margin: 24px 0 16px;
                            text-transform: uppercase;
                            letter-spacing: 1.5px;
                            border-bottom: 2px solid #1e1b4b;
                            padding-bottom: 8px;
                            font-weight: 700;
                        }
                        .ea-doc h3 {
                            font-size: 14px;
                            margin: 16px 0 8px;
                            text-transform: uppercase;
                            letter-spacing: .8px;
                            font-weight: 700;
                        }
                        .ea-doc p { margin: 0 0 10px; }
                        .ea-lead { color: #475569; max-width: 620px; }
                        .ea-grid-2 {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 16px;
                            margin: 16px 0;
                        }
                        .ea-grid-3 {
                            display: grid;
                            grid-template-columns: 1fr 1fr 1fr;
                            gap: 12px;
                            margin: 16px 0;
                        }
                        .ea-box {
                            border: 1px solid #e2e8f0;
                            border-radius: 8px;
                            padding: 16px;
                            background: #fff;
                        }
                        .ea-box.soft { background: #f8fafc; }
                        .ea-box.brand { background: #eff6ff; border-left: 4px solid #1e1b4b; }
                        .ea-box.warn { background: #fefce8; border-left: 4px solid #eab308; }
                        .ea-label {
                            font-size: 10px;
                            color: #64748b;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                            margin-bottom: 4px;
                            font-weight: 700;
                        }
                        .ea-value { font-size: 14px; font-weight: 700; color: #1e1b4b; }
                        .ea-placeholder {
                            color: #1e1b4b;
                            font-weight: 600;
                        }
                        .ea-doc table {
                            width: 100%;
                            border-collapse: collapse;
                            margin: 12px 0 16px;
                            font-size: 12px;
                        }
                        .ea-doc th {
                            background: #1e1b4b;
                            color: #fff;
                            padding: 10px;
                            text-align: left;
                            font-size: 10px;
                            text-transform: uppercase;
                            letter-spacing: .8px;
                        }
                        .ea-doc td {
                            border-bottom: 1px solid #f1f5f9;
                            padding: 9px 10px;
                            vertical-align: top;
                            color: #475569;
                        }
                        .ea-doc tr:hover td {
                            background: #f8fafc;
                        }
                        .ea-num { width: 40px; text-align: center; }
                        .ea-right { text-align: right; }
                        .ea-small { font-size: 11px; color: #64748b; }
                        .ea-clause {
                            display: grid;
                            grid-template-columns: 42px 1fr;
                            gap: 8px;
                            margin: 8px 0;
                        }
                        .ea-clause .ea-no {
                            color: #1e1b4b;
                            font-weight: 700;
                        }
                        .ea-doc ul, .ea-doc ol { margin: 8px 0 12px 24px; padding: 0; }
                        .ea-doc li { margin: 4px 0; }
                        .ea-sig-grid {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 32px;
                            margin-top: 32px;
                        }
                        .ea-sig-line {
                            border-top: 1px solid #1e1b4b;
                            padding-top: 10px;
                            min-height: 70px;
                        }
                        .ea-footer {
                            position: absolute;
                            bottom: 10mm;
                            left: 18mm;
                            right: 18mm;
                            display: flex;
                            justify-content: space-between;
                            color: #94a3b8;
                            font-size: 9px;
                            border-top: 1px solid #e2e8f0;
                            padding-top: 7px;
                        }
                        .ea-avoid-break { break-inside: avoid; page-break-inside: avoid; }
                        .ea-toc td:first-child { width: 42px; font-weight: 700; color: #1e1b4b; }
                        .ea-annex-title {
                            background: transparent;
                            color: #1e1b4b;
                            padding-bottom: 8px;
                            border-bottom: 2px solid #1e1b4b;
                            margin-top: 32px;
                            margin-bottom: 16px;
                            font-weight: 700;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                            font-size: 18px;
                        }
                        @media print {
                            .ea-doc { background: #fff; }
                            .ea-page { margin: 0; box-shadow: none; width: 210mm; min-height: 297mm; }
                        }`;
                        
const startIndex = content.indexOf('.ea-doc * { box-sizing: border-box; }');
const endIndex = content.indexOf('</style>', startIndex);

if (startIndex > -1 && endIndex > -1) {
    // we need to find the exact start index of `.ea-doc *` and end index just before `</style>` or ``}} />`
    const endMatch = content.indexOf('`}} />', startIndex);
    
    // Check where `@media print` ends.
    content = content.substring(0, startIndex) + newCSS + '\n                        ' + content.substring(endMatch);
    fs.writeFileSync(file, content);
    console.log("Patched successfully");
} else {
    console.log("Could not find style tags");
}
