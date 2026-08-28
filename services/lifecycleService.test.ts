import { describe, it, expect, vi, beforeEach } from 'vitest';
import { advance, LifecycleError, getInitialLifecycle } from './lifecycleService';
import { runTransaction } from 'firebase/firestore';

vi.mock('firebase/firestore', () => {
    return {
        doc: vi.fn((db, path) => ({ id: path })),
        collection: vi.fn((db, path) => ({ id: path })),
        serverTimestamp: vi.fn(() => 'serverTimestamp'),
        runTransaction: vi.fn(),
    };
});
vi.mock('./firebaseClient', () => ({
    db: {}
}));

describe('Lifecycle Service', () => {
    let mockTransaction: any;
    let mockSnap: any;

    beforeEach(() => {
        mockSnap = {
            exists: () => true,
            data: () => ({
                context: {
                    lifecycle: getInitialLifecycle()
                }
            })
        };
        mockTransaction = {
            get: vi.fn().mockResolvedValue(mockSnap),
            update: vi.fn(),
            set: vi.fn()
        };
        (runTransaction as any).mockImplementation((db: any, callback: any) => callback(mockTransaction));
    });

    it('should reject illegal transitions (e.g. stage 5 to 6 without designGateActive)', async () => {
        mockSnap.data = () => ({
            context: {
                lifecycle: {
                    ...getInitialLifecycle(),
                    stage: 5
                }
            }
        });

        await expect(advance('org1', 'proj1', { type: 'ADVANCE', toStage: 6 }))
            .rejects.toThrowError(LifecycleError);
    });

    it('should allow legal path 1 to 6', async () => {
        let lifecycle = getInitialLifecycle();
        mockSnap.data = () => ({ context: { lifecycle } });

        // 1 to 5
        lifecycle = await advance('org1', 'proj1', { type: 'ADVANCE', toStage: 2 });
        expect(lifecycle.stage).toBe(2);
        
        lifecycle = await advance('org1', 'proj1', { type: 'ADVANCE', toStage: 3 });
        lifecycle = await advance('org1', 'proj1', { type: 'ADVANCE', toStage: 4 });
        lifecycle = await advance('org1', 'proj1', { type: 'ADVANCE', toStage: 5 });
        expect(lifecycle.stage).toBe(5);

        // Try 5 to 6 without gate (fails)
        mockSnap.data = () => ({ context: { lifecycle } });
        await expect(advance('org1', 'proj1', { type: 'ADVANCE', toStage: 6 })).rejects.toThrowError();

        // Activate gate
        lifecycle = await advance('org1', 'proj1', { type: 'GATE_ACTIVATE', gate: 'designGateActive' });
        expect(lifecycle.gates.designGateActive.done).toBe(true);

        // Try 5 to 6 with gate (succeeds)
        mockSnap.data = () => ({ context: { lifecycle } });
        lifecycle = await advance('org1', 'proj1', { type: 'ADVANCE', toStage: 6 });
        expect(lifecycle.stage).toBe(6);
    });

    it('should reject backward move without reason', async () => {
        mockSnap.data = () => ({
            context: {
                lifecycle: {
                    ...getInitialLifecycle(),
                    stage: 4
                }
            }
        });

        await expect(advance('org1', 'proj1', { type: 'RETREAT', toStage: 3, reason: '' }))
            .rejects.toThrowError(LifecycleError);
    });

    it('should allow backward move with reason', async () => {
        mockSnap.data = () => ({
            context: {
                lifecycle: {
                    ...getInitialLifecycle(),
                    stage: 4
                }
            }
        });

        const lifecycle = await advance('org1', 'proj1', { type: 'RETREAT', toStage: 3, reason: 'Client changed mind' });
        expect(lifecycle.stage).toBe(3);
        expect(lifecycle.subState).toContain('Client changed mind');
    });
});
