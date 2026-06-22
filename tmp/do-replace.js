const fs = require('fs');
let text = fs.readFileSync('components/Dashboard.tsx', 'utf-8');

// Top level replacement
let pre = `<LiveMarquee items={feedItems} onNavigate={setActiveTab} />
            <PhaseTransitionWidget projectContext={projectContext} projectId={projectId} setProjectContext={setProjectContext} />

            {/* CONDENSED HERO HEADER STRIP */}`;
let post = `{/* CONDENSED HERO HEADER STRIP */}`;

text = text.replace(pre, post);

// Header ends at:
let headerEnd = `{/* Main Bento Grid (Two-Column Layout) */}`;
let widgetsToInsert = `<PhaseTransitionWidget projectContext={projectContext} projectId={projectId} setProjectContext={setProjectContext} />
            <LiveMarquee items={feedItems} onNavigate={setActiveTab} />

            {/* Main Bento Grid (Two-Column Layout) */}`;
            
text = text.replace(headerEnd, widgetsToInsert);

console.log("Replaced top level");

// Reorder Left Column
let split1 = text.split('{/* LEFT COLUMN: Quick Actions, Financials & Logistics (Covers 2 out of 3 cols) */}\n                <div className="lg:col-span-2 space-y-8">\n                    ');
let split2 = split1[1].split('                </div>\n\n                {/* RIGHT COLUMN: What to do today, Ops Intelligence, Site & Comms Pulse (Covers 1 of 3 cols) */}');
let leftColStr = split2[0];

// break leftColStr into blocks
let qaStart = leftColStr.indexOf('{/* DYNAMIC QUICK ACTIONS */}');
let finStart = leftColStr.indexOf('{/* FINANCIAL OVERVIEW & SCOPE */}');
let matStart = leftColStr.indexOf('{/* RE-IMAGINED COMPACT MATERIAL PIPELINE CARD */}');
let actoStart = leftColStr.indexOf('{/* ACTION PROTOCOL (WHAT BREAKS TOMORROW) */}');

let qaBlock = leftColStr.substring(qaStart, finStart);
let finBlock = leftColStr.substring(finStart, matStart);
let matBlock = leftColStr.substring(matStart, actoStart);
let actoBlock = leftColStr.substring(actoStart);

let newLeftColStr = actoBlock + qaBlock + finBlock + matBlock;

let newText = split1[0] + '{/* LEFT COLUMN: Quick Actions, Financials & Logistics (Covers 2 out of 3 cols) */}\n                <div className="lg:col-span-2 space-y-8">\n                    ' + newLeftColStr + '                </div>\n\n                {/* RIGHT COLUMN: What to do today, Ops Intelligence, Site & Comms Pulse (Covers 1 of 3 cols) */}';
newText += split2[1];

// Reorder Right Column
let rsplit1 = newText.split('{/* RIGHT COLUMN: What to do today, Ops Intelligence, Site & Comms Pulse (Covers 1 of 3 cols) */}\n                <div className="space-y-8">\n                    \n');
let rsplit2 = rsplit1[1].split('                </div>\n            </div>\n\n            {/* Blast');
let rightColStr = rsplit2[0];

let wtdStart = rightColStr.indexOf('{/* 1. "WHAT TO DO TODAY" PANEL */}');
let opsStart = rightColStr.indexOf('{/* 2. OPS INTELLIGENCE STACK */}');
let saStart = rightColStr.indexOf('{/* 3. SITE ACTIVITY WIDGET */}');
let atStart = rightColStr.indexOf('{/* 4. ACTION TRACKER WIDGET */}');

let wtdBlock = rightColStr.substring(wtdStart, opsStart);
let opsBlock = rightColStr.substring(opsStart, saStart);
let saBlock = rightColStr.substring(saStart, atStart);
let theRestBlock = rightColStr.substring(atStart);

let newRightColStr = wtdBlock + saBlock + opsBlock + theRestBlock;

let finalText = rsplit1[0] + '{/* RIGHT COLUMN: What to do today, Ops Intelligence, Site & Comms Pulse (Covers 1 of 3 cols) */}\n                <div className="space-y-8">\n                    \n' + newRightColStr + '                </div>\n            </div>\n\n            {/* Blast' + rsplit2[1];

fs.writeFileSync('components/Dashboard.tsx', finalText);
console.log("Success");
