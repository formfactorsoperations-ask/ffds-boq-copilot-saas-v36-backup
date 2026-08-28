const fs = require('fs');
const path = 'components/ProjectWorkspace.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace FloatingDock closing tag and add the button
content = content.replace(
  '              desktopClassName="h-auto bg-slate-200/50 border border-slate-200/80 px-2 py-1 gap-1 rounded-xl shadow-2xs"\n              mobileClassName=""\n            />\n          </div>\n        </div>',
  `              desktopClassName="h-auto bg-slate-200/50 border border-slate-200/80 px-2 py-1 gap-1 rounded-xl shadow-2xs"\n              mobileClassName=""\n            />\n\n            <button\n              onClick={() => setIsGlassLabOpen(true)}\n              className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-xs font-medium rounded-lg hover:from-purple-600 hover:to-indigo-600 transition-all shadow-sm shadow-purple-500/20"\n            >\n              <Sparkles className="w-3.5 h-3.5" />\n              Glass Theme\n            </button>\n          </div>\n        </div>`
);

// Add <GlassThemeLab /> just before the final </div> of the component
const lastDivIndex = content.lastIndexOf('</div>');
if (lastDivIndex !== -1) {
  content = content.slice(0, lastDivIndex) + 
    `\n      <AnimatePresence>\n        {isGlassLabOpen && <GlassThemeLab onClose={() => setIsGlassLabOpen(false)} />}\n      </AnimatePresence>\n    ` + 
    content.slice(lastDivIndex);
}

fs.writeFileSync(path, content, 'utf8');
console.log("Patched successfully.");
