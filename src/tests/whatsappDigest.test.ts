import { describe, it, expect } from 'vitest';
import { generateWhatsAppDigest } from '../../services/whatsappService';

/*
  The digest reports this week's change per room (overlay.siteProgress), not
  the running total, and only the client's actions -- the contract pinned in
  services/whatsappService.test.ts. This test used to pass `roomProgress` and
  `corrections`, which the digest has not read since it moved to the overlay.
*/
describe('WhatsApp Digest Generation', () => {
    it('should generate digest including progress, the briefing and the client\'s actions', () => {
        const pulse = {
            weekNumber: 5,
            executiveBriefing: "Good progress this week.",
            overlay: {
                siteProgress: { "Living Room": { pct: 60, previousPct: 45 }, "Kitchen": { pct: 80, previousPct: 80 } },
            },
            manualActions: [
                { assignee: 'client', text: 'Approve tile selection' },
                { assignee: 'studio', text: 'Order laminates' },
            ],
        };

        const digest = generateWhatsAppDigest(pulse);

        expect(digest).toContain("*Weekly Update: Week 5*");
        expect(digest).toContain("Good progress this week.");
        expect(digest).toContain("Living Room: +15%"); // this week's change
        expect(digest).not.toContain("Kitchen");       // no change, so not listed
        expect(digest).toContain("Approve tile selection");
        expect(digest).not.toContain("Order laminates"); // the studio's own action
    });
});
