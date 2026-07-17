import { describe, it, expect } from 'vitest';
import { sanitizeDataForClient, clientRevisionLabel } from '../../services/weeklyReportCompiler';

describe('Weekly Report Compiler - Client Safe Projection', () => {
    it('should map cause enums correctly', () => {
        expect(clientRevisionLabel('CLIENT_REVISION')).toBe('Client-requested change');
        expect(clientRevisionLabel('FFDS_DESIGN_MISS')).toBe('Studio correction');
        expect(clientRevisionLabel('SITE_CONDITION')).toBe('Site condition adjustment');
        expect(clientRevisionLabel('OTHER')).toBe('Standard Iteration');
    });

    it('should scrub forbidden substrings and map enums in the payload', () => {
        const rawPayload = {
            marginAmt: 1000,
            baseCost: 5000,
            unitCost: 100,
            rate: 200,
            classificationConfidence: 0.95,
            safeField: "safe value",
            cause: "CLIENT_REVISION",
            nested: {
                marginAmt: 500,
                baseCost: 2000,
                someString: "FFDS_DESIGN_MISS",
                otherString: "SITE_CONDITION",
                arrayField: [
                    { unitCost: 50, rate: 100, valid: true }
                ]
            }
        };

        const result = sanitizeDataForClient(rawPayload);
        const serialized = JSON.stringify(result);

        // Assert forbidden fields are absent
        expect(serialized).not.toContain("marginAmt");
        expect(serialized).not.toContain("baseCost");
        expect(serialized).not.toContain("unitCost");
        expect(serialized).not.toContain("rate");
        expect(serialized).not.toContain("classificationConfidence");
        
        // Assert enums are mapped
        expect(serialized).not.toContain("CLIENT_REVISION");
        expect(serialized).not.toContain("FFDS_DESIGN_MISS");
        expect(serialized).not.toContain("SITE_CONDITION");
        
        // Assert safe fields still exist
        expect(serialized).toContain("safe value");
        expect(serialized).toContain("Client-requested change");
        expect(serialized).toContain("Studio correction");
        expect(serialized).toContain("Site condition adjustment");
    });
});

import { vi } from 'vitest';
import { generateReportNarrative } from '../../services/weeklyReportCompiler';

// Mocking GoogleGenAI
vi.mock('@google/genai', () => {
    return {
        GoogleGenAI: class {
            models = {
                generateContent: vi.fn().mockImplementation(async ({ contents }) => {
                    if (contents.includes('"bad_fact"')) {
                        return { text: '{"weekAtAGlance": "The cost is ₹1,000,000.", "comingUpNextWeek": "Nothing."}' };
                    }
                    if (contents.includes('"no_numbers"')) {
                        return { text: '{"weekAtAGlance": "All good.", "comingUpNextWeek": "Nothing."}' };
                    }
                    return { text: '{"weekAtAGlance": "The cost is ₹5,000.", "comingUpNextWeek": "Nothing."}' };
                })
            };
        }
    };
});

describe('Weekly Report Compiler - generateReportNarrative', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv, GEMINI_API_KEY: 'test_key' };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should return narrative when facts match snapshot', async () => {
        const snapshot = { safeField: "safe value", amount: "₹5,000" };
        const result = await generateReportNarrative(snapshot);
        expect(result).not.toBeNull();
        expect(result?.weekAtAGlance).toContain("₹5,000");
    });

    it('should return null when facts do not match snapshot (bad fact)', async () => {
        const snapshot = { safeField: "bad_fact", amount: "₹5,000" };
        const result = await generateReportNarrative(snapshot);
        expect(result).toBeNull();
    });

    it('should return narrative when no numbers are present', async () => {
        const snapshot = { safeField: "no_numbers" };
        const result = await generateReportNarrative(snapshot);
        expect(result).not.toBeNull();
        expect(result?.weekAtAGlance).toContain("All good.");
    });
});
