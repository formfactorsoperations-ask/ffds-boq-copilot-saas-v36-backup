const fs = require('fs');

let content = fs.readFileSync('components/Dashboard.tsx', 'utf-8');

function extractBlock(startMarker, endMarker) {
  let startIndex = content.indexOf(startMarker);
  if (startIndex === -1) { return { text: "", start: -1, end: -1 }; }
  
  let endIndex = content.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex === -1) { return { text: "", start: -1, end: -1 }; }
  
  // also consume any trailing newline/whitespace until the next non whitespace character? 
  // For simplicity just go to endMarker + endMarker.length
  endIndex += endMarker.length;
  
  return {
    text: content.substring(startIndex, endIndex),
    start: startIndex,
    end: endIndex
  };
}

let topLevelStart = content.indexOf('<LiveMarquee');
let gridStart = content.indexOf('{/* Main Bento Grid');

let topLevelText = content.substring(topLevelStart, gridStart);

const m1 = '<LiveMarquee items={feedItems} onNavigate={setActiveTab} />\n';
const m2 = '            <PhaseTransitionWidget projectContext={projectContext} projectId={projectId} setProjectContext={setProjectContext} />\n';

let heroStart = topLevelText.indexOf('{/* CONDENSED HERO HEADER STRIP */}');
let heroText = topLevelText.substring(heroStart);

// New Top Level
let newTopLevel = heroText + '\n' + m1 + '\n' + m2 + '\n';
content = content.replace(topLevelText, newTopLevel);


// Left Column
let quickActionBlock = extractBlock('{/* DYNAMIC QUICK ACTIONS */}', '</motion.div>\n\n                    {/* FINANCIAL OVERVIEW & SCOPE */}');
let finBlock = extractBlock('{/* FINANCIAL OVERVIEW & SCOPE */}', '</div>\n\n                    {/* RE-IMAGINED COMPACT MATERIAL PIPELINE CARD */}');
let matBlock = extractBlock('{/* RE-IMAGINED COMPACT MATERIAL PIPELINE CARD */}', '</motion.div>\n\n                    {/* ACTION PROTOCOL (WHAT BREAKS TOMORROW) */}');
let actionProtBlock = extractBlock('{/* ACTION PROTOCOL (WHAT BREAKS TOMORROW) */}', '</motion.div>\n                </div>\n\n                {/* RIGHT COLUMN:');

if (quickActionBlock.start !== -1 && actionProtBlock.start !== -1) {
    let leftColStart = quickActionBlock.start;
    let leftColEnd = actionProtBlock.end;
    let originalLeftCol = content.substring(leftColStart, leftColEnd);
    
    // new order: action prot, quick actions, fin, mat
    let newLeftCol = 
        actionProtBlock.text.replace('</motion.div>\n                </div>\n\n                {/* RIGHT COLUMN:', '</motion.div>\n\n                    {/* DYNAMIC QUICK ACTIONS */}') +
        quickActionBlock.text.replace('</motion.div>\n\n                    {/* FINANCIAL OVERVIEW & SCOPE */}', '</motion.div>\n\n                    {/* FINANCIAL OVERVIEW & SCOPE */}') +
        finBlock.text.replace('</div>\n\n                    {/* RE-IMAGINED COMPACT MATERIAL PIPELINE CARD */}', '</div>\n\n                    {/* RE-IMAGINED COMPACT MATERIAL PIPELINE CARD */}') +
        matBlock.text.replace('</motion.div>\n\n                    {/* ACTION PROTOCOL (WHAT BREAKS TOMORROW) */}', '</motion.div>\n                </div>\n\n                {/* RIGHT COLUMN:');
        
    content = content.replace(originalLeftCol, newLeftCol);
}


// Right Column
let rightColStart = content.indexOf('{/* 1. "WHAT TO DO TODAY" PANEL */}');
let nextSecStart = content.indexOf('{/* Blast Radius Network');

let siteActivityBlock = extractBlock('{/* 3. SITE ACTIVITY WIDGET */}', '<div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm relative overflow-hidden group">');
let opsIntellBlock = extractBlock('{/* 2. OPS INTELLIGENCE STACK */}', '{/* 3. SITE ACTIVITY WIDGET */}');
let actionTrackerBlock = extractBlock('{/* 4. ACTION TRACKER WIDGET */}', '{/* 5. COMMS TRACKER WIDGET */}');
let commsTrackerBlock = extractBlock('{/* 5. COMMS TRACKER WIDGET */}', '                </div>\n            </div>\n\n            {/* Blast');
let todayBlock = extractBlock('{/* 1. "WHAT TO DO TODAY" PANEL */}', '{/* 2. OPS INTELLIGENCE STACK */}');

if (siteActivityBlock.start !== -1 && opsIntellBlock.start !== -1) {
    // We want site activity before ops intell
    let originalRight = content.substring(todayBlock.start, commsTrackerBlock.end);
    let newRight = 
        todayBlock.text + 
        siteActivityBlock.text.replace('<div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm relative overflow-hidden group">', '') + 
        opsIntellBlock.text.replace('{/* 3. SITE ACTIVITY WIDGET */}', '') + 
        actionTrackerBlock.text + 
        commsTrackerBlock.text;
    content = content.replace(originalRight, newRight);
}

fs.writeFileSync('components/Dashboard.tsx', content);
console.log("DONE!");
