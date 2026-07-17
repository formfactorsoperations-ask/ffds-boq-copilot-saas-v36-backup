import { describe, it, expect } from 'vitest';
import { generateWhatsAppDigest } from '../../services/whatsappService';

describe('WhatsApp Digest Generation', () => {
    it('should generate digest including snapshot, corrections, and manualInputs', () => {
        const pulse = {
            weekNumber: 5,
            executiveBriefing: "Good progress this week.",
            roomProgress: { "Living Room": 60, "Kitchen": 80 },
            manualActions: [ { assignee: 'client', text: 'Approve tile selection' } ],
            corrections: [ { fieldPath: 'categoryProgress[0].percentage', newValue: '45', state: 'active', reason: 'Fixed' } ]
        };

        const digest = generateWhatsAppDigest(pulse);

        // number-existence test updated to check snapshot + corrections + manualInputs
        expect(digest).toContain("60%"); // snapshot (room progress)
        expect(digest).toContain("45");   // correction
        expect(digest).toContain("Approve tile selection"); // manualInput
    });
});
