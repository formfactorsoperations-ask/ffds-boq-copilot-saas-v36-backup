export function generateWhatsAppDigest(pulse: any): string {
    let text = `*Weekly Update: Week ${pulse?.weekNumber || ''}*\n\n`;
    text += pulse?.executiveBriefing ? `${pulse.executiveBriefing}\n\n` : '';
    
    if (pulse?.roomProgress && Object.keys(pulse.roomProgress).length > 0) {
        text += "*Site Progress:*\n";
        for (const [room, pct] of Object.entries(pulse.roomProgress)) {
            text += `- ${room}: ${pct}%\n`;
        }
        text += "\n";
    }

    if (pulse?.manualActions && pulse.manualActions.length > 0) {
        text += "*Action Items:*\n";
        pulse.manualActions.forEach((a: any) => {
            text += `- [${a.assignee === 'client' ? 'Client' : 'Studio'}] ${a.text}\n`;
        });
        text += "\n";
    }

    if (pulse?.openItems) {
        if (pulse.openItems.client && pulse.openItems.client.length > 0) {
            text += "*Waiting on You:*\n";
            pulse.openItems.client.forEach((a: any) => {
                text += `- ${a.text}\n`;
            });
            text += "\n";
        }
    }

    if (pulse?.corrections && pulse.corrections.length > 0) {
        text += "*Note (Corrections):*\n";
        pulse.corrections.forEach((c: any) => {
            if (c.state === 'active') {
                text += `- ${c.fieldPath.split('.').pop()}: changed to ${c.newValue} (${c.reason})\n`;
            }
        });
    }

    return text.trim();
}
