import { describe, it, expect } from 'vitest';
import { generateWhatsAppDigest } from './whatsappService';

describe('WhatsApp Digest', () => {
    it('generates text strictly from snapshot and overlay data', () => {
        const pulse = {
            weekNumber: 12,
            narrative: {
                weekAtAGlance: "The ceiling grid is 100% complete in the living room. We are starting the paintwork next week."
            },
            overlay: {
                siteProgress: {
                    'Living Room': { pct: 85, previousPct: 70 },
                    'Kitchen': { pct: 50, previousPct: 50 },
                    'Bedroom': { pct: 20, previousPct: 0 }
                }
            },
            openItems: {
                client: [
                    { text: "Confirm kitchen tile selection", assignee: 'client' }
                ]
            },
            manualActions: [
                { text: "Send updated moodboard", assignee: 'studio' },
                { text: "Sign off on plumbing layout", assignee: 'client' }
            ]
        };

        const result = generateWhatsAppDigest(pulse);

        expect(result).toContain('*Weekly Update: Week 12*');
        expect(result).toContain('The ceiling grid is 100% complete in the living room.');
        
        // Progress deltas
        expect(result).toContain('Living Room: +15%');
        expect(result).toContain('Bedroom: +20%');
        expect(result).not.toContain('Kitchen'); // Delta is 0, so should be excluded

        // Actions
        expect(result).toContain('Confirm kitchen tile selection');
        expect(result).toContain('Sign off on plumbing layout');
        expect(result).not.toContain('Send updated moodboard'); // Studio action, exclude

        // Assert all numbers in result actually exist in the payload
        const allNumbers = result.match(/\b\d+\b/g) || [];
        // Expected numbers: 12 (week), 100 (from narrative), 15 (delta), 20 (delta)
        expect(allNumbers).toEqual(expect.arrayContaining(['12', '100', '15', '20']));
        // Should not contain 85, 70, 50, 0 since we only show deltas
        expect(allNumbers).not.toContain('85');
        expect(allNumbers).not.toContain('70');
        expect(allNumbers).not.toContain('50');
        expect(allNumbers).not.toContain('0');
    });
});
