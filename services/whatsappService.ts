export function generateWhatsAppDigest(pulse: any): string {
    const weekNumber = pulse?.weekNumber || '';
    let text = `*Weekly Update: Week ${weekNumber}*\n\n`;
    
    // Headline from narrative first sentence
    const narrativeText = pulse?.narrative?.weekAtAGlance || pulse?.executiveBriefing || '';
    if (narrativeText) {
        const firstSentence = narrativeText.split(/[.!?]/)[0];
        if (firstSentence) {
            text += `${firstSentence.trim()}.\n\n`;
        }
    }

    const overlay = pulse?.overlay || {};
    
    // Site progress deltas
    if (overlay.siteProgress && Object.keys(overlay.siteProgress).length > 0) {
        const deltas = Object.entries(overlay.siteProgress)
            .map(([room, prog]: [string, any]) => {
                const diff = (prog.pct || 0) - (prog.previousPct || 0);
                if (diff > 0) return `${room}: +${diff}%`;
                return null;
            })
            .filter(Boolean);
            
        if (deltas.length > 0) {
            text += `*Site Progress:*\n`;
            deltas.forEach(d => text += `- ${d}\n`);
            text += `\n`;
        }
    }

    // Actions needed
    const clientActions = [
        ...(pulse?.openItems?.client || []),
        ...(pulse?.manualActions || []).filter((a: any) => a.assignee === 'client')
    ];

    if (clientActions.length > 0) {
        text += `*Action Items:*\n`;
        clientActions.forEach(a => {
            text += `- ${a.text}\n`;
        });
        text += `\n`;
    }

    text += `*View full report:* https://example.com/report`; // Need an actual link if available or placeholder

    return text.trim();
}
