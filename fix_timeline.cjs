const fs = require('fs');
let content = fs.readFileSync('components/TimelineTab.tsx', 'utf8');

const replacement = `// -- Old Manual Builder Fallback Component --
const OldTimelineBuilder: React.FC<any> = ({
  boq,
  phases,
  setPhases,
  onBack,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddPhase = () => {
    setPhases([
      ...(phases || []),
      { phaseName: "New Phase", description: "", startDay: 0, durationDays: 14 }
    ]);
  };

  const handleRemovePhase = (index: number) => {
    const newPhases = [...phases];
    newPhases.splice(index, 1);
    setPhases(newPhases);
  };

  const handlePhaseChange = (index: number, field: string, value: any) => {
    const newPhases = [...phases];
    newPhases[index] = { ...newPhases[index], [field]: value };
    setPhases(newPhases);
  };

  const handleGenerateAI = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      if (!boq) throw new Error("BOQ is required to generate timeline");
      const result = await generateProjectTimeline(boq);
      setPhases(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card
      title="Build Manual Timeline"
      titleIcon={<ClockIcon className="w-5 h-5" />}
    >
      <button
        onClick={onBack}
        className="text-indigo-600 underline text-sm font-bold mb-6 hover:text-indigo-700"
      >
        &larr; Back to Template Auto-Build
      </button>

      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-800">Timeline Phases</h3>
        <div className="flex gap-2">
          {isAiAvailable() && (
            <button 
              onClick={handleGenerateAI}
              disabled={isGenerating || !boq}
              className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-bold hover:bg-purple-200 disabled:opacity-50 flex items-center gap-2"
            >
              <SparklesIcon className="w-4 h-4" />
              {isGenerating ? "Generating..." : "Auto-Generate via AI"}
            </button>
          )}
          <button 
             onClick={handleAddPhase}
             className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700"
          >
             + Add Phase
          </button>
        </div>
      </div>

      {error && <div className="text-red-600 bg-red-50 p-3 rounded mb-4 text-sm font-medium">{error}</div>}

      <div className="space-y-4">
        {phases && phases.length > 0 ? phases.map((phase: any, i: number) => (
          <div key={i} className="border border-slate-200 p-4 rounded-xl relative group bg-white shadow-sm">
            <button 
               onClick={() => handleRemovePhase(i)}
               className="absolute top-4 right-4 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
               <DeleteIcon className="w-5 h-5" />
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Phase Name</label>
                <input 
                  type="text"
                  value={phase.phaseName}
                  onChange={(e) => handlePhaseChange(i, 'phaseName', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-sm font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Start Day (Offset)</label>
                  <input 
                    type="number"
                    value={phase.startDay}
                    onChange={(e) => handlePhaseChange(i, 'startDay', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Duration (Days)</label>
                  <input 
                    type="number"
                    value={phase.durationDays}
                    onChange={(e) => handlePhaseChange(i, 'durationDays', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-sm"
                  />
                </div>
              </div>
            </div>
            <div>
               <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
               <input 
                  type="text"
                  value={phase.description}
                  onChange={(e) => handlePhaseChange(i, 'description', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-sm text-slate-600"
               />
            </div>
          </div>
        )) : (
          <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
             No phases defined. Add a phase manually or generate via AI.
          </div>
        )}
      </div>
    </Card>
  );
};

export default TimelineTab;`;

const target = content.substring(content.indexOf('// -- Old Manual Builder Fallback Component --'));
content = content.replace(target, replacement);
fs.writeFileSync('components/TimelineTab.tsx', content);
console.log('patched manual timeline builder');
