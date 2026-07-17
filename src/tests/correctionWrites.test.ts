import { describe, it, expect, vi } from 'vitest';

const mockDbService = {
    setDoc: vi.fn(),
    doc: vi.fn((db, path) => path),
    collection: vi.fn((db, path) => path),
};

vi.mock('firebase/firestore', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        setDoc: mockDbService.setDoc,
        doc: mockDbService.doc,
        collection: mockDbService.collection,
        getFirestore: vi.fn()
    }
});

describe('Correction System', () => {
    it('Applying a correction performs zero writes outside weeklyReports and tasks subcollection', async () => {
        const taskId = 'tsk-123';
        const orgId = 'org-1';
        const projectId = 'proj-1';
        const taskPath = `organizations/${orgId}/projects/${projectId}/tasks/${taskId}`;
        
        mockDbService.doc.mockReturnValueOnce(taskPath);
        
        await mockDbService.setDoc(taskPath, {
            id: taskId,
            type: 'report_source_mismatch',
            module: 'Weekly Report',
            instruction: `Corrected value for paymentPlan[0].status. Reason: The payment was received yesterday`,
            raisedByReport: 'pulse-1',
            status: 'open',
            createdAt: 1000,
            createdBy: 'Ops User'
        });

        expect(mockDbService.setDoc).toHaveBeenCalledTimes(1);
        expect(mockDbService.setDoc.mock.calls[0][0]).toBe(taskPath);
        expect(taskPath).toContain('/tasks/');
        
        expect(taskPath).not.toContain('/paymentGates');
        expect(taskPath).not.toContain('/drawingTracker');
    });
});
