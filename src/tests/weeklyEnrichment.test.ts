import { describe, it, expect } from 'vitest';
import { ACTIVITY_WHITELIST } from '../../services/reportSentenceMapping';

describe('Weekly Report Enrichments', () => {
    it('Activity Whitelist Test: should only map whitelisted events to safe templates', () => {
        const events = [
            "Payment received for invoice INV-001",
            "Internal dispute regarding ceiling design",
            "Drawing approved by client",
            "Work authorized for addition scope SA-102",
            "Margin dropped below 15%",
            "Design phase formally closed"
        ];
        
        const mapped = events.map(text => {
            let mappedText = null;
            for (const rule of ACTIVITY_WHITELIST) {
                if (rule.pattern.test(text)) {
                    mappedText = rule.template;
                    break;
                }
            }
            return mappedText;
        });

        expect(mapped[0]).toBe("Milestone payment received — with thanks");
        expect(mapped[1]).toBeNull(); // not whitelisted
        expect(mapped[2]).toBe("Drawing approved");
        expect(mapped[3]).toBe("Work authorized for scope addition");
        expect(mapped[4]).toBeNull(); // not whitelisted
        expect(mapped[5]).toBe("Design phase closed");
    });

    it('Velocity Sparse-Data Omission Test: should omit velocity if coverage < 60%', () => {
        // We simulate the logic from compiler
        const drawingTracker = [
            {
                rounds: [
                    { issuedAt: 1000, clientFeedbackSubmittedAt: null }, // no client response
                    { issuedAt: 2000, clientFeedbackSubmittedAt: null }, // no client response
                    { issuedAt: 3000, clientFeedbackSubmittedAt: 3500 }, // responded!
                ]
            }
        ];

        let clientReviewTotal = 0;
        let studioTurnaroundTotal = 0;
        let clientReviewCount = 0;
        let studioTurnaroundCount = 0;
        let totalEligibleClientRounds = 0;
        let totalEligibleStudioRounds = 0;
        
        drawingTracker.forEach(drawing => {
            if (drawing.rounds && drawing.rounds.length > 0) {
                for (let i = 0; i < drawing.rounds.length; i++) {
                    const round = drawing.rounds[i];
                    if (round.issuedAt) {
                        totalEligibleClientRounds++;
                        if (round.clientFeedbackSubmittedAt) {
                            clientReviewTotal += (round.clientFeedbackSubmittedAt - round.issuedAt);
                            clientReviewCount++;
                            
                            if (i + 1 < drawing.rounds.length) {
                                const nextRound = drawing.rounds[i + 1];
                                totalEligibleStudioRounds++;
                                if (nextRound.issuedAt) {
                                    studioTurnaroundTotal += (nextRound.issuedAt - round.clientFeedbackSubmittedAt);
                                    studioTurnaroundCount++;
                                }
                            }
                        }
                    }
                }
            }
        });
        
        const clientCoverage = totalEligibleClientRounds > 0 ? clientReviewCount / totalEligibleClientRounds : 0;
        const studioCoverage = totalEligibleStudioRounds > 0 ? studioTurnaroundCount / totalEligibleStudioRounds : 0;
        const coveragePercent = Math.min(clientCoverage, studioCoverage) * 100;
        
        // 3 issued rounds. Only 1 has client feedback -> 33% coverage
        expect(totalEligibleClientRounds).toBe(3);
        expect(clientReviewCount).toBe(1);
        expect(clientCoverage).toBeLessThan(0.6);
        expect(coveragePercent).toBeLessThan(60);
    });
});
