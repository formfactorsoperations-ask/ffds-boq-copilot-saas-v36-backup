import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WeeklyPulseReport } from '../../components/client/WeeklyPulseReport';
import { formatINR } from '../../lib/utils';

describe('WeeklyPulseReport Client View', () => {
    it('should render exact narrative and amounts from snapshot', () => {
        const fixtureReport = {
            periodStart: '2026-07-10',
            periodEnd: '2026-07-17',
            snapshot: {
                paymentStages: [
                    { id: 'p1', name: 'Stage 1', amount: 25000, status: 'pending' }
                ],
                contract: {
                    signedAt: 1713000000000
                },
                designGate: {
                    gateActivated: false,
                    overrideReason: 'Client urgent request',
                    overriddenBy: 'Test Approver'
                }
            },
            narrative: {
                weekAtAGlance: 'This week we achieved 50% completion. 100% facts.',
                comingUpNextWeek: 'Next week we will start tiling and plumbing.'
            }
        };

        const studioSettings = {
            companyName: 'Test Studio',
            address: '123 Test St',
            phone: '555-1234',
            email: 'hello@test.com',
            footerText: 'Building dreams'
        };

        const { container } = render(<WeeklyPulseReport report={fixtureReport} studioSettings={studioSettings} />);
        const textContent = container.textContent || '';
        
        expect(textContent).toContain('This week we achieved 50% completion. 100% facts.');
        expect(textContent).toContain('Next week we will start tiling and plumbing.');
        expect(textContent).toContain(formatINR(25000));
        
        // Assert masthead contents
        expect(textContent).toContain('Test Studio');
        expect(textContent).toContain('123 Test St');
        expect(textContent).toContain('555-1234');
        expect(textContent).toContain('Building dreams');

        // Check overrides
        expect(textContent).toContain('Client urgent request');
        expect(textContent).toContain('Test Approver');
    });

    it('should render em-dashes for missing values', () => {
        const fixtureReport = {
            snapshot: {}
        };
        const { container } = render(<WeeklyPulseReport report={fixtureReport} studioSettings={{}} />);
        const textContent = container.textContent || '';
        // If everything is missing, it should render em-dashes
        expect(textContent).toContain('—');
    });
});
