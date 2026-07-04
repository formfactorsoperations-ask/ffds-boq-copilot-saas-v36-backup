const fs = require('fs');
let content = fs.readFileSync('hooks/useTimelinePhases.ts', 'utf8');

// The messed up part starts at "const shiftTimelinePhases = async (stepNumber: number, daysToShift: number) => {"
// and goes all the way to "  return {" (which was originally "        return {")
// Let's just find "const shiftTimelinePhases" and replace it back to "        return {"
const brokenStart = content.indexOf('        const shiftTimelinePhases = async');
const brokenEnd = content.indexOf('  return {\n          ...phase,');

if (brokenStart !== -1 && brokenEnd !== -1) {
    const toReplace = content.substring(brokenStart, brokenEnd + 10);
    content = content.replace(toReplace, '        return {');
    
    // Now insert shiftTimelinePhases before the final return
    const finalReturnMatch = content.match(/  return \{\s+phases,\s+loading,/);
    if (finalReturnMatch) {
        const finalReturnIndex = finalReturnMatch.index;
        
        const newMethod = `  const shiftTimelinePhases = async (stepNumber: number, daysToShift: number) => {
    if (!firestoreDb || !projectId || !studioId || daysToShift === 0) return;
    try {
      const sortedPhases = [...phases].sort((a, b) => a.stepNumber - b.stepNumber);
      const targetIndex = sortedPhases.findIndex(p => p.stepNumber === stepNumber);
      if (targetIndex === -1) return;

      const batch = writeBatch(firestoreDb);
      const phasesRef = collection(firestoreDb, \`studios/\${studioId}/projects/\${projectId}/timelinePhases\`);
      
      let lastEndDate = new Date();
      for (let i = targetIndex; i < sortedPhases.length; i++) {
        const phase = sortedPhases[i];
        const newStartDate = new Date(phase.startDate);
        newStartDate.setDate(newStartDate.getDate() + daysToShift);
        const newEndDate = new Date(phase.endDate);
        newEndDate.setDate(newEndDate.getDate() + daysToShift);

        batch.update(doc(phasesRef, String(phase.stepNumber)), {
          startDate: newStartDate.toISOString(),
          endDate: newEndDate.toISOString()
        });
        lastEndDate = newEndDate;
      }

      const projectRef = doc(firestoreDb, \`studios/\${studioId}/projects\`, projectId);
      batch.set(projectRef, { estimatedCompletionDate: lastEndDate.toISOString() }, { merge: true });

      await batch.commit();
    } catch (err) {
      console.error("Error shifting timeline:", err);
    }
  };

`;
        content = content.slice(0, finalReturnIndex) + newMethod + content.slice(finalReturnIndex);
        fs.writeFileSync('hooks/useTimelinePhases.ts', content);
        console.log('Fixed useTimelinePhases.ts');
    } else {
        console.log('Could not find final return');
    }
} else {
    console.log('Could not find broken part');
}
